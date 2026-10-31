// Type-safe statusberekining (beslissing 004)
// Volgorde: logged_out > offline > sharing > online
import { OFFLINE_AFTER_MS } from "@/lib/config";

export type WorkerStatus = "sharing" | "online" | "offline" | "logged_out";

export type SessionLike = {
  lastHeartbeatAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type ShareLike = {
  sharingEnabled: boolean;
  locationUpdatedAt: Date | null;
};

/**
 * Berekent de worker-status uitsluitend server-side.
 * - logged_out: sessie ingetrokken of verlopen
 * - offline: heartbeat ouder dan OFFLINE_AFTER_MS
 * - sharing: heartbeat recent + sharing_enabled
 * - online: heartbeat recent + sharing uit
 */
export function computeWorkerStatus(
  session: SessionLike | null,
  share: ShareLike | null,
  now = Date.now()
): WorkerStatus {
  if (!session) return "logged_out";
  if (session.revokedAt || session.expiresAt.getTime() <= now) {
    return "logged_out";
  }

  const lastBeat = session.lastHeartbeatAt?.getTime();
  const beatAge = lastBeat == null ? Infinity : now - lastBeat;
  if (beatAge > OFFLINE_AFTER_MS) return "offline";

  if (share?.sharingEnabled) return "sharing";
  return "online";
}
