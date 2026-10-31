// POST /api/locations/import — analyseert een bestand, dedupe + optionele
// geocoding (max 50 per verzoek, rate-limit-vriendelijk). Schrijft NIETS in de
// DB; de client importeert goedgekeurde rijen via /api/locations/batch.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { parseImportContent, dedupeKey } from "@/lib/locations/import";
import { geocode } from "@/lib/geocode";
import { prisma } from "@/lib/db";
import { z } from "zod";

const importSchema = z.object({
  content: z.string().min(1).max(500_000, "Bestand te groot (max 500KB)"),
  format: z.enum(["lines", "csv"]).optional(),
  /** Alleen geocode-actie: rijen met adres maar zonder coords laten geocoden */
  geocodeRows: z.boolean().default(true),
  /** Alleen geocode-en; geen dedupe-claims nodig */
  maxGeocode: z.number().int().min(0).max(50).default(50),
});

const GEOCODE_DELAY_MS = 1_100; // netjes voor publieke providers (~1 req/s)

type RowResult = {
  line: number;
  name: string | null;
  address: string;
  type: "permanent" | "temporary" | null;
  expiresAt: string | null;
  notes: string | null;
  status: "ok" | "duplicate" | "unresolved" | "geocoded";
  latitude?: number;
  longitude?: number;
  geocodeProvider?: string;
  geocodeLabel?: string;
  candidates?: { label: string; latitude: number; longitude: number; provider: string }[];
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  const { res } = await requireAuth();
  if (res) return res;

  const body = await req.json().catch(() => null);
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige invoer", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { content, format, geocodeRows, maxGeocode } = parsed.data;

  const parsedFile = parseImportContent(content, format);

  // Dedupe tegen DB (niet-verwijderde locaties)
  const existing = await prisma.managedLocation.findMany({
    where: { deletedAt: null },
    select: { name: true, address: true },
  });
  const existingKeys = new Set(existing.map(dedupeKey));

  const seen = new Set<string>();
  const rows: RowResult[] = [];
  let geocodeBudget = geocodeRows ? maxGeocode : 0;
  let geocoded = 0;
  let unresolved = 0;
  let duplicates = 0;

  for (const r of parsedFile.rows) {
    const key = dedupeKey(r);
    if (existingKeys.has(key) || seen.has(key)) {
      duplicates++;
      rows.push({ ...r, status: "duplicate" });
      continue;
    }
    seen.add(key);

    if (geocodeBudget > 0) {
      geocodeBudget--;
      try {
        const { results } = await geocode(r.address);
        geocoded++;
        if (results.length === 1) {
          rows.push({
            ...r,
            status: "geocoded",
            latitude: results[0].latitude,
            longitude: results[0].longitude,
            geocodeProvider: results[0].provider,
            geocodeLabel: results[0].label,
          });
        } else if (results.length > 1) {
          rows.push({
            ...r,
            status: "geocoded",
            candidates: results.map((x) => ({
              label: x.label,
              latitude: x.latitude,
              longitude: x.longitude,
              provider: x.provider,
            })),
          });
        } else {
          unresolved++;
          rows.push({ ...r, status: "unresolved" });
        }
      } catch {
        unresolved++;
        rows.push({ ...r, status: "unresolved" });
      }
      // Rate-limit pauze tussen geocode-aanroepen (behalve na de laatste)
      if (geocodeBudget > 0) await sleep(GEOCODE_DELAY_MS);
    } else {
      rows.push({ ...r, status: "ok" }); // adres aanwezig; coords nog nodig
    }
  }

  return NextResponse.json({
    format: parsedFile.format,
    summary: {
      totalRows: rows.length,
      valid: rows.filter((r) => r.status !== "duplicate").length,
      invalid: parsedFile.errors.length,
      duplicates,
      geocoded,
      unresolved,
      needsCoordinates: rows.filter((r) => r.status === "ok").length,
    },
    errors: parsedFile.errors,
    rows,
    note:
      geocodeRows && geocodeBudget === 0 && rows.some((r) => r.status === "ok")
        ? "Geocode-budget bereikt — deel 2 van het bestand kan opnieuw worden aangeboden."
        : undefined,
  });
}
