// POST /api/routes/[id]/duplicate — kopieer route + punten
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { serializeRoute } from "@/lib/locations/routes";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const source = await prisma.route.findUnique({
    where: { id },
    include: { points: { orderBy: { orderIndex: "asc" } } },
  });
  if (!source || source.deletedAt) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }

  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.route.create({
      data: {
        name: `${source.name} (kopie)`,
        description: source.description,
        createdById: auth.user.id,
      },
    });
    for (const p of source.points) {
      await tx.routePoint.create({
        data: {
          routeId: created.id,
          orderIndex: p.orderIndex,
          locationId: p.locationId,
          name: p.name,
          address: p.address,
          latitude: p.latitude,
          longitude: p.longitude,
        },
      });
    }
    return tx.route.findUniqueOrThrow({
      where: { id: created.id },
      include: { points: true },
    });
  });

  await logAudit(auth.user.id, "route.duplicated", "route", copy.id, {
    from: source.id,
    name: copy.name,
  });

  return NextResponse.json(serializeRoute(copy), { status: 201 });
}
