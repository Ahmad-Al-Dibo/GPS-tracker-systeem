// Tasks API: PATCH + DELETE
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const ALLOWED_STATUS = ["open", "in_progress", "overdue", "done", "cancelled"] as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  // Alleen creator, assignee of admin mag wijzigen
  if (
    auth.user.role !== "admin" &&
    task.creatorId !== auth.user.id &&
    task.assigneeId !== auth.user.id
  ) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.title) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.includes(body.status)) {
      return NextResponse.json(
        { error: `Ongeldige status — toegestaan: ${ALLOWED_STATUS.join(", ")}` },
        { status: 400 }
      );
    }
    data.status = body.status;
    if (body.status === "done") data.completedAt = new Date();
    if (body.status !== "done") data.completedAt = null;

    // Erkenning: uit overdue terug naar open/inuitvoering → melding opnieuw mogelijk
    if ((body.status === "open" || body.status === "in_progress") && task.status === "overdue") {
      data.overdueNotifiedAt = null;
    }
  }
  if (body.priority) data.priority = body.priority;
  if (body.dueDate !== undefined) {
    const newDue = body.dueDate ? new Date(body.dueDate) : null;
    data.dueDate = newDue;
    // Deadline opnieuw ingepland in de toekomst → overdue-status herstellen
    if (
      task.status === "overdue" &&
      newDue &&
      !Number.isNaN(newDue.getTime()) &&
      newDue.getTime() >= Date.now()
    ) {
      data.status = "open";
      data.overdueNotifiedAt = null;
    }
  }
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null;

  const updated = await prisma.task.update({ where: { id }, data });
  await logAudit(auth.user.id, "task.updated", "task", id, { status: body.status });

  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    completedAt: updated.completedAt?.toISOString() ?? null,
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  if (auth.user.role !== "admin" && task.creatorId !== auth.user.id) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  await prisma.task.delete({ where: { id } });
  await logAudit(auth.user.id, "task.deleted", "task", id, { title: task.title });

  return NextResponse.json({ ok: true });
}
