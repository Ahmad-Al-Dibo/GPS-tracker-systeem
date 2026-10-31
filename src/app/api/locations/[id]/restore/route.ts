// POST /api/locations/[id]/restore — herstel uit prullenbak van de module
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const location = await prisma.managedLocation.findUnique({ where: { id } });
  if (!location) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  if (!location.deletedAt) {
    return NextResponse.json({ error: "Staat niet in de prullenbak" }, { status: 400 });
  }

  const restored = await prisma.managedLocation.update({
    where: { id },
    data: { deletedAt: null },
  });
  await logAudit(auth.user.id, "location.restored", "location", id, { name: location.name });

  return NextResponse.json({ ok: true, id: restored.id, name: restored.name });
}
