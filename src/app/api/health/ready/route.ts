// GET /api/health/ready — readiness: app KAN verkeer afhandelen.
// 503 zolang de database onbereikbaar is (kritieke afhankelijkheid).
// Load balancers/proxy's gebruiken dit om traffic te routeren.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ready",
      check: "readiness",
      service: "gps-web",
      timestamp: new Date().toISOString(),
      database: { status: "ok", latencyMs: Date.now() - start },
    });
  } catch (err) {
    // Details server-side loggen (publiek endpoint — geen internen tonen).
    console.error("[health/ready] database check failed:", err);
    return NextResponse.json(
      {
        status: "not_ready",
        check: "readiness",
        service: "gps-web",
        timestamp: new Date().toISOString(),
        database: { status: "fail", detail: "database onbereikbaar" },
      },
      { status: 503 }
    );
  }
}
