// Geofences API: PATCH + DELETE
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAdmin();
  if (res) return res;

  const { id } = await params;
  const existing = await prisma.geofence.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.name) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.color) data.color = body.color;
  if (body.coordinates) data.coordinates = body.coordinates;
  if (body.isActive !== undefined) data.isActive = body.isActive;

  const updated = await prisma.geofence.update({ where: { id }, data });
  await logAudit(auth.user.id, "geofence.updated", "geofence", id);

  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAdmin();
  if (res) return res;

  const { id } = await params;
  const existing = await prisma.geofence.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  await prisma.geofence.delete({ where: { id } });
  await logAudit(auth.user.id, "geofence.deleted", "geofence", id, { name: existing.name });

  return NextResponse.json({ ok: true });
}
