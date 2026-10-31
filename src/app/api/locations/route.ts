// Locaties API: GET (lijst met filters) + POST (aanmaken)
// Actief-beleid: temporary locaties zijn actief zolang startsAt <= nu < expiresAt
// (verval is EXCLUSIEF: expiresAt <= nu = verlopen). Backend bepaalt dit —
// niet alleen een frontend-timer.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

const locationSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(120),
  address: z.string().trim().min(1, "Adres is verplicht").max(300),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  geocodeProvider: z.enum(["photon", "nominatim", "manual"]).optional(),
  geocodeLabel: z.string().trim().max(300).nullable().optional(),
  type: z.enum(["permanent", "temporary"]).default("permanent"),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  color: z.string().trim().max(20).nullable().optional(),
});

/** Actieve filter: permanent; temporary met venster dat nu overlapt. */
function activeLocationWhere(now: Date): Prisma.ManagedLocationWhereInput {
  return {
    OR: [
      { type: "permanent" },
      {
        type: "temporary",
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { expiresAt: { gt: now } },
        ],
      },
    ],
  };
}

export async function GET(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const url = new URL(req.url);
  const type = url.searchParams.get("type"); // permanent|temporary
  const status = url.searchParams.get("status") ?? "active"; // active|expired|all|deleted
  const q = url.searchParams.get("q")?.trim();

  const now = new Date();
  const where: Prisma.ManagedLocationWhereInput = {};

  if (status === "deleted") {
    where.deletedAt = { not: null };
  } else {
    where.deletedAt = null;
    // AND-semantiek: actief-venster EN zoekterm moeten beide kloppen
    const and: Prisma.ManagedLocationWhereInput[] = [];
    if (status === "active") {
      and.push(activeLocationWhere(now));
    } else if (status === "expired") {
      and.push({
        type: "temporary",
        OR: [
          { expiresAt: { lte: now } },
          { startsAt: { gt: now } }, // toekomstig = nog niet actief
        ],
      });
    }
    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { address: { contains: q, mode: "insensitive" } },
        ],
      });
    }
    if (type && (type === "permanent" || type === "temporary")) {
      where.type = type;
    }
    if (and.length > 0) where.AND = and;
  }

  const locations = await prisma.managedLocation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  return NextResponse.json({
    locations: locations.map((l) => ({
      ...l,
      startsAt: l.startsAt?.toISOString() ?? null,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      deletedAt: l.deletedAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
      isExpired:
        l.type === "temporary" &&
        ((l.expiresAt != null && l.expiresAt.getTime() <= now.getTime()) ||
          (l.startsAt != null && l.startsAt.getTime() > now.getTime())),
    })),
    serverTime: now.toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const body = await req.json().catch(() => null);
  const parsed = locationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige invoer", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const d = parsed.data;

  // Backend-regels: temporary vereist expiresAt in de toekomst; startsAt <= expiresAt
  const now = Date.now();
  if (d.type === "temporary") {
    if (!d.expiresAt) {
      return NextResponse.json(
        { error: "Tijdelijke locatie vereist een vervaldatum" },
        { status: 400 }
      );
    }
    if (new Date(d.expiresAt).getTime() <= now) {
      return NextResponse.json(
        { error: "Vervaldatum moet in de toekomst liggen" },
        { status: 400 }
      );
    }
  }
  if (d.startsAt && d.expiresAt && new Date(d.startsAt) > new Date(d.expiresAt)) {
    return NextResponse.json(
      { error: "Startdatum ligt na de vervaldatum" },
      { status: 400 }
    );
  }

  const location = await prisma.managedLocation.create({
    data: {
      name: d.name,
      address: d.address,
      latitude: d.latitude,
      longitude: d.longitude,
      geocodeProvider: d.geocodeProvider ?? "manual",
      geocodeLabel: d.geocodeLabel ?? null,
      type: d.type,
      startsAt: d.startsAt ? new Date(d.startsAt) : null,
      expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
      notes: d.notes ?? null,
      color: d.color ?? null,
      createdById: auth.user.id,
    },
  });

  await logAudit(auth.user.id, "location.created", "location", location.id, {
    name: location.name,
    type: location.type,
  });

  return NextResponse.json(
    {
      ...location,
      startsAt: location.startsAt?.toISOString() ?? null,
      expiresAt: location.expiresAt?.toISOString() ?? null,
      createdAt: location.createdAt.toISOString(),
      updatedAt: location.updatedAt.toISOString(),
    },
    { status: 201 }
  );
}
