// Tracker-beheer: GET (alle trackers) + POST (nieuwe tracker)
// Trackers zijn IngestSource's met tracker-gegevens; hier aparte view voor beheer
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const trackerCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  serialNumber: z.string().trim().min(1).max(80),
  brand: z.string().trim().max(60).nullable().optional(),
  trackerType: z.string().trim().max(60).nullable().optional(),
  simCardNumber: z.string().trim().max(30).nullable().optional(),
  sourceType: z.enum(["physical", "app"]).default("physical"),
  vehicleId: z.string().uuid().nullable().optional(),
});

export async function GET() {
  const { auth, res } = await requireAuth();
  if (res) return res;

  // Haal alle IngestSource's op die tracker-gegevens hebben (zonder prullenbak)
  const trackers = await prisma.ingestSource.findMany({
    where: {
      deletedAt: null,
      // Multi-tenancy: admin alles, gebruiker alleen eigen trackers
      ...(auth!.user.role === "admin" ? {} : { ownerUserId: auth!.user.id }),
      OR: [
        { trackerSerial: { not: null } },
        { trackerSource: "physical" },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    trackers: trackers.map((t) => ({
      id: t.id,
      name: t.name,
      serialNumber: t.trackerSerial,
      brand: t.trackerBrand,
      trackerType: t.trackerType,
      simCardNumber: t.simCardNumber,
      sourceType: t.trackerSource,
      isActive: t.isActive,
      lastSeen: t.receivedAt.toISOString(),
      latitude: t.latitude,
      longitude: t.longitude,
      vehicleName: t.displayName ?? t.name,
      vehicleLicensePlate: t.licensePlate,
      createdAt: t.createdAt.toISOString(),
    })),
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
