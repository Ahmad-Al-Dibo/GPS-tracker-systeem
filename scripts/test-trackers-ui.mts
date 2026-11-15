// Trackers-UI smoke (Phase 2 S4): lijst, zoeken, detail, metadata-formulier,
// installatiepaneel. Server moet draaien; Playwright browser nodig.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
let failures = 0;
function check(cond: boolean, msg: string) {
  if (cond) console.log(`OK: ${msg}`);
  else {
    failures++;
    console.error(`FAIL: ${msg}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.fill('input[autocomplete="username"]', "admin");
  await page.fill('input[type="password"]', "Admin123!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 15000 });
  check(true, "login");

  // Trackers-pagina (nav-URL /app/devices)
  await page.goto(`${BASE}/app/devices`, { waitUntil: "networkidle", timeout: 30000 });
  check((await page.locator("h1:has-text('Trackers')").count()) === 1, "pagina toont 'Trackers'-titel");
  check((await page.locator('input[aria-label="Tracker zoeken"]').count()) === 1, "zoekveld aanwezig");

  // Er is ten minste één tracker in de test-DB (E2E-voertuig/-trackers)
  const cards = page.locator("button.group");
  const cardCount = await cards.count();
  check(cardCount > 0, `lijst toont trackers (${cardCount})`);

  // Zoeken filtert
  await page.fill('input[aria-label="Tracker zoeken"]', "bestaat-niet-999");
  await page.waitForTimeout(700); // debounce 300 + request
  const empty = await page.locator("text=Geen trackers gevonden").count();
  check(empty > 0, "zoeken met onbekende term toont leeg-stand");
  await page.fill('input[aria-label="Tracker zoeken"]', "");
  await page.waitForTimeout(700);

  // Detail openen
  if (cardCount > 0) {
    await cards.first().click();
    await page.waitForSelector("h2", { timeout: 10000 });
    check((await page.locator("text=GPS-history").count()) > 0, "detail toont GPS-history-sectie");
    check((await page.locator("text=Metadata (beheerder)").count()) > 0, "detail toont metadata-formulier");
    check((await page.locator("text=Sluiten").count()) > 0, "detail heeft sluitknop");
    // Sluiten
    await page.locator("button:has-text('✕ Sluiten')").click();
    await page.waitForTimeout(300);
  }

  // Installatiepaneel
  await page.locator("button:has-text('App installeren')").click();
  await page.waitForTimeout(300);
  check((await page.locator("text=Mobiele tracker-app installeren").count()) > 0, "installatiepaneel opent");
  check(
    (await page.locator("text=Download-URL nog niet ingesteld").count()) > 0 ||
      (await page.locator("a:has-text('APK downloaden')").count()) > 0,
    "download-URL gedraagt zich eerlijk (geconfigureerd óf duidelijke hint)"
  );

  // Handleiding
  await page.locator("button:has-text('Installatiehandleiding')").click();
  await page.waitForTimeout(300);
  check((await page.locator("text=Stap 1 — Verzamel").count()) > 0, "hardware-handleiding opent");
  check((await page.locator("text=automatisch hier verschijnt").count()) > 0, "handleiding beschrijft auto-registratie");

  // Mobiele viewport (mobile-first check): kaart/lijst bereikbaar
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  check((await cards.count()) > 0, "lijst rendert ook op mobiele viewport");
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4);
  check(!hScroll, "geen horizontale overflow op mobiel");

  check(
    pageErrors.length === 0,
    pageErrors.length === 0 ? "geen pageerrors" : `pageerrors: ${pageErrors.join(" | ")}`
  );

  await browser.close();
  console.log(failures === 0 ? "\nTRACKERS-UI SMOKE GESLAAGD" : `\n${failures} MISLUKT`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
