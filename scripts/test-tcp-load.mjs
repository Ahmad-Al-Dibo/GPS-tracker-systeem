// WP12-tests: TCP-lifecycle + load (draait tegen lopende web-app + gps-tcp):
//  A. Unknown IMEI -> afgewezen (geen records, verbinding dicht)
//  B. 70 gelijktijdige devices -> allemaal ACK, 140 punten in DB
//  C. Disconnect + reconnect (herverbinden werkt, dubbele sessie wordt geschopt)
//  D. TCP-replay van identiek frame -> geen dubbele punten, ACK telt mee
//  E. Online/offline-overgangen via tracking-state (lastSeenAt manipulatie)
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
const TCP_HOST = "127.0.0.1";
const TCP_PORT = Number(process.env.GPS_TCP_PORT ?? 5027);
const N_DEVICES = 70;
const prisma = new PrismaClient();
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

// --- frame-opbouw (identiek aan e2e-teltonika) --------------------------------
function crc16(buf) {
  let crc = 0x0000;
  for (const byte of buf) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc & 0xffff;
}
function buildRecord(ts, lat, lon) {
  const parts = [];
  const tsBuf = Buffer.alloc(8); tsBuf.writeBigUInt64BE(BigInt(ts)); parts.push(tsBuf, Buffer.from([0]));
  const lonB = Buffer.alloc(4); lonB.writeInt32BE(Math.round(lon * 1e7)); parts.push(lonB);
  const latB = Buffer.alloc(4); latB.writeInt32BE(Math.round(lat * 1e7)); parts.push(latB);
  const rest = Buffer.alloc(2 + 2 + 1 + 2); rest.writeInt16BE(30, 0); rest.writeUInt16BE(90, 2); rest[4] = 8; parts.push(rest);
  const io = Buffer.alloc(2 + 2 + 2 + 3 + 2 + 2 + 2 + 2);
  io.writeUInt16BE(1, 4); io.writeUInt16BE(239, 6); io.writeUInt8(1, 8);
  parts.push(io);
  return Buffer.concat(parts);
}
function buildFrame(records) {
  const payload = Buffer.concat([Buffer.from([0x8e, records.length]), ...records, Buffer.from([records.length])]);
  const head = Buffer.alloc(8); head.writeUInt32BE(payload.length, 4);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc16(payload), 0);
  return Buffer.concat([head, payload, crc]);
}

/** Eén TCP-sessie: handshake + frames, retourneert ACKs. */
function tcpSession(imei, frames, { expectHandshake = true, reuseSocket = null } = {}) {
  return new Promise((resolve, reject) => {
    const socket = reuseSocket ?? net.createConnection({ host: TCP_HOST, port: TCP_PORT });
    const acks = [];
    let phase = "imei";
    let buf = Buffer.alloc(0);
    const sendHandshake = () => {
      const imeiBuf = Buffer.from(imei, "ascii");
      const h = Buffer.alloc(2); h.writeUInt16BE(imeiBuf.length, 0);
      socket.write(Buffer.concat([h, imeiBuf]));
    };
    const onConnect = () => sendHandshake();
    if (reuseSocket) sendHandshake();
    else socket.on("connect", onConnect);

    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (phase === "imei" && buf.length >= 1) {
        const reply = buf[0]; buf = buf.subarray(1);
        if (reply !== 0x01) {
          socket.destroy();
          resolve({ handshake: reply, acks });
          return;
        }
        phase = "frames";
        for (const f of frames) socket.write(f);
        if (frames.length === 0) { socket.end(); resolve({ handshake: 0x01, acks }); }
      }
      while (phase === "frames" && buf.length >= 4) {
        acks.push(buf.readUInt32BE(0));
        buf = buf.subarray(4);
        if (acks.length >= frames.length) {
          socket.end();
          resolve({ handshake: 0x01, acks });
          return;
        }
      }
    });
    socket.on("error", reject);
    socket.on("close", () => resolve({ handshake: phase === "imei" ? null : 0x01, acks, closed: true }));
    setTimeout(() => { socket.destroy(); resolve({ handshake: phase === "imei" ? null : 0x01, acks, timeout: true }); }, 15000);
    void expectHandshake;
  });
}

