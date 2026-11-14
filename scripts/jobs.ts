/**
 * Planner voor background jobs.
 *
 * Gebruik:
 *   npm run jobs:once     — één controleslag en stoppen (voor cron/Task Scheduler)
 *   npm run jobs          — daemon: elke 60 seconden controleren op openstaande slots
 *
 * Bedrijfsregel: deadline-controle 2× per dag (09:00/21:00, tijdzone uit
 * Instellingen). Krachtens de slot-idempotentie is het veilig om vaker of
 * minder vaak te starten: gemiste slots worden ingehaald, dubbele niet opnieuw gedraaid.
 */
import { runDueJobs, JOB_DEADLINE_CHECK } from "@/lib/jobs/runner";
import { runRetentionCleanup } from "@/lib/jobs/retention";
import { prisma } from "@/lib/db";

const INTERVAL_MS = 60_000;

/** Retention-slot per dag; slotKey-idempotentie voorkomt dubbele uitvoering. */
async function runRetentionSlot(label: string) {
  const slotKey = `retention-cleanup@${new Date().toISOString().slice(0, 10)}`;
  try {
    await prisma.jobRun.create({
      data: { jobName: "retention-cleanup", slotKey, status: "running" },
    });
  } catch {
    return; // slot vandaag al gedraaid (unique constraint)
  }
  const startedAt = Date.now();
  try {
    const result = await runRetentionCleanup();
    await prisma.jobRun.update({
      where: { slotKey },
      data: {
        status: "success",
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        result: result as unknown as Record<string, number>,
      },
    });
    console.log(
      `[jobs] retention ${label}: ${result.deletedPoints} punten, ${result.deletedEvents} events verwijderd (${result.batches} batches)`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.jobRun
      .update({ where: { slotKey }, data: { status: "failed", finishedAt: new Date(), error: message } })
      .catch(() => undefined);
    console.error(`[jobs] retention ${label} MISLUKT: ${message}`);
  }
}

async function runOnce(label: string): Promise<{ failed: number }> {
  let failed = 0;
  try {
    const summary = await runDueJobs();
    failed += summary.failed;
    console.log(
      `[jobs] ${label}: ${summary.processed} verwerkt, ${summary.skipped} al verwerkt (overgeslagen), ${summary.failed} mislukt`
    );
  } catch (err) {
    failed += 1;
    console.error(`[jobs] ${label}: onverwachte fout:`, err);
  }
  await runRetentionSlot(label);
  return { failed };
}

async function main() {
  const once = process.argv.includes("--once");

  if (once) {
    const summary = await runOnce("once");
    await prisma.$disconnect();
    process.exit(summary.failed > 0 ? 1 : 0);
  }

  console.log(
    `[jobs] daemon gestart voor "${JOB_DEADLINE_CHECK}" — elke ${INTERVAL_MS / 1000}s controleren op openstaande slots`
  );
  await runOnce("start");

  setInterval(() => {
    void runOnce("tick");
  }, INTERVAL_MS);
}

main().catch(async (err) => {
  console.error("[jobs] daemon gefaald:", err);
  await prisma.$disconnect();
  process.exit(1);
});
