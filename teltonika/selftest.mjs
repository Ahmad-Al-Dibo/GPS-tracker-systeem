import net from 'node:net'

/**
 * Zelftest/regressietest: draait tegen de lopende server op 127.0.0.1:5027.
 * Stuurt een IMEI-handshake + een Codec 8-frame + een Codec 8 Extended-frame
 * en controleert de AVL-ACKs (4 bytes = aantal records).
 *
 *   node teltonika/selftest.mjs
 */

const HOST = process.env.AVL_HOST ?? '127.0.0.1'
const PORT = Number(process.env.AVL_PORT ?? 5027)

function crc16(buf) {
  // CRC-16/IBM (poly 0x8005, reflected 0xA001, init 0x0000) — dezelfde
  // als server.mjs en het echte FMC920-device (Teltonika AVL-spec).
  let crc = 0x0000
  for (const byte of buf) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1
  }
  return crc & 0xffff
}

function frame(payload) {
  // echte FMC920-vorm: preamble(4) | length(4) | payload | crc(4)
  const head = Buffer.alloc(8)
  head.writeUInt32BE(0, 0)
  head.writeUInt32BE(payload.length, 4)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc16(payload), 0)
  return Buffer.concat([head, payload, crc])
}

function gpsRecord(ts, lat, lon) {
  const buf = Buffer.alloc(24)
  buf.writeBigUInt64BE(BigInt(ts), 0)
  buf[8] = 0 // priority
  buf.writeInt32BE(Math.round(lon * 1e7), 9)
  buf.writeInt32BE(Math.round(lat * 1e7), 13)
  buf.writeInt16BE(12, 17) // altitude
  buf.writeUInt16BE(180, 19) // angle
  buf[21] = 8 // satellites
  buf.writeUInt16BE(55, 22) // speed
  return buf
}

// Codec 8-record: gps(24) + eventId(2) + totalIO(1)=2 + n1=2 (id+val pairs) + n2/n4/n8 leeg
const codec8Record = Buffer.concat([
  gpsRecord(new Date('2026-11-04T12:00:00Z').getTime(), 52.37024, 4.895154),
  Buffer.from([0x00, 0x01]), // event id
  Buffer.from([0x02]), // total IO = 2
  Buffer.from([0x02, 0x15, 0x01, 0x02, 0x00]), // n1=2: (0x15=1)(0x02=0)
  Buffer.from([0x00]), // n2
  Buffer.from([0x00]), // n4
  Buffer.from([0x00]), // n8
])
const codec8Payload = Buffer.concat([Buffer.from([0x08, 0x01]), codec8Record, Buffer.from([0x01])])

// Codec 8E-record: gps(24) + eventId(2) + totalIO(1) + n1=1 + n2/n4/n8 leeg + nX=1 (id+len+value)
const codec8ERecord = Buffer.concat([
  gpsRecord(new Date('2026-11-04T12:05:00Z').getTime(), 52.3676, 4.9041),
  Buffer.from([0x00, 0x00]),
  Buffer.from([0x02]), // total IO
  Buffer.from([0x01, 0x15, 0x01]), // n1=1: id 0x15 = 1
  Buffer.from([0x00, 0x00, 0x00]), // n2/n4/n8 leeg
  Buffer.from([0x01, 0xF1, 0x02, 0xAB, 0xCD]), // nX=1: id 0xF1, lengte 2, waarde ABCD
])
const codec8EPayload = Buffer.concat([Buffer.from([0x8e, 0x01]), codec8ERecord, Buffer.from([0x01])])

