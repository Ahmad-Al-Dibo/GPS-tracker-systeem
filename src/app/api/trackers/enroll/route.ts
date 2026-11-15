// POST /api/trackers/enroll — provisioning van de mobiele tracker-app.
// De app (eerste start) stuurt installId + naam + metadata met de GEBRUIKERS-
// API-key (X-API-Key) van de eigenaar. Resultaat: tracker (auto-aangemaakt,
// unverified) + trackerKey (gptt_…, 1× getoond, hash opgeslagen).
// De trackerKey authenticáát daarna elke GPS-zending (X-Tracker-Key):
// alleen het installId is NIET genoeg om een bestaande tracker te imiteren.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { validateApiKey } from "@/lib/api-keys";
import { logger, correlationId, logRequest } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  generateTrackerKey,
  trackerMetadataSchema,
  deviceMetadataUpdate,
  uniqueTrackerName,
} from "@/lib/tracker-identity";

const WINDOW_MS = 60 * 60_000; // 1 uur
const MAX_ENROLLS_PER_IP = 30; // genereus: enkele testers/tokens, geen spam
const limiter = createRateLimiter(WINDOW_MS);

const enrollSchema = z.object({
  // Persistent install-ID van de app (UUID). Dit is de identiteit — nooit de naam.
  installId: z.string().uuid(),
  deviceName: z.string().trim().min(1).max(80).optional(),
  metadata: trackerMetadataSchema.optional(),
});

export async function POST(req: NextRequest) {
  const reqId = correlationId(req);
  logRequest(req, reqId, { route: "trackers/enroll" });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (limiter.isLimited(`enroll:${ip}`, MAX_ENROLLS_PER_IP)) {
    return NextResponse.json(
      { error: "Te veel registratiepogingen; probeer later opnieuw." },
      { status: 429 }
    );
  }

  const apiKey =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const key = apiKey ? await validateApiKey(apiKey) : null;
  if (!key) {
    limiter.record(`enroll:${ip}`);
    return NextResponse.json({ error: "Ongeldige of ontbrekende API-key" }, { status: 401 });
  }
  const ownerUserId = key.userId;

  const body = await req.json().catch(() => null);
  const parsed = enrollSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige invoer", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { installId, deviceName, metadata } = parsed.data;

  try {
    const existing = await prisma.ingestSource.findUnique({
      where: { externalId: installId },
    });

    if (existing?.deletedAt) {
      return NextResponse.json(
        { error: "Deze tracker staat in de prullenbak; herstel hem eerst." },
        { status: 409 }
      );
    }

    const { raw: trackerKey, hash } = generateTrackerKey();

    if (existing) {
      // Alleen de eigenaar (of admin) mag opnieuw enrolen → key-rotatie.
      const isOwner = existing.ownerUserId === ownerUserId || existing.ownerUserId === null;
      if (!isOwner && key.user.role !== "admin") {
        limiter.record(`enroll:${ip}`);
        logger.warn("enroll denied: installId belongs to another owner", {
          reqId,
          installId,
          ownerUserId,
        });
        return NextResponse.json(
          { error: "Dit install-ID is al geregistreerd bij een andere eigenaar." },
          { status: 403 }
        );
      }

      // Device-metadata toepassen met de naamregel (admin-hernoeming blijft
      // staan tot de app écht hernoemt); `metadata` (admin) blijft ongemoeid.
      const incoming = {
        ...(metadata ?? {}),
        ...(deviceName ? { device_name: deviceName } : {}),
      };
      const update = deviceMetadataUpdate(existing.deviceMetadata, incoming);

      const updated = await prisma.ingestSource.update({
        where: { id: existing.id },
        data: {
          deviceSecretHash: hash, // rotatie: oud wordt ongeldig
          ...(existing.ownerUserId === null ? { ownerUserId } : {}),
          ...(existing.sourceType !== "mobile" ? { sourceType: "mobile" } : {}),
          deviceMetadata: update.deviceMetadata,
          ...(update.displayName ? { displayName: update.displayName } : {}),
        },
      });

      logger.info("tracker re-enrolled (key rotated)", {
        reqId,
        installId,
        sourceId: updated.id,
      });
      await logAudit(ownerUserId, "tracker.enroll", "tracker", updated.id, {
        installId,
        rotated: true,
      });

      return NextResponse.json({
        trackerId: updated.id,
        trackerKey,
        externalId: updated.externalId,
        displayName: updated.displayName ?? updated.name,
        verificationStatus: updated.verificationStatus,
        rotated: true,
      });
    }

    // Nieuwe install → automatisch registreren (unverified tot admin-pairing).
    const incoming = {
      ...(metadata ?? {}),
      ...(deviceName ? { device_name: deviceName } : {}),
    };
    const update = deviceMetadataUpdate(null, incoming);
    const name = await uniqueTrackerName(
      deviceName ?? `Mobiel ${installId.slice(0, 8)}`,
      installId
    );

    const created = await prisma.ingestSource.create({
      data: {
        name,
        displayName: deviceName ?? null,
        externalId: installId,
        sourceType: "mobile",
        trackerSource: "app",
        verificationStatus: "unverified",
        firstSeenAt: new Date(),
        ownerUserId,
        deviceSecretHash: hash,
        deviceMetadata: update.deviceMetadata,
        iconEmoji: "📱",
      },
    });

    logger.warn("mobile tracker auto-registered (unverified)", {
      reqId,
      installId,
      sourceId: created.id,
      ownerUserId,
    });
    await logAudit(ownerUserId, "tracker.enroll", "tracker", created.id, {
      installId,
      created: true,
    });

    return NextResponse.json(
      {
        trackerId: created.id,
        trackerKey,
        externalId: created.externalId,
        displayName: created.displayName ?? created.name,
        verificationStatus: created.verificationStatus,
        rotated: false,
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error("enroll failed", { reqId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Registratie mislukt" }, { status: 500 });
  }
}
