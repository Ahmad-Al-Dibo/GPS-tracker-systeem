import net from 'node:net'
import http from 'node:http'
import tls from 'node:tls'
import fsMod from 'node:fs'

/**
 * Teltonika FMC920/FMB920 — AVL-ontvangstserver + web-dashboard.
 *
 * TCP (5027): Teltonika AVL-protocol
 *   1) IMEI-handshake: 2 bytes lengte + IMEI-ASCII → server antwoordt 0x01 (accept)
 *   2) frame: preamble(4x00) | length(4) | crc(4) | payload | crc(4)   (CRC-16/CCITT-FALSE)
 *   3) payload: codecId(1) | recordCount(1) | records… | recordCount(1)
 *      - Codec 8   (0x08): vaste IO-groepen (1/2/4/8 byte)
 *      - Codec 8E  (0x8E): zelfde kop + extra NX-groep (id(1)+len(1)+value(len))
 *        → het device draait op "Codec 8 Extended" (zie Configurator → System)
 *   4) ACK = 4 bytes aantal geaccepteerde records (device: ACK Type = AVL ✓)
 *
 * HTTP (8787): dashboard + JSON API (laatste records).
 */

const TCP_PORT = Number(process.env.GPS_TCP_PORT ?? process.env.AVL_PORT ?? 5027)
const TCP_HOST = process.env.GPS_TCP_HOST ?? '0.0.0.0'
const HTTP_PORT = Number(process.env.GPS_HTTP_PORT ?? process.env.HTTP_PORT ?? 8787)
// Timeout-beleid (fases gescheiden — NIET een korte generieke idle-timeout die
// legitieme apparaten doodt die zelden sturen op een open verbinding):
//   handshake : verbinding moet binnen Xs de IMEI-handshake afronden
//   partial   : onvolledig frame + stilte = corrupte stroom -> reset
//   idle      : optioneel (0 = uit); alleen inschakelen met beleid per vloot
//   keepalive : TCP-probes detecteren dode peers zonder actieve sockets te killen
const HANDSHAKE_TIMEOUT_S = Number(process.env.GPS_TCP_HANDSHAKE_TIMEOUT ?? 30)
const PARTIAL_FRAME_TIMEOUT_S = Number(process.env.GPS_TCP_PARTIAL_FRAME_TIMEOUT ?? 60)
const IDLE_TIMEOUT_S = Number(process.env.GPS_TCP_IDLE_TIMEOUT ?? 0) // 0 = uitgeschakeld
const KEEPALIVE_MS = Number(process.env.GPS_TCP_KEEPALIVE_MS ?? 60_000)
const LOG_RAW = process.env.GPS_LOG_RAW === '1'
const TLS_CERT = process.env.GPS_TLS_CERT
const TLS_KEY = process.env.GPS_TLS_KEY

const devices = new Map()
const recent = []
const MAX_RECENT = 200

// --- Structured JSON logging (nooit geheimen loggen) -------------------------
function log(level, msg, fields = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: 'gps-tcp',
    msg,
    ...fields,
  })
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n')
  else process.stdout.write(line + '\n')
}

// --- Actieve verbindingen per IMEI -------------------------------------------
// connectionState (hier) = TCP-connectiviteit; NIET de GPS-versheid (die leeft
// in de web-app). Registry ondersteunt lifecycle-observatie en duplicaat-schop.
const connections = new Map() // imei -> { socket, remote, connectedAt, lastActivityAt }

function registerConnection(imei, socket, remote) {
  const prev = connections.get(imei)
  if (prev && prev.socket !== socket) {
    log('warn', 'duplicate connection replaced', { imei, oldRemote: prev.remote, remote })
    prev.socket.destroy() // nieuwste verbinding wint (device is herverbonden)
  }
  connections.set(imei, {
    socket,
    remote,
    connectedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  })
}

function unregisterConnection(imei, remote) {
  const cur = connections.get(imei)
  if (cur && cur.remote === remote) connections.delete(imei)
}

// CRC-16/IBM (poly 0x8005, reflected 0xA001, init 0x0000) — volgens de
// officiele Teltonika-wiki (Teltonika AVL Protocols: "CRC-16/IBM is used"),
// geverifieerd tegen echte FMC920-frames (trailer = 00 00 + CRC16 BE).
function crc16(buf) {
  let crc = 0x0000
  for (const byte of buf) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1
    }
  }
  return crc & 0xffff
}

