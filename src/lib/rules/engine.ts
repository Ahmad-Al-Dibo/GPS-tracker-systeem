// Rule-engine: evalueert regels op basis van beschikbare GPS-data
// Ondersteunt: snelheid, coördinaten, tijdstip, laatst-gezien, geofence
import { prisma } from "@/lib/db";
import type {
  Rule,
  RuleCondition,
  IngestSource,
  Geofence,
} from "@prisma/client";

export type RuleWithConditions = Rule & {
  conditions: RuleCondition[];
  geofence: Geofence | null;
};

export type TelemetrySnapshot = {
  sourceId: string;
  latitude: number | null;
  longitude: number | null;
  speedMps: number | null;
  speedKmh: number | null;
  sampledAt: Date | null;
  receivedAt: Date;
  /** Leeftijd van laatste waarneming in seconden */
  ageSeconds: number;
};

export type RuleEvaluation = {
  rule: RuleWithConditions;
  violated: boolean;
  measuredValue?: number;
  threshold?: number;
  latitude?: number;
  longitude?: number;
};

/** Bouwt een TelemetrySnapshot uit een IngestSource. */
export function toSnapshot(source: IngestSource, now = Date.now()): TelemetrySnapshot {
  const ageSeconds = source.sampledAt
    ? Math.floor((now - source.sampledAt.getTime()) / 1000)
    : Math.floor((now - source.receivedAt.getTime()) / 1000);
  return {
    sourceId: source.id,
    latitude: source.latitude,
    longitude: source.longitude,
    speedMps: source.speedMps,
    speedKmh: source.speedMps != null ? source.speedMps * 3.6 : null,
    sampledAt: source.sampledAt,
    receivedAt: source.receivedAt,
    ageSeconds,
  };
}

/** Laadt alle actieve regels met condities + geofence. */
export async function loadActiveRules(): Promise<RuleWithConditions[]> {
  return prisma.rule.findMany({
    where: { enabled: true },
    include: { conditions: true, geofence: true },
  });
}

/** Controleert of een tijdstip binnen de planning van een regel valt. */
export function matchesSchedule(rule: Rule, date: Date, timezone: string): boolean {
  // Weekdag controleren
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const weekdayStr = formatter.format(date); // "Mon", "Tue", ...
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = weekdayMap[weekdayStr] ?? 0;
  if (!rule.weekdays.includes(dayOfWeek)) return false;

  // Tijdvenster controleren
  if (!rule.timeFrom || !rule.timeTo) return true;

  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const currentTime = timeFormatter.format(date); // "HH:mm"
  const from = rule.timeFrom;
  const to = rule.timeTo;

  // Overnight venster (bijv. 22:00–06:00)
  if (from > to) {
    return currentTime >= from || currentTime < to;
  }
  return currentTime >= from && currentTime < to;
}

/** Controleert of een punt binnen een geofence-polygon valt (ray casting). */
export function pointInPolygon(
  lat: number,
  lon: number,
  polygon: [number, number][]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Evalueert één conditie tegen een snapshot. */
function evaluateCondition(
  cond: RuleCondition,
  snap: TelemetrySnapshot,
  rule: Rule,
  now: Date
): { met: boolean; measured?: number; threshold?: number } {
  switch (cond.field) {
    case "speed_kmh": {
      if (snap.speedKmh == null) return { met: false };
      const v = snap.speedKmh;
      const t = cond.value1 ?? rule.thresholdValue ?? 0;
      switch (cond.operator) {
        case "gt": return { met: v > t, measured: v, threshold: t };
        case "gte": return { met: v >= t, measured: v, threshold: t };
        case "lt": return { met: v < t, measured: v, threshold: t };
        case "lte": return { met: v <= t, measured: v, threshold: t };
        case "between":
          return {
            met: v >= (cond.value1 ?? 0) && v <= (cond.value2 ?? Infinity),
            measured: v,
            threshold: cond.value2 ?? undefined,
          };
        default: return { met: false };
      }
    }

    case "last_seen_age_s": {
      const v = snap.ageSeconds;
      const t = cond.value1 ?? 120;
      switch (cond.operator) {
        case "gt": return { met: v > t, measured: v, threshold: t };
        case "gte": return { met: v >= t, measured: v, threshold: t };
        case "lt": return { met: v < t, measured: v, threshold: t };
        case "lte": return { met: v <= t, measured: v, threshold: t };
        default: return { met: false };
      }
    }

    case "hour_of_day": {
      if (!cond.value1) return { met: false };
      const fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: rule.timezone,
        hour: "2-digit",
        hour12: false,
      });
      const hour = parseInt(fmt.format(now), 10);
      const from = cond.value1;
      const to = cond.value2 ?? cond.value1;
      if (from > to) return { met: hour >= from || hour < to };
      return { met: hour >= from && hour < to };
    }

    case "day_of_week": {
      if (!cond.value1) return { met: false };
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: rule.timezone,
        weekday: "short",
      });
      const map: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
      };
      const dow = map[fmt.format(now)] ?? 0;
      const allowed = [cond.value1, cond.value2].filter(
        (v): v is number => v != null
      );
      return { met: allowed.includes(dow) };
    }

    case "latitude":
    case "longitude": {
      const v =
        cond.field === "latitude" ? snap.latitude : snap.longitude;
      if (v == null || cond.value1 == null) return { met: false };
      const t = cond.value1;
      switch (cond.operator) {
        case "gt": return { met: v > t, measured: v, threshold: t };
        case "lt": return { met: v < t, measured: v, threshold: t };
        case "between":
          return {
            met: v >= (cond.value1 ?? -90) && v <= (cond.value2 ?? 90),
            measured: v,
            threshold: cond.value2 ?? undefined,
          };
        default: return { met: false };
      }
    }

    default:
      return { met: false };
  }
}

