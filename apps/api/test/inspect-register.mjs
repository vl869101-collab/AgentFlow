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
  const res = await page.goto("http://localhost:3000/register", { timeout: 15000 });
  console.log("Status:", res?.status());
  console.log("URL:", page.url());
  console.log("Title:", await page.title());
  const inputs = await page.$$eval("input", (els) =>
    els.map((e) => ({ name: e.name, type: e.type, id: e.id, placeholder: e.placeholder }))
  );
  console.log("Inputs found:", inputs);
  const bodyText = await page.textContent("body");
  console.log("Body text excerpt:", bodyText?.slice(0, 300));
} catch (e) {
  console.error("Error:", e);
} finally {
  await browser.close();
}
