// POST /api/ingest/teltonika — ontvangt gedecodeerde Teltonika AVL-records van de
// TCP-ingestie-server en slaat ze duurzaam op (pas daarna ACK volgens Teltonika-protocol).
// Auth: gedeelde ingest-key (X-Ingest-Key header) — geen user-sessie, dit is machine-tot-machine.
// Idempotentie: Teltonika-records hebben geen record-ID; herverzending na een
// gefaalde ACK is byte-identiek. Daarom dedupe op SHA-256 content-hash
// (canonische recordvelden) met unieke constraint (deviceId, recordHash).
import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { logger, correlationId, logRequest } from "@/lib/logger";
import { z } from "zod";

const avlRecordSchema = z.object({
  timestamp: z.string(), // ISO of epoch-ms
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  // Ruwe protocolwaarden (uint16 e.d.); we clammen bij opslag zodat een
  // corrupt record nooit het hele frame kan breken.
  speedMps: z.number().finite().min(0).max(2000).nullable().optional(),
  altitude: z.number().finite().nullable().optional(),
  heading: z.number().finite().min(0).max(65535).nullable().optional(),
  satellites: z.number().int().min(0).max(255).nullable().optional(),
  priority: z.number().int().min(0).max(255).nullable().optional(),
  io: z
    .array(z.object({ id: z.number().int(), value: z.unknown() }))
    .nullable()
    .optional(),
});

const teltonikaIngestSchema = z.object({
  imei: z.string().trim().min(10).max(20),
  codec: z.string().nullable().optional(),
  records: z.array(avlRecordSchema).min(1).max(500),
});

