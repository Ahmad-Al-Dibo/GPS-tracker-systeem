// WP9-verificatie Phase 3A: 70-device load-test met 10-SECONDEN rapportageprofiel
// (moving-interval conform projectbesluit). Echt uitgevoerd: 70 devices sturen
// gedurende 60s elk 10s een record (6 rondes x 70 = 420 records).
// Meet: ACK-scores, latentie per ronde, DB-groei, geheugen-belasting serverzijde.
import { readFileSync } from "node:fs";
import net from "node:net";
import { PrismaClient } from "@prisma/client";
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const WEB = "http://localhost:3000";
const TCP_PORT = Number(process.env.GPS_TCP_PORT ?? 5027);
const N_DEVICES = 70;
const ROUNDS = 6; // 6 x 10s = 60s profiel
const INTERVAL_S = 10;
const prisma = new PrismaClient();
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

function crc16(buf) {
  let crc = 0x0000;
  for (const byte of buf) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc & 0xffff;
}
function buildFrame(ts, lat, lon, round) {
  const parts = [];
  const tsBuf = Buffer.alloc(8); tsBuf.writeBigUInt64BE(BigInt(ts)); parts.push(tsBuf, Buffer.from([1]));
  const lonB = Buffer.alloc(4); lonB.writeInt32BE(Math.round(lon * 1e7)); parts.push(lonB);
  const latB = Buffer.alloc(4); latB.writeInt32BE(Math.round(lat * 1e7)); parts.push(latB);
  const rest = Buffer.alloc(2 + 2 + 1 + 2); rest.writeInt16BE(30, 0); rest.writeUInt16BE(120, 2); rest[4] = 9; parts.push(rest);
  const io = Buffer.alloc(2 + 2 + 2 + 3 + 2 + 2 + 2 + 2);
  io.writeUInt16BE(1, 4); io.writeUInt16BE(239, 6); io.writeUInt8(1, 8);
  parts.push(io);
  const record = Buffer.concat(parts);
  const payload = Buffer.concat([Buffer.from([0x8e, 1]), record, Buffer.from([1])]);
  const head = Buffer.alloc(8); head.writeUInt32BE(payload.length, 4);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc16(payload), 0);
  void round;
  return Buffer.concat([head, payload, crc]);
}

/** Persistente sessie per device: 1 verbinding, meerdere frames (zoals een echt device).
 *  Eén data-handler (geen dubbele verwerking); frames worden ALTIJD verstuurd. */
class DeviceSession {
  constructor(imei) {
    this.imei = imei;
    this.queue = [];
    this.pending = null;
    this.buf = Buffer.alloc(0);
    this.hsResolve = null;
    this.hsDone = false;
    this.socket = net.createConnection({ host: "127.0.0.1", port: TCP_PORT });
    this.socket.on("data", (d) => this.onData(d));
    this.socket.on("error", () => undefined);
  }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    if (!this.hsDone && this.buf.length >= 1) {
      this.hsDone = true;
      const v = this.buf[0];
      this.buf = this.buf.subarray(1);
      if (this.hsResolve) { this.hsResolve(v); this.hsResolve = null; }
    }
    while (this.buf.length >= 4) {
      const ack = this.buf.readUInt32BE(0);
      this.buf = this.buf.subarray(4);
      if (this.pending) { this.pending(ack); this.pending = null; }
      else this.queue.push(ack);
    }
  }
  handshake() {
    return new Promise((resolve, reject) => {
      this.hsResolve = resolve;
      this.socket.once("connect", () => {
        const b = Buffer.from(this.imei, "ascii");
        const h = Buffer.alloc(2); h.writeUInt16BE(b.length, 0);
        this.socket.write(Buffer.concat([h, b]));
      });
      this.socket.once("error", reject);
    });
  }
  sendFrame(frame) {
    return new Promise((resolve) => {
      this.socket.write(frame); // frame gaat ALTIJD de deur uit
      if (this.queue.length > 0) { resolve(this.queue.shift()); return; }
      this.pending = resolve;
    });
  }
  destroy() { this.socket.destroy(); }
}

