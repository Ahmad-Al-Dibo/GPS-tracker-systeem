// Route API: GET (detail met punten), PATCH (naam/omschrijving + volledige
// punten-vervanging in één transactie), DELETE (soft)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { routeCreateSchema, serializeRoute } from "@/lib/locations/routes";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const route = await prisma.route.findUnique({
    where: { id },
    include: { points: true },
  });
  if (!route || route.deletedAt) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }
  return NextResponse.json(serializeRoute(route));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const existing = await prisma.route.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  // PATCH vervangt de puntenlijst volledig als `points` meegegeven wordt;
  // alle velden optioneel (naam/omschrijving/punten afzonderlijk wijzigbaar)
  const parsed = routeCreateSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }
  const d = parsed.data;

  const route = await prisma.$transaction(async (tx) => {
    await tx.route.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
      },
    });
    if (d.points !== undefined) {
      // Volledige vervanging: bestaande punten weg, nieuwe in volgorde
      await tx.routePoint.deleteMany({ where: { routeId: id } });
      for (let i = 0; i < d.points.length; i++) {
        const p = d.points[i];
        await tx.routePoint.create({
          data: {
            routeId: id,
            orderIndex: i,
            locationId: p.locationId ?? null,
            name: p.name,
            address: p.address ?? null,
            latitude: p.latitude,
            longitude: p.longitude,
          },
        });
      }
    }
    return tx.route.findUniqueOrThrow({
      where: { id },
      include: { points: true },
    });
  });

  await logAudit(auth.user.id, "route.updated", "route", id, {
    name: route.name,
    points: route.points.length,
  });

  return NextResponse.json(serializeRoute(route));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const existing = await prisma.route.findUnique({
    where: { id },
    include: { _count: { select: { points: true } } },
  });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }

  // Soft delete — route-punten blijven bewaard voor herstel/audit
  await prisma.route.update({ where: { id }, data: { deletedAt: new Date() } });
  await logAudit(auth.user.id, "route.deleted", "route", id, {
    name: existing.name,
    points: existing._count.points,
  });

  return NextResponse.json({ ok: true, softDeleted: true });
}
