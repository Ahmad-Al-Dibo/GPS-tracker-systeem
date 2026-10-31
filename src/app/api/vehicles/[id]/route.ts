// Voertuig API: GET (detail), PATCH (bewerken), DELETE (soft delete) + ?permanent=true
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const vehicleUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  displayName: z.string().trim().max(80).nullable().optional(),
  licensePlate: z.string().trim().max(20).nullable().optional(),
  brand: z.string().trim().max(60).nullable().optional(),
  vehicleType: z.string().trim().max(60).nullable().optional(),
  color: z.string().trim().max(40).nullable().optional(),
  yearOfBuild: z.number().int().min(1900).max(2100).nullable().optional(),
  chassisNumber: z.string().trim().max(50).nullable().optional(),
  startingKm: z.number().min(0).nullable().optional(),
  vehicleGroup: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  iconEmoji: z.string().trim().min(1).max(8).optional(),
  isActive: z.boolean().optional(),
  trackerSerial: z.string().trim().max(80).nullable().optional(),
  trackerBrand: z.string().trim().max(60).nullable().optional(),
  trackerType: z.string().trim().max(60).nullable().optional(),
  simCardNumber: z.string().trim().max(30).nullable().optional(),
  trackerSource: z.enum(["physical", "app"]).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const vehicle = await prisma.ingestSource.findUnique({
    where: { id },
    include: {
      persons: {
        where: { person: { deletedAt: null } },
        include: {
          person: { select: { id: true, name: true, email: true, phone: true } },
        },
      },
      events: {
        include: { rule: { select: { name: true } } },
        orderBy: { startTime: "desc" },
        take: 20,
      },
      tasks: {
        include: { assignee: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
  if (!vehicle || vehicle.deletedAt) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }

  return NextResponse.json({
    ...vehicle,
    speedKmh: vehicle.speedMps != null ? Math.round(vehicle.speedMps * 3.6 * 10) / 10 : null,
    sampledAt: vehicle.sampledAt?.toISOString() ?? null,
    receivedAt: vehicle.receivedAt.toISOString(),
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
    persons: vehicle.persons.map((p) => ({
      id: p.person.id,
      name: p.person.name,
      email: p.person.email,
      phone: p.person.phone,
    })),
    events: vehicle.events.map((e) => ({
      id: e.id,
      ruleName: e.rule.name,
      severity: e.severity,
      status: e.status,
      startTime: e.startTime.toISOString(),
    })),
    tasks: vehicle.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assignee: t.assignee?.username ?? null,
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const existing = await prisma.ingestSource.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = vehicleUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  // Naam-wijziging uniek checken
  if (parsed.data.name && parsed.data.name !== existing.name) {
    const dupe = await prisma.ingestSource.findUnique({ where: { name: parsed.data.name } });
    if (dupe) {
      if (dupe.deletedAt) {
        return NextResponse.json(
          { error: "Naam staat in de prullenbak — herstel of verwijder dat voertuig eerst definitief" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Naam bestaat al" }, { status: 409 });
    }
  }

  const updated = await prisma.ingestSource.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
}

/**
 * DELETE /api/vehicles/[id] — soft delete (gaat naar prullenbak;
 * GPS-geschiedenis, events, taken en koppelingen blijven bewaard).
 * DELETE /api/vehicles/[id]?permanent=true&confirm=true — definitief
 * verwijderen (admin, alleen uit de prullenbak; cascade wordt eerst geteld
 * en moet met confirm=true worden bevestigd).
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const url = new URL(req.url);
  const permanent = url.searchParams.get("permanent") === "true";
  const confirm = url.searchParams.get("confirm") === "true";

  const { id } = await params;
  const existing = await prisma.ingestSource.findUnique({
    where: { id },
    include: {
      _count: { select: { points: true, events: true, tasks: true, persons: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  // ── Definitief verwijderen (admin + bevestiging) ──
  if (permanent) {
    const { auth, res } = await requireAdmin();
    if (res) return res;

    if (!existing.deletedAt) {
      return NextResponse.json(
        { error: "Alleen verwijderde records kunnen definitief worden verwijderd" },
        { status: 400 }
      );
    }

    const dependencies = {
      gpsPoints: existing._count.points,
      events: existing._count.events,
      tasks: existing._count.tasks,
      links: existing._count.persons,
    };
    // Bevestiging is altijd verplicht bij definitief verwijderen
    if (!confirm) {
      return NextResponse.json(
        {
          error: "Bevestiging vereist voor definitief verwijderen",
          code: "needs_confirmation",
          dependencies,
        },
        { status: 409 }
      );
    }

    // Cascade: points + events (+ event_points) definitief weg;
    // taken behouden hun record maar verliezen de voertuigkoppeling (SetNull).
    await prisma.ingestSource.delete({ where: { id } });

    await logAudit(auth.user.id, "vehicle.purge", "vehicle", id, {
      name: existing.name,
      removed: dependencies,
    });

    return NextResponse.json({ ok: true, purged: true, removed: dependencies });
  }

  // ── Soft delete (naar prullenbak) ──
  const { auth, res } = await requireAuth();
  if (res) return res;

  if (existing.deletedAt) {
    return NextResponse.json({ error: "Staat al in de prullenbak" }, { status: 409 });
  }

  // Enkel zichtbaarheid verbergen: isActive (tracker-actief) en toegangsrechten
  // blijven ongewijzigd; herstel zet dus niets automatisch terug/actief.
  await prisma.ingestSource.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: auth.user.id },
  });

  await logAudit(auth.user.id, "vehicle.delete", "vehicle", id, {
    name: existing.name,
    gpsPoints: existing._count.points,
    events: existing._count.events,
    links: existing._count.persons,
  });

  return NextResponse.json({ ok: true, softDeleted: true });
}
