// Cross-user autorisatietest (Phase 2 §8):
// user B mag NIET bij de devices/voertuigen/bronnen van admin kunnen.
// Draai tegen een lopende dev-server (localhost:3000). Maakt eigen testdata
// en ruimt die weer op.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const BASE = "http://localhost:3000";
const prisma = new PrismaClient();
const SUFFIX = Date.now();
const results = [];
let failures = 0;

function check(name, ok, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

async function login(identifier, password) {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return res.ok ? cookie : null;
}

async function api(cookie, path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// --- testdata: user B --------------------------------------------------------
const userBPw = "TestUserB!" + SUFFIX;
const userB = await prisma.user.create({
  data: {
    email: `test-user-b-${SUFFIX}@test.local`,
    username: `test-user-b-${SUFFIX}`,
    passwordHash: await bcrypt.hash(userBPw, 10),
    role: "user",
  },
});

const adminCookie = await login("admin", process.env.ADMIN_PASSWORD ?? "admin");
const bCookie = await login(`test-user-b-${SUFFIX}`, userBPw);
if (!adminCookie || !bCookie) {
  console.log("login mislukt", !!adminCookie, !!bCookie);
  await prisma.user.delete({ where: { id: userB.id } }).catch(() => {});
  process.exit(1);
}

// --- admin maakt voertuig + device ------------------------------------------
const veh = await api(adminCookie, "/api/vehicles", {
  method: "POST",
  body: JSON.stringify({ name: `AuthZ Voertuig ${SUFFIX}`, licensePlate: `AZ-${SUFFIX}` }),
});
check("admin maakt voertuig", veh.status === 200 || veh.status === 201, `status ${veh.status}`);
const vehicleId = veh.body?.id ?? veh.body?.vehicle?.id;

const dev = await api(adminCookie, "/api/devices", {
  method: "POST",
  body: JSON.stringify({ imei: `868618${String(SUFFIX).slice(-9)}`, label: `AuthZ Device ${SUFFIX}` }),
});
check("admin maakt device", dev.status === 201, `status ${dev.status}`);
const deviceId = dev.body?.id;

// --- cross-user tests --------------------------------------------------------
const bDevices = await api(bCookie, "/api/devices");
check(
  "B ziet admin-device NIET in lijst",
  bDevices.status === 200 && !(bDevices.body?.devices ?? []).some((d) => d.id === deviceId),
  `${(bDevices.body?.devices ?? []).length} devices zichtbaar`
);

const bPatchDev = await api(bCookie, `/api/devices/${deviceId}`, {
  method: "PATCH",
  body: JSON.stringify({ action: "connect" }),
});
check("B kan admin-device NIET verbinden/activeren", bPatchDev.status === 403, `status ${bPatchDev.status}`);

const bDelDev = await api(bCookie, `/api/devices/${deviceId}`, { method: "DELETE" });
check("B kan admin-device NIET verwijderen", bDelDev.status === 403, `status ${bDelDev.status}`);

const bVehicles = await api(bCookie, "/api/vehicles");
check(
  "B ziet admin-voertuig NIET in lijst",
  bVehicles.status === 200 && !(bVehicles.body?.vehicles ?? []).some((v) => v.id === vehicleId),
  `${(bVehicles.body?.vehicles ?? []).length} voertuigen zichtbaar`
);

const bGetVeh = await api(bCookie, `/api/vehicles/${vehicleId}`);
check("B krijgt GEEN toegang tot admin-voertuig detail", bGetVeh.status === 403, `status ${bGetVeh.status}`);

const bPatchVeh = await api(bCookie, `/api/vehicles/${vehicleId}`, {
  method: "PATCH",
  body: JSON.stringify({ displayName: "gekkaapt" }),
});
check("B kan admin-voertuig NIET bewerken", bPatchVeh.status === 403, `status ${bPatchVeh.status}`);

// --- source-takeover via API-key --------------------------------------------
const adminKeyRes = await api(adminCookie, "/api/keys", {
  method: "POST",
  body: JSON.stringify({ label: `AuthZ admin key ${SUFFIX}` }),
});
const adminKey = adminKeyRes.body?.apiKey;
const bKeyRes = await api(bCookie, "/api/keys", {
  method: "POST",
  body: JSON.stringify({ label: `AuthZ userB key ${SUFFIX}` }),
});
const bKey = bKeyRes.body?.apiKey;
check("API-keys aangemaakt", !!adminKey && !!bKey);

// admin maakt een bron via ingest
const srcName = `authz-src-${SUFFIX}`;
const ingest1 = await fetch(BASE + "/api/ingest", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": adminKey },
  body: JSON.stringify({ name: srcName, latitude: 52.0, longitude: 6.0, speedMps: 0, sampledAt: Date.now() }),
});
check("admin maakt bron via ingest", ingest1.status === 200, `status ${ingest1.status}`);

// B probeert dezelfde bronnaam te "overnemen"
const ingest2 = await fetch(BASE + "/api/ingest", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": bKey },
  body: JSON.stringify({ name: srcName, latitude: 51.0, longitude: 5.0, speedMps: 10, sampledAt: Date.now() }),
});
const ingest2Body = await ingest2.json().catch(() => null);
check(
  "B kan admin-bron NIET overnemen (takeover-fix)",
  ingest2.status === 403,
  `status ${ingest2.status} ${ingest2Body?.error ?? ""}`
);

// --- vehicle-persons + trash cross-user --------------------------------------
const bVp = await api(bCookie, "/api/vehicle-persons", {
  method: "POST",
  body: JSON.stringify({ vehicleId, personId: crypto.randomUUID() }),
});
check("B kan NIET koppelen aan admin-voertuig (vehicle-persons)", bVp.status === 403 || bVp.status === 404, `status ${bVp.status}`);

const bVpDel = await api(
  bCookie,
  `/api/vehicle-persons?vehicleId=${vehicleId}&personId=00000000-0000-0000-0000-000000000001`,
  { method: "DELETE" }
);
check("B kan NIET ontkoppelen van admin-voertuig (vehicle-persons)", bVpDel.status === 403, `status ${bVpDel.status}`);

const bTrash = await api(bCookie, "/api/trash?type=vehicles");
check(
  "B ziet admin-voertuigen NIET in prullenbak",
  bTrash.status === 200 && !(bTrash.body?.items ?? []).some((i) => i.id === vehicleId),
  `${(bTrash.body?.items ?? []).length} items zichtbaar`
);

// --- opruimen ----------------------------------------------------------------
if (deviceId) await api(adminCookie, `/api/devices/${deviceId}`, { method: "DELETE" });
if (vehicleId) await api(adminCookie, `/api/vehicles/${vehicleId}?permanent=true`, { method: "DELETE" });
await prisma.ingestSource.deleteMany({ where: { name: srcName } }).catch(() => {});
await prisma.apiKey.deleteMany({ where: { userId: userB.id } }).catch(() => {});
if (adminKey) {
  const adminUser = await prisma.user.findFirst({ where: { username: "admin" } });
  await prisma.apiKey.deleteMany({ where: { label: `AuthZ admin key ${SUFFIX}` } }).catch(() => {});
  void adminUser;
}
await prisma.user.delete({ where: { id: userB.id } }).catch(() => {});

console.log(results.join("\n"));
console.log(failures === 0 ? "\nAUTZ-TESTS GESLAAGD" : `\n${failures} AUTZ-TESTS MISLUKT`);
await prisma.$disconnect();
process.exit(failures === 0 ? 0 : 1);
