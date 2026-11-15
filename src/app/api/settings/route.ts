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
    "appDownloadUrl",
  ] as const;
  for (const key of allowed) {
    if (key in body) data[key] = body[key];
  }
  // Alleen een echte https-URL óf een same-origin pad ("/…") —
  // geen arbitrary strings.
  if ("appDownloadUrl" in data) {
    const url = data.appDownloadUrl;
    if (url !== null && url !== "" && typeof url === "string") {
      if (url.startsWith("/") && !url.startsWith("//")) {
        // self-hosted pad (bijv. /downloads/gps-tracker.apk)
        data.appDownloadUrl = url;
      } else {
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          return NextResponse.json({ error: "Ongeldige download-URL" }, { status: 400 });
        }
        if (parsed.protocol !== "https:") {
          return NextResponse.json({ error: "Download-URL moet https zijn" }, { status: 400 });
        }
        data.appDownloadUrl = url;
      }
    } else {
      data.appDownloadUrl = null;
    }
  }
  // Numerieke settings: Sanity-limieten (negatieve retentie sloopt data).
  for (const key of ["telemetryIntervalS", "offlineThresholdS", "eventRetentionDays", "pointRetentionDays"] as const) {
    if (key in data) {
      const n = Number(data[key]);
      if (!Number.isFinite(n) || n < 1 || n > 3650) {
        return NextResponse.json({ error: `${key} moet tussen 1 en 3650 zijn` }, { status: 400 });
      }
      data[key] = Math.round(n);
    }
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
