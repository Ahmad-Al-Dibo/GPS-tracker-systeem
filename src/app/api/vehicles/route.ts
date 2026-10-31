// Voertuigen API: GET (lijst) + POST (aanmaken)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const vehicleSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(80),
  displayName: z.string().trim().max(80).nullable().optional(),
  licensePlate: z.string().trim().max(20).nullable().optional(),
  brand: z.string().trim().max(60).nullable().optional(),
  vehicleType: z.string().trim().max(60).nullable().optional(),
  color: z.string().trim().max(40).nullable().optional(),
  yearOfBuild: z.number().int().min(1900).max(2100).nullable().optional(),
  chassisNumber: z.string().trim().max(50).nullable().optional(),
  startingKm: z.number().min(0).nullable().optional(),
  vehicleGroup: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  iconEmoji: z.string().trim().min(1).max(8).default("🚗"),
  trackerSerial: z.string().trim().max(80).nullable().optional(),
  trackerBrand: z.string().trim().max(60).nullable().optional(),
  trackerType: z.string().trim().max(60).nullable().optional(),
  simCardNumber: z.string().trim().max(30).nullable().optional(),
  trackerSource: z.enum(["physical", "app"]).default("app"),
});

export async function GET() {
  const { auth, res } = await requireAuth();
  if (res) return res;

  // Soft delete: verwijderde voertuigen en gekoppelde verwijderde personen tonen
  const vehicles = await prisma.ingestSource.findMany({
    where: { deletedAt: null },
    include: {
      persons: {
        where: { person: { deletedAt: null } },
        include: {
          person: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    vehicles: vehicles.map((v) => ({
      id: v.id,
      name: v.name,
      displayName: v.displayName ?? v.name,
      licensePlate: v.licensePlate,
      brand: v.brand,
      vehicleType: v.vehicleType,
      color: v.color,
      yearOfBuild: v.yearOfBuild,
      chassisNumber: v.chassisNumber,
      startingKm: v.startingKm,
      currentKm: v.currentKm,
      totalDistanceKm: v.totalDistanceKm,
      vehicleGroup: v.vehicleGroup,
      description: v.description,
      notes: v.notes,
      iconEmoji: v.iconEmoji,
      isActive: v.isActive,
      trackerSerial: v.trackerSerial,
      trackerBrand: v.trackerBrand,
      trackerType: v.trackerType,
      simCardNumber: v.simCardNumber,
      trackerSource: v.trackerSource,
      latitude: v.latitude,
      longitude: v.longitude,
      speedMps: v.speedMps,
      speedKmh: v.speedMps != null ? Math.round(v.speedMps * 3.6 * 10) / 10 : null,
      sampledAt: v.sampledAt?.toISOString() ?? null,
      receivedAt: v.receivedAt.toISOString(),
      persons: v.persons.map((p) => ({
        id: p.person.id,
        name: p.person.name,
      })),
      createdAt: v.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const body = await req.json().catch(() => null);
  const parsed = vehicleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige invoer", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  // Unieke naam controleren (DB-uniek; ook in prullenbak geldt de naam nog)
  const existing = await prisma.ingestSource.findUnique({ where: { name: d.name } });
  if (existing) {
    if (existing.deletedAt) {
      return NextResponse.json(
        { error: "Naam staat in de prullenbak — herstel of verwijder dat voertuig eerst definitief" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Voertuignaam bestaat al" }, { status: 409 });
  }

  const vehicle = await prisma.ingestSource.create({
    data: {
      name: d.name,
      displayName: d.displayName,
      licensePlate: d.licensePlate,
      brand: d.brand,
      vehicleType: d.vehicleType,
      color: d.color,
      yearOfBuild: d.yearOfBuild,
      chassisNumber: d.chassisNumber,
      startingKm: d.startingKm,
      currentKm: d.startingKm,
      vehicleGroup: d.vehicleGroup,
      description: d.description,
      notes: d.notes,
      iconEmoji: d.iconEmoji,
      trackerSerial: d.trackerSerial,
      trackerBrand: d.trackerBrand,
      trackerType: d.trackerType,
      simCardNumber: d.simCardNumber,
      trackerSource: d.trackerSource,
      ownerUserId: auth.user.id,
    },
  });

  return NextResponse.json(
    { ...vehicle, createdAt: vehicle.createdAt.toISOString() },
    { status: 201 }
  );
}
