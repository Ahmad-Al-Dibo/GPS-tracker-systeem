// Locatie API: GET (detail), PATCH (bewerken), DELETE (soft) + restore
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const locationUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  address: z.string().trim().min(1).max(300).optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  geocodeProvider: z.enum(["photon", "nominatim", "manual"]).optional(),
  geocodeLabel: z.string().trim().max(300).nullable().optional(),
  type: z.enum(["permanent", "temporary"]).optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  color: z.string().trim().max(20).nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

function serialize(l: {
  id: string; name: string; address: string; latitude: number; longitude: number;
  geocodeProvider: string | null; geocodeLabel: string | null; type: string;
  startsAt: Date | null; expiresAt: Date | null; notes: string | null; color: string | null;
  deletedAt: Date | null; createdAt: Date; updatedAt: Date;
}) {
  return {
    ...l,
    startsAt: l.startsAt?.toISOString() ?? null,
    expiresAt: l.expiresAt?.toISOString() ?? null,
    deletedAt: l.deletedAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const location = await prisma.managedLocation.findUnique({ where: { id } });
  if (!location || location.deletedAt) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }
  return NextResponse.json(serialize(location));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const existing = await prisma.managedLocation.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = locationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }
  const d = parsed.data;

  const nextType = d.type ?? existing.type;
  const nextExpires = d.expiresAt !== undefined ? (d.expiresAt ? new Date(d.expiresAt) : null) : existing.expiresAt;
  const nextStarts = d.startsAt !== undefined ? (d.startsAt ? new Date(d.startsAt) : null) : existing.startsAt;

  if (nextType === "temporary" && !nextExpires) {
    return NextResponse.json(
      { error: "Tijdelijke locatie vereist een vervaldatum" },
      { status: 400 }
    );
  }
  if (nextStarts && nextExpires && nextStarts > nextExpires) {
    return NextResponse.json(
      { error: "Startdatum ligt na de vervaldatum" },
      { status: 400 }
    );
  }

  const updated = await prisma.managedLocation.update({ where: { id }, data: d });
  await logAudit(auth.user.id, "location.updated", "location", id, { name: updated.name });
  return NextResponse.json(serialize(updated));
}

/** DELETE — soft delete (prullenbak-gedrag binnen de module). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const existing = await prisma.managedLocation.findUnique({
    where: { id },
    include: { _count: { select: { routePoints: true } } },
  });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }

  // Soft delete; route-punten behouden hun snapshot (SetNull op locationId
  // gebeurt pas bij definitieve verwijdering — hier blijft referentie staan).
  await prisma.managedLocation.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await logAudit(auth.user.id, "location.deleted", "location", id, {
    name: existing.name,
    routePoints: existing._count.routePoints,
  });

  return NextResponse.json({ ok: true, softDeleted: true, routePoints: existing._count.routePoints });
}

/** POST /api/locations/[id]/restore — herstel (apart route-bestand zie restore/). */
