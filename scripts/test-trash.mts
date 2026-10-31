/**
 * Tests: soft delete, filteren, prullenbak, herstellen, definitief verwijderen,
 * autorisatie en de gevolgen voor GPS-geschiedenis/voertuig-relaties.
 *
 * Vereist: server draait op BASE_URL (default http://localhost:3000)
 * Systeem: gebruikt prisma direct voor DB-asserties (soft delete = rij bestaat nog).
 *
 * Run: npm run test:trash
 */
import { prisma } from "@/lib/db";

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

async function main() {
  const ts = Date.now();
  const personName = `TestPersoon-${ts}`;
  const personBName = `TestPersoonB-${ts}`;
  const vehicleName = `TestVoertuig-${ts}`;

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@gps.local";
  const adminPass = process.env.ADMIN_PASSWORD ?? "Admin123!";
  const admin = await login(adminEmail, adminPass);

  const me = await req<{ username: string; role: string }>(admin, "/api/me");
  assert(me.status === 200 && me.body.role === "admin", "admin login");

  // ── Aanmaken testdata ──────────────────────────────────
  const personA = await req<{ id: string }>(admin, "/api/persons", {
    method: "POST",
    body: JSON.stringify({ name: personName, email: `a-${ts}@test.nl` }),
  });
  assert(personA.status === 201, "persoon A aanmaken");
  const personB = await req<{ id: string }>(admin, "/api/persons", {
    method: "POST",
    body: JSON.stringify({ name: personBName }),
  });
  assert(personB.status === 201, "persoon B aanmaken");

  const vehicle = await req<{ id: string; isActive: boolean }>(admin, "/api/vehicles", {
    method: "POST",
    body: JSON.stringify({ name: vehicleName, iconEmoji: "🚗" }),
  });
  assert(vehicle.status === 201, "voertuig aanmaken");
  const vehicleId = vehicle.body.id;
  const isActiveBefore = vehicle.body.isActive;

  const link = await req(admin, "/api/vehicle-persons", {
    method: "POST",
    body: JSON.stringify({ vehicleId, personId: personA.body.id }),
  });
  assert(link.status === 201, "koppeling A↔voertuig aanmaken");

  // GPS-punt via ingest (API-key) → bewijst GPS-geschiedenis
  const keyRes = await req<{ apiKey: string }>(admin, "/api/keys", {
    method: "POST",
    body: JSON.stringify({ label: `trash-test-${ts}` }),
  });
  assert(keyRes.status === 201 && !!keyRes.body.apiKey, "API-key voor ingest");
  const ingestRes = await fetch(`${BASE}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": keyRes.body.apiKey },
    body: JSON.stringify({ name: vehicleName, latitude: 52.1, longitude: 6.1, speedMps: 5 }),
  });
  const ingestBody = (await ingestRes.json()) as { sourceId?: string };
  assert(ingestRes.status === 200 && ingestBody.sourceId === vehicleId, "GPS-punt landt op hetzelfde voertuig");
  const pointsBefore = await prisma.ingestPoint.count({ where: { sourceId: vehicleId } });
  assert(pointsBefore >= 1, "GPS-punt(en) opgeslagen");

  // Taak gekoppeld aan voertuig (afhankelijkheid bij definitief verwijderen)
  const taskRes = await req<{ id: string }>(admin, "/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title: `Trash-test taak ${ts}`, vehicleId }),
  });
  assert(taskRes.status === 201, "taak gekoppeld aan voertuig");
  const taskId = taskRes.body.id;

  // ── 1. Soft delete persoon ─────────────────────────────
  const delA = await req<{ softDeleted: boolean; links: number }>(
    admin,
    `/api/persons/${personA.body.id}`,
    { method: "DELETE" }
  );
  assert(delA.status === 200 && delA.body.softDeleted === true, "persoon soft delete → 200 + softDeleted");

  const dbPerson = await prisma.person.findUnique({ where: { id: personA.body.id } });
  assert(dbPerson !== null, "record bestaat NIET fysiek verwijderd (soft delete)");
  assert(dbPerson?.deletedAt instanceof Date, "deletedAt gezet");
  assert(dbPerson?.deletedBy !== null, "deletedBy gezet");
  const linksAfterSoft = await prisma.vehiclePerson.count({ where: { personId: personA.body.id } });
  assert(linksAfterSoft === 1, "koppelingen blijven bewaard bij soft delete");

  // ── 2. Filteren uit actieve lijsten/responses ──────────
  const listP = await req<{ persons: { id: string; name: string }[] }>(admin, "/api/persons");
  assert(
    listP.status === 200 && !listP.body.persons.some((p) => p.id === personA.body.id),
    "verwijderde persoon niet in actieve lijst /api/persons"
  );
  assert(
    listP.body.persons.some((p) => p.id === personB.body.id),
    "niet-verwijderde persoon wel in lijst"
  );
  const detailP = await req(admin, `/api/persons/${personA.body.id}`);
  assert(detailP.status === 404, "GET persoon-detail → 404 na soft delete");
  const patchP = await req(admin, `/api/persons/${personA.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "x" }),
  });
  assert(patchP.status === 404, "PATCH verwijderde persoon → 404");

  // Koppelen aan verwijderde persoon (voertuig is nog actief)
  const linkDeletedPerson = await req<{ error: string }>(admin, "/api/vehicle-persons", {
    method: "POST",
    body: JSON.stringify({ vehicleId, personId: personA.body.id }),
  });
  assert(
    linkDeletedPerson.status === 409 && (linkDeletedPerson.body.error ?? "").includes("prullenbak"),
    "koppelen aan verwijderde persoon → 409"
  );

  // ── 3. Soft delete voertuig ────────────────────────────
  const delV = await req<{ softDeleted: boolean }>(admin, `/api/vehicles/${vehicleId}`, {
    method: "DELETE",
  });
  assert(delV.status === 200 && delV.body.softDeleted === true, "voertuig soft delete → 200 + softDeleted");

  const dbVehicle = await prisma.ingestSource.findUnique({ where: { id: vehicleId } });
  assert(dbVehicle !== null, "voertuig bestaat nog in DB (soft delete)");
  assert(dbVehicle?.deletedAt instanceof Date, "voertuig deletedAt gezet");
  assert(dbVehicle?.isActive === isActiveBefore, "isActive (tracker-status) ongewijzigd bij verwijderen");
  const pointsStill = await prisma.ingestPoint.count({ where: { sourceId: vehicleId } });
  assert(pointsStill === pointsBefore, "GPS-geschiedenis behouden bij soft delete");

  const listV = await req<{ vehicles: { id: string }[] }>(admin, "/api/vehicles");
  assert(
    listV.status === 200 && !listV.body.vehicles.some((v) => v.id === vehicleId),
    "verwijderd voertuig niet in actieve lijst /api/vehicles"
  );
  const detailV = await req(admin, `/api/vehicles/${vehicleId}`);
  assert(detailV.status === 404, "GET voertuig-detail → 404 na soft delete");

  const overview = await req<{ totalVehicles: number }>(admin, "/api/overview");
  assert(overview.status === 200, "overview bereikbaar na soft delete");

  const sourcesRes = await req<{ sources: { id: string; name: string }[] }>(
    admin,
    "/api/ingest/sources"
  );
  assert(
    sourcesRes.status === 200 && !sourcesRes.body.sources.some((s) => s.id === vehicleId),
    "verwijderd voertuig niet in /api/ingest/sources (selectie/kaart)"
  );

  // Rapporten (standaard API-response)
  const reportRes = await fetch(`${BASE}/api/reports?type=activity`, {
    headers: { Cookie: admin.cookie },
  });
  const csv = await reportRes.text();
  assert(reportRes.ok && !csv.includes(vehicleName), "rapport-activity bevat verwijderd voertuig niet");

  // ── 4. Prullenbak ──────────────────────────────────────
  const noAuthTrash = await req<{ error: string }>(null, "/api/trash?type=persons");
  assert(noAuthTrash.status === 401, "prullenbak zonder sessie → 401");

  // Soft delete B ná A → nieuwste eerst
  await req(admin, `/api/persons/${personB.body.id}`, { method: "DELETE" });
  const trashP = await req<{
    items: { id: string; deletedAt: string; deletedByName: string | null; dependencies: { links: number } }[];
  }>(admin, "/api/trash?type=persons");
  assert(trashP.status === 200 && trashP.body.items.length >= 2, "prullenbak personen bevat verwijderde records");
  const idxA = trashP.body.items.findIndex((i) => i.id === personA.body.id);
  const idxB = trashP.body.items.findIndex((i) => i.id === personB.body.id);
  assert(idxA >= 0 && idxB >= 0 && idxB < idxA, "gesorteerd op verwijderdatum, nieuwste eerst");
  assert(trashP.body.items[idxA]?.deletedByName === me.body.username, "verwijderd door getoond (admin)");
  assert(typeof trashP.body.items[idxA]?.deletedAt === "string", "verwijderdatum getoond");

  const trashV = await req<{
    items: {
      id: string;
      deletedAt: string;
      deletedByName: string | null;
      dependencies: { gpsPoints: number; links: number; tasks: number };
    }[];
  }>(admin, "/api/trash?type=vehicles");
  const trashItem = trashV.body.items.find((i) => i.id === vehicleId);
  assert(!!trashItem, "voertuig in prullenbak");
  assert(trashItem!.dependencies.gpsPoints >= 1, "prullenbak toont GPS-punt-afhankelijkheid");
  assert(trashItem!.dependencies.links === 1, "prullenbak toont koppel-afhankelijkheid");
  assert(trashItem!.dependencies.tasks === 1, "prullenbak toont taak-afhankelijkheid");

  const badType = await req(admin, "/api/trash?type=fout");
  assert(badType.status === 400, "prullenbak onjuist type → 400");

  // ── 5. Koppelen aan verwijderde voertuigen geweigerd ───
  const linkDeleted = await req<{ error: string }>(admin, "/api/vehicle-persons", {
    method: "POST",
    body: JSON.stringify({ vehicleId, personId: personB.body.id }),
  });
  assert(
    linkDeleted.status === 409 && (linkDeleted.body.error ?? "").includes("prullenbak"),
    "koppelen aan verwijderd voertuig → 409"
  );

  // ── 6. Naam-uniekheid: nieuw voertuig metzelfde naam ───
  const dupeName = await req<{ error: string }>(admin, "/api/vehicles", {
    method: "POST",
    body: JSON.stringify({ name: vehicleName }),
  });
  assert(
    dupeName.status === 409 && (dupeName.body.error ?? "").includes("prullenbak"),
    "aanmaken met naam uit prullenbak → 409 met melding"
  );

  // ── 7. Herstellen ──────────────────────────────────────
  const restoreA = await req<{ ok: boolean }>(admin, `/api/persons/${personA.body.id}/restore`, {
    method: "POST",
  });
  assert(restoreA.status === 200 && restoreA.body.ok === true, "persoon herstellen → 200");
  const restoredList = await req<{ persons: { id: string }[] }>(admin, "/api/persons");
  assert(
    restoredList.body.persons.some((p) => p.id === personA.body.id),
    "herstelde persoon terug in actieve lijst"
  );
  const restoredDetail = await req<{ vehicles: { id: string }[] }>(
    admin,
    `/api/persons/${personA.body.id}`
  );
  assert(restoredDetail.status === 200, "herstelde persoon detail weer 200");
  // Voertuig is nog verwijderd → koppeling bestaat wel in DB, maar getoond niet
  const linkInDb = await prisma.vehiclePerson.count({
    where: { personId: personA.body.id, vehicleId },
  });
  assert(linkInDb === 1, "koppeling in DB onaangetast na herstel persoon");

  const restoreV = await req<{ ok: boolean; isActive: boolean }>(
    admin,
    `/api/vehicles/${vehicleId}/restore`,
    { method: "POST" }
  );
  assert(restoreV.status === 200 && restoreV.body.ok === true, "voertuig herstellen → 200");
  assert(restoreV.body.isActive === isActiveBefore, "isActive ongewijzigd na herstel (niet automatisch geactiveerd/uitgeschakeld)");
  const restoredVehicles = await req<{ vehicles: { id: string }[] }>(admin, "/api/vehicles");
  assert(
    restoredVehicles.body.vehicles.some((v) => v.id === vehicleId),
    "hersteld voertuig terug in actieve lijst"
  );
  const restoredVDetail = await req<{ persons: { id: string }[] }>(admin, `/api/vehicles/${vehicleId}`);
  assert(
    restoredVDetail.status === 200 &&
      restoredVDetail.body.persons.some((p) => p.id === personA.body.id),
    "voertuig-persoon koppeling hersteld zonder opnieuw koppelen"
  );
  const reportRes2 = await fetch(`${BASE}/api/reports?type=activity`, {
    headers: { Cookie: admin.cookie },
  });
  const csv2 = await reportRes2.text();
  assert(csv2.includes(vehicleName), "hersteld voertuig weer in rapport");
  const dbVehicle2 = await prisma.ingestSource.findUnique({ where: { id: vehicleId } });
  assert(dbVehicle2?.deletedAt === null && dbVehicle2?.deletedBy === null, "deletedAt/deletedBy gewist na herstel");

  // Restore van record dat niet verwijderd is → 400
  const restoreAgain = await req(admin, `/api/vehicles/${vehicleId}/restore`, { method: "POST" });
  assert(restoreAgain.status === 400, "herstellen niet-verwijderd record → 400");

  // ── 8. Definitief verwijderen ──────────────────────────
  // Moet uit de prullenbak + met bevestiging
  const purgedActive = await req(admin, `/api/persons/${personA.body.id}?permanent=true&confirm=true`, {
    method: "DELETE",
  });
  assert(purgedActive.status === 400, "definitief verwijderen zonder soft delete → 400");

  // Nogmaals soft delete A (zonder koppelingen? koppeling bestaat nog)
  await req(admin, `/api/persons/${personA.body.id}`, { method: "DELETE" });

  const purgeNoConfirm = await req<{ code: string; dependencies: { links: number } }>(
    admin,
    `/api/persons/${personA.body.id}?permanent=true`,
    { method: "DELETE" }
  );
  assert(
    purgeNoConfirm.status === 409 && purgeNoConfirm.body.code === "needs_confirmation",
    "definitief verwijderen zonder confirm → 409 needs_confirmation"
  );
  assert(purgeNoConfirm.body.dependencies.links >= 1, "409 bevat afhankelijkheden (koppelingen)");

  const personBStill = await prisma.person.findUnique({ where: { id: personB.body.id } });
  assert(personBStill?.deletedAt, "persoon B nog in prullenbak");

  const purgeA = await req<{ purged: boolean }>(
    admin,
    `/api/persons/${personA.body.id}?permanent=true&confirm=true`,
    { method: "DELETE" }
  );
  assert(purgeA.status === 200 && purgeA.body.purged === true, "persoon definitief verwijderd met confirm");
  assert((await prisma.person.findUnique({ where: { id: personA.body.id } })) === null, "persoon fysiek uit DB");
  assert(
    (await prisma.vehiclePerson.count({ where: { personId: personA.body.id } })) === 0,
    "koppelingen definitief verwijderd"
  );

  // Voertuig opnieuw in prullenbak → definitief
  await req(admin, `/api/vehicles/${vehicleId}`, { method: "DELETE" });
  const purgeVNoConfirm = await req<{ dependencies: { gpsPoints: number; tasks: number } }>(
    admin,
    `/api/vehicles/${vehicleId}?permanent=true`,
    { method: "DELETE" }
  );
  assert(purgeVNoConfirm.status === 409, "voertuig definitief zonder confirm → 409");
  assert(purgeVNoConfirm.body.dependencies.gpsPoints >= 1, "afhankelijkheden bevatten GPS-punten");

  const purgeV = await req<{ removed: { gpsPoints: number; tasks: number } }>(
    admin,
    `/api/vehicles/${vehicleId}?permanent=true&confirm=true`,
    { method: "DELETE" }
  );
  assert(purgeV.status === 200 && purgeV.body.removed.gpsPoints >= 1, "voertuig definitief verwijderd (cascade geteld)");
  assert((await prisma.ingestSource.findUnique({ where: { id: vehicleId } })) === null, "voertuig fysiek uit DB");
  assert(
    (await prisma.ingestPoint.count({ where: { sourceId: vehicleId } })) === 0,
    "GPS-punten verwijderd bij definitief verwijderen (bekend gevolg)"
  );
  const taskAfter = await prisma.task.findUnique({ where: { id: taskId } });
  assert(taskAfter !== null, "taak-record blijft bestaan bij verwijderen voertuig");
  assert(taskAfter?.vehicleId === null, "taak-verwijzing naar voertuig wordt NULL (SetNull)");

  // ── 9. Autorisatie backendniveau ───────────────────────
  // Niet-admin aanmaken + inloggen
  const pwHash = await (async () => {
    const bcrypt = await import("bcryptjs");
    return bcrypt.hash(`Test-${ts}!`, 10);
  })();
  const testUser = await prisma.user.create({
    data: {
      email: `trash-test-${ts}@test.local`,
      username: `trashtest${ts}`,
      passwordHash: pwHash,
      role: "user",
    },
  });
  const userJar = await login(`trashtest${ts}`, `Test-${ts}!`);

  const userTrash = await req<{ items?: unknown[] }>(userJar, "/api/trash?type=persons");
  assert(userTrash.status === 200, "niet-admin mag prullenbak lezen");

  // Voertuig zacht verwijderen door niet-admin is toegestaan (requireAuth),
  // daarna mag die NIET definitief verwijderen (requireAdmin)
  const userVehicle = await req<{ id: string }>(userJar, "/api/vehicles", {
    method: "POST",
    body: JSON.stringify({ name: `UserVoertuig-${ts}` }),
  });
  assert(userVehicle.status === 201, "niet-admin kan voertuig aanmaken");
  await req(userJar, `/api/vehicles/${userVehicle.body.id}`, { method: "DELETE" });
  const userPurge = await req<{ error: string }>(
    userJar,
    `/api/vehicles/${userVehicle.body.id}?permanent=true&confirm=true`,
    { method: "DELETE" }
  );
  assert(userPurge.status === 403, "definitief verwijderen niet-admin → 403");

  const noSessionPurge = await req(null, `/api/vehicles/${userVehicle.body.id}?permanent=true&confirm=true`, {
    method: "DELETE",
  });
  assert(noSessionPurge.status === 401, "definitief verwijderen zonder sessie → 401");

  // ── 10. Gebruikersaccounts onaangetast ─────────────────
  const meAfter = await req<{ username: string }>(admin, "/api/me");
  assert(meAfter.status === 200 && meAfter.body.username === me.body.username, "admin-sessie/ account werkt na alle operaties");
  const adminRow = await prisma.user.findUnique({ where: { email: adminEmail } });
  assert(adminRow?.isActive === true, "gebruikersaccount niet gewijzigd door personen/voertuig-operaties");

  // ── Opschonen testdata ─────────────────────────────────
  await prisma.notification.deleteMany({ where: { title: { contains: `Trash-test` } } });
  await prisma.task.deleteMany({ where: { title: { contains: `Trash-test taak ${ts}` } } });
  await req(admin, `/api/vehicles/${userVehicle.body.id}?permanent=true&confirm=true`, { method: "DELETE" });
  await prisma.ingestSource.deleteMany({ where: { name: { contains: `-${ts}` } } });
  await prisma.person.deleteMany({ where: { name: { contains: `-${ts}` } } });
  await prisma.apiKey.deleteMany({ where: { label: `trash-test-${ts}` } });
  await prisma.session.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } }).catch(() => undefined);

  console.log(`\nTrash-tests: ${passed} geslaagd, ${failed} gefaald.`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
