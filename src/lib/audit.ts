// Audit-log helper
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function logAudit(
  actorUserId: string | null,
  action: string,
  targetType?: string,
  targetId?: string,
  detail?: Prisma.InputJsonValue
) {
  await prisma.auditLog
    .create({
      data: {
        actorUserId: actorUserId || null,
        action,
        targetType: targetType || null,
        targetId: targetId || null,
        detail: detail ?? undefined,
      },
    })
    .catch((err) => console.error("Audit log failed:", err));
}
