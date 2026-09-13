import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, "../../bot");
const require = createRequire(path.join(botDir, "package.json"));
const { chromium } = require("playwright");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[BROWSER ${m.type()}]`, m.text());
  });
  page.on("pageerror", (e) => console.log("[PAGEERROR]", e.message));

  const email = "e2e-test-1788738035670@test.local";
  const password = "SecurePassword2026!#";

  console.log("Navigating to /login...");
  await page.goto("http://localhost:3030/login", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="email"]', { timeout: 10000 });
  await page.waitForTimeout(1000);

  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  await page.waitForURL((u) => u.pathname.includes("/dashboard") || u.pathname.includes("/workflows"), { timeout: 10000 });
  console.log("Logged in! URL:", page.url());

  await page.goto("http://localhost:3030/workflows", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button:has-text("Create workflow")', { timeout: 10000 });
  await page.click('button:has-text("Create workflow")');
  await page.waitForURL((u) => u.pathname.includes("/editor"), { timeout: 15000 });
  console.log("Editor URL:", page.url());

  await page.waitForSelector(".react-flow", { timeout: 30000 });
  await page.waitForTimeout(1000);

  // Add Node 1: Webhook
  const emptyBtn = await page.$('button:has-text("Adicionar Trigger Webhook")');
  if (emptyBtn) await emptyBtn.click();
  else await page.click('button:has-text("Webhook")');
  await page.waitForSelector('.react-flow__node:has-text("Webhook")', { timeout: 5000 });

  // Add Node 2: HTTP Request
  await page.click('button:has-text("HTTP Request")');
  await page.waitForSelector('.react-flow__node:has-text("HTTP Request")', { timeout: 5000 });

  // Add Node 3: Condition
  await page.click('button:has-text("Condition")');
  await page.waitForSelector('.react-flow__node:has-text("Condition")', { timeout: 5000 });

  // Now click Fit View in React Flow Controls so all 3 nodes fit cleanly on canvas
  console.log("Fitting view...");
  const fitViewBtn = page.locator('.react-flow__controls-fitview');
  if (await fitViewBtn.isVisible()) {
    await fitViewBtn.click();
    await page.waitForTimeout(1000);
  }

  // Connect Webhook -> HTTP Request
  const hWebhookOut = page.locator('.react-flow__node:has-text("Webhook") .react-flow__handle[data-handlepos="right"]');
  const hHttpIn = page.locator('.react-flow__node:has-text("HTTP Request") .react-flow__handle[data-handlepos="left"]');

  const bWebhook = await hWebhookOut.boundingBox();
  const bHttpIn = await hHttpIn.boundingBox();
  console.log("Webhook out:", bWebhook, "HTTP in:", bHttpIn);

  await page.mouse.move(bWebhook.x + bWebhook.width / 2, bWebhook.y + bWebhook.height / 2);
  await page.mouse.down();
  await page.mouse.move(bHttpIn.x + bHttpIn.width / 2, bHttpIn.y + bHttpIn.height / 2, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(800);
  console.log("Edges after 1->2:", await page.$$eval(".react-flow__edge", (e) => e.length));

  // Connect HTTP Request -> Condition
  const hHttpOut = page.locator('.react-flow__node:has-text("HTTP Request") .react-flow__handle[data-handlepos="right"]');
  const hCondIn = page.locator('.react-flow__node:has-text("Condition") .react-flow__handle[data-handlepos="left"]');

  const bHttpOut = await hHttpOut.boundingBox();
  const bCondIn = await hCondIn.boundingBox();
  console.log("HTTP out:", bHttpOut, "Condition in:", bCondIn);

  await page.mouse.move(bHttpOut.x + bHttpOut.width / 2, bHttpOut.y + bHttpOut.height / 2);
  await page.mouse.down();
  await page.mouse.move(bCondIn.x + bCondIn.width / 2, bCondIn.y + bCondIn.height / 2, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(800);
  console.log("Edges after 2->3:", await page.$$eval(".react-flow__edge", (e) => e.length));

  // Now attempt cycle: Condition (source) -> HTTP Request (target)
  console.log("Attempting cycle connection Condition -> HTTP Request...");
  const hCondOut = page.locator('.react-flow__node:has-text("Condition") .react-flow__handle[data-handlepos="right"]').first();
  const hHttpInAgain = page.locator('.react-flow__node:has-text("HTTP Request") .react-flow__handle[data-handlepos="left"]');

  const bCondOut = await hCondOut.boundingBox();
  const bHttpInAgain = await hHttpInAgain.boundingBox();
  console.log("Condition out:", bCondOut, "HTTP in:", bHttpInAgain);

  await page.mouse.move(bCondOut.x + bCondOut.width / 2, bCondOut.y + bCondOut.height / 2);
  await page.mouse.down();
  await page.mouse.move(bHttpInAgain.x + bHttpInAgain.width / 2, bHttpInAgain.y + bHttpInAgain.height / 2, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(800);

  const edgeCountAfterCycle = await page.$$eval(".react-flow__edge", (e) => e.length);
  console.log("Edges after cycle attempt (MUST still be 2):", edgeCountAfterCycle);

  const cycleFeedback = await page.evaluate(() => {
    const warningEl = document.querySelector(".af-cycle-warning");
    const toastEl = document.querySelector(".fixed.bottom-5");
    return {
      warningBanner: warningEl ? warningEl.textContent : null,
      toast: toastEl ? toastEl.textContent : null,
    };
  });
  console.log("Cycle rejection feedback in DOM:", JSON.stringify(cycleFeedback));

  await browser.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
