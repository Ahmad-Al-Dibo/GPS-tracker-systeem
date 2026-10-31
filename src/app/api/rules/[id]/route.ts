// Rules API: PATCH + DELETE per ID
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAdmin();
  if (res) return res;

  const { id } = await params;
  const existing = await prisma.rule.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  // Alleen toegestane velden
  const allowed = [
    "name", "description", "enabled", "logic", "severity", "vehicleGroup",
    "thresholdValue", "thresholdMin", "thresholdMax", "durationSec", "consecutive",
    "timezone", "weekdays", "timeFrom", "timeTo", "geofenceId",
    "preEventPoints", "postEventPoints", "retentionDays",
    "notifyInApp", "createEvent", "createTask", "taskTitle",
  ] as const;
  for (const key of allowed) {
    if (key in body) data[key] = body[key];
  }

  // Versie verhogen bij configuratiewijziging
  data.version = existing.version + 1;

  const updated = await prisma.rule.update({
    where: { id },
    data,
    include: { conditions: true },
  });

  await logAudit(auth.user.id, "rule.updated", "rule", id, { version: updated.version });

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
  const existing = await prisma.rule.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  await prisma.rule.delete({ where: { id } });
  await logAudit(auth.user.id, "rule.deleted", "rule", id, { name: existing.name });

  return NextResponse.json({ ok: true });
}
