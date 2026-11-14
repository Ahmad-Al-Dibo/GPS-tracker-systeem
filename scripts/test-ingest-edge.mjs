// WP4-tests: idempotente ingest-edge-cases
//  1. Twee VERSCHILLENDE records met identieke timestamp -> beide opgeslagen
//  2. Out-of-order (jonger record na ouder) -> beide bewaard, originele ts behouden
//  3. Buffered replay na herverbinden -> geen duplicaten
//  4. Identieke batch opnieuw (ACK verloren -> device retry) -> duplicates, geen nieuwe rijen
// Testhygiene: dynamische timestamps + eigen data en device-state opruimen.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const IMEI = "868618088364708";
const prisma = new PrismaClient();
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

async function push(records) {
  const res = await fetch("http://localhost:3000/api/ingest/teltonika", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Ingest-Key": process.env.TELTONIKA_INGEST_KEY ?? "" },
    body: JSON.stringify({ imei: IMEI, codec: "0x8E", records }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const NOW = Date.now();
const iso = (offsetMs) => new Date(NOW + offsetMs).toISOString();
const T = iso(0); // zelfde-ts-basis
const mk = (ts, lat, lon) => ({
  timestamp: ts, latitude: lat, longitude: lon,
  speedMps: 1, satellites: 8, priority: 0, io: [{ id: 239, value: 1 }],
});

// 1) identieke timestamp, andere inhoud
const r1 = await push([mk(T, 52.1, 6.1), mk(T, 52.2, 6.2)]);
check("zelfde-ts, andere inhoud -> 2 records opgeslagen",
  r1.body?.accepted === 2 && r1.body?.duplicates === 0,
  JSON.stringify(r1.body));

// 2) out-of-order: ouder record ná jonger
const r2 = await push([mk(iso(5000), 52.3, 6.3), mk(iso(-5000), 52.4, 6.4)]);
check("out-of-order records -> beide opgeslagen",
  r2.body?.accepted === 2 && r2.body?.duplicates === 0,
  JSON.stringify(r2.body));

// 3) buffered replay: alles opnieuw -> alleen duplicates
const replay = await push([
  mk(T, 52.1, 6.1), mk(T, 52.2, 6.2),
  mk(iso(5000), 52.3, 6.3), mk(iso(-5000), 52.4, 6.4),
]);
check("buffered replay -> 0 nieuw, 4 duplicates",
  replay.body?.accepted === 4 && replay.body?.duplicates === 4,
  JSON.stringify(replay.body));

// 4) retry van identieke batch (simulatie verloren ACK)
const retry = await push([mk(T, 52.1, 6.1)]);
check("retry na verloren ACK -> gedupeerd, ACK telt mee",
  retry.body?.accepted === 1 && retry.body?.duplicates === 1,
  JSON.stringify(retry.body));

// 5) originele timestamps bewaard (uit DB)
const rows = await prisma.ingestPoint.findMany({
  where: { recordHash: { not: null }, sampledAt: { gte: new Date(NOW - 10_000) } },
  orderBy: { sampledAt: "asc" },
});
const timestamps = rows.map((r) => r.sampledAt.toISOString());
check("originele GPS-timestamps bewaard",
  timestamps.includes(iso(-5000)) && timestamps.includes(T) && timestamps.includes(iso(5000)),
  timestamps.join(", "));

// opruimen: eigen testrecords + device-state herstellen
for (const r of rows) await prisma.ingestPoint.delete({ where: { id: r.id } }).catch(() => {});
const dev = await prisma.gpsDevice.findUnique({ where: { imei: IMEI } });
if (dev) {
  await prisma.gpsDevice.update({
    where: { id: dev.id },
    data: { lastFixAt: null, lastLat: null, lastLon: null, lastSpeedMps: null },
  });
}
await prisma.$disconnect();

console.log(failures === 0 ? "\nWP4-INGEST-TESTS GESLAAGD" : `\n${failures} WP4-TESTS MISLUKT`);
process.exit(failures === 0 ? 0 : 1);
