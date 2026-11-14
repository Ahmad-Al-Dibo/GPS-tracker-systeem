// E2E-test: volledige hardware-flow zonder fysiek apparaat.
// 1) login (admin) 2) voertuig + device registreren 3) Connect-knop 4) koppelen
// 5) gesimuleerd Teltonika-frame via TCP (poort 5027) 6) verifieer DB/API.
const IMEI = "868618088364708";
const BASE = "http://localhost:3000";
const TCP_HOST = "127.0.0.1";
const TCP_PORT = 5027;

// .env inlezen voor ADMIN_PASSWORD
import { readFileSync } from "node:fs";
import net from "node:net";
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

function crc16(buf) {
  let crc = 0xffff;
  for (const byte of buf) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function buildCodec8ERecord({ ts, lat, lon, speedKmh, sats, ignition }) {
  const parts = [];
  const tsBuf = Buffer.alloc(8);
  tsBuf.writeBigUInt64BE(BigInt(ts));
  parts.push(tsBuf, Buffer.from([0])); // priority
  const lonBuf = Buffer.alloc(4); lonBuf.writeInt32BE(Math.round(lon * 1e7)); parts.push(lonBuf);
  const latBuf = Buffer.alloc(4); latBuf.writeInt32BE(Math.round(lat * 1e7)); parts.push(latBuf);
  const altBuf = Buffer.alloc(2); altBuf.writeInt16BE(30); parts.push(altBuf);
  const angBuf = Buffer.alloc(2); angBuf.writeUInt16BE(88); parts.push(angBuf);
  parts.push(Buffer.from([sats]));
  const spdBuf = Buffer.alloc(2); spdBuf.writeUInt16BE(Math.round(speedKmh)); parts.push(spdBuf);
  // IO: eventIoId(2)=0, totalIo(2)=1, N1(2)=1, [{id 239, val}], N2/N4/N8/NX = 0
  const io = Buffer.alloc(2 + 2 + 2 + 3 + 2 + 2 + 2 + 2);
  let o = 0;
  io.writeUInt16BE(0, o); o += 2; // eventIoId
  io.writeUInt16BE(1, o); o += 2; // totalIo
  io.writeUInt16BE(1, o); o += 2; // N1 = 1
  io.writeUInt16BE(239, o); o += 2; // id = Ignition
  io.writeUInt8(ignition ? 1 : 0, o); o += 1;
  io.writeUInt16BE(0, o); o += 2; // N2
  io.writeUInt16BE(0, o); o += 2; // N4
  io.writeUInt16BE(0, o); o += 2; // N8
  io.writeUInt16BE(0, o); o += 2; // NX
  parts.push(io);
  return Buffer.concat(parts);
}

function buildFrame(recordsBufs, count) {
  const payload = Buffer.concat([Buffer.from([0x8e, count]), ...recordsBufs, Buffer.from([count])]);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(0, 0);
  head.writeUInt32BE(payload.length, 4);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc16(payload), 0);
  return Buffer.concat([head, payload, crc]);
}

async function api(path, opts = {}, cookie) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return { res, data: await res.json().catch(() => null), setCookie };
}

async function sendTcp(imei, frame) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: TCP_HOST, port: TCP_PORT }, () => {
      const imeiBuf = Buffer.from(imei, "ascii");
      const head = Buffer.alloc(2);
      head.writeUInt16BE(imeiBuf.length, 0);
      sock.write(Buffer.concat([head, imeiBuf]));
    });
    let phase = "imei";
    let buf = Buffer.alloc(0);
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (phase === "imei" && buf.length >= 1) {
        console.log("IMEI-antwoord:", buf[0] === 1 ? "0x01 (accept)" : "0x" + buf[0].toString(16));
        buf = buf.subarray(1);
        phase = "ack";
        sock.write(frame);
      }
      if (phase === "ack" && buf.length >= 4) {
        const accepted = buf.readUInt32BE(0);
        console.log("AVL-ACK:", accepted, "record(s)");
        sock.end();
        resolve(accepted);
      }
    });
    sock.on("error", reject);
    setTimeout(() => reject(new Error("TCP-timeout")), 10000);
  });
}

