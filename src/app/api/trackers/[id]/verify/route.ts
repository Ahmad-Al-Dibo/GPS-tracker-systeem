// Tracker verifiëren (admin-pairing): unverified → verified.
// Markeert ook de hardware-sidecar als geautoriseerd.
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

  if (source.verificationStatus === "verified") {
    return NextResponse.json({ ok: true, already: true, status: "verified" });
  }

  await prisma.ingestSource.update({
    where: { id: source.id },
    data: { verificationStatus: "verified" },
  });
  // Hardware-sidecar meenemen (bestaande pending-apparaten → active).
  await prisma.gpsDevice.updateMany({
    where: { vehicleId: source.id, deletedAt: null, status: { not: "revoked" } },
    data: { status: "active", authorizedAt: new Date() },
  });

  await logAudit(admin.auth.user.id, "tracker.verified", "tracker", source.id, {
    externalId: source.externalId,
    sourceType: source.sourceType,
  });
  return NextResponse.json({ ok: true, status: "verified" });
}
