// GET /api/health — publieke health-check voor monitoring/load-balancers.
// Rapporteert applicatie, database en (optioneel) de GPS TCP-service.
// Down: database onbereikbaar. Degraded: GPS TCP-service onbereikbaar.
import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Check = { status: "ok" | "fail"; detail?: string; latencyMs?: number };

function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(process.cwd() + "/package.json", "utf8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function checkDatabase(): Promise<Check> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    // Volledige fout alleen server-side loggen: Prisma-berichten kunnen
    // DB-host/versie/gebruiker bevatten en dit endpoint is publiek.
    console.error("[health] database check failed:", err);
    return { status: "fail", detail: "database onbereikbaar" };
  }
}

async function checkTcpService(): Promise<Check | null> {
  const url = process.env.GPS_TCP_HEALTH_URL;
  if (!url) return null; // niet geconfigureerd → overslaan
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { status: "fail", detail: `HTTP ${res.status}`, latencyMs: Date.now() - start };
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    console.error("[health] gps-tcp check failed:", err);
    return { status: "fail", detail: "onbereikbaar", latencyMs: Date.now() - start };
  }
}

export async function GET() {
  const [db, tcp] = await Promise.all([checkDatabase(), checkTcpService()]);

  const checks: Record<string, Check | null> = { database: db, gpsTcpService: tcp };
  const criticalFailed = db.status === "fail";
  const degraded = tcp?.status === "fail";

  const status = criticalFailed ? "down" : degraded ? "degraded" : "ok";

  return NextResponse.json(
    {
      status,
      version: appVersion(),
      service: "gps-web",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks,
    },
    { status: criticalFailed ? 503 : 200 }
  );
}
