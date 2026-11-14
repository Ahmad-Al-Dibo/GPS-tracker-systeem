// GET /api/ingest/sources — eigen bronnen (sessie) of alle (admin)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuth } from "@/lib/auth-session";
import {
  sourceTrackingState,
  legacyStatusLabel,
  liveSpeedKmh,
  lastKnownSpeedKmh,
} from "@/lib/tracking-state";

export async function GET() {
  const auth = await getAuth();

  // Zonder sessie: alleen admin-toegang geweigerd; publiek leeg
  // Soft delete: verwijderde voertuigen niet in actieve lijst/selecties
  const where: Record<string, unknown> =
    auth?.user.role === "admin" ? {} : auth ? { ownerUserId: auth.user.id } : { ownerUserId: "00000000-0000-0000-0000-000000000000" };
  where.deletedAt = null;

  const now = Date.now();
  const sources = await prisma.ingestSource.findMany({
    where,
    orderBy: { name: "asc" },
  });

  const list = sources.map((s) => {
    const trackingState = sourceTrackingState(s);
    const speedLiveKmh = liveSpeedKmh(trackingState, s.speedMps);
    return {
      id: s.id,
      name: s.name,
      displayName: s.displayName ?? s.name,
      iconEmoji: s.iconEmoji ?? "🚚",
      description: s.description,
      latitude: s.latitude,
      longitude: s.longitude,
      accuracyMeters: s.accuracyMeters,
      speedMps: s.speedMps,
      // SPEED-CONTRACT: speedKmh = alleen live snelheid (null als niet vers).
      speedKmh: speedLiveKmh,
      lastSpeedKmh: lastKnownSpeedKmh(s.speedMps),
      moving: speedLiveKmh != null && s.speedMps != null && s.speedMps >= 1.0,
      sampledAt: s.sampledAt?.toISOString() ?? null,
      receivedAt: s.receivedAt.toISOString(),
      // status = legacy-label (fresh/stale/no_fix); trackingState = centrale staat
      status: legacyStatusLabel(trackingState),
      trackingState,
      ageSeconds: Math.round((now - s.receivedAt.getTime()) / 1000),
    };
  });

  return NextResponse.json({ sources: list, serverTime: new Date(now).toISOString() });
}