/**
 * Evalueert alle actieve regels tegen een snapshot.
 * Alleen regels die relevant zijn voor dit voertuig.
 */
export async function evaluateRules(
  source: IngestSource,
  rules?: RuleWithConditions[],
  now = Date.now()
): Promise<RuleEvaluation[]> {
  const activeRules = rules ?? (await loadActiveRules());
  const snap = toSnapshot(source, now);
  const currentDate = new Date(now);
  const results: RuleEvaluation[] = [];

  for (const rule of activeRules) {
    // Voertuig-filter
    if (rule.vehicleIds.length > 0 && !rule.vehicleIds.includes(source.id)) {
      continue;
    }
    if (
      rule.vehicleGroup &&
      source.vehicleGroup &&
      rule.vehicleGroup !== source.vehicleGroup
    ) {
      continue;
    }
    if (
      rule.vehicleGroup &&
      !source.vehicleGroup &&
      rule.vehicleIds.length === 0
    ) {
      // Regel is beperkt tot een groep, maar voertuig hoort bij geen groep
      continue;
    }

    // Planning
    if (!matchesSchedule(rule, currentDate, rule.timezone)) {
      continue;
    }

    // Condities evalueren
    let violated = false;
    let measuredValue: number | undefined;
    let threshold: number | undefined;

    if (rule.conditions.length === 0) {
      // Enkel drempel via rule.thresholdValue (snelheid)
      if (rule.thresholdValue != null && snap.speedKmh != null) {
        violated = snap.speedKmh > rule.thresholdValue;
        measuredValue = snap.speedKmh;
        threshold = rule.thresholdValue;
      }
    } else if (rule.logic === "and_all") {
      violated = rule.conditions.every((c) => {
        const r = evaluateCondition(c, snap, rule, currentDate);
        if (r.measured != null) measuredValue = r.measured;
        if (r.threshold != null) threshold = r.threshold;
        return r.met;
      });
    } else if (rule.logic === "or_any") {
      violated = rule.conditions.some((c) => {
        const r = evaluateCondition(c, snap, rule, currentDate);
        if (r.measured != null) measuredValue = r.measured;
        if (r.threshold != null) threshold = r.threshold;
        return r.met;
      });
    } else {
      // single
      const c = rule.conditions[0];
      if (c) {
        const r = evaluateCondition(c, snap, rule, currentDate);
        violated = r.met;
        measuredValue = r.measured;
        threshold = r.threshold;
      }
    }

    // Geofence-conditie
    if (!violated && rule.geofence && snap.latitude != null && snap.longitude != null) {
      try {
        const coords = JSON.parse(rule.geofence.coordinates) as [number, number][];
        const inside = pointInPolygon(snap.latitude, snap.longitude, coords);
        if (rule.conditions.length === 0) {
          // Geofence als enige voorwaarde
          if (rule.thresholdValue == null) {
            violated = inside; // "binnen" = overtreding voor restricted-area
          }
        }
      } catch {
        // Ongeldige polygon — negeren
      }
    }

    // "outside_hours" operator
    if (
      !violated &&
      rule.conditions.some((c) => c.operator === "outside_hours")
    ) {
      const inSchedule = matchesSchedule(rule, currentDate, rule.timezone);
      if (!inSchedule && snap.speedKmh != null && snap.speedKmh > 1) {
        // Voertuig beweegt buiten toegestane uren
        violated = true;
        measuredValue = snap.speedKmh;
      }
    }

    if (violated) {
      results.push({
        rule,
        violated: true,
        measuredValue,
        threshold,
        latitude: snap.latitude ?? undefined,
        longitude: snap.longitude ?? undefined,
      });
    }
  }

  return results;
}