// echte device-chunk (FMC920, 4 nov 2026): payload = 14 records — regressietest.
// De ruwe dump was in de log afgekapt; daarom nemen we de payload (bytes 8..8+1193)
// en bouwen het frame opnieuw met een correcte CRC.
const realChunk = Buffer.from(
  '00000000000004a98e0e000001a1a72cea080000000000000000000000000000000000f0000c000500ef0000f00100150400c800004502000500b5000000b6000000422df60043000000440000000200f100004fc000100000000000000000000001a1a72defc00000000000000000000000000000000000f0000c000500ef0000f00000150400c800004502000500b5000000b6000000422e3b0043000000440000000200f100004fc000100000000000000000000001a1a72e41c80000000000000000000000000000000000f0000c000500ef0000f00100150400c800004502000500b5000000b6000000422e590043000000440000000200f100004fc000100000000000000000000001a1a730fd000000000000000000000000000000000000f0000c000500ef0000f00000150400c800004502000500b5000000b6000000422e5e0043000000440000000200f100004fc000100000000000000000000001a1a7348f100000000000000000000000000000000000f0000c000500ef0000f00100150400c800004502000500b5000000b6000000422e510043000000440000000200f100004fc000100000000000000000000001a1a735ac380000000000000000000000000000000000f0000c000500ef0000f00000150400c800004502000500b5000000b6000000422e640043000000440000000200f100004fc000100000000000000000000001a1a735d7300000000000000000000000000000000000f0000c000500ef0000f00100150400c800004502000500b5000000b6000000422e5d0043000000440000000200f100004fc000100000000000000000000001a1a736f4580000000000000000000000000000000000f0000c000500ef0000f00000150400c800004502000500b5000000b6000000422e390043000000440000000200f100004fc000100000000000000000000001a1a73ad4880000000000000000000000000000000000f0000c000500ef0000f00100150300c800004502000500b5000000b6000000422dfe0043000000440000000200f100004fc000100000000000000000000001a1a73cff380000000000000000000000000000000000f0000c000500ef0000f00000150400c800004502000500b5000000b6000000422e390043000000440000000200f100004fc000100000000000000000000001a1a73d80200000000000000000000000000000000000f0000c000500ef0000f00100150300c800004502000500b5000000b6000000422e080043000000440000000200f100004fc000100000000000000000000001a1a73f49280000000000000000000000000000000000f0000c000500ef0000f00000150500c800004502000500b5000000b6000000422cd20043101200440059000200f100004fc000100000000000000000000001a1a747e060000000000000000000000000000000000000000c000500ef0000f00000150400c800004502000500b5000000b6000000422e6500430fde00440000000200f100004fc000100000000000000000000001a1a747e06a0000000000000000000000000000000000f0000c000500ef0000f00100150400c800004502000500b5000000b6000000422e5500430fdd00440000000200f100004fc0001000000000000000000e000013b3',
  'hex',
)
const realDataLength = realChunk.readUInt32BE(4)
const realPayload = realChunk.subarray(8, 8 + realDataLength) // = 1193 bytes, 14 records

const socket = net.createConnection({ host: HOST, port: PORT }, () => {
  console.log('verbonden met', `${HOST}:${PORT}`)
  const imei = '868618088364708'
  const body = Buffer.from(imei, 'ascii')
  const hand = Buffer.alloc(2 + body.length)
  hand.writeUInt16BE(body.length, 0)
  body.copy(hand, 2)
  socket.write(hand)
})

let step = 0
let buffer = Buffer.alloc(0)
socket.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  if (step === 0 && buffer.length >= 1) {
    console.log(buffer[0] === 1 ? 'PASS: IMEI geaccepteerd (0x01)' : `FAIL: IMEI-antwoord ${buffer[0]}`)
    buffer = buffer.subarray(1)
    step = 1
    socket.write(frame(codec8Payload))
  }
  if (step === 1 && buffer.length >= 4) {
    const ack = buffer.readUInt32BE(0)
    console.log(ack === 1 ? 'PASS: ACK codec 8 = 1 record' : `FAIL: ACK codec 8 = ${ack}`)
    buffer = buffer.subarray(4)
    step = 2
    socket.write(frame(codec8EPayload))
  }
  if (step === 2 && buffer.length >= 4) {
    const ack = buffer.readUInt32BE(0)
    console.log(ack === 1 ? 'PASS: ACK codec 8E = 1 record' : `FAIL: ACK codec 8E = ${ack}`)
    buffer = buffer.subarray(4)
    step = 3
    socket.write(frame(realPayload)) // echte FMC920-payload: 14 records
  }
  if (step === 3 && buffer.length >= 4) {
    const ack = buffer.readUInt32BE(0)
    console.log(ack === 14 ? 'PASS: ACK echte chunk = 14 records' : `FAIL: ACK echte chunk = ${ack}`)
    step = 4
    socket.end()
  }
})
socket.on('close', () => {
  console.log(step === 4 ? 'ZELFTEST GESLAAGD' : 'ZELFTEST MISLUKT (stap ' + step + ')')
  process.exit(step === 4 ? 0 : 1)
})
socket.on('error', (error) => {
  console.error('FAIL: verbinding:', error.message)
  process.exit(1)
})
