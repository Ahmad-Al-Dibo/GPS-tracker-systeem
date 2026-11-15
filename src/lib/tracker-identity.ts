// Kern van Phase 2: uniforme tracker-identiteit voor hardware én mobiel.
// Regels:
//  - Identiteit = externalId (IMEI / install-UUID), NOOIT de naam.
//  - Nieuwe trackers worden automatisch aangemaakt (unverified);
//    admin verifieert/revoked later (pairing).
//  - Apparaat-metadata wordt gevalideerd (Zod) en mag beheerdersvelden
//    (metadata / dedicated kolommen) niet overschrijven.
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "./db";
import { logger } from "./logger";

// ─── Metadata-validatie ──────────────────────────────────────────────
// Bekende velden + customFields: nieuwe velden hoeven geen migratie; alles
// wat niet gevalideerd is wordt gestript (nooit arbitrary data opslaan).

const MAX_CUSTOM_FIELDS = 50;

export const trackerMetadataSchema = z
  .object({
    device_name: z.string().trim().min(1).max(80),
    vehicle_type: z.string().trim().max(60),
    vehicle_registration: z.string().trim().max(20),
    company: z.string().trim().max(80),
    driver: z.string().trim().max(80),
    department: z.string().trim().max(80),
    customFields: z.record(
      z.string().trim().min(1).max(60),
      z.string().trim().max(200)
    ),
  })
  .partial()
  .superRefine((v, ctx) => {
    if (v.customFields && Object.keys(v.customFields).length > MAX_CUSTOM_FIELDS) {
      ctx.addIssue({
        code: "custom",
        path: ["customFields"],
        message: `Maximaal ${MAX_CUSTOM_FIELDS} custom velden`,
      });
    }
    if (JSON.stringify(v).length > 8_000) {
      ctx.addIssue({ code: "custom", message: "Metadata te groot (max 8KB)" });
    }
  });

export type TrackerMetadata = z.infer<typeof trackerMetadataSchema>;

/** Valideer device-metadata; ongeldige velden → fout (geen stilzwijgend opslaan). */
export function parseDeviceMetadata(input: unknown): TrackerMetadata {
  return trackerMetadataSchema.parse(input);
}

// ─── TrackerKey (mobiel enrolment-credential) ────────────────────────

export const TRACKER_KEY_PREFIX = "gptt_";

export function hashTrackerKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Nieuwe trackerKey: 32 random bytes → 64 hex, prefix gptt_ (1× getoond). */
export function generateTrackerKey(): { raw: string; hash: string } {
  const raw = TRACKER_KEY_PREFIX + randomBytes(32).toString("hex");
  return { raw, hash: hashTrackerKey(raw) };
}

// ─── Unieke interne naam ─────────────────────────────────────────────
// name blijft @unique (legacy-upsert op naam); externe identiteit is
// externalId. Bij name-collision: suffix met externalId-staart + korte random.

/** Zoekt een unieke interne `name` (unieke constraint) voor een nieuwe tracker. */
export async function uniqueTrackerName(base: string, externalId: string): Promise<string> {
  const clean = base.trim().slice(0, 70) || "Tracker";
  const candidates = [
    clean,
    `${clean} (${externalId.slice(-6)})`,
    `${clean} (${externalId.slice(-4)}-${randomBytes(2).toString("hex")})`,
  ];
  for (const name of candidates) {
    const existing = await prisma.ingestSource.findUnique({
      where: { name },
      select: { id: true },
    });
    if (!existing) return name;
  }
  // Theoretisch onbereikbaar; vangnet met volledig random suffix.
  return `${clean}-${randomBytes(4).toString("hex")}`;
}

// ─── Hardware: find-or-create op IMEI ────────────────────────────────

export type HardwareTrackerResult = {
  // null = records bestaan maar mogen geen data ontvangen (verwijderd/revoked)
  sourceId: string | null;
  deviceId: string | null;
  created: boolean;
  reject?: "deleted" | "revoked" | "rate-limited";
};

