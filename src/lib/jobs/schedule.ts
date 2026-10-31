// Planning van background jobs
// Bedrijfsregel: taken-deadlines worden 2× per dag gecontroleerd
// (ochtend- en avondronde). Via env DEADLINE_SCHEDULE="09:00,21:00" te overriden.

export const DEFAULT_DEADLINE_SCHEDULE = ["09:00", "21:00"];

/// Hoeveel dagen terug gekeken wordt bij het inhalen van gemiste controles.
export const LOOKBACK_DAYS = 7;

export type JobSlot = { key: string; at: Date };

/** Offset (ms) van `tz` ten opzichte van UTC op het gegeven instant. */
function tzOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return asUtc - instant.getTime();
}

/** Datum-sleutel (YYYY-MM-DD) van `instant` in de gegeven tijdzone. */
export function localDateKey(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Zet lokale wandklok-tijd (in `tz`) om naar een UTC-instant (2-pass voor DST). */
export function zonedToInstant(
  dateKey: string, // YYYY-MM-DD
  hhmm: string, // HH:MM
  tz: string
): Date {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, m);
  const offset1 = tzOffsetMs(new Date(naive), tz);
  const first = new Date(naive - offset1);
  const offset2 = tzOffsetMs(first, tz);
  return new Date(naive - offset2);
}

/**
 * Alle geplande slots t/m `now` die nog niet verwerkt hoeven te worden
 * (filter op JobRun gebeurt in de runner). Oudere gemiste slots worden
 * hiermee automatisch ingehaald (lookback-begrenzing).
 */
export function getDueSlots(
  jobName: string,
  now: Date,
  schedule: string[],
  timeZone: string,
  lookbackDays: number = LOOKBACK_DAYS
): JobSlot[] {
  const slots: JobSlot[] = [];
  for (let i = lookbackDays; i >= 0; i--) {
    const dayInstant = new Date(now.getTime() - i * 86_400_000);
    const dateKey = localDateKey(dayInstant, timeZone);
    for (const hhmm of schedule) {
      const at = zonedToInstant(dateKey, hhmm, timeZone);
      if (at.getTime() <= now.getTime()) {
        slots.push({ key: `${jobName}@${dateKey}T${hhmm}`, at });
      }
    }
  }
  return slots;
}
