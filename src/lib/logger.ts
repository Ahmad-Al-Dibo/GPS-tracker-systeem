// Structured JSON logging voor de web-app (Phase 2 WP8).
// Vorm: {ts, level, service, msg, ...velden} — nooit geheimen loggen
// (geen wachtwoorden, API-keys, sessie-cookies).
import { randomUUID } from "node:crypto";

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function emit(level: Level, msg: string, fields: Fields = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: "gps-web",
    msg,
    ...fields,
  });
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const logger = {
  debug: (msg: string, fields?: Fields) => emit("debug", msg, fields),
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, fields?: Fields) => emit("error", msg, fields),
};

/** Haal of genereer een correlation-id per request (X-Request-Id). */
export function correlationId(req: Request): string {
  return req.headers.get("x-request-id") ?? randomUUID();
}

/** Log een API-aanroep in één regel met correlation-id. */
export function logRequest(
  req: Request,
  reqId: string,
  fields: Fields = {}
) {
  emit("info", "request", {
    reqId,
    method: req.method,
    path: new URL(req.url).pathname,
    ...fields,
  });
}

/** Log een API-fout met correlation-id (zonder gevoelige payload). */
export function logError(reqId: string, msg: string, err: unknown, fields: Fields = {}) {
  emit("error", msg, {
    reqId,
    error: err instanceof Error ? err.message : String(err),
    ...fields,
  });
}
