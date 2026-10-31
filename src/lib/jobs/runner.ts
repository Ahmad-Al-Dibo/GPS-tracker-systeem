// Runner: verwerkt alle openstaande planning-slots en logt uitvoeringen
// in JobRun. Idempotent op twee lagen:
//  1. Slot-niveau: unieke `slotKey` in de DB → een slot wordt nooit twee keer uitgevoerd.
//  2. Data-niveau: de job zelf is idempotent (dubbele uitvoering = zelfde resultaat).
import { prisma } from "@/lib/db";
import { getDueSlots, DEFAULT_DEADLINE_SCHEDULE } from "@/lib/jobs/schedule";
import { runDeadlineCheck, type DeadlineCheckResult } from "@/lib/jobs/deadline-check";

export const JOB_DEADLINE_CHECK = "deadline-check";

export type RunSummary = {
  processed: number;
  skipped: number;
  failed: number;
  results: ({ slot: string } & DeadlineCheckResult)[];
  detail: { slot: string; result?: DeadlineCheckResult; error?: string }[];
};

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}

function scheduleFromEnv(): string[] | undefined {
  const raw = process.env.DEADLINE_SCHEDULE;
  if (!raw) return undefined;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{2}:\d{2}$/.test(s));
  return list.length > 0 ? list : undefined;
}

/**
 * Voert alle vervallen planning-slots uit t/m `now`.
 * Gemiste controles (daemon lag stil) worden automatisch ingehaald;
 * reeds verwerkte slots worden overgeslagen.
 */
export async function runDueJobs(opts?: {
  now?: Date;
  timeZone?: string;
  schedule?: string[];
  lookbackDays?: number;
}): Promise<RunSummary> {
  const now = opts?.now ?? new Date();
  const schedule = opts?.schedule ?? scheduleFromEnv() ?? DEFAULT_DEADLINE_SCHEDULE;

  const settings = await prisma.settings.findUnique({ where: { orgKey: "default" } });
  const timeZone = opts?.timeZone ?? settings?.timezone ?? "Europe/Amsterdam";

  const slots = getDueSlots(JOB_DEADLINE_CHECK, now, schedule, timeZone, opts?.lookbackDays);

  const summary: RunSummary = {
    processed: 0,
    skipped: 0,
    failed: 0,
    results: [] as RunSummary["results"],
    detail: [],
  };

  for (const slot of slots) {
    // Slot-niveau idempotentie (unieke constraint)
    let runId: string;
    try {
      const run = await prisma.jobRun.create({
        data: { jobName: JOB_DEADLINE_CHECK, slotKey: slot.key, status: "running" },
      });
      runId = run.id;
    } catch (err) {
      if (isUniqueViolation(err)) {
        summary.skipped++;
        continue;
      }
      throw err;
    }

    const startedAt = Date.now();
    try {
      // Evalueren tegen de echte uitvoeringstijd (niet de historische slot-tijd):
      // de controleslag gebeurt nu en moet de huidige staat markeren.
      const result = await runDeadlineCheck(now);
      await prisma.jobRun.update({
        where: { id: runId },
        data: {
          status: "success",
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          result: result as unknown as Record<string, number>,
        },
      });
      summary.processed++;
      summary.results.push({ ...result, slot: slot.key });
      summary.detail.push({ slot: slot.key, result });
      console.log(
        `[jobs] ${slot.key} → ok (overdue: ${result.markedOverdue}, hersteld: ${result.recovered}, gemeld: ${result.notified})`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.jobRun
        .update({
          where: { id: runId },
          data: {
            status: "failed",
            finishedAt: new Date(),
            durationMs: Date.now() - startedAt,
            error: message,
          },
        })
        .catch(() => undefined);
      summary.failed++;
      summary.detail.push({ slot: slot.key, error: message });
      console.error(`[jobs] ${slot.key} → MISLUKT: ${message}`);
    }
  }

  return summary;
}