/**
 * Parse de IO-sectie vanaf `pos` voor codec 8 (1-byte IDs, 1-byte counts)
 * of codec 8E (2-byte IDs, 2-byte counts + NX-groep). Retourneert { ios, next }.
 */
function parseIoSection(buf, pos, codec8e) {
  const idSize = codec8e ? 2 : 1
  const countSize = codec8e ? 2 : 1
  const readId = (o) => (codec8e ? buf.readUInt16BE(o) : buf[o])
  const readCount = (o) => (codec8e ? buf.readUInt16BE(o) : buf[o])
  const ios = []
  for (const vs of [1, 2, 4, 8]) {
    const n = readCount(pos)
    pos += countSize
    for (let i = 0; i < n; i++) {
      const id = readId(pos)
      let value
      if (vs === 1) value = buf[pos + idSize]
      else if (vs === 2) value = buf.readUInt16BE(pos + idSize)
      else if (vs === 4) value = buf.readUInt32BE(pos + idSize)
      else value = buf.readBigUInt64BE(pos + idSize).toString()
      ios.push({ id, value, size: vs })
      pos += idSize + vs
    }
  }
  if (codec8e) {
    const nx = readCount(pos)
    pos += countSize
    for (let i = 0; i < nx; i++) {
      const id = readId(pos)
      const len = buf.readUInt16BE(pos + idSize)
      pos += idSize + 2
      ios.push({ id, value: buf.subarray(pos, pos + len).toString('hex'), size: len })
      pos += len
    }
  }
  return { ios, next: pos }
}

/**
 * Parse een record vanaf `offset`. Kop (24 B) + IO-sectie; de recordgrens wordt
 * dynamisch bepaald door de IO-sectie (geen vaste recordgrootte nodig).
 */
function parseRecord(buf, offset, codec) {
  const codec8e = codec === 0x8e
  const ts = Number(buf.readBigUInt64BE(offset))
  const priority = buf[offset + 8]
  const lon = buf.readInt32BE(offset + 9) / 1e7
  const lat = buf.readInt32BE(offset + 13) / 1e7
  const altitude = buf.readInt16BE(offset + 17)
  const angle = buf.readUInt16BE(offset + 19)
  const satellites = buf[offset + 21]
  const speed = buf.readUInt16BE(offset + 22)
  const eventIoId = codec8e ? buf.readUInt16BE(offset + 24) : buf[offset + 24]
  const ioStart = offset + (codec8e ? 28 : 26)
  let ios = []
  let next = ioStart
  try {
    const parsed = parseIoSection(buf, ioStart, codec8e)
    ios = parsed.ios
    next = parsed.next
  } catch {
    next = Math.min(offset + 85, buf.length)
  }
  return {
    next,
    record: {
      timestamp: ts === 0 ? null : new Date(ts).toISOString(),
      priority,
      lat,
      lon,
      altitude,
      angle,
      satellites,
      speed,
      eventIoId,
      io: ios,
    },
  }
}

/** Parse een volledige payload (codec + count + records + trailer). */
function parsePayload(payload) {
  const codec = payload[0]
  const count = payload[1] ?? 0
  const records = []
  let offset = 2
  for (let i = 0; i < count && offset < payload.length - 1; i++) {
    try {
      const { record, next } = parseRecord(payload, offset, codec)
      records.push(record)
      offset = next
    } catch (err) {
      console.warn('[avl] parse-fout record', i, err.message)
      break
    }
  }
  return { codec, records }
}

/**
 * Stuur gedecodeerde records naar de web-app. Retourneert het aantal dat de
 * web-app duurzaam heeft geaccepteerd (0 bij fout = geen ACK zodat het device
 * opnieuw stuurt). Zonder WEB_INGEST_URL: lokaal modus (selftest), ACK = alles.
 */
