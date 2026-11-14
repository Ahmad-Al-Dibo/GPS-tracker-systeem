// Test: idempotente ingest — zelfde record 2× sturen moet 1× opslaan (2e = duplicate).
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
const NOW = Date.now();
const rec = {
  timestamp: new Date(NOW - 60_000).toISOString(),
  latitude: 52.15548,
  longitude: 6.19052,
  speedMps: 0,
  satellites: 7,
  priority: 0,
  io: [{ id: 239, value: 1 }],
};

async function push(records) {
  const res = await fetch("http://localhost:3000/api/ingest/teltonika", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Ingest-Key": process.env.TELTONIKA_INGEST_KEY ?? "" },
    body: JSON.stringify({ imei: IMEI, codec: "0x8E", records }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const first = await push([rec]);
console.log("1e verzending:", JSON.stringify(first.body));
const second = await push([rec]);
console.log("2e verzending (herverzending):", JSON.stringify(second.body));

const ok =
  first.status === 200 &&
  first.body?.accepted === 1 &&
  first.body?.duplicates === 0 &&
  second.status === 200 &&
  second.body?.accepted === 1 &&
  second.body?.duplicates === 1;

// 3e: batch met 1 nieuw + 1 dubbel
const batch = await push([rec, { ...rec, timestamp: new Date(NOW - 30_000).toISOString() }]);
console.log("gemengde batch (1 nieuw + 1 dubbel):", JSON.stringify(batch.body));
const okBatch = batch.body?.accepted === 2 && batch.body?.duplicates === 1;

// opruimen: eigen testdata + device-state herstellen
const prisma = new PrismaClient();
const dev = await prisma.gpsDevice.findUnique({ where: { imei: IMEI } });
if (dev) {
  await prisma.ingestPoint.deleteMany({
    where: { deviceId: dev.id, recordHash: { not: null }, receivedAt: { gte: new Date(NOW - 300_000) } },
  });
  await prisma.gpsDevice.update({
    where: { id: dev.id },
    data: { lastFixAt: null, lastLat: null, lastLon: null, lastSpeedMps: null },
  });
}
await prisma.$disconnect();

console.log(ok && okBatch ? "TEST GESLAAGD: dedupe werkt" : "TEST MISLUKT");
process.exit(ok && okBatch ? 0 : 1);
