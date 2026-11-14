// Retention-opruiming (Phase 2 WP9) — ruimt oude tracking-punten en afgeronde
// events op basis van de bestaande Settings-velden (pointRetentionDays,
// eventRetentionDays).
//
// Veiligheid:
//  - Alleen IngestPoint-rijen ouder dan de cutoff (devices/voertuigen blijven).
//  - Alleen events met status resolved/dismissed (open events blijven altijd).
//  - Batch-gewijs (BATCH_SIZE per deleteMany) zodat er geen langlopende
//    transacties of locks ontstaan.
//  - Idempotent: een tweede draai verwijdert niets meer.
import { prisma } from "@/lib/db";

const BATCH_SIZE = 1000;

export type RetentionResult = {
  pointRetentionDays: number;
  eventRetentionDays: number;
  deletedPoints: number;
  deletedEvents: number;
  batches: number;
};

async function deleteBatches(
  findIds: () => Promise<{ id: string }[]>,
  doDelete: (ids: string[]) => Promise<number>
): Promise<{ deleted: number; batches: number }> {
  let deleted = 0;
  let batches = 0;
  for (;;) {
    const rows = await findIds();
    if (rows.length === 0) break;
    const count = await doDelete(rows.map((r) => r.id));
    deleted += count;
    batches++;
    if (rows.length < BATCH_SIZE) break;
    // Veiligheid: oneindige lus voorkomen als deletes niet slagen
    if (count === 0) break;
  }
  return { deleted, batches };
}

export async function runRetentionCleanup(now: Date = new Date()): Promise<RetentionResult> {
  const settings = await prisma.settings.findUnique({ where: { orgKey: "default" } });
  const pointRetentionDays = settings?.pointRetentionDays ?? 90;
  const eventRetentionDays = settings?.eventRetentionDays ?? 30;

  const pointCutoff = new Date(now.getTime() - pointRetentionDays * 86_400_000);
  const eventCutoff = new Date(now.getTime() - eventRetentionDays * 86_400_000);

  // Oude tracking-punten
  const points = await deleteBatches(
    () =>
      prisma.ingestPoint.findMany({
        where: { receivedAt: { lt: pointCutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      }),
    (ids) => prisma.ingestPoint.deleteMany({ where: { id: { in: ids } } }).then((r) => r.count)
  );

  // Afgeronde events (resolved/dismissed) — open events NOOIT verwijderen.
  // EventPoints verwijderen cascade mee (FK onDelete: Cascade).
  const events = await deleteBatches(
    () =>
      prisma.event.findMany({
        where: {
          status: { in: ["resolved", "dismissed"] },
          createdAt: { lt: eventCutoff },
        },
        select: { id: true },
        take: BATCH_SIZE,
      }),
    (ids) => prisma.event.deleteMany({ where: { id: { in: ids } } }).then((r) => r.count)
  );

  return {
    pointRetentionDays,
    eventRetentionDays,
    deletedPoints: points.deleted,
    deletedEvents: events.deleted,
    batches: points.batches + events.batches,
  };
}
