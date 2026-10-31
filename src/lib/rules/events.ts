// Event-detectie: maakt events aan bij overtredingen met GPS-bewijs
import { prisma } from "@/lib/db";
import {
  evaluateRules,
  loadActiveRules,
  type RuleWithConditions,
  type RuleEvaluation,
} from "@/lib/rules/engine";
import type { IngestSource } from "@prisma/client";

const ONGOING_COOLDOWN_MS = 5 * 60 * 1000; // Geen nieuw event voor zelfde regel binnen 5 min

/**
 * Verwerkt een nieuw GPS-punt: evalueert regels en maakt events aan.
 * Roep aan vanuit de ingest-pipeline.
 */
export async function processIngest(
  source: IngestSource,
  rules?: RuleWithConditions[]
) {
  const activeRules = rules ?? (await loadActiveRules());
  const evaluations = await evaluateRules(source, activeRules);

  for (const evalResult of evaluations) {
    await handleViolation(source, evalResult);
  }
}

async function handleViolation(
  source: IngestSource,
  evaluation: RuleEvaluation
) {
  const { rule, measuredValue, threshold, latitude, longitude } = evaluation;

  if (!rule.createEvent) return;

  // Dubbele-events voorkomen: check of er al een open event is voor deze regel+voertuig
  const recentEvent = await prisma.event.findFirst({
    where: {
      vehicleId: source.id,
      ruleId: rule.id,
      status: { in: ["new", "under_review"] },
      startTime: { gte: new Date(Date.now() - ONGOING_COOLDOWN_MS) },
    },
    orderBy: { startTime: "desc" },
  });

  if (recentEvent) {
    // Event al actief — duur bijwerken
    const durationSec = Math.floor(
      (Date.now() - recentEvent.startTime.getTime()) / 1000
    );
    await prisma.event.update({
      where: { id: recentEvent.id },
      data: {
        durationSec,
        endTime: new Date(),
        latitude: latitude ?? recentEvent.latitude,
        longitude: longitude ?? recentEvent.longitude,
        measuredValue: measuredValue ?? recentEvent.measuredValue,
      },
    });
    return;
  }

  // Nieuw event aanmaken
  const event = await prisma.event.create({
    data: {
      vehicleId: source.id,
      ruleId: rule.id,
      ruleVersion: rule.version,
      severity: rule.severity,
      status: "new",
      startTime: source.sampledAt ?? source.receivedAt,
      measuredValue,
      threshold,
      latitude,
      longitude,
    },
  });

  // GPS-bewijs: pre-event punten ophalen
  await captureEvidence(event.id, source.id, rule);

  // Notificatie
  if (rule.notifyInApp) {
    await createNotifications(event.id, source, rule, measuredValue, threshold);
  }

  // Taak aanmaken indien ingesteld
  if (rule.createTask && rule.taskTitle) {
    await prisma.task.create({
      data: {
        title: rule.taskTitle.replace("{vehicle}", source.displayName ?? source.name),
        description: `Automatisch aangemaakt door regel "${rule.name}"`,
        priority: rule.severity === "critical" ? "urgent" : "high",
        vehicleId: source.id,
        eventId: event.id,
        creatorId: source.ownerUserId ?? (await getFirstAdminId()),
      },
    });
  }
}

/**
 * Slaat GPS-bewijspunten op: pre-event (laatste N punten) + event-punten.
 * Post-event punten worden later toegevoegd (zie finalizeEvent).
 */
async function captureEvidence(
  eventId: string,
  sourceId: string,
  rule: { preEventPoints: number }
) {
  // Pre-event: laatste N IngestPoint's vóór het event
  const prePoints = await prisma.ingestPoint.findMany({
    where: { sourceId },
    orderBy: { sampledAt: "desc" },
    take: Math.min(rule.preEventPoints, 100),
  });

  const eventPoints = prePoints.reverse().map((p) => ({
    eventId,
    latitude: p.latitude,
    longitude: p.longitude,
    speedMps: p.speedMps,
    accuracyMeters: p.accuracyMeters,
    sampledAt: p.sampledAt,
    phase: "pre" as const,
  }));

  if (eventPoints.length > 0) {
    await prisma.eventPoint.createMany({ data: eventPoints });
  }
}

/**
 * Voegt post-event punten toe wanneer een event wordt opgelost.
 * Roep aan vanuit de event-resolve workflow.
 */
export async function addPostEventPoints(
  eventId: string,
  sourceId: string,
  postCount: number
) {
  // Haal laatste N punten na de event-tijd
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return;

  const postPoints = await prisma.ingestPoint.findMany({
    where: {
      sourceId,
      sampledAt: { gt: event.endTime ?? event.startTime },
    },
    orderBy: { sampledAt: "asc" },
    take: Math.min(postCount, 50),
  });

  if (postPoints.length > 0) {
    await prisma.eventPoint.createMany({
      data: postPoints.map((p) => ({
        eventId,
        latitude: p.latitude,
        longitude: p.longitude,
        speedMps: p.speedMps,
        accuracyMeters: p.accuracyMeters,
        sampledAt: p.sampledAt,
        phase: "post" as const,
      })),
    });
  }
}

async function createNotifications(
  eventId: string,
  source: IngestSource,
  rule: { name: string; severity: string },
  measuredValue?: number,
  threshold?: number
) {
  // Stuur naar alle admins + eigenaar van het voertuig
  const recipients = await prisma.user.findMany({
    where: {
      OR: [
        { role: "admin" },
        ...(source.ownerUserId ? [{ id: source.ownerUserId }] : []),
      ],
      isActive: true,
    },
    select: { id: true },
  });

  const valueStr =
    measuredValue != null ? ` (${Math.round(measuredValue)}${threshold != null ? ` > ${Math.round(threshold)}` : ""})` : "";

  await prisma.notification.createMany({
    data: recipients.map((r) => ({
      userId: r.id,
      title: `${rule.name}: ${source.displayName ?? source.name}${valueStr}`,
      body: `Voertuig ${source.displayName ?? source.name} heeft regel "${rule.name}" overtreden.`,
      severity: rule.severity as "info" | "warning" | "critical",
      eventId,
      channel: "in_app" as const,
    })),
  });
}

async function getFirstAdminId(): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: { role: "admin" },
    select: { id: true },
  });
  return admin?.id ?? "";
}

/**
 * Periodieke check: markeert "stale/offline" events en sluit events
 * die te lang without updates zijn. Roep aan met een interval.
 */
export async function processStaleEvents() {
  const staleThresholdMs = 5 * 60 * 1000;
  const staleEvents = await prisma.event.findMany({
    where: {
      status: { in: ["new", "under_review"] },
      endTime: { lt: new Date(Date.now() - staleThresholdMs) },
    },
  });

  for (const event of staleEvents) {
    // Als voertuig weer normaal rapporteert, sluit event
    const source = await prisma.ingestSource.findUnique({
      where: { id: event.vehicleId },
    });
    if (!source) continue;

    const age = Date.now() - source.receivedAt.getTime();
    if (age < 120_000) {
      // Voertuig rapporteert weer — event is voorbij
      await prisma.event.update({
        where: { id: event.id },
        data: { status: "resolved", resolvedAt: new Date(), endTime: new Date() },
      });
      // Post-event punten toevoegen
      const rule = await prisma.rule.findUnique({
        where: { id: event.ruleId },
      });
      if (rule) {
        await addPostEventPoints(event.id, event.vehicleId, rule.postEventPoints);
      }
    }
  }
}
