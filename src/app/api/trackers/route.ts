// Tracker-beheer (Phase 2): één uniforme lijst voor hardware + mobiel.
// Trackers = IngestSource-records met identiteit (externalId); GpsDevice is
// de hardware-sidecar. GET ondersteunt zoeken/filter/paginatie; POST blijft
// de optionele handmatige aanmaak (auto-registratie is de default).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";
import { sourceTrackingState, liveSpeedKmh, deviceConnectionState } from "@/lib/tracking-state";
import { trackerMetadataSchema } from "@/lib/tracker-identity";

const trackerCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  serialNumber: z.string().trim().min(1).max(80),
  brand: z.string().trim().max(60).nullable().optional(),
  trackerType: z.string().trim().max(60).nullable().optional(),
  simCardNumber: z.string().trim().max(30).nullable().optional(),
  sourceType: z.enum(["physical", "app"]).default("physical"),
  vehicleId: z.string().uuid().nullable().optional(),
});

/** Zoekvelden over identiteit + admin- én apparaat-metadata. */
function searchFilter(q: string) {
  const contains = (v: string) => ({ contains: v, mode: "insensitive" as const });
  // Json path-filters ondersteunen geen `mode` (case-sensitive `string_contains`).
  const json = (path: string[]) => ({ path, string_contains: q });
  return {
    OR: [
      { name: contains(q) },
      { displayName: contains(q) },
      { externalId: contains(q) },
      { licensePlate: contains(q) },
      { trackerSerial: contains(q) },
      { brand: contains(q) },
      { metadata: json(["driver"]) },
      { metadata: json(["vehicle_registration"]) },
      { deviceMetadata: json(["driver"]) },
      { deviceMetadata: json(["vehicle_registration"]) },
      { deviceMetadata: json(["company"]) },
    ],
  };
}

export async function GET(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const sourceType = url.searchParams.get("sourceType") ?? "";
  const verification = url.searchParams.get("verificationStatus") ?? "";
  const connection = url.searchParams.get("connection") ?? "";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);

  const where = {
    deletedAt: null,
    // Multi-tenancy: admin alles, gebruiker alleen eigen trackers
    ...(auth!.user.role === "admin" ? {} : { ownerUserId: auth!.user.id }),
    ...(sourceType && sourceType !== "all" ? { sourceType } : {}),
    ...(verification ? { verificationStatus: verification } : {}),
    ...(q ? searchFilter(q) : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.ingestSource.count({ where }),
    prisma.ingestSource.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: limit,
      skip: offset,
      include: { devices: { where: { deletedAt: null }, take: 1 } },
    }),
  ]);

  // Verbindingsfilter gebeurt in memory (gecomputeerde staat, drempels uit
  // config); small genoeg na serverse paginatie.
  const items = rows
    .map((t) => {
      const device = t.devices[0] ?? null;
      const state = device
        ? deviceConnectionState(t.receivedAt, device.status)
        : sourceTrackingState(t);
      return {
        id: t.id,
        name: t.name,
        displayName: t.displayName,
        externalId: t.externalId,
        sourceType: t.sourceType,
        verificationStatus: t.verificationStatus,
        connectionState: state,
        lastSeen: t.receivedAt.toISOString(),
        firstSeenAt: (t.firstSeenAt ?? t.createdAt).toISOString(),
        latitude: t.latitude,
        longitude: t.longitude,
        speedKmh: liveSpeedKmh(state, t.speedMps),
        metadata: t.metadata ?? null,
        deviceMetadata: t.deviceMetadata ?? null,
        licensePlate: t.licensePlate,
        description: t.description,
        iconEmoji: t.iconEmoji,
        hardware: device
          ? {
              imei: device.imei,
              status: device.status,
              brand: device.brand,
              model: device.model,
              protocol: device.protocol,
              label: device.label,
              lastRecordCount: device.lastRecordCount,
            }
          : null,
      };
    })
    .filter((t) => {
      if (!connection || connection === "all") return true;
      if (connection === "online") return t.connectionState === "online";
      if (connection === "offline") return t.connectionState === "offline" || t.connectionState === "revoked";
      if (connection === "stale") return t.connectionState === "stale" || t.connectionState === "unknown";
      return true;
    });

  return NextResponse.json({
    trackers: items,
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
  });
}

export async function POST(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const body = await req.json().catch(() => null);
  const parsed = trackerCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige invoer", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;

  // Unieke serienummer controleren
  const existingSerial = await prisma.ingestSource.findFirst({
    where: { trackerSerial: d.serialNumber },
  });
  if (existingSerial) {
    return NextResponse.json({ error: "Serienummer bestaat al" }, { status: 409 });
  }

  // Unieke naam controleren (ook in prullenbak)
  const existingName = await prisma.ingestSource.findUnique({ where: { name: d.name } });
  if (existingName) {
    if (existingName.deletedAt) {
      return NextResponse.json(
        { error: "Naam staat in de prullenbak — herstel of verwijder dat record eerst definitief" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Naam bestaat al" }, { status: 409 });
  }

  const tracker = await prisma.ingestSource.create({
    data: {
      name: d.name,
      trackerSerial: d.serialNumber,
      trackerBrand: d.brand,
      trackerType: d.trackerType,
      simCardNumber: d.simCardNumber,
      trackerSource: d.sourceType,
      ownerUserId: auth.user.id,
    },
  });

  return NextResponse.json(
    {
      id: tracker.id,
      name: tracker.name,
      serialNumber: tracker.trackerSerial,
      sourceType: tracker.trackerSource,
      createdAt: tracker.createdAt.toISOString(),
    },
    { status: 201 }
  );
}
