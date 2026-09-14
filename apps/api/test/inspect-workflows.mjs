import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, "../../bot");
const require = createRequire(path.join(botDir, "package.json"));
const { chromium } = require("playwright");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("[CONSOLE ERROR]", m.text()); });
page.on("pageerror", (e) => console.log("[PAGEERROR]", e.message));
page.on("response", (r) => { if (r.status() >= 400) console.log(`[HTTP ${r.status()}] ${r.request().method()} ${r.url()}`); });

try {
  // Login first via API to seed tokens
  const email = `e2e-inspect-${Date.now()}@test.local`;
  const password = "SecurePassword2026!#";
  const regRes = await fetch("http://127.0.0.1:3001/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name: "Inspector" }),
  });
  console.log("register status:", regRes.status);
  const loginRes = await fetch("http://127.0.0.1:3001/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await loginRes.json();
  console.log("login status:", loginRes.status, "token?", !!loginBody.token);

  await page.goto("http://localhost:3030/workflows", { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token, refreshToken }) => {
    localStorage.setItem("agentflow_token", token);
    localStorage.setItem("agentflow_refresh_token", refreshToken);
  }, { token: loginBody.token, refreshToken: loginBody.refreshToken });
  await page.goto("http://localhost:3030/workflows", { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);

  console.log("URL:", page.url());
  console.log("Body excerpt:", (await page.textContent("body"))?.slice(0, 800));
  const buttons = await page.$$eval("button", (els) => els.map((e) => e.textContent?.trim().slice(0, 80)));
  console.log("Buttons:", JSON.stringify(buttons));
  const links = await page.$$eval("a", (els) => els.map((e) => ({ text: e.textContent?.trim().slice(0, 60), href: e.getAttribute("href") })));
  console.log("Links:", JSON.stringify(links));

  // Create workflow via API directly to test editor route
  const wfRes = await fetch("http://127.0.0.1:3001/api/workflows", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${loginBody.token}`,
    },
    body: JSON.stringify({ name: "E2E Direct Workflow", description: "Direct test" }),
  });
  const wfBody = await wfRes.json();
  console.log("Direct workflow create status:", wfRes.status, "ID:", wfBody.id);

  if (wfBody.id) {
    console.log(`Navigating directly to /workflows/${wfBody.id}/editor...`);
    await page.goto(`http://localhost:3030/workflows/${wfBody.id}/editor`, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(3000);
    console.log("Editor URL:", page.url());
    console.log("Editor Body excerpt:", (await page.textContent("body"))?.slice(0, 800));
    console.log("Has react-flow or canvas?", await page.$eval('.react-flow', el => !!el).catch(() => false));
  }
} catch (e) {
  console.error("Error:", e.message);
} finally {
  await browser.close();
}
