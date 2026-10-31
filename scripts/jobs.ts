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
import { prisma } from "@/lib/db";

const INTERVAL_MS = 60_000;

async function runOnce(label: string) {
  try {
    const summary = await runDueJobs();
    console.log(
      `[jobs] ${label}: ${summary.processed} verwerkt, ${summary.skipped} al verwerkt (overgeslagen), ${summary.failed} mislukt`
    );
    return summary;
  } catch (err) {
    console.error(`[jobs] ${label}: onverwachte fout:`, err);
    return { processed: 0, skipped: 0, failed: 1 };
  }
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
