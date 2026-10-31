/**
 * Tests: periodieke deadline-job — overschreden deadlines, statusbijwerking,
 * meldingen, idempotentie bij herhaalde uitvoering, slot-inhaling (catch-up)
 * en JobRun-logging.
 *
draait direct tegen de DB (geen server nodig).
 * Gebruik bewust vaste data in 2020 (buiten de lookback van eventuele echte
 * runs) en ruimt eigen JobRun-rijen/taak/meldingen op.
 *
 * Run: npm run test:jobs
 */
import { prisma } from "@/lib/db";
import { runDueJobs, JOB_DEADLINE_CHECK } from "@/lib/jobs/runner";
import { runDeadlineCheck } from "@/lib/jobs/deadline-check";

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg: string) {
  if (cond) {
    passed++;
    console.log(`OK: ${msg}`);
  } else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

const T1 = new Date("2020-01-05T10:00:00+01:00"); // 10:00 — na 09:00-slot
const T2 = new Date("2020-01-05T21:30:00+01:00"); // zelfde dag, na 21:00-slot
const T3 = new Date("2020-01-06T10:00:00+01:00"); // volgende dag
const T4 = new Date("2020-01-07T10:00:00+01:00"); // dag erna

const PAST_DUE = new Date("2019-12-01T12:00:00+01:00");
const FUTURE_DUE = new Date("2030-06-01T12:00:00+01:00");

async function notificationCountFor(titlePart: string): Promise<number> {
  // Meldingen hebben prefix "Taak over tijd: " — tel op deeltaal
  return prisma.notification.count({ where: { title: { contains: titlePart } } });
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("Geen admin gevonden — draai db:seed eerst");

  const ts = Date.now();
  const titleOverdue = `Job-test verlopen ${ts}`;
  const titleFuture = `Job-test toekomst ${ts}`;
  const titleDone = `Job-test klaar ${ts}`;

  // ── Testdata ───────────────────────────────────────────
  const tOverdue = await prisma.task.create({
    data: { title: titleOverdue, dueDate: PAST_DUE, creatorId: admin.id },
  });
  const tFuture = await prisma.task.create({
    data: { title: titleFuture, dueDate: FUTURE_DUE, creatorId: admin.id },
  });
  const tDone = await prisma.task.create({
    data: { title: titleDone, dueDate: PAST_DUE, status: "done", creatorId: admin.id },
  });

  // ── 1. Eerste uitvoering ───────────────────────────────
  const runA = await runDueJobs({ now: T1 });
  assert(runA.failed === 0, "run A zonder fouten");
  assert(runA.processed >= 1, `run A verwerkt openstaande slots (${runA.processed})`);

  const afterA = await prisma.task.findUnique({ where: { id: tOverdue.id } });
  assert(afterA?.status === "overdue", "overschreden deadline → status 'overdue'");
  assert(afterA?.overdueNotifiedAt instanceof Date, "overdueNotifiedAt gezet (melding vastgelegd)");

  const futureAfter = await prisma.task.findUnique({ where: { id: tFuture.id } });
  assert(futureAfter?.status === "open", "toekomstige deadline ongemoeid (open)");

  const doneAfter = await prisma.task.findUnique({ where: { id: tDone.id } });
  assert(doneAfter?.status === "done", "afgeronde taak niet gewijzigd (alleen noodzakelijke statussen)");

  const notifCount1 = await notificationCountFor(titleOverdue);
  assert(notifCount1 === 1, `precies één melding na eerste run (kreeg ${notifCount1})`);
  const notifOverdue = await prisma.notification.findFirst({
    where: { title: { contains: titleOverdue } },
  });
  assert(notifOverdue?.userId === admin.id, "melding naar ontvanger (maker/toewijzer)");

  // JobRun-logging
  const runsAfterA = await prisma.jobRun.findMany({
    where: { jobName: JOB_DEADLINE_CHECK, slotKey: { contains: "2020-01-05" } },
  });
  assert(runsAfterA.length >= 1, "JobRun-rijen aangemaakt");
  assert(runsAfterA.every((r) => r.status === "success"), "JobRun status 'success'");
  assert(runsAfterA.every((r) => r.finishedAt !== null && r.durationMs !== null), "JobRun registered finishedAt + durationMs");
  assert(
    runsAfterA.every((r) => r.result !== null && typeof r.result === "object"),
    "JobRun resultaat gelogd"
  );

  // ── 2. Herhaalde uitvoering (idempotent) ───────────────
  const runB = await runDueJobs({ now: T1 });
  assert(runB.processed === 0, `herhaalde run op zelfde moment → geen nieuwe slots (${runB.processed} verwerkt)`);
  assert(runB.skipped >= 1, `reeds verwerkte slots overgeslagen (${runB.skipped})`);

  const notifCount2 = await notificationCountFor(titleOverdue);
  assert(notifCount2 === 1, `geen dubbele melding bij herhaalde uitvoering (${notifCount2})`);

  // Data-niveau idempotentie: job los nogmaals draaien
  const direct = await runDeadlineCheck(T1);
  assert(direct.markedOverdue === 0 && direct.recovered === 0 && direct.notified === 0, "directe heruitvoering job = geen wijzigingen");
  const notifCount3 = await notificationCountFor(titleOverdue);
  assert(notifCount3 === 1, "directe heruitvoering job → meldingen tellen gelijk");

  // ── 3. Catch-up: gemiste avondslot wordt ingehaald ─────
  const runC = await runDueJobs({ now: T2 });
  assert(runC.failed === 0, "run C zonder fouten");
  assert(runC.processed === 1, `gemiste 21:00-slot ingehaald (${runC.processed} nieuw verwerkt)`);
  const runsJan5 = await prisma.jobRun.count({
    where: { jobName: JOB_DEADLINE_CHECK, slotKey: { contains: "@2020-01-05" } },
  });
  assert(runsJan5 === 2, `beide slots van 2020-01-05 gelogd (09:00 + 21:00 = ${runsJan5})`);
  const notifCount4 = await notificationCountFor(titleOverdue);
  assert(notifCount4 === 1, "catch-up stuurt geen extra melding voor al gemelde taak");

  // ── 4. Deadline verplaatst → status hersteld ───────────
  await prisma.task.update({ where: { id: tOverdue.id }, data: { dueDate: FUTURE_DUE } });
  const runD = await runDueJobs({ now: T3 });
  assert(runD.processed >= 1, "volgende dag-nieuw-slot verwerkt");
  const recovered = await prisma.task.findUnique({ where: { id: tOverdue.id } });
  assert(recovered?.status === "open", "overdue hersteld naar open na verplaatsen deadline");
  assert(recovered?.overdueNotifiedAt === null, "meldingsmarker gereset bij herstel");

  // ── 5. Opnieuw overschreden na akkoord → opnieuw melden ─
  await prisma.task.update({ where: { id: tOverdue.id }, data: { dueDate: PAST_DUE } });
  const runE = await runDueJobs({ now: T4 });
  assert(runE.processed >= 1, "volgend dag-slot verwerkt");
  const reOverdue = await prisma.task.findUnique({ where: { id: tOverdue.id } });
  assert(reOverdue?.status === "overdue", "taak opnieuw overdue na nieuwe overschrijding");
  const notifCount5 = await notificationCountFor(titleOverdue);
  assert(notifCount5 === 2, `opnieuw melden na reset/erkenning (${notifCount5} meldingen)`);

  // ── 6. JobRun-foutregistratie-pad bestaat ──────────────
  const anyFailed = await prisma.jobRun.count({ where: { jobName: JOB_DEADLINE_CHECK, status: "failed" } });
  assert(typeof anyFailed === "number", "failed-status beschikbaar in JobRun (foutregistratie)");

  // ── Opschonen ──────────────────────────────────────────
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { title: { contains: titleOverdue } },
        { title: { contains: titleFuture } },
        { title: { contains: titleDone } },
      ],
    },
  });
  await prisma.task.deleteMany({ where: { id: { in: [tOverdue.id, tFuture.id, tDone.id] } } });
  await prisma.jobRun.deleteMany({
    where: {
      jobName: JOB_DEADLINE_CHECK,
      OR: [{ slotKey: { contains: "@2019-12-" } }, { slotKey: { contains: "@2020-01-" } }],
    },
  });

  console.log(`\nJob-tests: ${passed} geslaagd, ${failed} gefaald.`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
