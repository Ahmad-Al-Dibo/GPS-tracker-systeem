// Events API: GET (detail + bewijspunten), PATCH (status/assign/notities)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { addPostEventPoints } from "@/lib/rules/events";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

// Zod i.p.v. handmatige checks: assignedUserId moet een UUID zijn anders
// gooit Prisma een onbehandelde 500; status is een gesloten enum.
const eventPatchSchema = z.object({
  status: z.enum(["new", "under_review", "resolved", "dismissed"]).optional(),
  assignedUserId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  reviewNotes: z.string().max(5000).optional(),
});

/** Autorisatie voor een event: admin of eigenaar van het gekoppelde voertuig.
 * Zowel GET als PATCH gebruiken dit — dezelfde regel, geen IDOR-gat. */
async function canAccessEvent(
  role: string,
  userId: string,
  vehicleId: string
): Promise<boolean> {
  if (role === "admin") return true;
  const owns = await prisma.ingestSource.findFirst({
    where: { id: vehicleId, ownerUserId: userId },
  });
  return !!owns;
}

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
  if (!(await canAccessEvent(auth.user.role, auth.user.id, event.vehicleId))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
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

  // Dezelfde eigenaar/admin-regel als GET — anders mag elke ingelogde
  // gebruiker elk event wijzigen (IDOR).
  if (!(await canAccessEvent(auth.user.role, auth.user.id, event.vehicleId))) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = eventPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige invoer", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const data: Record<string, unknown> = {};

  if (parsed.data.status) {
    data.status = parsed.data.status;
    if (parsed.data.status === "resolved") data.resolvedAt = new Date();
    if (parsed.data.status === "dismissed") data.dismissedAt = new Date();
  }
  if (parsed.data.assignedUserId !== undefined) {
    data.assignedUserId = parsed.data.assignedUserId || null;
  }
  if (parsed.data.reviewNotes !== undefined) data.reviewNotes = parsed.data.reviewNotes;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, status: event.status });
  }

  const updated = await prisma.event.update({
    where: { id },
    data,
    include: { rule: { select: { postEventPoints: true } } },
  });

  // Bij resolve: post-event bewijs toevoegen
  if (parsed.data.status === "resolved") {
    await addPostEventPoints(id, event.vehicleId, updated.rule.postEventPoints);
  }

  await logAudit(auth.user.id, "event.updated", "event", id, {
    status: parsed.data.status,
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
