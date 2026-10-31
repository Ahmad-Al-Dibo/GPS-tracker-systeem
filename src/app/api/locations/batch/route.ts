// POST /api/locations/batch — meerdere locaties in één transactie (import-flow)
// Duplicate-detectie:zelfde genormaliseerde naam+adres binnen batch én in DB.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { dedupeKey } from "@/lib/locations/import";
import { z } from "zod";

const batchItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(300),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  geocodeProvider: z.enum(["photon", "nominatim", "manual"]).optional(),
  geocodeLabel: z.string().trim().max(300).nullable().optional(),
  type: z.enum(["permanent", "temporary"]).default("permanent"),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const batchSchema = z.object({
  items: z.array(batchItemSchema).min(1).max(200),
  skipDuplicates: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const body = await req.json().catch(() => null);
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige invoer", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { items, skipDuplicates } = parsed.data;

  // Bestaande adressen ophalen voor dedupe (niet-verwijderd)
  const existing = await prisma.managedLocation.findMany({
    where: { deletedAt: null },
    select: { name: true, address: true },
  });
  const existingKeys = new Set(existing.map(dedupeKey));

  const seen = new Set<string>();
  const toCreate: typeof items = [];
  let duplicates = 0;

  for (const item of items) {
    const key = dedupeKey(item);
    if (existingKeys.has(key) || seen.has(key)) {
      duplicates++;
      if (!skipDuplicates) {
        return NextResponse.json(
          { error: `Duplicate locatie: "${item.name}" (${item.address})`, duplicates },
          { status: 409 }
        );
      }
      continue;
    }
    seen.add(key);
    toCreate.push(item);
  }

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const item of toCreate) {
      rows.push(
        await tx.managedLocation.create({
          data: {
            name: item.name,
            address: item.address,
            latitude: item.latitude,
            longitude: item.longitude,
            geocodeProvider: item.geocodeProvider ?? "manual",
            geocodeLabel: item.geocodeLabel ?? null,
            type: item.type,
            startsAt: item.startsAt ? new Date(item.startsAt) : null,
            expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
            notes: item.notes ?? null,
            createdById: auth.user.id,
          },
        })
      );
    }
    return rows;
  });

  await logAudit(auth.user.id, "location.batch_created", "location", undefined, {
    created: created.length,
    duplicates,
  });

  return NextResponse.json({
    created: created.length,
    duplicates,
    items: created.map((l) => ({ id: l.id, name: l.name, address: l.address })),
  });
}