async function forwardToWeb(imei, codec, records) {
  const url = process.env.WEB_INGEST_URL
  if (!url) return records.length
  const key = process.env.TELTONIKA_INGEST_KEY ?? ''
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Ingest-Key': key },
      body: JSON.stringify({
        imei,
        codec: '0x' + codec.toString(16).toUpperCase(),
        records: records.map((r) => ({
          timestamp: r.timestamp ?? new Date().toISOString(),
          latitude: r.lat,
          longitude: r.lon,
          speedMps: r.speed != null ? r.speed / 3.6 : null,
          altitude: r.altitude ?? null,
          heading: r.angle ?? null,
          satellites: r.satellites ?? null,
          priority: r.priority ?? null,
          io: r.io ?? null,
        })),
      }),
      signal: AbortSignal.timeout(12000),
    })
    if (res.status === 401 || res.status === 403) {
      const body = await res.text()
      console.warn('[web] geweigerd voor IMEI', imei, '-', body)
      return -1 // signaal: niet geautoriseerd
    }
    if (!res.ok) {
      console.warn('[web] HTTP', res.status, 'voor IMEI', imei)
      console.warn('[web] foutdetail:', await res.text().catch(() => '(geen body)'))
      return 0
    }
    const data = await res.json().catch(() => null)
    console.log("[web] antwoord", res.status, JSON.stringify(data).slice(0, 300))
    return typeof data?.accepted === 'number' ? data.accepted : 0
  } catch (err) {
    console.warn('[web] push mislukt:', err.message)
    return 0
  }
}

/** Verwerk een frame: parse -> push naar web -> geef aantal geaccepteerde records terug. */
async function handleFrame(imei, payload) {
  const { codec, records } = parsePayload(payload)

  for (const record of records) {
    const entry = { imei, codec: '0x' + codec.toString(16).toUpperCase(), receivedAt: new Date().toISOString(), ...record }
    recent.push(entry)
    if (recent.length > MAX_RECENT) recent.shift()
    const device = devices.get(imei) ?? { imei, firstSeen: entry.receivedAt }
    devices.set(imei, { ...device, lastSeen: entry.receivedAt, lastRecord: record, recordCount: (device.recordCount ?? 0) + 1 })
    console.log('[avl]', imei, entry.codec, record.lat + ',', record.lon, 'sats=' + record.satellites, 'speed=' + record.speed, 'ts=' + record.timestamp)
  }

  const accepted = await forwardToWeb(imei, codec, records)
  return accepted
}

function frameAcc(count) {
  const reply = Buffer.alloc(4)
  reply.writeUInt32BE(count, 0)
  return reply
}

