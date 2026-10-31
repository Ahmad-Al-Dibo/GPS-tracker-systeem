// Geofences API
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const geofenceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3b82f6"),
  coordinates: z.string().min(2), // JSON array string
  isActive: z.boolean().default(true),
});

export async function GET() {
  const { res } = await requireAuth();
  if (res) return res;

  const fences = await prisma.geofence.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    geofences: fences.map((g) => ({
      ...g,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const { auth, res } = await requireAdmin();
  if (res) return res;

  const body = await req.json().catch(() => null);
  const parsed = geofenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  // Valideer JSON-coördinaten
  try {
    const coords = JSON.parse(parsed.data.coordinates);
    if (!Array.isArray(coords) || coords.length < 3) {
      return NextResponse.json(
        { error: "Polygon moet minimaal 3 punten hebben" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Ongeldige coördinaten" }, { status: 400 });
  }

  const fence = await prisma.geofence.create({ data: parsed.data });
  await logAudit(auth.user.id, "geofence.created", "geofence", fence.id, { name: fence.name });

  return NextResponse.json(
    { ...fence, createdAt: fence.createdAt.toISOString(), updatedAt: fence.updatedAt.toISOString() },
    { status: 201 }
  );
}