async function main() {
  console.log("=== E2E: hardware-flow (gesimuleerd Teltonika-frame) ===");

  // 1) Login
  let { res, data, setCookie } = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier: "admin", password: process.env.ADMIN_PASSWORD ?? "admin" }),
  });
  if (!res.ok) {
    console.log("login met standaardwachtwoord faalde, probeer env ADMIN_PASSWORD niet gezet -> check seed");
    console.log("status", res.status, data);
    process.exit(1);
  }
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  console.log("1) login OK");

  // 2) Voertuig aanmaken
  ({ res, data } = await api("/api/vehicles", {
    method: "POST",
    body: JSON.stringify({ name: "E2E Testvoertuig " + Date.now(), licensePlate: "E2E-TEST-01" }),
  }, cookie));
  if (!res.ok) { console.log("voertuig aanmaken mislukt", res.status, data); process.exit(1); }
  const vehicleId = data.id ?? data.vehicle?.id;
  console.log("2) voertuig OK:", vehicleId);

  // 3) Device registreren
  ({ res, data } = await api("/api/devices", {
    method: "POST",
    body: JSON.stringify({ imei: IMEI, label: "E2E FMC920", brand: "Teltonika", model: "FMC920", protocol: "codec8e" }),
  }, cookie));
  if (!res.ok && res.status !== 409) { console.log("device aanmaken mislukt", res.status, data); process.exit(1); }
  const deviceId = data.id;
  console.log("3) device OK:", deviceId ?? "(bestond al)");

  // 4) Connect-knop (autoriseren)
  let list = await api("/api/devices", {}, cookie);
  let dev = list.data.devices.find((d) => d.imei === IMEI);
  ({ res, data } = await api(`/api/devices/${dev.id}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "connect" }),
  }, cookie));
  console.log("4) connect:", res.ok ? "OK (status=" + data.status + ")" : "MISLUKT " + res.status);

  // 5) Koppelen aan voertuig
  ({ res, data } = await api(`/api/devices/${dev.id}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "assign", vehicleId }),
  }, cookie));
  console.log("5) assign:", res.ok ? "OK" : "MISLUKT " + res.status);

  // 5b) Device-state resetten zodat de meting niet door andere tests vervuild wordt
  {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const dev = await prisma.gpsDevice.findUnique({ where: { imei: IMEI } });
    if (dev) {
      await prisma.gpsDevice.update({
        where: { id: dev.id },
        data: { lastFixAt: null, lastLat: null, lastLon: null, lastSpeedMps: null },
      });
    }
    await prisma.$disconnect();
  }

  // 6) Gesimuleerd frame via TCP
  const rec = buildCodec8ERecord({
    ts: Date.now(),
    lat: 52.1554817,
    lon: 6.1905183,
    speedKmh: 0,
    sats: 7,
    ignition: true,
  });
  const frame = buildFrame([rec], 1);
  console.log("6) TCP-frame verzenden (" + frame.length + " B)...");
  const accepted = await sendTcp(IMEI, frame);
  if (accepted !== 1) { console.log("MISLUKT: ACK =", accepted, "verwacht 1"); process.exit(1); }

  // 7) Verifieer
  await new Promise((r) => setTimeout(r, 1000));
  list = await api("/api/devices", {}, cookie);
  dev = list.data.devices.find((d) => d.imei === IMEI);
  console.log("7) device-status:");
  console.log("   connectionState:", dev.connectionState);
  console.log("   lastSeenAt:", dev.lastSeenAt);
  console.log("   lastLat/Lon:", dev.lastLat, "/", dev.lastLon);
  console.log("   lastRecordCount:", dev.lastRecordCount);

  const pos = dev.lastLat === 52.1554817 && dev.lastLon === 6.1905183;
  console.log("   positie correct:", pos ? "JA" : "NEE");

  // 8) Voertuig-positie via API (wat de kaart toont)
  const v = await api(`/api/vehicles/${vehicleId}`, {}, cookie);
  console.log("8) voertuig-positie (kaart):", v.data.latitude, "/", v.data.longitude);
  console.log("   devices gekoppeld:", v.data.devices.length, "-", v.data.devices.map((d) => d.imei + ":" + d.connectionState).join(", "));

  const ok = pos && dev.connectionState === "online" && v.data.latitude === 52.1554817;
  console.log(ok ? "=== E2E GESLAAGD ===" : "=== E2E MISLUKT ===");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error("e2e-fout:", err.message); process.exit(1); });
