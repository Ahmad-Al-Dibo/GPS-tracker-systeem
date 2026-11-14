// WP9-test: retention-opruiming
//  - Oude punten weg, recente blijven
//  - Afgeronde events weg, OPEN events blijven
//  - Idempotent (2e draai verwijdert niets)
//  - Devices/voertuigen blijven bestaan
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const prisma = new PrismaClient();
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

const { runRetentionCleanup } = await import("../src/lib/jobs/retention.ts").catch(async () => {
  // tsx-pads; fallback via dynamische tsx-executable is hier niet nodig omdat
  // dit script via `npx tsx` draait.
  return import("../src/lib/jobs/retention");
});

// Testvoertuig + regel aanmaken
const S = Date.now();
const vehicle = await prisma.ingestSource.create({ data: { name: `ret-test-${S}`, displayName: "Retention Test" } });
const rule = await prisma.rule.create({ data: { name: `ret-rule-${S}` } });

// Oude + nieuwe punten
const oldDate = new Date(Date.now() - 400 * 86_400_000); // ruim ouder dan 90d
const newDate = new Date();
const oldP = await prisma.ingestPoint.create({ data: { sourceId: vehicle.id, latitude: 1, longitude: 1, sampledAt: oldDate, receivedAt: oldDate, recordHash: `ret-old-${S}` } });
const newP = await prisma.ingestPoint.create({ data: { sourceId: vehicle.id, latitude: 2, longitude: 2, sampledAt: newDate, receivedAt: newDate, recordHash: `ret-new-${S}` } });

// Afgerond + open event (oud)
const doneEvent = await prisma.event.create({
  data: { vehicleId: vehicle.id, ruleId: rule.id, ruleVersion: 1, severity: "info", status: "resolved", startTime: oldDate, createdAt: oldDate },
});
const openEvent = await prisma.event.create({
  data: { vehicleId: vehicle.id, ruleId: rule.id, ruleVersion: 1, severity: "info", status: "new", startTime: oldDate, createdAt: oldDate },
});

const result = await runRetentionCleanup();
console.log("retention-resultaat:", JSON.stringify(result));

check("oude punten verwijderd", (await prisma.ingestPoint.findUnique({ where: { id: oldP.id } })) === null);
check("recente punten blijven", (await prisma.ingestPoint.findUnique({ where: { id: newP.id } })) !== null);
check("afgerond event verwijderd", (await prisma.event.findUnique({ where: { id: doneEvent.id } })) === null);
check("OPEN event blijft altijd", (await prisma.event.findUnique({ where: { id: openEvent.id } })) !== null);
check("voertuig blijft bestaan", (await prisma.ingestSource.findUnique({ where: { id: vehicle.id } })) !== null);

const result2 = await runRetentionCleanup();
check("idempotent: 2e draai verwijdert niets", result2.deletedPoints === 0 && result2.deletedEvents === 0, JSON.stringify(result2));

// opruimen
await prisma.event.deleteMany({ where: { vehicleId: vehicle.id } });
await prisma.ingestPoint.deleteMany({ where: { sourceId: vehicle.id } });
await prisma.ingestSource.delete({ where: { id: vehicle.id } });
await prisma.rule.delete({ where: { id: rule.id } });
await prisma.$disconnect();

console.log(failures === 0 ? "\nRETENTION-TESTS GESLAAGD" : `\n${failures} RETENTION-TESTS MISLUKT`);
process.exit(failures === 0 ? 0 : 1);
