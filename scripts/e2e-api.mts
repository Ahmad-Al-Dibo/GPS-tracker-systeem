/**
 * E2E smoke-test voor Fleet GPS Platform (admin-only versie)
 * Vereist: server draait op BASE_URL (default http://localhost:3000)
 *
 * Test: admin login, geen publieke registratie, API-keys, ingest, overview
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

type Jar = { cookie: string };

async function login(identifier: string, password: string): Promise<Jar> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  return { cookie };
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

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
  console.log(`OK: ${msg}`);
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@gps.local";
  const adminPass = process.env.ADMIN_PASSWORD ?? "Admin123!";

  // 1. Admin login
  const admin = await login(adminEmail, adminPass);
  const me = await req<{ role: string }>(admin, "/api/me");
  assert(me.status === 200 && me.body.role === "admin", "admin login + rol");

  // 2. Publieke registratie moet mislukken (endpoint bestaat niet meer)
  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "x@test.com", username: "hacker", password: "test1234" }),
  });
  assert(regRes.status === 404 || regRes.status === 405, "publieke registratie verwijderd (404/405)");

  // 3. /register pagina moet 404 zijn
  const regPage = await fetch(`${BASE}/register`);
  assert(regPage.status === 404, "register-pagina verwijderd (404)");

  // 4. API-key aanmaken
  const keyRes = await req<{ apiKey: string; keyPrefix: string }>(
    admin,
    "/api/keys",
    { method: "POST", body: JSON.stringify({ label: "E2E test" }) }
  );
  assert(keyRes.status === 201 && keyRes.body.apiKey?.startsWith("gpta_"), "API-key aanmaken");
  const apiKey = keyRes.body.apiKey;

  // 5. Key in lijst (zonder raw value)
  const listRes = await req<{ keys: { keyPrefix: string }[] }>(admin, "/api/keys");
  assert(listRes.status === 200 && listRes.body.keys.length > 0, "API-key lijst");

  // 6. Ingest met API-key
  const ingestBody = JSON.stringify({
    name: "E2E-Test",
    latitude: 52.1,
    longitude: 6.1,
    accuracyMeters: 8,
    speedMps: 3.0,
  });
  const ingestRes = await fetch(`${BASE}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: ingestBody,
  });
  assert(ingestRes.status === 200, "GPS-ingest met API-key");

  // 7. Ingest zonder key → 401
  const noAuth = await fetch(`${BASE}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: ingestBody,
  });
  assert(noAuth.status === 401, "ingest zonder key geweigerd (401)");

  // 8. Overview
  const ov = await req<{ totalVehicles: number }>(admin, "/api/overview");
  assert(ov.status === 200 && ov.body.totalVehicles >= 1, "overview toont voertuigen");

  // 9. Onbevoegd: geen sessie → 401 op protected endpoints
  const noSession = await req<{ error: string }>(null, "/api/keys");
  assert(noSession.status === 401, "geen sessie → 401 op /api/keys");

  // 10. Logout
  const out = await fetch(`${BASE}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: admin.cookie },
  });
  assert(out.status === 200, "logout");

  // 11. Na logout → sessie ongeldig
  const afterOut = await req<{ error: string }>(admin, "/api/me");
  assert(afterOut.status === 401, "sessie ongeldig na logout");

  console.log("\nAlle E2E-checks geslaagd.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
