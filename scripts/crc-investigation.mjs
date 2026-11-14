// CRC-onderzoek deel 2: brute-force op COMPLETE echte FMC920-frames
// (uit teltonika/server.log van 2026-11-04, 100-byte frames) + spec-check.
import { readFileSync } from "node:fs";

const algos = {
  "CCITT-FALSE(1021,FFFF)": (buf) => { let c = 0xffff; for (const b of buf) { c ^= b << 8; for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c; },
  "XMODEM(1021,0000)": (buf) => { let c = 0x0000; for (const b of buf) { c ^= b << 8; for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c; },
  "IBM(8005,0000,refl)": (buf) => { let c = 0x0000; for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1; } return c & 0xffff; },
  "MODBUS(8005,FFFF,refl)": (buf) => { let c = 0xffff; for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1; } return c & 0xffff; },
  "KERMIT(1021,0000,refl)": (buf) => { const rev = (x) => { let r = 0; for (let i = 0; i < 16; i++) { r = (r << 1) | (x & 1); x >>>= 1; } return r & 0xffff; }; let c = 0; for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0x8408 : c >>> 1; } return rev(c); },
  "CCITT(1021,FFFF,refl)": (buf) => { const rev = (x) => { let r = 0; for (let i = 0; i < 16; i++) { r = (r << 1) | (x & 1); x >>>= 1; } return r & 0xffff; }; let c = rev(0xffff); for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ rev(0x1021) : c >>> 1; } return rev(c) & 0xffff; },
};

// Echte frames uit de log van 2026-11-04 (device → server, compleet, 100 B).
// Verwachte waarden uit de server-waarschuwingen: 7fca / 7310 / 66dc.
const FRAMES = [
  { name: "frame A (log 22:37, 100 B)", hex: "00000000000000588e01000001a1a87f201000040421c21f17499a003f00940b000000f0000c000500ef0000f00000150400c800004501000500b5000a00b6000700422e900043000000440000000200f100004fc0001000000000000000000100007fca" },
  { name: "frame B (log 22:37, 100 B)", hex: "00000000000000588e01000001a1a8b60e9000040421c21f17499a000d00940f00000000000c000500ef0000f00000150400c800004501000500b5000a00b6000700422e8e0043000000440000000200f100004fc0001000000000000000000100007310" },
];

for (const f of FRAMES) {
  const frame = Buffer.from(f.hex, "hex");
  console.log(`\n=== ${f.name} — ${frame.length} bytes ===`);
  if (frame.length !== 100) console.log(`  (let op: lengte ${frame.length}, verwacht 100 — hex bijgesneden?)`);
  const dataLen = frame.readUInt32BE(4);
  const payload = frame.subarray(8, 8 + dataLen);
  const trailer = frame.subarray(8 + dataLen);
  console.log(`payload ${payload.length} B (codec 0x${payload[0].toString(16)}, count ${payload[1]}), trailer: ${trailer.toString("hex")}`);
  for (const [algo, fn] of Object.entries(algos)) {
    const c = fn(payload);
    const marks = [];
    if (trailer.length >= 2 && trailer.readUInt16BE(0) === c) marks.push("= trailer[0..2]");
    if (trailer.length >= 4 && trailer.readUInt16BE(2) === c) marks.push("= trailer[2..4]");
    if (trailer.length >= 4) {
      const dup = ((c << 16) | c) >>> 0;
      if (trailer.readUInt32BE(0) === dup) marks.push("= 2x gedupliceerd");
    }
    console.log(`  ${algo.padEnd(26)} 0x${c.toString(16).padStart(4, "0")} ${marks.join(" ")}`);
  }
}

// Ook: trailing bytes van het selftest-chunk-frame (mogelijk 3 v/d 4 CRC-bytes)
const selftest = readFileSync("teltonika/selftest.mjs", "utf8");
const m = selftest.match(/'([0-9a-f]{400,})'/);
if (m) {
  const chunk = Buffer.from(m[1], "hex");
  const dataLen = chunk.readUInt32BE(4);
  const payload = chunk.subarray(8, 8 + dataLen);
  const trailer = chunk.subarray(8 + dataLen);
  console.log(`\n=== selftest chunk — ${chunk.length} B, payload ${payload.length} B, trailer: ${trailer.toString("hex")} ===`);
  for (const [algo, fn] of Object.entries(algos)) {
    const c = fn(payload);
    const marks = [];
    if (trailer.length >= 2 && trailer.readUInt16BE(0) === c) marks.push("= trailer[0..2]");
    if (trailer.length >= 3 && trailer.readUInt16BE(trailer.length - 2) === c) marks.push("= laatste 2 bytes");
    console.log(`  ${algo.padEnd(26)} 0x${c.toString(16).padStart(4, "0")} ${marks.join(" ")}`);
  }
}
