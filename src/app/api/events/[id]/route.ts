// Events API: GET (detail + bewijspunten), PATCH (status/assign/notities)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { addPostEventPoints } from "@/lib/rules/events";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      rule: true,
      vehicle: { select: { id: true, name: true, displayName: true, iconEmoji: true } },
      assignee: { select: { id: true, username: true } },
      points: { orderBy: { sampledAt: "asc" } },
    },
  });

  if (!event) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  // Autorisatie: eigen voertuig of admin
  if (auth.user.role !== "admin") {
    const owns = await prisma.ingestSource.findFirst({
      where: { id: event.vehicleId, ownerUserId: auth.user.id },
    });
    if (!owns) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  return NextResponse.json({
    ...event,
    startTime: event.startTime.toISOString(),
    endTime: event.endTime?.toISOString() ?? null,
    resolvedAt: event.resolvedAt?.toISOString() ?? null,
    dismissedAt: event.dismissedAt?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    points: event.points.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      speedMps: p.speedMps,
      sampledAt: p.sampledAt.toISOString(),
      phase: p.phase,
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (body.status && ["new", "under_review", "resolved", "dismissed"].includes(body.status)) {
    data.status = body.status;
    if (body.status === "resolved") data.resolvedAt = new Date();
    if (body.status === "dismissed") data.dismissedAt = new Date();
  }
  if (body.assignedUserId !== undefined) data.assignedUserId = body.assignedUserId || null;
  if (body.reviewNotes !== undefined) data.reviewNotes = body.reviewNotes;

  const updated = await prisma.event.update({
    where: { id },
    data,
    include: { rule: { select: { postEventPoints: true } } },
  });

  // Bij resolve: post-event bewijs toevoegen
  if (body.status === "resolved") {
    await addPostEventPoints(id, event.vehicleId, updated.rule.postEventPoints);
  }

  await logAudit(auth.user.id, "event.updated", "event", id, { status: body.status });

  return NextResponse.json({ ok: true, status: updated.status });
}
