// Notifications API
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 30)));

  const notifications = await prisma.notification.findMany({
    where: {
      userId: auth.user.id,
      ...(unreadOnly ? { isRead: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: auth.user.id, isRead: false },
  });

  return NextResponse.json({
    unreadCount,
    notifications: notifications.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}

/** POST /api/notifications — markeer als gelezen (id of alle) */
export async function POST(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const body = await req.json().catch(() => ({}));

  if (body.all === true) {
    await prisma.notification.updateMany({
      where: { userId: auth.user.id, isRead: false },
      data: { isRead: true },
    });
  } else if (body.id) {
    await prisma.notification.updateMany({
      where: { id: body.id, userId: auth.user.id },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ ok: true });
}
