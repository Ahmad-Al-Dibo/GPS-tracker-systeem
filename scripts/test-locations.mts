/**
 * Tests: locatiebeheer, routes, import, geocode-proxy, kaartzoek-basis.
 * - Parser-checks draaien lokaal (geen server).
 * - API-checks vereisen server op BASE_URL.
 * Ruimt eigen testdata op via prisma.
 * Run: npm run test:locations
 */
import { prisma } from "@/lib/db";
import {
  parseImportContent,
  normalizeAddressKey,
  dedupeKey,
  parseCsvLine,
} from "@/lib/locations/import";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

type Jar = { cookie: string };

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg: string) {
  if (cond) {
    passed++;
    console.log(`OK: ${msg}`);
  } else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

async function login(identifier: string, password: string): Promise<Jar> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const setCookies = res.headers.getSetCookie?.() ?? [];
  return { cookie: setCookies.map((c) => c.split(";")[0]).join("; ") };
}

async function req<T>(
  jar: Jar | null,
  path: string,
  init?: RequestInit
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(jar ? { Cookie: jar.cookie } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as T;
  return { status: res.status, body };
}

// ─── Deel 1: parser (geen server nodig) ───
function testParser() {
  console.log("\n— Parser —");
  const lines = parseImportContent(
    "# comment\nKarel Doormanstraat 59, Haaksbergen\n\nMagazijn | Industrieweg 3, Almelo"
  );
  assert(lines.format === "lines", "herkent lines-formaat");
  assert(lines.rows.length === 2, `2 rijen uit lines-formaat (kreeg ${lines.rows.length})`);
  assert(
    lines.rows[0]?.address === "Karel Doormanstraat 59, Haaksbergen",
    "komma in adres behouden (niet gesplitst)"
  );
  assert(lines.rows[1]?.name === "Magazijn", "Label | adres-syntax parseert naam");
  assert(
    lines.rows[1]?.address === "Industrieweg 3, Almelo",
    "Label | adres-syntax parseert adres"
  );

  const csv = parseImportContent(
    'name,address,type,expires_at,notes\nHoofdkantoor,"Karel Doormanstraat 59, Haaksbergen",permanent,,"Vaste"\nTijdelijk,"Stationsstraat 12, Enschede",temporary,2026-12-25T18:00:00,"Kerst"',
    "csv"
  );
  assert(csv.format === "csv", "CSV-formaat");
  assert(csv.rows.length === 2, "CSV: 2 geldige rijen");
  assert(
    csv.rows[0]?.address === "Karel Doormanstraat 59, Haaksbergen",
    "CSV: komma in quotes behouden"
  );
  assert(csv.rows[1]?.type === "temporary", "CSV: type temporary");
  assert(csv.rows[1]?.expiresAt != null, "CSV: expiresAt geparsed");

  const badCsv = parseImportContent("naam;adres\nx;y", "csv");
  assert(badCsv.errors.length > 0, "CSV zonder address-kolom → fout");

  const badRows = parseImportContent(
    'name,address,type\nA,"X 1, Y",permanent\nB,"Z 2, Y",vies\nC,,permanent',
    "csv"
  );
  assert(badRows.errors.length >= 2, `ongeldige rijen gemeld (${badRows.errors.length})`);

  assert(
    normalizeAddressKey("Straat 1,  STAD!") === normalizeAddressKey("straat 1 stad"),
    "normaliseerkleutel vergelijkt hoofdletter/spatie/punctuatie-vrij"
  );
  assert(
    dedupeKey({ name: "A", address: "X 1, Y" }) ===
      dedupeKey({ name: "a", address: "x 1 y" }),
    "dedupe-key gelijk voor zelfde adres in andere schrijfwijze"
  );
  assert(
    dedupeKey({ name: null, address: "X 1" }) !== dedupeKey({ name: null, address: "X 2" }),
    "verschillende adressen ≠ duplicate (deterministisch, niet fuzzy)"
  );
  assert(
    parseCsvLine('a,"b,c",d').join("|") === "a|b,c|d",
    "CSV-parser: quotes met komma"
  );
  assert(parseCsvLine('a,"b""c"').join("|") === 'a|b"c', "CSV-parser: escaped quotes");
}

// ─── Deel 2: API (server nodig) ───
async function testApi(jar: Jar, ts: number) {
  console.log("\n— Locaties API —");
  const noAuth = await req(null, "/api/locations");
  assert(noAuth.status === 401, "locaties zonder sessie → 401");

  // Permanent aanmaken
  const locA = await req<{ id: string; type: string }>(jar, "/api/locations", {
    method: "POST",
    body: JSON.stringify({
      name: `TestDepot-${ts}`,
      address: `Karel Doormanstraat 59, Haaksbergen`,
      latitude: 52.2,
      longitude: 6.75,
      geocodeProvider: "manual",
      type: "permanent",
      notes: "test",
    }),
  });
  assert(locA.status === 201, "permanent locatie aanmaken");
  const locAId = locA.body.id;

  // Temporary zonder vervaldatum → 400
  const tempNoExp = await req(jar, "/api/locations", {
    method: "POST",
    body: JSON.stringify({
      name: `Temp-${ts}`,
      address: "X 1, Y",
      latitude: 52.0,
      longitude: 6.0,
      type: "temporary",
    }),
  });
  assert(tempNoExp.status === 400, "temporary zonder vervaldatum → 400");

  // Temporary met verleden-vervaldatum → 400
  const tempPast = await req(jar, "/api/locations", {
    method: "POST",
    body: JSON.stringify({
      name: `Temp2-${ts}`,
      address: "X 2, Y",
      latitude: 52.0,
      longitude: 6.0,
      type: "temporary",
      expiresAt: new Date(Date.now() - 86400_000).toISOString(),
    }),
  });
  assert(tempPast.status === 400, "temporary met verleden-vervaldatum → 400");

  // Temporary toekomstig
  const tempFut = await req<{ id: string }>(jar, "/api/locations", {
    method: "POST",
    body: JSON.stringify({
      name: `TempActief-${ts}`,
      address: "Stationsstraat 12, Enschede",
      latitude: 52.22,
      longitude: 6.9,
      type: "temporary",
      expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    }),
  });
  assert(tempFut.status === 201, "temporary met toekomst-vervaldatum aanmaken");
  const tempId = tempFut.body.id;

  // Actieve lijst: beide zichtbaar
  const active = await req<{ locations: { id: string }[] }>(
    jar,
    "/api/locations?status=active"
  );
  assert(
    active.body.locations.some((l) => l.id === locAId) &&
      active.body.locations.some((l) => l.id === tempId),
    "actieve lijst toont permanent + tijdelijk"
  );

  // Vervaldatum verlopen maken (direct in DB — frontend-timer niet leidend)
  await prisma.managedLocation.update({
    where: { id: tempId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const active2 = await req<{ locations: { id: string }[] }>(
    jar,
    "/api/locations?status=active"
  );
  assert(
    !active2.body.locations.some((l) => l.id === tempId),
    "verlopen temporary verdwijnt uit actieve lijst (backend-bepaald)"
  );
  const expired = await req<{ locations: { id: string; isExpired: boolean }[] }>(
    jar,
    "/api/locations?status=expired"
  );
  assert(
    expired.body.locations.some((l) => l.id === tempId && l.isExpired),
    "verlopen temporary zichtbaar in verlopen-weergave"
  );

  // Zoekfilter
  const searchRes = await req<{ locations: { name: string }[] }>(
    jar,
    `/api/locations?status=all&q=TestDepot-${ts}`
  );
  assert(
    searchRes.body.locations.length === 1,
    "zoekfilter op naam vindt exact de locatie"
  );

  // Soft delete + herstel
  const del = await req<{ softDeleted: boolean }>(jar, `/api/locations/${locAId}`, {
    method: "DELETE",
  });
  assert(del.status === 200 && del.body.softDeleted, "soft delete locatie");
  const gone = await req(jar, `/api/locations/${locAId}`);
  assert(gone.status === 404, "verwijderde locatie → 404 in detail");
  const active3 = await req<{ locations: { id: string }[] }>(
    jar,
    "/api/locations?status=active"
  );
  assert(
    !active3.body.locations.some((l) => l.id === locAId),
    "verwijderde locatie niet in actieve lijst"
  );
  const restore = await req<{ ok: boolean }>(jar, `/api/locations/${locAId}/restore`, {
    method: "POST",
  });
  assert(restore.status === 200 && restore.body.ok, "herstel locatie");
  const active4 = await req<{ locations: { id: string }[] }>(
    jar,
    "/api/locations?status=active"
  );
  assert(
    active4.body.locations.some((l) => l.id === locAId),
    "herstelde locatie terug in actieve lijst"
  );

  // PATCH: temporary → temporary-verloop bewaken
  const patchBad = await req(jar, `/api/locations/${tempId}`, {
    method: "PATCH",
    body: JSON.stringify({ type: "temporary", expiresAt: null }),
  });
  assert(patchBad.status === 400, "PATCH temporary zonder verloop → 400");

  console.log("\n— Geocode-proxy —");
  const geoNoAuth = await req(null, "/api/geocode?q=Haaksbergen");
  assert(geoNoAuth.status === 401, "geocode zonder sessie → 401");
  const geoShort = await req<{ error: string }>(jar, "/api/geocode?q=ab");
  assert(geoShort.status === 400, "geocode query < 3 tekens → 400");
  const geo = await req<{ results: { latitude: number; longitude: number; label: string }[] }>(
    jar,
    "/api/geocode?q=Karel%20Doormanstraat%2059%2C%20Haaksbergen"
  );
  if (geo.status === 200) {
    assert(geo.body.results.length > 0, "geocode vindt resultaten (netwerk)");
    assert(
      geo.body.results.every((r) => Math.abs(r.latitude) <= 90 && Math.abs(r.longitude) <= 180),
      "geocode-resultaten binnen geldige coördinaten"
    );
  } else {
    assert(
      geo.status === 502,
      `geocode provider-onbereikbaar → nette 502 (status ${geo.status})`
    );
  }

  console.log("\n— Routes API —");
  const route = await req<{ id: string; points: { orderIndex: number; name: string }[] }>(
    jar,
    "/api/routes",
    {
      method: "POST",
      body: JSON.stringify({
        name: `TestRoute-${ts}`,
        description: "e2e",
        points: [
          { name: "Punt 1", latitude: 52.2, longitude: 6.7, address: "A" },
          { name: "Punt 2", latitude: 52.25, longitude: 6.75, address: "B" },
          { name: "Punt 3", latitude: 52.3, longitude: 6.8, address: "C" },
        ],
      }),
    }
  );
  assert(route.status === 201, "route aanmaken met 3 punten");
  assert(
    route.body.points.map((p) => p.orderIndex).join(",") === "0,1,2",
    "punten opgeslagen in volgorde (orderIndex 0..n)"
  );
  const routeId = route.body.id;

  // Herschikken via PATCH (volledige lijstvervanging)
  const reorder = await req<{ points: { name: string }[] }>(jar, `/api/routes/${routeId}`, {
    method: "PATCH",
    body: JSON.stringify({
      points: [
        { name: "Punt 3", latitude: 52.3, longitude: 6.8 },
        { name: "Punt 1", latitude: 52.2, longitude: 6.7 },
        { name: "Punt 2", latitude: 52.25, longitude: 6.75 },
      ],
    }),
  });
  assert(reorder.status === 200, "route punten herschikken");
  assert(
    reorder.body.points.map((p) => p.name).join(",") === "Punt 3,Punt 1,Punt 2",
    "volgorde na herschikken correct"
  );

  // Heropenen: volgorde blijft behouden (persistente)
  const reopen = await req<{ points: { name: string }[] }>(jar, `/api/routes/${routeId}`);
  assert(
    reopen.body.points.map((p) => p.name).join(",") === "Punt 3,Punt 1,Punt 2",
    "volgorde overleeft heropenen (DB-persistente)"
  );

  // Koppelen aan beheerde locatie (snapshot + referentie)
  const withLoc = await req<{ points: { locationId: string | null }[] }>(
    jar,
    `/api/routes/${routeId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        points: [
          {
            locationId: locAId,
            name: `TestDepot-${ts}`,
            address: "Karel Doormanstraat 59, Haaksbergen",
            latitude: 52.2,
            longitude: 6.75,
          },
          { name: "Los punt", latitude: 52.3, longitude: 6.8 },
        ],
      }),
    }
  );
  assert(withLoc.body.points[0]?.locationId === locAId, "routepunt verwijst naar locatie");
  // Locatie wijzigen → routepunt-snapshot onaangetast
  await req(jar, `/api/locations/${locAId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: `Hernoemd-${ts}` }),
  });
  const afterRename = await req<{ points: { name: string }[] }>(jar, `/api/routes/${routeId}`);
  assert(
    afterRename.body.points[0]?.name === `TestDepot-${ts}`,
    "wijzigen bronlocatie corrupteert routepunt-snapshot niet"
  );
  // Herstellen voor opruimen
  await req(jar, `/api/locations/${locAId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: `TestDepot-${ts}` }),
  });

  // Dupliceren
  const dup = await req<{ id: string; name: string; points: unknown[] }>(
    jar,
    `/api/routes/${routeId}/duplicate`,
    { method: "POST" }
  );
  assert(dup.status === 201 && dup.body.name.includes("kopie"), "route dupliceren");
  assert(dup.body.points.length === 2, "duplicaat bevat kopie van punten");

  // Straatroute (netwerk; 200 met route OF nette 503)
  const road = await req<{ route?: { coordinates: [number, number][] } }>(
    jar,
    "/api/routes/road",
    {
      method: "POST",
      body: JSON.stringify({
        points: [
          { latitude: 52.2, longitude: 6.7 },
          { latitude: 52.25, longitude: 6.75 },
        ],
      }),
    }
  );
  assert(
    road.status === 200 || road.status === 503,
    `road-route: 200 (OSRM) of 503 (fallback-melding) — kreeg ${road.status}`
  );
  if (road.status === 200) {
    assert((road.body.route?.coordinates.length ?? 0) > 1, "OSRM-geometrie aanwezig");
  }

  // Soft delete route
  const delRoute = await req<{ softDeleted: boolean }>(jar, `/api/routes/${dup.body.id}`, {
    method: "DELETE",
  });
  assert(delRoute.status === 200 && delRoute.body.softDeleted, "route soft delete");
  const list = await req<{ routes: { id: string }[] }>(jar, "/api/routes");
  assert(
    !list.body.routes.some((r) => r.id === dup.body.id),
    "verwijderde route niet in lijst"
  );

  console.log("\n— Import + batch —");
  // Import: lines-formaat met dedupe tegen net-aangemaakte locatie
  const imp = await req<{
    summary: Record<string, number>;
    rows: { status: string; address: string }[];
    errors: unknown[];
  }>(jar, "/api/locations/import", {
    method: "POST",
    body: JSON.stringify({
      content: `# test\nKarel Doormanstraat 59, Haaksbergen\nNieuwe Straat 5, Almelo\nOnzin`,
      geocodeRows: false,
    }),
  });
  assert(imp.status === 200, "import-analyse zonder geocoding");
  assert(imp.body.summary.duplicates >= 1, "import merkt bestaand adres als duplicaat");
  assert(imp.body.rows.some((r) => r.status === "duplicate"), "duplicaat-status per rij");
  assert(imp.body.rows.some((r) => r.status === "ok"), "onbekende rijen krijgen status ok (coords nodig)");

  // CSV-import met ongeldige rij
  const impCsv = await req<{ summary: Record<string, number>; errors: { line: number }[] }>(
    jar,
    "/api/locations/import",
    {
      method: "POST",
      body: JSON.stringify({
        content:
          'name,address,type\nX,"Karel Doormanstraat 59, Haaksbergen",permanent\nY,"Zweef 1, Almelo",vies',
        format: "csv",
        geocodeRows: false,
      }),
    }
  );
  assert(impCsv.status === 200, "CSV-import analyseert");
  assert(impCsv.body.errors.length >= 1, "CSV: ongeldig type gemeld");
  assert(impCsv.body.summary.duplicates >= 1, "CSV: duplicate adres uit vorige import gedetecteerd");

  // Batch-create met dedupe
  const batch = await req<{ created: number; duplicates: number }>(jar, "/api/locations/batch", {
    method: "POST",
    body: JSON.stringify({
      items: [
        {
          name: `ImportA-${ts}`,
          address: `Importstraat 1, Almelo`,
          latitude: 52.35,
          longitude: 6.66,
          type: "permanent",
        },
        {
          name: `ImportA-${ts}`,
          address: `importstraat 1 almelO`,
          latitude: 52.35,
          longitude: 6.66,
          type: "permanent",
        },
        {
          name: `ImportB-${ts}`,
          address: `Importstraat 2, Almelo`,
          latitude: 52.36,
          longitude: 6.67,
          type: "permanent",
        },
      ],
      skipDuplicates: true,
    }),
  });
  assert(batch.status === 200, "batch-import uitvoeren");
  assert(batch.body.created === 2, `batch: 2 nieuw (kreeg ${batch.body.created})`);
  assert(batch.body.duplicates === 1, `batch: 1 in-file duplicate (kreeg ${batch.body.duplicates})`);

  // Opruimen routes + import-locaties
  await prisma.route.deleteMany({ where: { name: { contains: `-${ts}` } } });
  await prisma.managedLocation.deleteMany({ where: { name: { contains: `-${ts}` } } });
}

async function main() {
  testParser();

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@gps.local";
  const adminPass = process.env.ADMIN_PASSWORD ?? "Admin123!";
  const jar = await login(adminEmail, adminPass);
  const ts = Date.now();
  await testApi(jar, ts);

  // Laatste restanten
  await prisma.managedLocation.deleteMany({ where: { name: { contains: `-${ts}` } } });
  await prisma.route.deleteMany({ where: { name: { contains: `-${ts}` } } });

  console.log(`\nLocatie-tests: ${passed} geslaagd, ${failed} gefaald.`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
