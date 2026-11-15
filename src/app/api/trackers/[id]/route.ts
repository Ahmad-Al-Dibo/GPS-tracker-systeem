// Tracker-detail (Phase 2): GET volledig profiel + GPS-history, PATCH
// beheersvelden (displayName/metadata/description). Auth: admin of eigenaar.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireTrackerAccess } from "@/lib/api-helpers";
import { trackerMetadataSchema } from "@/lib/tracker-identity";
import { logAudit } from "@/lib/audit";
import { sourceTrackingState, liveSpeedKmh, deviceConnectionState } from "@/lib/tracking-state";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  // Beheerders-metadata (wordt NOOIT door ingest overschreven)
  metadata: trackerMetadataSchema.nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { source, res } = await requireTrackerAccess(id);
  if (res) return res;

  const [device, recentPoints] = await Promise.all([
    prisma.gpsDevice.findFirst({
      where: { vehicleId: source.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.ingestPoint.findMany({
      where: { sourceId: source.id },
      orderBy: { sampledAt: "desc" },
      take: 100,
    }),
  ]);

  const state = device
    ? deviceConnectionState(source.receivedAt, device.status)
    : sourceTrackingState(source);

  return NextResponse.json({
    id: source.id,
    name: source.name,
    displayName: source.displayName,
    externalId: source.externalId,
    sourceType: source.sourceType,
    verificationStatus: source.verificationStatus,
    connectionState: state,
    firstSeenAt: (source.firstSeenAt ?? source.createdAt).toISOString(),
    lastSeen: source.receivedAt.toISOString(),
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
    latitude: source.latitude,
    longitude: source.longitude,
    speedKmh: liveSpeedKmh(state, source.speedMps),
    lastAltitude: source.lastAltitude,
    lastHeading: source.lastHeading,
    lastBatteryLevel: source.lastBatteryLevel,
    accuracyMeters: source.accuracyMeters,
    metadata: source.metadata ?? null,
    deviceMetadata: source.deviceMetadata ?? null,
    description: source.description,
    // Voertuig-facade (dezelfde rij; voertuigvelden blijven gescheiden)
    licensePlate: source.licensePlate,
    brand: source.brand,
    vehicleType: source.vehicleType,
    trackerSerial: source.trackerSerial,
    iconEmoji: source.iconEmoji,
    hardware: device
      ? {
          id: device.id,
          imei: device.imei,
          deviceType: device.deviceType,
          status: device.status,
          brand: device.brand,
          model: device.model,
          protocol: device.protocol,
          simCardNumber: device.simCardNumber,
          firmware: device.firmware,
          label: device.label,
          lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
          lastRecordCount: device.lastRecordCount,
        }
      : null,
    recentPoints: recentPoints.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      speedMps: p.speedMps,
      altitude: p.altitude,
      heading: p.heading,
      accuracyMeters: p.accuracyMeters,
      sampledAt: p.sampledAt.toISOString(),
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { auth, source, res } = await requireTrackerAccess(id);
  if (res) return res;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige invoer", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const d = parsed.data;
  if (Object.keys(d).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const updated = await prisma.ingestSource.update({
    where: { id: source.id },
    data: {
      ...(d.displayName !== undefined ? { displayName: d.displayName } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.metadata !== undefined
        ? { metadata: d.metadata === null ? Prisma.DbNull : d.metadata }
        : {}),
    },
  });

  await logAudit(auth.user.id, "tracker.updated", "tracker", source.id, {
    fields: Object.keys(d),
  });

  return NextResponse.json({
    ok: true,
    id: updated.id,
    displayName: updated.displayName,
    metadata: updated.metadata ?? null,
  });
}
