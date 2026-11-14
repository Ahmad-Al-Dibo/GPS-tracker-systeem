// POST /api/ingest — locatie sturen met X-API-Key (apparaten)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestLocationSchema } from "@/lib/validation";
import { validateApiKey } from "@/lib/api-keys";
import { processIngest } from "@/lib/rules/events";

export async function POST(req: NextRequest) {
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

  // Idempotentie
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

  try {
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
