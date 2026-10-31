// GET /api/overview — dashboard-statistieken
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

export async function GET() {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const now = Date.now();
  const isOffline = (d: Date) => now - d.getTime() > 120_000;

  const where: Record<string, unknown> =
    auth.user.role === "admin" ? {} : { ownerUserId: auth.user.id };
  // Soft delete: verwijderde voertuigen tellen niet mee
  where.deletedAt = null;

  const sources = await prisma.ingestSource.findMany({ where });
  const sourceIds = sources.map((s) => s.id);

  const [openEvents, openTasks, recentEvents, unreadNotifs] =
    await Promise.all([
      prisma.event.count({
        where: {
          status: { in: ["new", "under_review"] },
          vehicle: { deletedAt: null },
        },
      }),
      prisma.task.count({
        where: { status: { in: ["open", "in_progress", "overdue"] } },
      }),
      prisma.event.findMany({
        where: { vehicleId: { in: sourceIds } },
        include: { rule: { select: { name: true } }, vehicle: { select: { displayName: true, name: true } } },
        orderBy: { startTime: "desc" },
        take: 10,
      }),
      prisma.notification.count({
        where: { userId: auth.user.id, isRead: false },
      }),
    ]);

  const total = sources.length;
  const online = sources.filter((s: { receivedAt: Date }) => !isOffline(s.receivedAt)).length;
  const offline = total - online;
  const moving = sources.filter(
    (s: { speedMps: number | null; receivedAt: Date }) =>
      s.speedMps != null && s.speedMps >= 1.0 && !isOffline(s.receivedAt)
  ).length;
  const stationary = online - moving;

  return NextResponse.json({
    totalVehicles: total,
    online,
    offline,
    moving,
    stationary,
    openEvents,
    openTasks,
    unreadNotifications: unreadNotifs,
    recentEvents: recentEvents.map((e) => ({
      id: e.id,
      vehicleName: e.vehicle.displayName ?? e.vehicle.name,
      ruleName: e.rule.name,
      severity: e.severity,
      status: e.status,
      startTime: e.startTime.toISOString(),
      measuredValue: e.measuredValue,
    })),
    serverTime: new Date(now).toISOString(),
  });
}
