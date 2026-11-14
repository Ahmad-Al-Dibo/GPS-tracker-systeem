// Users API: beheer (admin only)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { res } = await requireAdmin();
  if (res) return res;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      isActive: true,
      createdAt: true,
      _count: { select: { sources: true, apiKeys: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const { auth, res } = await requireAdmin();
  if (res) return res;

  const body = await req.json().catch(() => ({}));
  const { userId, role, isActive } = body;

  if (!userId) {
    return NextResponse.json({ error: "userId verplicht" }, { status: 400 });
  }

  // Eigen account niet deactiveren
  if (userId === auth.user.id && isActive === false) {
    return NextResponse.json(
      { error: "Je kunt je eigen account niet deactiveren" },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  if (role && ["user", "admin"].includes(role)) data.role = role;
  if (typeof isActive === "boolean") data.isActive = isActive;

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, email: true, username: true, role: true, isActive: true },
  });

  // Bij deactiveren: sessies intrekken
  if (isActive === false) {
    await prisma.session.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });
  }

  await logAudit(auth.user.id, "user.updated", "user", userId, data as Record<string, string | number | boolean>);

  return NextResponse.json(updated);
}
