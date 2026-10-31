// POST /api/vehicles/[id]/restore — herstel uit de prullenbak
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const vehicle = await prisma.ingestSource.findUnique({ where: { id } });
  if (!vehicle) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  if (!vehicle.deletedAt) {
    return NextResponse.json({ error: "Staat niet in de prullenbak" }, { status: 400 });
  }

  // Naam-uniekheid: het verwijderde record houdt zijn naam in de DB (unieke
  // constraint), dus er kan geen actief voertuig dezelfde naam voeren —
  // herstel kan hier nooit op een naam-conflict stuiten.
  const restored = await prisma.ingestSource.update({
    where: { id },
    data: { deletedAt: null, deletedBy: null },
  });

  await logAudit(auth.user.id, "vehicle.restore", "vehicle", id, { name: vehicle.name });

  return NextResponse.json({
    ok: true,
    id: restored.id,
    name: restored.name,
    displayName: restored.displayName ?? restored.name,
    isActive: restored.isActive,
    createdAt: restored.createdAt.toISOString(),
    updatedAt: restored.updatedAt.toISOString(),
  });
}
