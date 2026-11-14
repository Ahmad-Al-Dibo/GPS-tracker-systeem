import { readFileSync } from "node:fs";
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const res = await fetch("http://localhost:3000/api/ingest/teltonika", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Ingest-Key": process.env.TELTONIKA_INGEST_KEY ?? "" },
  body: JSON.stringify({
    imei: "868618088364708",
    codec: "0x8E",
    records: [
      { timestamp: "2026-11-04T15:28:21.000Z", latitude: 0, longitude: 0, speedMps: 0, satellites: 0, priority: 0, io: [] },
      { timestamp: "+135763-11-27T17:45:05.806Z", latitude: 2.2, longitude: 0.09, speedMps: 22, satellites: 32, priority: 240, io: [] },
    ],
  }),
});
const text = await res.text();
console.log("status:", res.status);
console.log("body:", text.slice(0, 500));
