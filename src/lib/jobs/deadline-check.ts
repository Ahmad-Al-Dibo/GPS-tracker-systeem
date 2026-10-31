// Deadline-check job: controleert taken op overschreden vervaldatums.
// Idempotent: meerdere uitvoeringen geven geen dubbele statuswijzigingen
// of dubbele meldingen (overdueNotifiedAt is de melding-sluiting).
import { prisma } from "@/lib/db";

export type DeadlineCheckResult = {
  markedOverdue: number;
  recovered: number;
  notified: number;
  candidates: number;
};

/**
 * Voert de deadlinecontrole uit tegen de stand van `now`.
 *
 * 1. Herstelt overdue-taken waarvan de deadline inmiddels is verplaatst
 *    naar de toekomst (of verwijderd) → weer "open".
 * 2. Markeert open/in-uitvoering-taken met overschreden deadline als "overdue"
 *    (alleen deze statussen — taken die klaar/geannuleerd zijn blijven onaangeroerd).
 * 3. Verstuurt één in-app melding per overdue taak (toewijzer, anders maker)
 *    en zet daarna `overdueNotifiedAt` → herhaalde uitvoeringen meldingen niet opnieuw.
 */
export async function runDeadlineCheck(now: Date): Promise<DeadlineCheckResult> {
  // 1. Herstel: deadline (weer) haalbaar
  const recovered = await prisma.task.updateMany({
    where: {
      status: "overdue",
      OR: [{ dueDate: null }, { dueDate: { gte: now } }],
    },
    data: { status: "open", overdueNotifiedAt: null },
  });

  // 2. Nieuw overschreden deadlines markeren
  const marked = await prisma.task.updateMany({
    where: {
      status: { in: ["open", "in_progress"] },
      dueDate: { lt: now },
    },
    data: { status: "overdue" },
  });

  // 3. Meldingen (idempotent via overdueNotifiedAt)
  const toNotify = await prisma.task.findMany({
    where: { status: "overdue", dueDate: { lt: now }, overdueNotifiedAt: null },
    select: { id: true, title: true, dueDate: true, assigneeId: true, creatorId: true },
  });

  let notified = 0;
  if (toNotify.length > 0) {
    const settings = await prisma.settings.findUnique({ where: { orgKey: "default" } });
    const notifyInApp = settings?.notifyInApp ?? true;

    if (notifyInApp) {
      const recipientIds = [
        ...new Set(toNotify.map((t) => t.assigneeId ?? t.creatorId).filter((v): v is string => !!v)),
      ];
      const activeUsers = recipientIds.length
        ? await prisma.user.findMany({
            where: { id: { in: recipientIds }, isActive: true },
            select: { id: true },
          })
        : [];
      const active = new Set(activeUsers.map((u) => u.id));

      const notifications: {
        userId: string;
        title: string;
        body: string;
        severity: "info" | "warning" | "critical";
        channel: "in_app";
      }[] = [];
      for (const t of toNotify) {
        const recipient = t.assigneeId ?? t.creatorId;
        if (!recipient || !active.has(recipient)) continue;
        notifications.push({
          userId: recipient,
          title: `Taak over tijd: ${t.title}`,
          body: t.dueDate
            ? `De vervaldatum (${t.dueDate.toISOString()}) is overschreden.`
            : "De vervaldatum is overschreden.",
          severity: "warning",
          channel: "in_app",
        });
      }

      if (notifications.length > 0) {
        await prisma.notification.createMany({ data: notifications });
        notified = notifications.length;
      }
    }

    // Afgehandeld markeren — ook zonder geldige ontvanger (inactieve
    // gebruiker) of met uitgeschakelde meldingen — zodat elke taak per
    // overdue-periode maximaal één keer wordt verwerkt (idempotent).
    await prisma.task.updateMany({
      where: { id: { in: toNotify.map((t) => t.id) } },
      data: { overdueNotifiedAt: now },
    });
  }

  return {
    markedOverdue: marked.count,
    recovered: recovered.count,
    notified,
    candidates: toNotify.length,
  };
}
