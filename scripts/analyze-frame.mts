// Analyse: vind de juiste Codec 8E-recordstructuur voor de FMC920
// Probeert meerdere GPS-elementgroottes en IO-count-formaten
import { readFileSync } from "fs";

const log = readFileSync("teltonika/server.log", "utf8");
const lines = log.split("\n").filter((l) => l.includes("ruwe data") && l.includes("1205"));
if (lines.length === 0) {
  console.log("Geen 1205-byte frame gevonden in server.log");
  process.exit(1);
}
const hex = lines[0].match(/\(([0-9]+) B\): ([0-9a-f]+)/);
if (!hex) {
  console.log("Hex-patroon niet gevonden in logregel");
  process.exit(1);
}
const buf = Buffer.from(hex[2], "hex");
console.log(`Frame: ${buf.length} bytes, codec=0x${buf[8].toString(16)}, count=${buf[9]}`);

// NL-coördinatenbereik
const NL_LAT_MIN = 50, NL_LAT_MAX = 54;
const NL_LON_MIN = 3, NL_LON_MAX = 8;

function isNetherlands(lat: number, lon: number): boolean {
  return lat >= NL_LAT_MIN && lat <= NL_LAT_MAX && lon >= NL_LON_MIN && lon <= NL_LON_MAX;
}

function isZero(lat: number, lon: number): boolean {
  return lat === 0 && lon === 0;
}

// Strategie: parse IO-sectie met verschillende count-formaten
function parseIo(buf: Buffer, pos: number, idSize: number, countSize: number, hasNx: boolean): number | null {
  const readCount = (o: number): number => (countSize === 2 ? buf.readUInt16BE(o) : buf[o]);
  try {
    for (const vs of [1, 2, 4, 8]) {
      const n = readCount(pos);
      if (n > 100) return null; // onredelijk groot
      pos += countSize;
      for (let i = 0; i < n; i++) {
        pos += idSize + vs;
        if (pos > buf.length) return null;
      }
    }
    if (hasNx) {
      const nx = readCount(pos);
      if (nx > 100) return null;
      pos += countSize;
      for (let i = 0; i < nx; i++) {
        pos += idSize;
        const len = buf.readUInt16BE(pos);
        pos += 2 + len;
        if (pos > buf.length) return null;
      }
    }
    return pos;
  } catch {
    return null;
  }
}

// Strategieën proberen
const strategies = [
  { name: "GPS=24, idSize=2, countSize=2, nx=true", gpsSize: 24, idSize: 2, countSize: 2, hasNx: true },
  { name: "GPS=24, idSize=2, countSize=2, nx=false", gpsSize: 24, idSize: 2, countSize: 2, hasNx: false },
  { name: "GPS=24, idSize=1, countSize=1, nx=false", gpsSize: 24, idSize: 1, countSize: 1, hasNx: false },
  { name: "GPS=25, idSize=2, countSize=2, nx=true", gpsSize: 25, idSize: 2, countSize: 2, hasNx: true },
  { name: "GPS=25, idSize=2, countSize=2, nx=false", gpsSize: 25, idSize: 2, countSize: 2, hasNx: false },
  { name: "GPS=25, idSize=1, countSize=1, nx=false", gpsSize: 25, idSize: 1, countSize: 1, hasNx: false },
  { name: "GPS=26, idSize=2, countSize=2, nx=true", gpsSize: 26, idSize: 2, countSize: 2, hasNx: true },
  { name: "GPS=26, idSize=1, countSize=1, nx=false", gpsSize: 26, idSize: 1, countSize: 1, hasNx: false },
];

for (const strat of strategies) {
  console.log(`\n=== ${strat.name} ===`);
  let pos = 10; // na preamble(4)+len(4)+codec(1)+count(1)
  let okCount = 0;
  let nlCount = 0;
  let zeroCount = 0;
  let badCount = 0;
  const records = [];

  for (let r = 0; r < buf[9]; r++) {
    if (pos + strat.gpsSize > buf.length) {
      console.log(`  Record ${r + 1}: buffer op (pos=${pos})`);
      break;
    }
    const ts = Number(buf.readBigUInt64BE(pos));
    const lat = buf.readInt32BE(pos + 13) / 1e7;
    const lon = buf.readInt32BE(pos + 9) / 1e7;
    const sats = buf[pos + 21];
    const speed = buf.readUInt16BE(pos + 22);

    const tsDate = new Date(ts);
    const tsValid = !Number.isNaN(tsDate.getTime()) && tsDate.getFullYear() >= 2020 && tsDate.getFullYear() <= 2030;

    records.push({ r: r + 1, pos, lat: lat.toFixed(4), lon: lon.toFixed(4), sats, speed, ts: tsValid ? tsDate.toISOString() : `INVALID(${ts})` });

    if (isNetherlands(lat, lon)) nlCount++;
    else if (isZero(lat, lon)) zeroCount++;
    else badCount++;
    if (tsValid) okCount++;

    // IO-sectie overslaan
    const ioStart = pos + strat.gpsSize;
    const nextPos = parseIo(buf, ioStart, strat.idSize, strat.countSize, strat.hasNx);
    if (nextPos === null) {
      console.log(`  Record ${r + 1}: IO-parse faalde op pos=${ioStart}`);
      break;
    }
    pos = nextPos;
  }

  console.log(`  Records: ${records.length}, geldige ts: ${okCount}, NL: ${nlCount}, 0/0: ${zeroCount}, slecht: ${badCount}`);
  for (const rec of records.slice(0, 5)) {
    console.log(`    #${rec.r} pos=${rec.pos} lat=${rec.lat} lon=${rec.lon} sats=${rec.sats} spd=${rec.speed} ts=${rec.ts}`);
  }
  if (records.length > 5) console.log(`    ... (${records.length - 5} meer)`);
}