/** Canonische content-hash voor dedupe bij device-herverzending. */
function recordHash(r: z.infer<typeof avlRecordSchema>): string {
  const canonical = JSON.stringify([
    r.timestamp,
    r.latitude,
    r.longitude,
    r.speedMps ?? null,
    r.altitude ?? null,
    r.heading ?? null,
    r.satellites ?? null,
    r.priority ?? null,
    r.io ?? null,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

/** Constant-time key-vergelijking: SHA-256-digests (vaste lengte) zodat
 * timingSafeEqual altijd veilig is en de key-lengte niet lekt. */
function ingestKeyMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const reqId = correlationId(req);
  logRequest(req, reqId, { route: "ingest/teltonika" });
  // Machine-tot-machine auth via gedeelde sleutel
  const ingestKey = req.headers.get("x-ingest-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.TELTONIKA_INGEST_KEY;
  if (!expected) {
    return NextResponse.json(
      { accepted: 0, error: "TELTONIKA_INGEST_KEY niet geconfigureerd op de server" },
      { status: 500 }
    );
  }
  if (!ingestKey || !ingestKeyMatches(ingestKey, expected)) {
    return NextResponse.json({ accepted: 0, error: "Ongeldige ingest-key" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = teltonikaIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { accepted: 0, error: "Ongeldige payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { imei, records } = parsed.data;
  const codec = parsed.data.codec ?? null;

  // Device moet geregistreerd én geautoriseerd zijn (IMEI-allowlist)
  const device = await prisma.gpsDevice.findUnique({ where: { imei } });
  if (!device || device.deletedAt) {
    return NextResponse.json({ accepted: 0, error: "Device niet geregistreerd" }, { status: 403 });
  }
  if (device.status !== "active") {
    return NextResponse.json(
      { accepted: 0, error: "Device niet geautoriseerd (status: " + device.status + ")" },
      { status: 403 }
    );
  }

  // Voertuig-koppeling is vereist om locaties op te slaan (US-14/US-06)
  let vehicle = null;
  if (device.vehicleId) {
    vehicle = await prisma.ingestSource.findFirst({
      where: { id: device.vehicleId, deletedAt: null },
    });
  }

  const receivedAt = new Date();
  let lastFixAt = device.lastFixAt;
  let lastLat = device.lastLat;
  let lastLon = device.lastLon;
  let lastSpeed = device.lastSpeedMps;
  let accepted = 0;
  let duplicates = 0;

  for (const r of records) {
    // Timestamp normaliseren: ongeldige of absurde waarden (corrupte records)
    // vallen terug op ontvangsttijd — nooit het hele frame laten falen.
    const t = Date.parse(r.timestamp);
    const sane = !Number.isNaN(t) && t > 946684800000 && t < 4102444800000; // 2000..2100
    const sampledAt = sane ? new Date(t) : receivedAt;

    // Alleen opslaan als er een voertuig gekoppeld is
    if (!vehicle) continue;

    try {
      await prisma.ingestPoint.create({
        data: {
          sourceId: vehicle.id,
          deviceId: device.id,
          latitude: r.latitude,
          longitude: r.longitude,
          speedMps: r.speedMps != null ? Math.min(Math.max(r.speedMps, 0), 200) : null,
          accuracyMeters: null,
          altitude: r.altitude != null ? Math.max(-1000, Math.min(r.altitude, 30000)) : null,
          heading: r.heading != null ? ((Math.round(r.heading) % 360) + 360) % 360 : null,
          satellites: r.satellites != null ? Math.min(r.satellites, 40) : null,
          priority: r.priority ?? null,
          ioData: r.io && r.io.length > 0 ? (r.io as never) : undefined,
          recordHash: recordHash(r),
          sampledAt,
          receivedAt,
        },
      });
      accepted++;
    } catch (err) {
      // P2002 = unieke constraint (deviceId, recordHash): dit record staat al
      // duurzaam in de DB (herverzending na gefaalde ACK). Telt mee voor de ACK
      // zodat het device stopt met herverzenden.
      if ((err as { code?: string })?.code === "P2002") {
        accepted++;
        duplicates++;
      }
      // Andere opslagfout: record overslaan, telt niet mee voor de ACK.
    }

    // Laatste positie bijwerken (alleen als recenter)
    if (!lastFixAt || sampledAt > lastFixAt) {
      lastFixAt = sampledAt;
      lastLat = r.latitude;
      lastLon = r.longitude;
      lastSpeed = r.speedMps ?? lastSpeed;
    }
  }

  // Device live-status updaten
  await prisma.gpsDevice.update({
    where: { id: device.id },
    data: {
      lastSeenAt: receivedAt,
      lastFixAt,
      lastLat,
      lastLon,
      lastSpeedMps: lastSpeed,
      lastRecordCount: device.lastRecordCount + accepted,
    },
  });

  // Voertuig-positie + afstand updaten (US-15/US-16) en regels evalueren
  if (vehicle && accepted > 0) {
    // Kies het record met de meest recente GELDIGE timestamp.
    // Fallback: als ALLE timestamps corrupt zijn (bekend FMC920-probleem bij
    // sommige firmware-versies), neem het laatst ontvangen record alsnog —
    // anders wordt de voertuig-positie nooit bijgewerkt.
    const withValidTs = records
      .map((r) => ({ ...r, t: Date.parse(r.timestamp) }))
      .filter((r) => !Number.isNaN(r.t) && r.t > 946684800000 && r.t < 4102444800000)
      .sort((a, b) => b.t - a.t);

    const newest = withValidTs[0] ?? records[records.length - 1];
    const hasValidTs =
      newest.t !== undefined &&
      !Number.isNaN(newest.t) &&
      newest.t > 946684800000 &&
      newest.t < 4102444800000;
    const sampledAt = hasValidTs ? new Date(newest.t) : receivedAt;

    try {
      const { calculateDistanceDelta } = await import("@/lib/distance");
      const delta = calculateDistanceDelta(
        vehicle.lastCalcLat,
        vehicle.lastCalcLon,
        vehicle.lastCalcAt,
        newest.latitude,
        newest.longitude,
        sampledAt
      );
      const newTotal = (vehicle.totalDistanceKm ?? 0) + delta.distanceM / 1000;
      const newCurrent = (vehicle.currentKm ?? vehicle.startingKm ?? 0) + delta.distanceM / 1000;

      await prisma.ingestSource.update({
        where: { id: vehicle.id },
        data: {
          latitude: newest.latitude,
          longitude: newest.longitude,
          speedMps: newest.speedMps ?? null,
          sampledAt,
          receivedAt,
          lastCalcLat: newest.latitude,
          lastCalcLon: newest.longitude,
          lastCalcAt: sampledAt,
          totalDistanceKm: newTotal,
          currentKm: newCurrent,
        },
      });
    } catch {
      await prisma.ingestSource.update({
        where: { id: vehicle.id },
        data: {
          latitude: newest.latitude,
          longitude: newest.longitude,
          speedMps: newest.speedMps ?? null,
          sampledAt,
          receivedAt,
        },
      });
    }

    if (!vehicle.deletedAt) {
      const { processIngest } = await import("@/lib/rules/events");
      processIngest(vehicle).catch((err) => {
        console.error("Rule evaluation failed:", err);
      });
    }
  }

  logger.info("ingest result", { reqId, imei, accepted, duplicates, total: records.length, vehicleLinked: !!vehicle });
  return NextResponse.json(
    {
    accepted,
    duplicates,
    total: records.length,
    codec,
    vehicleLinked: !!vehicle,
    deviceId: device.id,
    reqId,
    },
    { headers: { "X-Request-Id": reqId } }
  );
}
