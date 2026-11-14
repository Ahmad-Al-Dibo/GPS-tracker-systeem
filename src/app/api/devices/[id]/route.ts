// Device-detail: PATCH (connect/disconnect/assign/update) + DELETE (soft delete)
// De "Connect-knop" in de UI stuurt action: "connect" -> device autoriseren (IMEI-allowlist).
// Multi-tenancy: non-admin mag alleen eigen apparaten (ownerUserId) beheren.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, jsonError } from "@/lib/api-helpers";
import { z } from "zod";

const patchSchema = z.object({
  action: z.enum(["connect", "disconnect", "assign", "update"]).default("update"),
  label: z.string().trim().max(80).nullable().optional(),
  brand: z.string().trim().max(60).nullable().optional(),
  model: z.string().trim().max(60).nullable().optional(),
  simCardNumber: z.string().trim().max(30).nullable().optional(),
  firmware: z.string().trim().max(40).nullable().optional(),
  protocol: z.enum(["codec8", "codec8e", "codec16"]).optional(),
  vehicleId: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Ongeldige invoer", 400);
  }
  const d = parsed.data;

  const device = await prisma.gpsDevice.findFirst({
    where: { id, deletedAt: null },
  });
  if (!device) return jsonError("Device niet gevonden", 404);
  if (auth!.user.role !== "admin" && device.ownerUserId !== auth!.user.id) {
    return jsonError("Geen toegang tot dit apparaat", 403);
  }

  switch (d.action) {
    case "connect": {
      // Autoriseer het device: IMEI mag nu verbinden en data sturen
      const updated = await prisma.gpsDevice.update({
        where: { id },
        data: {
          status: "active",
          authorizedAt: device.authorizedAt ?? new Date(),
          revokedAt: null,
        },
      });
      return NextResponse.json({
        id: updated.id,
        imei: updated.imei,
        status: updated.status,
        authorizedAt: updated.authorizedAt?.toISOString() ?? null,
      });
    }

    case "disconnect": {
      // Intrekken: device mag niet meer verbinden
      const updated = await prisma.gpsDevice.update({
        where: { id },
        data: { status: "revoked", revokedAt: new Date() },
      });
      return NextResponse.json({
        id: updated.id,
        imei: updated.imei,
        status: updated.status,
      });
    }

    case "assign": {
      // Koppel (of ontkoppel) aan een voertuig (US-06/US-12)
      if (d.vehicleId === undefined) return jsonError("vehicleId vereist voor assign", 400);
      if (d.vehicleId) {
        const vehicle = await prisma.ingestSource.findFirst({
          where: { id: d.vehicleId, deletedAt: null },
        });
        if (!vehicle) return jsonError("Voertuig niet gevonden", 404);
      }
      const updated = await prisma.gpsDevice.update({
        where: { id },
        data: {
          vehicleId: d.vehicleId ?? null,
          assignedAt: d.vehicleId ? new Date() : null,
        },
      });
      return NextResponse.json({
        id: updated.id,
        imei: updated.imei,
        vehicleId: updated.vehicleId,
      });
    }

    default: {
      // update: velden bijwerken
      const updated = await prisma.gpsDevice.update({
        where: { id },
        data: {
          ...(d.label !== undefined ? { label: d.label } : {}),
          ...(d.brand !== undefined ? { brand: d.brand } : {}),
          ...(d.model !== undefined ? { model: d.model } : {}),
          ...(d.simCardNumber !== undefined ? { simCardNumber: d.simCardNumber } : {}),
          ...(d.firmware !== undefined ? { firmware: d.firmware } : {}),
          ...(d.protocol !== undefined ? { protocol: d.protocol } : {}),
          ...(d.vehicleId !== undefined
            ? { vehicleId: d.vehicleId, assignedAt: d.vehicleId ? new Date() : null }
            : {}),
        },
      });
      return NextResponse.json({
        id: updated.id,
        imei: updated.imei,
        label: updated.label,
        status: updated.status,
        vehicleId: updated.vehicleId,
      });
    }
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, res } = await requireAuth();
  if (res) return res;

  const { id } = await params;
  const device = await prisma.gpsDevice.findFirst({
    where: { id, deletedAt: null },
  });
  if (!device) return jsonError("Device niet gevonden", 404);
  if (auth!.user.role !== "admin" && device.ownerUserId !== auth!.user.id) {
    return jsonError("Geen toegang tot dit apparaat", 403);
  }

  // Soft delete + intrekken
  await prisma.gpsDevice.update({
    where: { id },
    data: { deletedAt: new Date(), status: "revoked", revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
