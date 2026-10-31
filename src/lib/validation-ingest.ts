// Validatie voor open ingest-endpoint (Android-app / GPS-trackers)
import { z } from "zod";

export const ingestLocationSchema = z.object({
  /** Naam van de API/bron — uniek per tracker */
  name: z.string().trim().min(1).max(80),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().min(0).max(100_000).nullable().optional(),
  /** Snelheid in m/s (Android: coords.speed) */
  speedMps: z.number().finite().min(0).max(200).nullable().optional(),
  /** Bron-tijd (Android: sampledAt of timestamp) */
  sampledAt: z.union([z.string(), z.number()]).optional(),
  /** Optioneel event-id voor idempotentie */
  event_id: z.union([z.string(), z.number().int()]).optional(),
  event_id_alt: z.string().optional(),
  source: z.string().optional(),
});

export const updateSourceSchema = z.object({
  iconEmoji: z.string().trim().min(1).max(8).optional(),
  displayName: z.string().trim().min(1).max(60).nullable().optional(),
});
