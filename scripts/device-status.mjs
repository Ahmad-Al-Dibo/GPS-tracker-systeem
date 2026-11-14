// Korte status-check: is het FMC920-device geregistreerd/geautoriseerd/gekoppeld?
import { readFileSync } from "node:fs";
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const BASE = "http://localhost:3000";
const IMEI = "868618088364708";

const login = await fetch(BASE + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identifier: "admin", password: process.env.ADMIN_PASSWORD ?? "admin" }),
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
if (!login.ok) { console.log("login mislukt", login.status); process.exit(1); }

const res = await fetch(BASE + "/api/devices", { headers: { Cookie: cookie } });
const d = await res.json();
const dev = d.devices.find((x) => x.imei === IMEI);
if (!dev) {
  console.log("Device met IMEI", IMEI, "is NOG NIET geregistreerd.");
  console.log("Geregistreerde apparaten:", d.devices.map((x) => x.imei).join(", ") || "(geen)");
} else {
  console.log("Device:", dev.imei, "-", dev.label ?? "(geen label)");
  console.log("  status:", dev.status, "| verbinding:", dev.connectionState);
  console.log("  voertuig:", dev.vehicleName ?? "NIET GEKOPPELD", dev.vehicleLicensePlate ?? "");
  console.log("  laatst gezien:", dev.lastSeenAt ?? "nog nooit");
  console.log("  laatste positie:", dev.lastLat ?? "-", "/", dev.lastLon ?? "-", "| fix:", dev.lastFixAt ?? "-");
  console.log("  records ontvangen:", dev.lastRecordCount);
}
