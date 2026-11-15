/**
 * Phase 2 scenario-tests (API-niveau):
 *  A — nieuwe Teltonika-IMEI → automatische registratie → data → positie bijgewerkt
 *  B — nieuwe mobiele tracker: enrolment → trackerKey → GPS → registratie
 *  C — bestaande tracker: extra data → geen duplicaat-record
 *  D — metadata/naam-wijziging sync + beheerdersvelden behouden
 *  F — meerdere trackers: gescheiden identiteiten/posities
 *
 * Run: npm run test:trackers   (server moet draaien; .env wordt zelf gelezen)
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
function check(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`OK: ${msg}`);
  } else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "Admin123!" }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

async function main() {
  const cookie = await login();
  const H = { "Content-Type": "application/json", Cookie: cookie };
  const stamp = Date.now();

  // ── Scenario A: nieuwe hardware-IMEI ──
  console.log("\n— Scenario A: nieuwe Teltonika-IMEI —");
  const IMEI_A = `9900${String(stamp).slice(-10)}`; // 14 cijfers, uniek
  const hwPush = await fetch(`${BASE}/api/ingest/teltonika`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Ingest-Key": process.env.TELTONIKA_INGEST_KEY ?? "" },
    body: JSON.stringify({
      imei: IMEI_A,
      codec: "0x8E",
      records: [
        { timestamp: new Date().toISOString(), latitude: 52.16, longitude: 6.73, speedMps: 3, satellites: 9, priority: 0, io: [] },
      ],
    }),
  });
  const hwBody = await hwPush.json();
  check(hwPush.status === 200 && hwBody.accepted === 1, `A1: nieuwe IMEI wordt geaccepteerd (kreeg ${hwPush.status}/${hwBody.accepted})`);
  check(hwBody.vehicleLinked === true, "A2: tracker automatisch gekoppeld (geen quarantine)");

  const hwSource = await prisma.ingestSource.findUnique({ where: { externalId: IMEI_A } });
  check(!!hwSource, "A3: tracker-record aangemaakt met externalId = IMEI");
  check(hwSource?.verificationStatus === "unverified", "A4: tracker is unverified (wacht op admin-pairing)");
  check(hwSource?.sourceType === "hardware", "A5: sourceType = hardware");
  check(hwSource?.latitude === 52.16 && hwSource?.longitude === 6.73, "A6: eerste positie opgeslagen");
  check(hwSource?.firstSeenAt !== null, "A7: firstSeenAt gezet");
  const hwDevice = await prisma.gpsDevice.findUnique({ where: { imei: IMEI_A } });
  check(!!hwDevice && hwDevice.vehicleId === hwSource?.id, "A8: GpsDevice sidecar gekoppeld aan tracker");

  // Zichtbaar in de kaart-/bronlijst
  const sourcesRes = await fetch(`${BASE}/api/ingest/sources`, { headers: { Cookie: cookie } });
  const sourcesBody = await sourcesRes.json();
  check(
    (sourcesBody.sources ?? []).some((s: { id: string }) => s.id === hwSource?.id),
    "A9: tracker zichtbaar in /api/ingest/sources (dashboard)"
  );

  // ── Scenario B: nieuwe mobiele tracker ──
  console.log("\n— Scenario B: nieuwe mobiele tracker —");
  const keyRes = await fetch(`${BASE}/api/keys`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ label: `tracker-test-${stamp}` }),
  });
  const keyBody = await keyRes.json();
  const userApiKey = keyBody.apiKey;
  check(!!userApiKey, "B1: gebruikers-API-key aangemaakt");

  const INSTALL_ID = randomUUID();
  const enrollRes = await fetch(`${BASE}/api/trackers/enroll`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": userApiKey },
    body: JSON.stringify({
      installId: INSTALL_ID,
      deviceName: "Company Van 01",
      metadata: { vehicle_registration: "AB-123-CD", driver: "Driver 01", company: "Example Company" },
    }),
  });
  const enroll = await enrollRes.json();
  check(enrollRes.status === 201, `B2: enrolment creëert tracker (kreeg ${enrollRes.status})`);
  check(!!enroll.trackerKey && enroll.trackerKey.startsWith("gptt_"), "B3: trackerKey uitgereikt (1×)");
  const mobileSource = await prisma.ingestSource.findUnique({ where: { externalId: INSTALL_ID } });
  check(!!mobileSource, "B4: tracker-record met externalId = installId");
  check(mobileSource?.verificationStatus === "unverified", "B5: mobiele tracker unverified");
  check(mobileSource?.displayName === "Company Van 01", "B6: naam uit app opgeslagen");
  const devMeta = mobileSource?.deviceMetadata as { vehicle_registration?: string } | null;
  check(devMeta?.vehicle_registration === "AB-123-CD", "B7: metadata opgeslagen");

  // GPS met trackerKey
  const gpsRes = await fetch(`${BASE}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tracker-Key": enroll.trackerKey },
    body: JSON.stringify({
      installId: INSTALL_ID,
      latitude: 52.09,
      longitude: 6.71,
      timestamp: new Date().toISOString(),
      speedMps: 8.5,
      altitude: 42,
      heading: 180,
      accuracyMeters: 5,
      batteryLevel: 77,
    }),
  });
  const gpsBody = await gpsRes.json();
  check(gpsRes.status === 200 && gpsBody.accepted === true, `B8: GPS met trackerKey geaccepteerd (kreeg ${gpsRes.status})`);
  const mobileAfter = await prisma.ingestSource.findUnique({ where: { id: mobileSource!.id } });
  check(mobileAfter?.latitude === 52.09 && mobileAfter?.longitude === 6.71, "B9: positie bijgewerkt");
  check(mobileAfter?.lastBatteryLevel === 77 && mobileAfter?.lastAltitude === 42 && mobileAfter?.lastHeading === 180, "B10: batterij/altitude/heading op profiel");
  const pointCount = await prisma.ingestPoint.count({ where: { sourceId: mobileSource!.id } });
  check(pointCount === 1, `B11: GPS-punt opgeslagen (kreeg ${pointCount})`);

  // Verkeerde key wordt geweigerd (identiteit alleen = onvoldoende)
  const badKeyRes = await fetch(`${BASE}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tracker-Key": "gptt_" + "0".repeat(64) },
    body: JSON.stringify({ latitude: 1, longitude: 1 }),
  });
  check(badKeyRes.status === 401, "B12: onbekende trackerKey → 401");

  // ── Scenario C: bestaande tracker, geen duplicaat ──
  console.log("\n— Scenario C: bestaande tracker —");
  const gps2 = await fetch(`${BASE}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tracker-Key": enroll.trackerKey },
    body: JSON.stringify({ installId: INSTALL_ID, latitude: 52.10, longitude: 6.72, timestamp: new Date().toISOString() }),
  });
  check(gps2.status === 200, "C1: tweede zending geaccepteerd");
  const mobileCount = await prisma.ingestSource.count({ where: { externalId: INSTALL_ID } });
  check(mobileCount === 1, `C2: geen duplicaat-record (kreeg ${mobileCount})`);
  const hwCount = await prisma.ingestSource.count({ where: { externalId: IMEI_A } });
  check(hwCount === 1, `C3: hardware blijft ook uniek (kreeg ${hwCount})`);

  // ── Scenario D: metadata/naam-wijziging + admin-velden behouden ──
  console.log("\n— Scenario D: metadata-wijziging —");
  // Admin zet beheerdersmetadata + hernoemt de tracker
  const adminPatch = await fetch(`${BASE}/api/trackers/${mobileSource!.id}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({
      displayName: "Admin Rename",
      metadata: { department: "Logistics", customFields: { branch: "Enschede" } },
    }),
  });
  check(adminPatch.status === 200, `D1: admin PATCH metadata/displayName (kreeg ${adminPatch.status})`);

  // App stuurt gewijzigde metadata (nieuwe naam + extra veld) in GPS-payload
  const gps3 = await fetch(`${BASE}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tracker-Key": enroll.trackerKey },
    body: JSON.stringify({
      installId: INSTALL_ID,
      latitude: 52.11,
      longitude: 6.73,
      timestamp: new Date().toISOString(),
      metadata: { device_name: "Company Van 02", department: "App Department" },
    }),
  });
  check(gps3.status === 200, "D2: GPS met metadata-wijziging geaccepteerd");
  const afterD = await prisma.ingestSource.findUnique({ where: { id: mobileSource!.id } });
  const adminMeta = afterD?.metadata as { department?: string; customFields?: Record<string, string> } | null;
  const devMetaD = afterD?.deviceMetadata as { device_name?: string; department?: string } | null;
  check(afterD?.displayName === "Company Van 02", "D3: apparaatnaam sync't displayName (echte rename)");
  check(adminMeta?.department === "Logistics", "D4: beheerdersmetadata ONAANGEROKEN door app-zending");
  check(!!adminMeta?.customFields?.branch, "D5: admin customFields behouden");
  check(devMetaD?.device_name === "Company Van 02" && devMetaD?.department === "App Department", "D6: deviceMetadata bijgewerkt");

  // Admin hernoemt opnieuw; app herhaalt dezelfde naam → admin-rename blijft
  await fetch(`${BASE}/api/trackers/${mobileSource!.id}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ displayName: "Admin Rename 2" }),
  });
  await fetch(`${BASE}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tracker-Key": enroll.trackerKey },
    body: JSON.stringify({
      installId: INSTALL_ID,
      latitude: 52.12,
      longitude: 6.74,
      timestamp: new Date().toISOString(),
      metadata: { device_name: "Company Van 02" }, // zelfde als laatst gezonden
    }),
  });
  const afterRename = await prisma.ingestSource.findUnique({ where: { id: mobileSource!.id } });
  check(afterRename?.displayName === "Admin Rename 2", "D7: admin-rename blijft staan bij herhaalde app-naam");

  // ── Scenario F: meerdere trackers, gescheiden posities ──
  console.log("\n— Scenario F: meerdere trackers —");
  check(hwSource!.id !== mobileSource!.id, "F1: verschillende records voor hardware + mobiel");
  const hwAfter = await prisma.ingestSource.findUnique({ where: { id: hwSource!.id } });
  check(hwAfter?.latitude === 52.16, "F2: hardware-positie niet overschreven door mobiele data");
  check(afterRename?.latitude === 52.12, "F3: mobiele positie onafhankelijk");

  // ── Opruimen ──
  await prisma.ingestPoint.deleteMany({ where: { sourceId: { in: [hwSource!.id, mobileSource!.id] } } });
  await prisma.gpsDevice.deleteMany({ where: { imei: IMEI_A } });
  await prisma.ingestSource.deleteMany({ where: { id: { in: [hwSource!.id, mobileSource!.id] } } });
  await prisma.apiKey.deleteMany({ where: { label: `tracker-test-${stamp}` } });
  console.log("\nOpruimen: testdata verwijderd.");

  await prisma.$disconnect();
  console.log(`\nTracker-tests: ${passed} geslaagd, ${failed} gefaald`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