function setupSocket(socket) {
  let imei = null
  let buffer = Buffer.alloc(0)
  const remote = `\${socket.remoteAddress}:\${socket.remotePort}`
  log('info', 'connection opened', { remote })

  // TCP keepalive: detecteert dode peers (NAT-timeouts, weggevallen modems)
  // zonder actieve verbindingen te verbreken.
  socket.setKeepAlive(true, KEEPALIVE_MS)
  socket.setNoDelay(true)

  // Handshake-timeout: zonder IMEI-handshake binnen Xs is de verbinding
  // verdacht (scanner/probe) -> sluiten.
  const handshakeTimer = setTimeout(() => {
    if (imei === null) {
      log('warn', 'handshake timeout, closing', { remote, timeoutS: HANDSHAKE_TIMEOUT_S })
      socket.destroy()
    }
  }, HANDSHAKE_TIMEOUT_S * 1000)

  // Incomplete-frame-timeout: gedeeltelijk frame + stilte = corrupte stroom.
  let partialTimer = null
  const armPartialTimer = () => {
    if (partialTimer) clearTimeout(partialTimer)
    partialTimer = null
    if (buffer.length > 0) {
      partialTimer = setTimeout(() => {
        log('warn', 'incomplete frame timeout, resetting stream', {
          imei, remote, bufferedBytes: buffer.length, timeoutS: PARTIAL_FRAME_TIMEOUT_S,
        })
        buffer = Buffer.alloc(0)
        socket.destroy() // device herverbindt vanzelf
      }, PARTIAL_FRAME_TIMEOUT_S * 1000)
    }
  }

  // Optionele idle-timeop (0 = uit). Zet dit NIET korter dan het langste
  // apparaatrapportage-interval; standaard uitgeschakeld.
  if (IDLE_TIMEOUT_S > 0) socket.setTimeout(IDLE_TIMEOUT_S * 1000)
  socket.on('timeout', () => {
    log('warn', 'idle timeout', { imei, remote, idleS: IDLE_TIMEOUT_S })
    socket.destroy()
  })

  socket.on('data', async (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    const cur = imei ? connections.get(imei) : null
    if (cur && cur.socket === socket) cur.lastActivityAt = new Date().toISOString()
    if (LOG_RAW) log('debug', 'raw data', { remote, bytes: chunk.length, hex: chunk.toString('hex') })

    if (imei === null && buffer.length >= 2) {
      const imeiLength = buffer.readUInt16BE(0)
      if (buffer.length >= 2 + imeiLength) {
        const candidate = buffer.subarray(2, 2 + imeiLength).toString('ascii')
        if (/^\d{6,20}$/.test(candidate)) {
          imei = candidate
          buffer = buffer.subarray(2 + imeiLength)
          log('info', 'imei accepted', { imei, remote })
          devices.set(imei, { imei, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), recordCount: 0 })
          clearTimeout(handshakeTimer)
          registerConnection(imei, socket, remote)
          socket.write(Buffer.from([0x01]))
        } else {
          log('warn', 'imei handshake rejected', { remote, candidate: candidate.slice(0, 32) })
          socket.write(Buffer.from([0x00]))
          socket.end()
          return
        }
      }
    }

    while (imei !== null && buffer.length >= 8) {
      const preamble = buffer.readUInt32BE(0)
      const dataLength = buffer.readUInt32BE(4)
      if (preamble !== 0) {
        log('warn', 'bad preamble, buffer reset', { imei, remote })
        buffer = Buffer.alloc(0)
        break
      }
      // Frame-indeling FMC920 (FW 04.00.00): preamble(4) | length(4) | payload | crc(4).
      // Geen leidende CRC; auto-detect voor varianten met leidende CRC (byte 8 is
      // dan niet 0x08/0x8E).
      const leadingCrc = [0x08, 0x8e].includes(buffer[8]) ? 0 : 4
      const frameLength = 8 + leadingCrc + dataLength + 4
      if (buffer.length < frameLength) break
      const payload = buffer.subarray(8 + leadingCrc, 8 + leadingCrc + dataLength)
      const crc = buffer.readUInt32BE(8 + leadingCrc + dataLength)
      const expected = crc16(payload)
      if (crc !== expected && crc !== ((expected << 16) | expected) >>> 0) {
        log('warn', 'crc mismatch, processed anyway', { imei, got: crc.toString(16), expected: expected.toString(16) })
      }
      let accepted = 0
      try {
        accepted = await handleFrame(imei, payload)
      } catch (err) {
        log('error', 'frame processing failed', { imei, error: err.message })
        accepted = 0
      }
      if (accepted < 0) {
        log('warn', 'device not authorized by web app, closing', { imei, remote })
        socket.write(frameAcc(0))
        socket.end()
        return
      }
      log('info', 'avl ack', { imei, accepted, records: payload[1] ?? 0 })
      socket.write(frameAcc(accepted))
      buffer = buffer.subarray(frameLength)
    }
    armPartialTimer()
  })

  socket.on('error', (error) => log('error', 'socket error', { imei, remote, error: error.message }))
  socket.on('close', () => {
    if (partialTimer) clearTimeout(partialTimer)
    clearTimeout(handshakeTimer)
    unregisterConnection(imei ?? '', remote)
    log('info', 'connection closed', { imei, remote })
  })
}

// TLS-optioneel: met GPS_TLS_CERT/KEY draait de listener op node:tls (zie
// DEPLOYMENT.md "Network security"). Zonder = plain TCP (alleen binnen VPN/APN).
let tcpServer
if (TLS_CERT && TLS_KEY) {
  // TLS 1.2+ (FMC920 ondersteunt TLS 1.2); RSA-compatibele cipher-suite voor
  // oudere device-implementaties. Certificaat: RSA 2048 aanbevolen (zie
  // DEPLOYMENT.md "Network security" — compatibiliteit niet fysiek getest).
  tcpServer = tls.createServer({
    cert: fsMod.readFileSync(TLS_CERT),
    key: fsMod.readFileSync(TLS_KEY),
    minVersion: 'TLSv1.2',
    ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:AES128-GCM-SHA256',
  }, setupSocket)
  log('info', 'TLS enabled for AVL listener', { cert: TLS_CERT })
} else {
  tcpServer = net.createServer(setupSocket)
}

