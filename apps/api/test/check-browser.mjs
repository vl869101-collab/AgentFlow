import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, "../../bot");
const require = createRequire(path.join(botDir, "package.json"));

const { chromium } = require("playwright");

console.log("Playwright loaded!");
console.log("Chromium executable path:", chromium.executablePath());

const browser = await chromium.launch({ headless: true });
console.log("Browser launched! Version:", browser.version());
const page = await browser.newPage();
await page.goto("http://localhost:3000/login");
console.log("Page title:", await page.title());
await browser.close();
console.log("Browser closed successfully!");
