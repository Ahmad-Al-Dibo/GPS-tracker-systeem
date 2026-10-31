// Voertuig-Persoon koppeling API (US-07)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const linkSchema = z.object({
  vehicleId: z.string().uuid(),
  personId: z.string().uuid(),
});

/** POST /api/vehicle-persons — persoon koppelen aan voertuig */
export async function POST(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const body = await req.json().catch(() => null);
  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const { vehicleId, personId } = parsed.data;

  // Controleer of beide bestaan én niet in de prullenbak staan
  const [vehicle, person] = await Promise.all([
    prisma.ingestSource.findUnique({ where: { id: vehicleId } }),
    prisma.person.findUnique({ where: { id: personId } }),
  ]);
  if (!vehicle) return NextResponse.json({ error: "Voertuig niet gevonden" }, { status: 404 });
  if (!person) return NextResponse.json({ error: "Persoon niet gevonden" }, { status: 404 });
  if (vehicle.deletedAt) {
    return NextResponse.json({ error: "Voertuig staat in de prullenbak" }, { status: 409 });
  }
  if (person.deletedAt) {
    return NextResponse.json({ error: "Persoon staat in de prullenbak" }, { status: 409 });
  }

  // Al gekoppeld?
  const existing = await prisma.vehiclePerson.findUnique({
    where: { vehicleId_personId: { vehicleId, personId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Al gekoppeld" }, { status: 409 });
  }

  const link = await prisma.vehiclePerson.create({
    data: { vehicleId, personId },
  });

  return NextResponse.json({ ok: true, linkId: link.id }, { status: 201 });
}

/** DELETE /api/vehicle-persons?vehicleId=...&personId=... — koppeling verwijderen */
export async function DELETE(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const url = new URL(req.url);
  const vehicleId = url.searchParams.get("vehicleId");
  const personId = url.searchParams.get("personId");

  if (!vehicleId || !personId) {
    return NextResponse.json({ error: "vehicleId en personId verplicht" }, { status: 400 });
  }

  await prisma.vehiclePerson.deleteMany({
    where: { vehicleId, personId },
  });

  return NextResponse.json({ ok: true });
}