tcpServer.listen(TCP_PORT, TCP_HOST, () => log('info', 'AVL server listening', { host: TCP_HOST, port: TCP_PORT, idleTimeoutS: IDLE_TIMEOUT_S, tls: !!(TLS_CERT && TLS_KEY) }))

// Graceful shutdown: stop met accepteren, sluit sockets af (devices herverbinden).
function shutdown(signal) {
  log('info', 'shutdown started', { signal, openConnections: connections.size })
  tcpServer.close()
  for (const [, c] of connections) c.socket.destroy()
  setTimeout(() => {
    log('info', 'shutdown complete', { signal })
    process.exit(0)
  }, 500)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.url === '/health') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      status: 'ok',
      service: 'gps-tcp',
      version: '1.1.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      openConnections: connections.size,
      knownDevices: devices.size,
      recentRecords: recent.length,
    }))
    return
  }
  if (req.url === '/api/devices') {
    res.setHeader('Content-Type', 'application/json')
    const devList = [...devices.values()].map((d) => ({
      ...d,
      connected: connections.has(d.imei),
      connection: connections.has(d.imei)
        ? { connectedAt: connections.get(d.imei).connectedAt, lastActivityAt: connections.get(d.imei).lastActivityAt, remote: connections.get(d.imei).remote }
        : null,
    }))
    res.end(JSON.stringify({ devices: devList, recent: recent.slice(-50).reverse() }))
    return
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Teltonika — live</title><style>
body{font-family:system-ui,sans-serif;background:#0e1621;color:#e8eef4;margin:0;padding:24px}
h1{font-size:20px} h2{font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:#8fa5b3;margin:22px 0 8px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #24323f}
th{color:#8fa5b3;font-weight:600}
.pill{background:#14372c;color:#3fe0a4;border-radius:999px;padding:3px 10px;font-size:11px}
.empty{color:#8fa5b3;padding:18px 0}
</style></head><body>
<h1>Teltonika AVL — live dashboard</h1>
<p class="empty">TCP:${TCP_PORT} (AVL, codec 8 + 8E) · HTTP:${HTTP_PORT}</p>
<h2>Devices</h2><table id="devices"><thead><tr><th>IMEI</th><th>Laatst gezien</th><th>Records</th><th>Positie</th></tr></thead><tbody></tbody></table>
<h2>Laatste records</h2><table id="records"><thead><tr><th>Ontvangen</th><th>IMEI</th><th>Codec</th><th>Tijd</th><th>Positie</th><th>Speed</th></tr></thead><tbody></tbody></table>
<script>
async function refresh(){
  try{
    const r = await fetch('/api/devices'); const d = await r.json();
    document.querySelector('#devices tbody').innerHTML = d.devices.map(x=>\`<tr><td><b>\${x.imei}</b></td><td>\${x.lastSeen||'-'}</td><td><span class="pill">\${x.recordCount||0}</span></td><td>\${x.lastRecord && x.lastRecord.lat!==undefined && x.lastRecord.lat!==0 ? x.lastRecord.lat.toFixed(5)+', '+x.lastRecord.lon.toFixed(5) : 'geen fix'}</td></tr>\`).join('') || '<tr><td colspan="4" class="empty">Nog geen devices verbonden</td></tr>';
    document.querySelector('#records tbody').innerHTML = d.recent.map(x=>\`<tr><td>\${x.receivedAt}</td><td>\${x.imei}</td><td>\${x.codec}</td><td>\${x.timestamp||'-'}</td><td>\${x.lat!==undefined&&x.lat!==0 ? x.lat.toFixed(5)+', '+x.lon.toFixed(5) : (x.note||'geen fix')}</td><td>\${x.speed!==undefined?x.speed+' km/h':'-'}</td></tr>\`).join('') || '<tr><td colspan="6" class="empty">Nog geen records</td></tr>';
  }catch(e){ console.error(e) }
}
refresh(); setInterval(refresh, 3000);
</script></body></html>`)
})

httpServer.listen(HTTP_PORT, () => console.log(`[http] dashboard op http://localhost:${HTTP_PORT}`))
