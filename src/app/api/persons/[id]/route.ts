// Person API: GET, PATCH, DELETE (soft delete) + ?permanent=true (definitief)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const personUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(120).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  country: z.string().trim().max(60).nullable().optional(),
  zipcode: z.string().trim().max(20).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      vehicles: {
        where: { vehicle: { deletedAt: null } },
        include: {
          vehicle: {
            select: { id: true, displayName: true, name: true, licensePlate: true, iconEmoji: true },
          },
        },
      },
    },
  });
  if (!person || person.deletedAt) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }

  return NextResponse.json({
    ...person,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
    vehicles: person.vehicles.map((v) => ({
      id: v.vehicle.id,
      displayName: v.vehicle.displayName ?? v.vehicle.name,
      licensePlate: v.vehicle.licensePlate,
      iconEmoji: v.vehicle.iconEmoji,
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const existing = await prisma.person.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = personUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const updated = await prisma.person.update({ where: { id }, data: parsed.data });
  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
}

/**
 * DELETE /api/persons/[id] — soft delete (gaat naar prullenbak).
 * DELETE /api/persons/[id]?permanent=true&confirm=true — definitief verwijderen
 * (admin, alleen uit de prullenbak, vereist confirm=true bij afhankelijkheden).
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const url = new URL(req.url);
  const permanent = url.searchParams.get("permanent") === "true";
  const confirm = url.searchParams.get("confirm") === "true";

  const { id } = await params;
  const existing = await prisma.person.findUnique({
    where: { id },
    include: { _count: { select: { vehicles: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  // ── Definitief verwijderen (admin + bevestiging) ──
  if (permanent) {
    const { auth, res } = await requireAdmin();
    if (res) return res;

    if (!existing.deletedAt) {
      return NextResponse.json(
        { error: "Alleen verwijderde records kunnen definitief worden verwijderd" },
        { status: 400 }
      );
    }

    const dependencies = { links: existing._count.vehicles };
    // Bevestiging is altijd verplicht bij definitief verwijderen
    if (!confirm) {
      return NextResponse.json(
        {
          error: "Bevestiging vereist voor definitief verwijderen",
          code: "needs_confirmation",
          dependencies,
        },
        { status: 409 }
      );
    }

    await prisma.$transaction([
      prisma.vehiclePerson.deleteMany({ where: { personId: id } }),
      prisma.person.delete({ where: { id } }),
    ]);

    await logAudit(auth.user.id, "person.purge", "person", id, {
      name: existing.name,
      removed: dependencies,
    });

    return NextResponse.json({ ok: true, purged: true, removed: dependencies });
  }

  // ── Soft delete (naar prullenbak) ──
  const { auth, res } = await requireAuth();
  if (res) return res;

  if (existing.deletedAt) {
    return NextResponse.json({ error: "Staat al in de prullenbak" }, { status: 409 });
  }

  // Koppelingen blijven bewaard zodat herstel de relaties terugzet.
  await prisma.person.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: auth.user.id },
  });

  await logAudit(auth.user.id, "person.delete", "person", id, {
    name: existing.name,
    links: existing._count.vehicles,
  });

  return NextResponse.json({ ok: true, softDeleted: true, links: existing._count.vehicles });
}
