// GET /api/health/live — liveness: het proces draait (geen dependencies).
// Gebruikt door systemd/restarters: alleen 503 als de app dood is.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    check: "liveness",
    service: "gps-web",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
}