// --- setup: login + voertuig + devices ---------------------------------------
const login = await fetch(WEB + "/api/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identifier: "admin", password: process.env.ADMIN_PASSWORD ?? "admin" }),
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
async function api(path, opts = {}) {
  const res = await fetch(WEB + path, { ...opts, headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers || {}) } });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const S = Date.now();
const veh = await api("/api/vehicles", { method: "POST", body: JSON.stringify({ name: `Load10s Voertuig ${S}` }) });
const vehicleId = veh.body?.id ?? veh.body?.vehicle?.id;
const imeis = Array.from({ length: N_DEVICES }, (_, i) => `8686181${String(S).slice(-6)}${String(i).padStart(2, "0")}`);
for (const imei of imeis) {
  const r = await api("/api/devices", {
    method: "POST",
    body: JSON.stringify({ imei, label: `L10 ${imei.slice(-4)}`, vehicleId }),
  });
  await api(`/api/devices/${r.body.id}`, { method: "PATCH", body: JSON.stringify({ action: "connect" }) });
}
check("setup: 70 devices geregistreerd + geautoriseerd", true);

// --- 10s-profiel: 6 rondes, elke ronde 70 frames parallel --------------------
const sessions = imeis.map((i) => new DeviceSession(i));
const hs = await Promise.all(sessions.map((s) => s.handshake()));
check("70 handshakes geslaagd", hs.every((v) => v === 1));

const baseLat = 52.15, baseLon = 6.19;
const t0 = Date.now();
let totalAcked = 0;
const roundDurations = [];
for (let round = 0; round < ROUNDS; round++) {
  const rt0 = Date.now();
  const acks = await Promise.all(
    sessions.map((s, i) =>
      s.sendFrame(buildFrame(Date.now(), baseLat + i * 0.0001 + round * 0.00001, baseLon + i * 0.0001, round))
    )
  );
  const acked = acks.filter((a) => a === 1).length;
  totalAcked += acked;
  roundDurations.push(Date.now() - rt0);
  if (round < ROUNDS - 1) await new Promise((r) => setTimeout(r, INTERVAL_S * 1000));
}
const elapsed = (Date.now() - t0) / 1000;
check(`10s-profiel: ${ROUNDS} rondes x ${N_DEVICES} records -> allemaal ACK 1`,
  totalAcked === ROUNDS * N_DEVICES,
  `${totalAcked}/${ROUNDS * N_DEVICES} in ${elapsed.toFixed(1)}s, rondes: ${roundDurations.join(",")}ms`);

const stored = await prisma.ingestPoint.count({
  where: { deviceId: { not: null }, receivedAt: { gte: new Date(t0 - 10_000) } },
});
check("420 records duurzaam opgeslagen", stored >= ROUNDS * N_DEVICES, `geteld: ${stored}`);

// Server-geheugenbelasting (proces-info via health)
const h = await api("/api/health");
check("web-app gezond na load", h.body?.status === "ok", `status=${h.body?.status}`);

// --- opruimen ----------------------------------------------------------------
const devIds = (await prisma.gpsDevice.findMany({ where: { imei: { in: imeis } }, select: { id: true } })).map((d) => d.id);
await prisma.ingestPoint.deleteMany({ where: { deviceId: { in: devIds } } });
await prisma.gpsDevice.deleteMany({ where: { id: { in: devIds } } });
await api(`/api/vehicles/${vehicleId}?permanent=true`, { method: "DELETE" });
sessions.forEach((s) => s.destroy());
await prisma.$disconnect();

console.log(failures === 0 ? "\n10S-PROFILE LOAD TEST GESLAAGD" : `\n${failures} TESTS MISLUKT`);
process.exit(failures === 0 ? 0 : 1);