/**
 * Auto-registratie voor hardware: onbekende IMEI → GpsDevice (active) +
 * IngestSource (hardware, unverified) + koppeling. Bekende IMEI → bestaande
 * koppeling (of auto-link als die ontbrak).
 * `allowCreate=false` (rate-limit) voorkomt aanmaak van nieuwe IMEIs.
 */
export async function findOrCreateHardwareTracker(opts: {
  imei: string;
  label?: string | null;
  allowCreate?: boolean;
}): Promise<HardwareTrackerResult> {
  const { imei, label, allowCreate = true } = opts;

  const device = await prisma.gpsDevice.findUnique({ where: { imei } });

  if (device?.deletedAt) return { sourceId: null, deviceId: null, created: false, reject: "deleted" };
  if (device?.status === "revoked") return { sourceId: null, deviceId: null, created: false, reject: "revoked" };

  if (device) {
    // Auto-link: apparaat zonder voertuig-koppeling krijgt nu een eigen
    // tracker-record (vervangt de Phase-1 quarantine voor nieuwe data).
    if (device.vehicleId) {
      const linked = await prisma.ingestSource.findFirst({
        where: { id: device.vehicleId, deletedAt: null },
      });
      if (linked) return { sourceId: linked.id, deviceId: device.id, created: false };
      // gekoppelde bron verwijderd → blijft quarantine-geval (zie route)
      return { sourceId: null, deviceId: device.id, created: false };
    }
    const source = await createHardwareSource(imei, label ?? device.label);
    await prisma.gpsDevice.update({
      where: { id: device.id },
      data: { vehicleId: source.id, lastSeenAt: new Date() },
    });
    logger.info("hardware tracker auto-linked", { imei, deviceId: device.id, sourceId: source.id });
    return { sourceId: source.id, deviceId: device.id, created: false };
  }

  if (!allowCreate) {
    return { sourceId: null, deviceId: null, created: false, reject: "rate-limited" };
  }

  // Nieuwe IMEI → automatisch registreren (unverified tot admin-pairing).
  const source = await createHardwareSource(imei, label);
  const device2 = await prisma.gpsDevice.create({
    data: {
      deviceType: "HARDWARE",
      imei,
      label: label ?? null,
      status: "active",
      vehicleId: source.id,
      authorizedAt: new Date(),
    },
  });
  logger.warn("hardware tracker auto-registered (unverified)", {
    imei,
    sourceId: source.id,
    deviceId: device2.id,
  });
  return { sourceId: source.id, deviceId: device2.id, created: true };
}

async function createHardwareSource(imei: string, label?: string | null) {
  const name = await uniqueTrackerName(label?.trim() || `Tracker ${imei.slice(-6)}`, imei);
  return prisma.ingestSource.create({
    data: {
      name,
      displayName: label?.trim() || null,
      externalId: imei,
      sourceType: "hardware",
      trackerSource: "physical",
      verificationStatus: "unverified",
      firstSeenAt: new Date(),
      iconEmoji: "📡",
    },
  });
}

// ─── Apparaat-metadata toepassen (naamregel) ─────────────────────────

/**
 * Past device-gerapporteerde metadata toe zonder beheerdersdata te
 * overschrijven:
 *  - `metadata` (admin) en dedicated kolommen worden NOOIT aangeraakt.
 *  - displayName volgt de apparaatnaam alleen als die BEREIKT verschilt van
 *    het laatst door het apparaat gezonden device_name — een admin die de
 *    tracker hernoemt houdt de naam tot de app écht hernoemt.
 */
export function deviceMetadataUpdate(
  current: unknown,
  incoming: TrackerMetadata
): { deviceMetadata: TrackerMetadata; displayName?: string } {
  const prev = (current ?? {}) as TrackerMetadata;
  const prevName = prev.device_name ?? null;
  const nextName = incoming.device_name ?? prevName;
  const update: { deviceMetadata: TrackerMetadata; displayName?: string } = {
    deviceMetadata: incoming,
  };
  if (nextName && nextName !== prevName) {
    update.displayName = nextName;
  }
  return update;
}