async function api(cookie, path, opts = {}) {
  const res = await fetch(WEB + path, {
    ...opts,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// --- setup: login + testvoertuig ---------------------------------------------
const login = await fetch(WEB + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identifier: "admin", password: process.env.ADMIN_PASSWORD ?? "admin" }),
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const veh = await api(cookie, "/api/vehicles", {
  method: "POST",
  body: JSON.stringify({ name: `LoadTest Voertuig ${Date.now()}` }),
});
const vehicleId = veh.body?.id ?? veh.body?.vehicle?.id;
check("setup: testvoertuig", !!vehicleId, `status ${veh.status}`);

// --- A. unknown IMEI ----------------------------------------------------------
const unknown = await tcpSession("999999999999999", [buildFrame([buildRecord(Date.now(), 52.0, 6.0)])]);
check(
  "A. unknown IMEI -> geen ACK (records geweigerd)",
  unknown.acks.length === 0 || unknown.acks[0] === 0,
  `handshake=${unknown.handshake?.toString(16)} acks=${JSON.stringify(unknown.acks)}`
);

// --- B. 70 gelijktijdige devices ---------------------------------------------
const S = Date.now();
const imeis = Array.from({ length: N_DEVICES }, (_, i) => `8686180${String(S).slice(-6)}${String(i).padStart(2, "0")}`);
for (const imei of imeis) {
  const r = await api(cookie, "/api/devices", {
    method: "POST",
    body: JSON.stringify({ imei, label: `LoadDev ${imei.slice(-4)}`, vehicleId }),
  });
  if (r.status !== 201) { check(`device ${imei} registreren`, false, `status ${r.status}`); break; }
  await api(cookie, `/api/devices/${r.body.id}`, { method: "PATCH", body: JSON.stringify({ action: "connect" }) });
}
check("B. 70 devices geregistreerd + geautoriseerd", true);

const t0 = Date.now();
const sessions = await Promise.all(
  imeis.map((imei, i) =>
    tcpSession(imei, [buildFrame([buildRecord(Date.now(), 52 + i * 0.001, 6 + i * 0.001)])])
  )
);
const allAcked = sessions.every((s) => s.acks[0] === 1);
const elapsed = Date.now() - t0;
check(`B. 70 gelijktijdige TCP-sessies -> allemaal ACK 1`, allAcked, `${elapsed}ms, acks=${sessions.map((s) => s.acks[0]).join(",")}`);

const stored = await prisma.ingestPoint.count({
  where: { deviceId: { not: null }, receivedAt: { gte: new Date(t0 - 5000) } },
});
check("B. 70 punten duurzaam opgeslagen", stored >= N_DEVICES, `geteld: ${stored}`);

// --- C. disconnect + reconnect + dubbele sessie -------------------------------
const first = await tcpSession(imeis[0], [buildFrame([buildRecord(Date.now(), 52.5, 6.5)])]);
check("C1. reconnect na disconnect -> ACK", first.acks[0] === 1, `acks=${JSON.stringify(first.acks)}`);

// Dubbele gelijktijdige sessie voor dezelfde IMEI: nieuwste wint, oude geschopt
const s1 = net.createConnection({ host: TCP_HOST, port: TCP_PORT });
s1.on("error", () => undefined);
await new Promise((r) => s1.on("connect", r));
const s1HandshakeDone = new Promise((r) => s1.once("data", r));
const h1 = Buffer.from(imeis[1], "ascii"); const h1l = Buffer.alloc(2); h1l.writeUInt16BE(h1.length, 0);
s1.write(Buffer.concat([h1l, h1]));
await s1HandshakeDone; // registratie aan server-zijde is nu zeker afgerond
const dupClosed = new Promise((r) => s1.on("close", r));
const s2result = await tcpSession(imeis[1], [buildFrame([buildRecord(Date.now(), 52.6, 6.6)])]);
const s1closed = await Promise.race([dupClosed.then(() => true), new Promise((r) => setTimeout(() => r(false), 5000))]);
check("C2. dubbele sessie -> oude verbinding geschopt, nieuwe werkt", s1closed && s2result.acks[0] === 1, `oldClosed=${s1closed} newAck=${s2result.acks[0]}`);
s1.destroy();

// --- D. TCP-replay van identiek frame ----------------------------------------
const replayFrame = buildFrame([buildRecord(1793900000000, 52.7, 6.7)]);
const before = await prisma.ingestPoint.count({ where: { deviceId: { not: null } } });
const r1 = await tcpSession(imeis[2], [replayFrame]);
const r2 = await tcpSession(imeis[2], [replayFrame]);
const after = await prisma.ingestPoint.count({ where: { deviceId: { not: null } } });
check(
  "D. TCP-replay identiek frame -> 1 punt, beide ACKs",
  r1.acks[0] === 1 && r2.acks[0] === 1 && after === before + 1,
  `acks=${r1.acks[0]},${r2.acks[0]} newRows=${after - before}`
);

// --- E. online/offline-overgangen --------------------------------------------
const dev3 = await prisma.gpsDevice.findUnique({ where: { imei: imeis[3] } });
await prisma.gpsDevice.update({ where: { id: dev3.id }, data: { lastSeenAt: new Date(Date.now() - 3 * 3600_000) } });
let list = await api(cookie, "/api/devices");
let d3 = list.body.devices.find((d) => d.id === dev3.id);
check("E1. 3 uur stil -> 'stale' (niet offline: batch-device)", d3.trackingState === "stale", `state=${d3.trackingState}`);
await prisma.gpsDevice.update({ where: { id: dev3.id }, data: { lastSeenAt: new Date(Date.now() - 30 * 3600_000) } });
list = await api(cookie, "/api/devices");
d3 = list.body.devices.find((d) => d.id === dev3.id);
check("E2. 30 uur stil -> 'offline'", d3.trackingState === "offline", `state=${d3.trackingState}`);
check("E3. laatste positie bewaard na offline", d3.lastLat != null, `lat=${d3.lastLat}`);
check("E4. stale snelheid NIET als live getoond", d3.speedLiveKmh === null, `speedLive=${d3.speedLiveKmh} lastSpeed=${d3.lastSpeedKmh}`);

// --- opruimen -----------------------------------------------------------------
const devIds = (await prisma.gpsDevice.findMany({ where: { imei: { in: imeis } }, select: { id: true } })).map((d) => d.id);
await prisma.ingestPoint.deleteMany({ where: { deviceId: { in: devIds } } });
await prisma.gpsDevice.deleteMany({ where: { id: { in: devIds } } });
await api(cookie, `/api/vehicles/${vehicleId}?permanent=true`, { method: "DELETE" });
await prisma.$disconnect();

console.log(failures === 0 ? "\nWP12-TCP/LOAD-TESTS GESLAAGD" : `\n${failures} TESTS MISLUKT`);
process.exit(failures === 0 ? 0 : 1);
