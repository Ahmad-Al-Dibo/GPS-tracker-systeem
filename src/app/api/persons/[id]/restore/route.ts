// POST /api/persons/[id]/restore — herstel uit de prullenbak
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  if (!person.deletedAt) {
    return NextResponse.json({ error: "Staat niet in de prullenbak" }, { status: 400 });
  }

  // Alleen zichtbaarheid terugzetten; er verandert verder niets
  // (geen rechten/tracker-status die gewijzigd zijn bij verwijderen).
  const restored = await prisma.person.update({
    where: { id },
    data: { deletedAt: null, deletedBy: null },
  });

  await logAudit(auth.user.id, "person.restore", "person", id, { name: person.name });

  return NextResponse.json({
    ok: true,
    id: restored.id,
    name: restored.name,
    createdAt: restored.createdAt.toISOString(),
    updatedAt: restored.updatedAt.toISOString(),
  });
}
