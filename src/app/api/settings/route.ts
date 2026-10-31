// Settings API
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { res } = await requireAuth();
  if (res) return res;

  let settings = await prisma.settings.findUnique({ where: { orgKey: "default" } });
  if (!settings) {
    settings = await prisma.settings.create({ data: { orgKey: "default" } });
  }

  return NextResponse.json({
    ...settings,
    updatedAt: settings.updatedAt.toISOString(),
  });
}

export async function PATCH(req: NextRequest) {
  const { auth, res } = await requireAdmin();
  if (res) return res;

  let settings = await prisma.settings.findUnique({ where: { orgKey: "default" } });
  if (!settings) {
    settings = await prisma.settings.create({ data: { orgKey: "default" } });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  const allowed = [
    "timezone", "unitSpeed", "telemetryIntervalS", "offlineThresholdS",
    "eventRetentionDays", "pointRetentionDays", "notifyInApp", "orgName",
  ] as const;
  for (const key of allowed) {
    if (key in body) data[key] = body[key];
  }

  const updated = await prisma.settings.update({
    where: { id: settings.id },
    data,
  });

  await logAudit(auth.user.id, "settings.updated", "settings", updated.id, data as Record<string, string | number | boolean>);

  return NextResponse.json({
    ...updated,
    updatedAt: updated.updatedAt.toISOString(),
  });
}
