// POST /api/ingest — GPS-ontvangst, twee credentials:
//  1. X-Tracker-Key (mobiele app, Phase 2): identiteit = trackerKey-hash →
//     automatisch gevonden/geresette tracker (geen naam nodig).
//  2. X-API-Key (browser-delen/legacy): identiteit = `name`-upsert (behouden
//     voor backward compatibility).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ingestLocationSchema } from "@/lib/validation";
import { validateApiKey } from "@/lib/api-keys";
import { processIngest } from "@/lib/rules/events";
import {
  hashTrackerKey,
  trackerMetadataSchema,
  deviceMetadataUpdate,
} from "@/lib/tracker-identity";

/** Payload van de mobiele app (X-Tracker-Key-pad). */
const trackerIngestSchema = z.object({
  // Cross-check: als meegestuurd moet het overeenkomen met de externalId
  // waar de trackerKey bij hoort (identiteit = key, niet dit veld).
  installId: z.string().uuid().optional(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  timestamp: z.union([z.string(), z.number()]).optional(),
  speedMps: z.number().finite().min(0).max(200).nullable().optional(),
  altitude: z.number().finite().min(-1000).max(30000).nullable().optional(),
  heading: z.number().finite().min(0).max(360).nullable().optional(),
  accuracyMeters: z.number().finite().min(0).max(100_000).nullable().optional(),
  batteryLevel: z.number().int().min(0).max(100).nullable().optional(),
  // Alleen meegestuurd als de app iets gewijzigd heeft (zie app-contract).
  metadata: trackerMetadataSchema.optional(),
});

async function trackerIngest(req: NextRequest, trackerKey: string) {
  const source = await prisma.ingestSource.findUnique({
    where: { deviceSecretHash: hashTrackerKey(trackerKey) },
  });
  // Zelfde melding voor onbekend/verwijderd: geen oracle over bestaande keys.
  if (!source || source.deletedAt) {
    return NextResponse.json(
      { accepted: false, error: "Ongeldige trackerKey" },
      { status: 401 }
    );
  }
  if (source.verificationStatus === "revoked") {
    return NextResponse.json(
      { accepted: false, error: "Tracker is ingetrokken door een beheerder" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = trackerIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { accepted: false, error: "Ongeldige payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const d = parsed.data;

  if (d.installId && source.externalId && d.installId !== source.externalId) {
    return NextResponse.json(
      { accepted: false, error: "installId hoort niet bij deze trackerKey" },
      { status: 403 }
    );
  }

  const receivedAt = new Date();
  let sampledAt = receivedAt;
  if (d.timestamp != null) {
    const n = typeof d.timestamp === "number" ? d.timestamp : Date.parse(d.timestamp);
    // Geen toekomstige tijdstempels (zelfde regel als het legacy-pad).
    if (!Number.isNaN(n) && n <= receivedAt.getTime() + 5 * 60_000) {
      sampledAt = new Date(n);
    }
  }

  try {
    await prisma.ingestPoint.create({
      data: {
        sourceId: source.id,
        latitude: d.latitude,
        longitude: d.longitude,
        speedMps: d.speedMps ?? null,
        accuracyMeters: d.accuracyMeters ?? null,
        altitude: d.altitude ?? null,
        heading: d.heading != null ? Math.round(d.heading) : null,
        sampledAt,
        receivedAt,
      },
    });

    // Tracker-profiel bijwerken; apparaat-metadata alleen bij gewijzigde
    // input (app stuurt dit niet bij elke zending) — naamregel beschermt
    // admin-hernoemingen.
    const metadataUpdate =
      d.metadata !== undefined
        ? deviceMetadataUpdate(source.deviceMetadata, d.metadata)
        : null;

    const { calculateDistanceDelta } = await import("@/lib/distance");
    const delta = calculateDistanceDelta(
      source.lastCalcLat,
      source.lastCalcLon,
      source.lastCalcAt,
      d.latitude,
      d.longitude,
      sampledAt
    );

    await prisma.ingestSource.update({
      where: { id: source.id },
      data: {
        latitude: d.latitude,
        longitude: d.longitude,
        speedMps: d.speedMps ?? source.speedMps,
        accuracyMeters: d.accuracyMeters ?? source.accuracyMeters,
        sampledAt,
        receivedAt,
        ...(d.altitude != null ? { lastAltitude: d.altitude } : {}),
        ...(d.heading != null ? { lastHeading: d.heading } : {}),
        ...(d.batteryLevel != null ? { lastBatteryLevel: d.batteryLevel } : {}),
        ...(metadataUpdate
          ? {
              deviceMetadata: metadataUpdate.deviceMetadata,
              ...(metadataUpdate.displayName ? { displayName: metadataUpdate.displayName } : {}),
            }
          : {}),
        lastCalcLat: d.latitude,
        lastCalcLon: d.longitude,
        lastCalcAt: sampledAt,
        totalDistanceKm: (source.totalDistanceKm ?? 0) + delta.distanceM / 1000,
        currentKm:
          (source.currentKm ?? source.startingKm ?? 0) + delta.distanceM / 1000,
      },
    });

    // Regel-evaluatie (fire-and-forget) — zelfde pad als legacy/hardware.
    if (!source.deletedAt) {
      const refreshed = { ...source, latitude: d.latitude, longitude: d.longitude, sampledAt, receivedAt };
      processIngest(refreshed).catch((err) => {
        console.error("Rule evaluation failed:", err);
      });
    }

    return NextResponse.json({
      accepted: true,
      trackerId: source.id,
      metadataApplied: metadataUpdate !== null,
    });
  } catch (err) {
    console.error("Tracker ingest failed:", err);
    return NextResponse.json(
      { accepted: false, error: "Opslag mislukt" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  // ── Pad 1: mobiele app met eigen trackerKey (Phase 2) ──
  const trackerKey = req.headers.get("x-tracker-key");
  if (trackerKey) {
    return trackerIngest(req, trackerKey);
  }

  // ── Pad 2: legacy X-API-Key + name-upsert (browser-delen e.d.) ──
  // Auth via X-API-Key header
  const apiKey =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!apiKey) {
    return NextResponse.json(
      { accepted: false, error: "X-API-key ontbreekt" },
      { status: 401 }
    );
  }

  const keyRecord = await validateApiKey(apiKey);
  if (!keyRecord) {
    return NextResponse.json(
      { accepted: false, error: "Ongeldige of ingetrokken API-key" },
      { status: 401 }
    );
  }

  const userId = keyRecord.userId;

  const body = await req.json().catch(() => null);
  const parsed = ingestLocationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { accepted: false, error: "Ongeldige payload" },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const receivedAt = new Date();

  let sampledAt: Date | null = null;
  if (d.sampledAt != null) {
    const n = typeof d.sampledAt === "number" ? d.sampledAt : Date.parse(d.sampledAt);
    if (!Number.isNaN(n) && n <= receivedAt.getTime() + 5 * 60_000) {
      sampledAt = new Date(n);
    }
  }
  if (!sampledAt) sampledAt = receivedAt;

  const eventId =
    d.event_id != null
      ? String(d.event_id)
      : d.event_id_alt != null
        ? d.event_id_alt
        : null;

  // Alles wat de DB raakt in één try: een DB-fout tijdens de idempotentie-
  // check of upsert moet dezelfde nette 500 geven (en geen onbehandelde
  // throw met stacktrace in de logs).
  try {
    // Idempotentie: zelfde event_id → geen nieuw punt (herverzending app).
    if (eventId) {
      const existing = await prisma.ingestSource.findFirst({
        where: { eventId, ownerUserId: userId },
      });
      if (existing) {
        return NextResponse.json({
          accepted: true,
          duplicate: true,
          name: existing.name,
        });
      }
    }

    // Multi-tenancy: een bron (naam) hoort bij één eigenaar. Een andere
    // key-eigenaar mag een bestaande bron NIET overnemen (takeover-fix).
    const existing = await prisma.ingestSource.findUnique({ where: { name: d.name } });
    if (existing && existing.ownerUserId != null && existing.ownerUserId !== userId) {
      return NextResponse.json(
        { accepted: false, error: "Deze bronnaam is al in gebruik door een andere eigenaar" },
        { status: 403 }
      );
    }

    const source = await prisma.ingestSource.upsert({
      where: { name: d.name },
      update: {
        latitude: d.latitude,
        longitude: d.longitude,
        accuracyMeters: d.accuracyMeters ?? null,
        speedMps: d.speedMps ?? null,
        sampledAt,
        receivedAt,
        eventId,
        // ownerUserId NIET overschrijven: eigenaarschap blijft stabiel
        lastError: null,
      },
      create: {
        name: d.name,
        ownerUserId: userId,
        latitude: d.latitude,
        longitude: d.longitude,
        accuracyMeters: d.accuracyMeters ?? null,
        speedMps: d.speedMps ?? null,
        sampledAt,
        receivedAt,
        eventId,
      },
    });

    await prisma.ingestPoint.create({
      data: {
        sourceId: source.id,
        latitude: d.latitude,
        longitude: d.longitude,
        speedMps: d.speedMps ?? null,
        accuracyMeters: d.accuracyMeters ?? null,
        sampledAt,
        receivedAt,
      },
    });

    // Afstand berekenen en km-stand bijwerken (US-16)
    try {
      const { calculateDistanceDelta } = await import("@/lib/distance");
      const delta = calculateDistanceDelta(
        source.lastCalcLat,
        source.lastCalcLon,
        source.lastCalcAt,
        d.latitude,
        d.longitude,
        sampledAt
      );

      const newTotal = (source.totalDistanceKm ?? 0) + delta.distanceM / 1000;
      const newCurrent = (source.currentKm ?? source.startingKm ?? 0) + delta.distanceM / 1000;

      await prisma.ingestSource.update({
        where: { id: source.id },
        data: {
          lastCalcLat: d.latitude,
          lastCalcLon: d.longitude,
          lastCalcAt: sampledAt,
          totalDistanceKm: newTotal,
          currentKm: newCurrent,
        },
      });
    } catch {
      // Afstandberekening mag ingest niet blokkeren
    }

    // Rule-evaluatie + event-detectie (fire-and-forget; blokkeert ingest niet)
    // Soft delete: voor verwijderde voertuigen geen regel-events/meldingen —
    // posities worden wel bijgehouden zodat de GPS-geschiedenis bewaard blijft.
    if (!source.deletedAt) {
      processIngest(source).catch((err) => {
        console.error("Rule evaluation failed:", err);
      });
    }

    return NextResponse.json({
      accepted: true,
      sourceId: source.id,
      name: source.name,
    });
  } catch {
    return NextResponse.json(
      { accepted: false, error: "Opslag mislukt" },
      { status: 500 }
    );
  }
}
