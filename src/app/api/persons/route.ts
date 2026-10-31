// Personen API: GET (lijst) + POST (aanmaken)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const personSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(120),
  email: z.string().trim().email().max(120).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  country: z.string().trim().max(60).nullable().optional(),
  zipcode: z.string().trim().max(20).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export async function GET() {
  const { auth, res } = await requireAuth();
  if (res) return res;

  // Soft delete: verwijderde personen en gekoppelde verwijderde voertuigen tonen
  const persons = await prisma.person.findMany({
    where: { deletedAt: null },
    include: {
      vehicles: {
        where: { vehicle: { deletedAt: null } },
        include: { vehicle: { select: { id: true, displayName: true, name: true, licensePlate: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    persons: persons.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      vehicles: p.vehicles.map((v) => ({
        id: v.vehicle.id,
        displayName: v.vehicle.displayName ?? v.vehicle.name,
        licensePlate: v.vehicle.licensePlate,
      })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const body = await req.json().catch(() => null);
  const parsed = personSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige invoer", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const person = await prisma.person.create({ data: parsed.data });
  return NextResponse.json(
    { ...person, createdAt: person.createdAt.toISOString(), updatedAt: person.updatedAt.toISOString() },
    { status: 201 }
  );
}
