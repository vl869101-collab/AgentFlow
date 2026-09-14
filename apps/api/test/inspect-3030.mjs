import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, "../../bot");
const require = createRequire(path.join(botDir, "package.json"));
const { chromium } = require("playwright");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  for (const route of ["/register", "/login"]) {
    const res = await page.goto(`http://localhost:3030${route}`, { timeout: 15000, waitUntil: "domcontentloaded" });
    console.log(`=== ${route} status:`, res?.status());
    const inputs = await page.$$eval("input", (els) =>
      els.map((e) => ({ name: e.name, type: e.type, id: e.id, placeholder: e.placeholder }))
    );
    console.log("Inputs:", JSON.stringify(inputs, null, 2));
    const buttons = await page.$$eval("button", (els) => els.map((e) => e.textContent?.trim().slice(0, 60)));
    console.log("Buttons:", JSON.stringify(buttons));
  }
} catch (e) {
  console.error("Error:", e.message);
} finally {
  await browser.close();
}
