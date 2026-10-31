// PATCH/DELETE /api/keys/[id] — bewerken/intrekken
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

/** PATCH — actief/inactief */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key || key.userId !== auth.user.id) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const isActive = typeof body?.isActive === "boolean" ? body.isActive : !key.isActive;

  const updated = await prisma.apiKey.update({
    where: { id },
    data: {
      isActive,
      ...(isActive ? { revokedAt: null } : { revokedAt: new Date() }),
    },
    select: { id: true, isActive: true, revokedAt: true },
  });

  return NextResponse.json({
    id: updated.id,
    isActive: updated.isActive,
    revokedAt: updated.revokedAt?.toISOString() ?? null,
  });
}

/** DELETE — permanent intrekken */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key || key.userId !== auth.user.id) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }

  await prisma.apiKey.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
