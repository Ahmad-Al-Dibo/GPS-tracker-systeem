// Events API: GET (lijst met filters)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const severity = url.searchParams.get("severity");
  const vehicleId = url.searchParams.get("vehicleId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (severity) where.severity = severity;
  if (vehicleId) where.vehicleId = vehicleId;
  // Soft delete: events van verwijderde voertuigen niet in actieve lijst
  where.vehicle = { deletedAt: null };
  if (from || to) {
    where.startTime = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  // Niet-admin ziet alleen eigen voertuigen
  if (auth.user.role !== "admin") {
    const ownSources = await prisma.ingestSource.findMany({
      where: { ownerUserId: auth.user.id, deletedAt: null },
      select: { id: true },
    });
    where.vehicleId = { in: ownSources.map((s) => s.id) };
  }

  const events = await prisma.event.findMany({
    where,
    include: {
      rule: { select: { id: true, name: true, severity: true } },
      vehicle: { select: { id: true, name: true, displayName: true, iconEmoji: true } },
      assignee: { select: { id: true, username: true } },
    },
    orderBy: { startTime: "desc" },
    take: limit,
  });

  const total = await prisma.event.count({ where });

  return NextResponse.json({
    total,
    events: events.map((e) => ({
      ...e,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime?.toISOString() ?? null,
      resolvedAt: e.resolvedAt?.toISOString() ?? null,
      dismissedAt: e.dismissedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
  });
}
