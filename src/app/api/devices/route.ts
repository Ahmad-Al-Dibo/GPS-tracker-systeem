// GPS-hardware apparaten (Teltonika FMC920 e.d.): GET (lijst) + POST (registreren)
// Devices hebben een unieke IMEI en een autorisatie-status (pending/active/revoked).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { deviceConnectionState, liveSpeedKmh, lastKnownSpeedKmh } from "@/lib/tracking-state";
import { z } from "zod";

const deviceCreateSchema = z
  .object({
    deviceType: z.enum(["HARDWARE", "SOFTWARE"]).default("HARDWARE"),
    imei: z.string().trim().min(10).max(20).nullable().optional(),
    simulatorId: z.string().trim().min(3).max(80).nullable().optional(),
    label: z.string().trim().max(80).nullable().optional(),
    brand: z.string().trim().max(60).nullable().optional(),
    model: z.string().trim().max(60).nullable().optional(),
    simCardNumber: z.string().trim().max(30).nullable().optional(),
    firmware: z.string().trim().max(40).nullable().optional(),
    protocol: z.enum(["codec8", "codec8e", "codec16"]).default("codec8e"),
    vehicleId: z.string().uuid().nullable().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.deviceType === "HARDWARE" && !d.imei) {
      ctx.addIssue({ code: "custom", path: ["imei"], message: "IMEI is verplicht voor hardware-apparaten" });
    }
    if (d.deviceType === "SOFTWARE" && !d.simulatorId) {
      ctx.addIssue({ code: "custom", path: ["simulatorId"], message: "Simulator-ID is verplicht voor software-apparaten" });
    }
    if (d.deviceType === "SOFTWARE" && d.imei) {
      ctx.addIssue({ code: "custom", path: ["imei"], message: "Een software-apparaat heeft geen IMEI" });
    }
  });

export async function GET() {
  const { auth, res } = await requireAuth();
  if (res) return res;

  // Multi-tenancy: admin ziet alles; gebruiker alleen eigen apparaten.
  const devices = await prisma.gpsDevice.findMany({
    where: {
      deletedAt: null,
      ...(auth!.user.role === "admin" ? {} : { ownerUserId: auth!.user.id }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      vehicle: {
        select: { id: true, displayName: true, name: true, licensePlate: true },
      },
    },
  });

  return NextResponse.json({
    devices: devices.map((d) => {
      const trackingState = deviceConnectionState(d.lastSeenAt, d.status);
      return {
        id: d.id,
        deviceType: d.deviceType,
        imei: d.imei,
        simulatorId: d.simulatorId,
        label: d.label,
        brand: d.brand,
        model: d.model,
        simCardNumber: d.simCardNumber,
        firmware: d.firmware,
        protocol: d.protocol,
        status: d.status,
        // trackingState = centrale staat; connectionState = legacy-label (UI)
        trackingState,
        connectionState: trackingState === "unknown" ? "never_connected" : trackingState,
        authorizedAt: d.authorizedAt?.toISOString() ?? null,
        vehicleId: d.vehicleId,
        vehicleName: d.vehicle ? (d.vehicle.displayName ?? d.vehicle.name) : null,
        vehicleLicensePlate: d.vehicle?.licensePlate ?? null,
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
        lastLat: d.lastLat,
        lastLon: d.lastLon,
        lastSpeedMps: d.lastSpeedMps,
        // SPEED-CONTRACT: speedLiveKmh alleen bij vers; lastSpeedKmh = historisch
        speedLiveKmh: liveSpeedKmh(trackingState, d.lastSpeedMps),
        lastSpeedKmh: lastKnownSpeedKmh(d.lastSpeedMps),
        lastFixAt: d.lastFixAt?.toISOString() ?? null,
        lastRecordCount: d.lastRecordCount,
        createdAt: d.createdAt.toISOString(),
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const body = await req.json().catch(() => null);
  const parsed = deviceCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige invoer", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;

  // Unieke identiteit per type
  if (d.deviceType === "HARDWARE") {
    const existing = await prisma.gpsDevice.findUnique({ where: { imei: d.imei! } });
    if (existing) {
      return NextResponse.json({ error: "IMEI is al geregistreerd" }, { status: 409 });
    }
    // Geen dubbele identiteit met legacy-tracker-rijen (IngestSource.trackerSerial)
    const legacy = await prisma.ingestSource.findFirst({
      where: { trackerSerial: d.imei, deletedAt: null },
      select: { id: true, name: true },
    });
    if (legacy) {
      return NextResponse.json(
        {
          error:
            "Deze IMEI bestaat al als legacy-tracker (" +
            legacy.name +
            ") — voorkom dubbele identiteiten. Gebruik die tracker of migreer die eerst.",
        },
        { status: 409 }
      );
    }
  } else {
    const existing = await prisma.gpsDevice.findUnique({ where: { simulatorId: d.simulatorId! } });
    if (existing) {
      return NextResponse.json({ error: "Simulator-ID is al geregistreerd" }, { status: 409 });
    }
  }

  // Voertuig bestaat (indien opgegeven)
  if (d.vehicleId) {
    const vehicle = await prisma.ingestSource.findFirst({
      where: { id: d.vehicleId, deletedAt: null },
    });
    if (!vehicle) {
      return NextResponse.json({ error: "Voertuig niet gevonden" }, { status: 404 });
    }
  }

  const device = await prisma.gpsDevice.create({
    data: {
      deviceType: d.deviceType,
      imei: d.deviceType === "HARDWARE" ? d.imei : null,
      simulatorId: d.deviceType === "SOFTWARE" ? d.simulatorId : null,
      label: d.label,
      brand: d.brand ?? "Teltonika",
      model: d.model,
      simCardNumber: d.simCardNumber,
      firmware: d.firmware,
      protocol: d.protocol,
      ownerUserId: auth!.user.id,
      vehicleId: d.vehicleId ?? null,
      assignedAt: d.vehicleId ? new Date() : null,
    },
  });

  return NextResponse.json(
    {
      id: device.id,
      deviceType: device.deviceType,
      imei: device.imei,
      simulatorId: device.simulatorId,
      label: device.label,
      status: device.status,
      vehicleId: device.vehicleId,
      createdAt: device.createdAt.toISOString(),
    },
    { status: 201 }
  );
}
