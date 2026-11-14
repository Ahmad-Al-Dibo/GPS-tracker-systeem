// Centrale tracking-state service — single source of truth voor statuscalculatie.
//
// Gescheiden concepten (Phase 2 §6):
//   - TCP-connectiviteit  : of het apparaat een actieve socket heeft (in de
//     TCP-service; hier alleen benaderd via laatste-communicatietijd).
//   - Laatste communicatie: receivedAt/lastSeenAt (elke data van het apparaat).
//   - Laatste GPS-record  : sampledAt/lastFixAt (laatste geldige positie).
//   - GPS-fix             : of er een positie bekend is (lat/lon aanwezig).
//   - Laatste positie     : wordt altijd bewaard, ook offline.
//   - Snelheid            : alleen "live" zolang het record vers is.
//
// Staten: ONLINE (recent actief) | OFFLINE (timeout overschreden) |
//         UNKNOWN (nog nooit data) | daarnaast REVOKED voor devices.
import { FRESH_ONLINE_S, FRESH_OFFLINE_S, DEVICE_ONLINE_S, DEVICE_OFFLINE_S } from "@/lib/config";

export type TrackingState = "online" | "stale" | "offline" | "unknown";
export type DeviceConnState = TrackingState | "revoked";

/** Algemene staat op basis van laatste activiteit. */
export function computeState(
  lastAt: Date | null | undefined,
  onlineS: number,
  offlineS: number
): TrackingState {
  if (!lastAt) return "unknown";
  const ageS = (Date.now() - lastAt.getTime()) / 1000;
  if (ageS < onlineS) return "online";
  if (ageS < offlineS) return "stale";
  return "offline";
}

/**
 * Device-verbindingstoestand (hardware-apparaten sturen periodiek batches →
 * ruime vensters). `status` is de operationele lifecycle-status van het device.
 */
export function deviceConnectionState(
  lastSeenAt: Date | null | undefined,
  status?: string | null
): DeviceConnState {
  if (status === "revoked") return "revoked";
  return computeState(lastSeenAt, DEVICE_ONLINE_S, DEVICE_OFFLINE_S);
}

/**
 * Bron-versheid (GPS-data): gebaseerd op de laatste INGEKOMEN data voor de bron.
 * `hasFix` = er is een bekende positie.
 */
export function sourceTrackingState(source: {
  latitude: number | null;
  receivedAt: Date;
  sampledAt?: Date | null;
}): TrackingState {
  if (source.latitude == null) return "unknown"; // nooit een geldige positie
  return computeState(source.receivedAt, FRESH_ONLINE_S, FRESH_OFFLINE_S);
}

/**
 * Snelheid alleen als LIVE tonen wanneer de data vers is; anders null
 * (de aanroeper toont eventueel "laatst bekend" met `lastSpeedKmh`).
 */
export function liveSpeedKmh(state: TrackingState | DeviceConnState, speedMps: number | null): number | null {
  if (state !== "online" || speedMps == null) return null;
  return Math.round(speedMps * 3.6 * 10) / 10;
}

/** Laatst bekende snelheid (altijd tonbaar, expliciet als historisch gelabeld). */
export function lastKnownSpeedKmh(speedMps: number | null): number | null {
  if (speedMps == null) return null;
  return Math.round(speedMps * 3.6 * 10) / 10;
}

/** Legacy-labels voor bestaande API-contracten (sources-status). */
export function legacyStatusLabel(state: TrackingState): "fresh" | "stale" | "no_fix" {
  if (state === "unknown") return "no_fix";
  if (state === "online") return "fresh";
  return "stale"; // stale én offline gedragen zich voor de UI als "niet vers"
}
