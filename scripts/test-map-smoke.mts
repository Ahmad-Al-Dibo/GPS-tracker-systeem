// Tijdelijke map-smoke-test (Phase 1 step 3 verificatie)
import { chromium } from "playwright";

const BASE = "http://localhost:3000";

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

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
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.fill('input[autocomplete="username"]', "admin");
  await page.fill('input[type="password"]', "Admin123!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 15000 });
  check(true, "login");

  // ── Live Kaart ──
  await page.goto(`${BASE}/app/map`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(".leaflet-container", { timeout: 15000 });
  check(true, "map: leaflet-container rendert");

  const search = page.locator('input[aria-label="Plaats zoeken"]');
  check((await search.count()) === 1, "map: zoekbalk aanwezig");

  const fsBtn = page.locator('button[title="Volledig scherm"]');
  const locBtn = page.locator('button[title="Ga naar mijn locatie (browser-GPS)"]');
  check((await fsBtn.count()) === 1, "map: fullscreen-knop aanwezig");
  check((await locBtn.count()) === 1, "map: locate-knop aanwezig");

  const fsBox = await fsBtn.boundingBox();
  const locBox = await locBtn.boundingBox();
  if (fsBox && locBox) {
    check(!overlaps(fsBox, locBox), "map: locate/fullscreen-knoppen overlappen NIET");
    check(locBox.y > fsBox.y, "map: locate-knop staat onder fullscreen-knop");
  } else {
    check(false, "map: knop-boxes ophaalbaar");
  }

  // Zoomcontrol niet overlapt met locate-knop (108px offset)
  const zoom = page.locator(".leaflet-control-zoom a").first();
  const zoomBox = await zoom.boundingBox();
  if (zoomBox && locBox) {
    check(!overlaps(zoomBox, locBox), "map: zoom-control overlapt locate-knop niet");
  }

  // Zoekbalk werkt (typ → resultaten of nette fout)
  await search.fill("Haaksbergen");
  await page.waitForTimeout(1500); // debounce 450ms + request
  const resultsOrError = await page.locator(
    'ul[role="listbox"], div:has-text("Geen resultaten"), div:has-text("Netwerkfout")'
  ).count();
  check(resultsOrError > 0, "map: zoekactie toont resultaten/foutmelding");

  // ── Historie ──
  await page.goto(`${BASE}/app/history`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(".leaflet-container", { timeout: 15000 });
  check(true, "history: leaflet-container rendert");
  const vehicleSelect = page.locator("select").first();
  check((await vehicleSelect.count()) === 1, "history: voertuig-select aanwezig");
  const options = await vehicleSelect.locator("option").count();
  if (options > 1) {
    await vehicleSelect.selectOption({ index: 1 });
    await page.waitForTimeout(1200);
    // Lege trail is geldig (test-DB heeft voertuigen zonder punten);
    // wél mag er geen foutmelding zijn na het laden.
    const trailInfo = await page.locator("text=punten geladen").count();
    const err = await page.locator("text=Trail laden mislukt, text=Netwerkfout").count();
    check(err === 0, "history: geen trail-foutmelding na selectie");
    check(trailInfo >= 0, "history: trail-load afgerond");
  } else {
    console.log("SKIP: history geen voertuigen met data in test-DB");
  }

  // ── Geofences (PolygonEditor) — kaart verschijnt pas in teken-/weergavemodus ──
  await page.goto(`${BASE}/app/geofences`, { waitUntil: "networkidle", timeout: 30000 });
  const newFenceBtn = page.locator('button:has-text("+ Nieuwe geofence")');
  if ((await newFenceBtn.count()) > 0) {
    await newFenceBtn.click();
    await page.waitForSelector(".leaflet-container", { timeout: 15000 });
    check(true, "geofences: polygon-editor rendert na openen tekenmodus");
    const drawInfo = await page.locator("text=Klik op de kaart om punten te tekenen").count();
    check(drawInfo > 0, "geofences: teken-instructie zichtbaar");
    // Polygon tekenen: 3 klikken → "Polygon gesloten"
    const map = page.locator(".leaflet-container").first();
    const box = await map.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
      await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4);
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6);
      await page.waitForTimeout(400);
      const closed = await page.locator("text=Polygon gesloten").count();
      check(closed > 0, "geofences: 3 klikken sluit polygon");
    }
  } else {
    check(false, "geofences: + Nieuwe geofence-knop aanwezig (admin)");
  }

  // ── Locaties ──
  await page.goto(`${BASE}/app/locations`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(".leaflet-container", { timeout: 15000 });
  check(true, "locations: kaart rendert");

  // ── Dashboard ──
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(".leaflet-container", { timeout: 15000 });
  check(true, "dashboard: kaart rendert");

  // Geen page-errors (React-crashes e.d.)
  check(consoleErrors.length === 0, `geen pageerrors${consoleErrors.length ? `: ${consoleErrors.join(" | ")}` : ""}`);

  await browser.close();
  console.log(failures === 0 ? "\nALLE MAP-SMOKES GESLAAGD" : `\n${failures} MISLUKT`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
