// Routes API: GET (lijst) + POST (aanmaken met punten)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { routeCreateSchema, serializeRoute } from "@/lib/locations/routes";

export async function GET() {
  const { res } = await requireAuth();
  if (res) return res;

  const routes = await prisma.route.findMany({
    where: { deletedAt: null },
    include: { points: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ routes: routes.map(serializeRoute) });
}

export async function POST(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const body = await req.json().catch(() => null);
  const parsed = routeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige invoer", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const route = await prisma.$transaction(async (tx) => {
    const created = await tx.route.create({
      data: {
        name: d.name,
        description: d.description ?? null,
        createdById: auth.user.id,
      },
    });
    for (let i = 0; i < d.points.length; i++) {
      const p = d.points[i];
      await tx.routePoint.create({
        data: {
          routeId: created.id,
          orderIndex: i,
          locationId: p.locationId ?? null,
          name: p.name,
          address: p.address ?? null,
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

  await logAudit(auth.user.id, "route.created", "route", route.id, {
    name: route.name,
    points: d.points.length,
  });

  return NextResponse.json(serializeRoute(route), { status: 201 });
}
