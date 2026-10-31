// Validatie-schemas
import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

export const apiKeyCreateSchema = z.object({
  label: z.string().trim().min(1).max(60).default("Default"),
});

export const updateSourceSchema = z.object({
  iconEmoji: z.string().trim().min(1).max(8).optional(),
  displayName: z.string().trim().min(1).max(60).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

export const ingestLocationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().min(0).max(100_000).nullable().optional(),
  speedMps: z.number().finite().min(0).max(200).nullable().optional(),
  sampledAt: z.union([z.string(), z.number()]).optional(),
  event_id: z.union([z.string(), z.number().int()]).optional(),
  event_id_alt: z.string().optional(),
  source: z.string().optional(),
});
