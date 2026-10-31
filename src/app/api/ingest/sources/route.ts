// GET /api/ingest/sources — eigen bronnen (sessie) of alle (admin)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuth } from "@/lib/auth-session";
import { STALE_MS } from "@/lib/config";

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
    const ageMs = now - s.receivedAt.getTime();
    const status =
      s.latitude == null ? "no_fix" : ageMs > STALE_MS ? "stale" : "fresh";
    const speedKmh =
      s.speedMps != null ? Math.round(s.speedMps * 3.6 * 10) / 10 : null;
    return {
      id: s.id,
      name: s.name,
      displayName: s.displayName ?? s.name,
      iconEmoji: s.iconEmoji ?? "📍",
      description: s.description,
      latitude: s.latitude,
      longitude: s.longitude,
      accuracyMeters: s.accuracyMeters,
      speedMps: s.speedMps,
      speedKmh,
      moving: s.speedMps != null && s.speedMps >= 1.0,
      sampledAt: s.sampledAt?.toISOString() ?? null,
      receivedAt: s.receivedAt.toISOString(),
      status,
      ageSeconds: Math.round(ageMs / 1000),
    };
  });

  return NextResponse.json({ sources: list, serverTime: new Date(now).toISOString() });
}
