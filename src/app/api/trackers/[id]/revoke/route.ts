// Tracker intrekken (admin): verificationStatus=revoked → data wordt geweigerd
// (hardware: device.status=revoked; mobiel: trackerKey-pad checkt revoked).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, requireTrackerAccess } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const admin = await requireAdmin();
  if (admin.res) return admin.res;
  const { id } = await params;
  const { source, res } = await requireTrackerAccess(id);
  if (res) return res;

  if (source.verificationStatus === "revoked") {
    return NextResponse.json({ ok: true, already: true, status: "revoked" });
  }

  await prisma.ingestSource.update({
    where: { id: source.id },
    data: { verificationStatus: "revoked" },
  });
  await prisma.gpsDevice.updateMany({
    where: { vehicleId: source.id, deletedAt: null },
    data: { status: "revoked", revokedAt: new Date() },
  });

  await logAudit(admin.auth.user.id, "tracker.revoked", "tracker", source.id, {
    externalId: source.externalId,
    sourceType: source.sourceType,
  });
  return NextResponse.json({ ok: true, status: "revoked" });
}
