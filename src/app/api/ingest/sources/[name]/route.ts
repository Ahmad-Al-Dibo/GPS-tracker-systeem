// PATCH/DELETE /api/ingest/sources/[name] — beheren of verwijderen (soft delete)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { updateSourceSchema } from "@/lib/validation";

type Params = { params: Promise<{ name: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { name } = await params;
  const source = await prisma.ingestSource.findUnique({ where: { name } });
  if (!source || source.deletedAt) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }
  if (source.ownerUserId !== auth.user.id && auth.user.role !== "admin") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateSourceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const updated = await prisma.ingestSource.update({
    where: { id: source.id },
    data: {
      ...(parsed.data.iconEmoji != null ? { iconEmoji: parsed.data.iconEmoji } : {}),
      ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    },
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    displayName: updated.displayName ?? updated.name,
    iconEmoji: updated.iconEmoji,
    description: updated.description,
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { name } = await params;
  const source = await prisma.ingestSource.findUnique({ where: { name } });
  if (!source) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  if (source.ownerUserId !== auth.user.id && auth.user.role !== "admin") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  if (source.deletedAt) {
    return NextResponse.json({ error: "Staat al in de prullenbak" }, { status: 409 });
  }

  // Soft delete: record blijft in DB (prullenbak), GPS-geschiedenis behouden
  await prisma.ingestSource.update({
    where: { id: source.id },
    data: { deletedAt: new Date(), deletedBy: auth.user.id },
  });
  await logAudit(auth.user.id, "vehicle.delete", "vehicle", source.id, { name: source.name, via: "ingest-sources" });

  return NextResponse.json({ ok: true, softDeleted: true });
}

// GET trail
export async function GET(req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { name } = await params;
  const source = await prisma.ingestSource.findUnique({ where: { name } });
  if (!source || source.deletedAt) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }
  if (source.ownerUserId !== auth.user.id && auth.user.role !== "admin") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(2000, Math.max(10, Number(url.searchParams.get("limit") ?? 300)));

  const points = await prisma.ingestPoint.findMany({
    where: { sourceId: source.id },
    orderBy: { sampledAt: "desc" },
    take: limit,
    select: { latitude: true, longitude: true, speedMps: true, sampledAt: true },
  });

  return NextResponse.json({
    name: source.name,
    trail: points.reverse().map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      speedMps: p.speedMps,
      sampledAt: p.sampledAt.toISOString(),
    })),
  });
}
