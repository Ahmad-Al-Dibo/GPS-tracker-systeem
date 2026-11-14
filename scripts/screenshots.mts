// Screenshots maken van de belangrijkste pagina's
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3000";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const PAGES = [
  { path: "/login", name: "01-login", auth: false },
  { path: "/app", name: "02-dashboard", auth: true },
  { path: "/app/vehicles", name: "03-voertuigen", auth: true },
  { path: "/app/persons", name: "04-personen", auth: true },
  { path: "/app/devices", name: "05-apparaten", auth: true },
  { path: "/app/map", name: "06-kaart", auth: true },
  { path: "/app/locations", name: "07-locaties", auth: true },
  { path: "/app/tasks", name: "08-taken", auth: true },
  { path: "/app/reports", name: "09-rapporten", auth: true },
  { path: "/app/settings", name: "10-instellingen", auth: true },
];

async function main() {
  const browser = await chromium.launch({ headless: true });

  // Desktop viewport
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Mobile viewport
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });

  // Login
  console.log("Inloggen...");
  await desktop.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await desktop.fill('input[name="identifier"], input[autocomplete="username"]', "admin");
  await desktop.fill('input[type="password"]', "Admin123!");
  await desktop.click('button[type="submit"]');
  await desktop.waitForURL("**/app", { timeout: 15000 });
  console.log("Ingelogd.");

  // Cookie kopiëren naar mobile
  const cookies = await desktop.context().cookies();
  await mobile.context().addCookies(cookies);

  for (const p of PAGES) {
    console.log(`Screenshot: ${p.name} (desktop)`);
    await desktop.goto(`${BASE}${p.path}`, { waitUntil: "networkidle", timeout: 30000 });
    await desktop.waitForTimeout(2000); // wachten op data-laden
    await desktop.screenshot({ path: `${OUT}/${p.name}-desktop.png`, fullPage: true });

    if (p.auth) {
      console.log(`Screenshot: ${p.name} (mobile)`);
      await mobile.goto(`${BASE}${p.path}`, { waitUntil: "networkidle", timeout: 30000 });
      await mobile.waitForTimeout(2000);
      await mobile.screenshot({ path: `${OUT}/${p.name}-mobile.png`, fullPage: true });
    }
  }

  await browser.close();
  console.log(`\nKlaar! Screenshots in ${OUT}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
