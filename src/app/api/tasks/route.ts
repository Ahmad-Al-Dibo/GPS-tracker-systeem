// Tasks API
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  eventId: z.string().uuid().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});

export async function GET(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  if (auth.user.role !== "admin") {
    where.OR = [
      { assigneeId: auth.user.id },
      { creatorId: auth.user.id },
    ];
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      vehicle: { select: { id: true, name: true, displayName: true, iconEmoji: true } },
      assignee: { select: { id: true, username: true } },
      creator: { select: { id: true, username: true } },
      event: { select: { id: true, severity: true } },
    },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      ...t,
      dueDate: t.dueDate?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const body = await req.json().catch(() => null);
  const parsed = taskCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: {
      ...parsed.data,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      creatorId: auth.user.id,
    },
  });

  await logAudit(auth.user.id, "task.created", "task", task.id, { title: task.title });

  return NextResponse.json(
    { ...task, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() },
    { status: 201 }
  );
}
