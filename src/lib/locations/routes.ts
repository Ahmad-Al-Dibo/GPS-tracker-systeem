// Gedeelde helpers voor de Routes-API (schema + serializer)
import { z } from "zod";

export const routePointInputSchema = z.object({
  locationId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).nullable().optional(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

export const routeCreateSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  points: z.array(routePointInputSchema).max(200).default([]),
});

type PointRow = {
  id: string;
  orderIndex: number;
  locationId: string | null;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
};

export function serializeRoute<
  T extends {
    id: string;
    name: string;
    description: string | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    points?: PointRow[];
  }
>(r: T) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    deletedAt: r.deletedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    points: (r.points ?? [])
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((p) => ({
        id: p.id,
        orderIndex: p.orderIndex,
        locationId: p.locationId,
        name: p.name,
        address: p.address,
        latitude: p.latitude,
        longitude: p.longitude,
      })),
  };
}
