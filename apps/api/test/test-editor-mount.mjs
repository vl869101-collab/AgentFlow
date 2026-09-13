import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, "../../bot");
const require = createRequire(path.join(botDir, "package.json"));
const { chromium } = require("playwright");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("console", (m) => console.log("[BROWSER]", m.type(), m.text().slice(0, 300)));
  page.on("pageerror", (e) => console.log("[PAGEERROR]", e.message));

  // Seed user & workflow
  const email = `e2e-test-${Date.now()}@test.local`;
  const password = "SecurePassword2026!#";
  const regRes = await fetch("http://127.0.0.1:3001/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name: "Mount Tester" }),
  });
  console.log("Register status:", regRes.status);
  const loginRes = await fetch("http://127.0.0.1:3001/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await loginRes.json();
  console.log("Login token present:", !!loginBody.token);

  const wfRes = await fetch("http://127.0.0.1:3001/api/workflows", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${loginBody.token}`,
    },
    body: JSON.stringify({ name: "Editor Mount Test Workflow" }),
  });
  const wfBody = await wfRes.json();
  console.log("Workflow created ID:", wfBody.id);

  // Set tokens in localStorage
  await page.goto("http://localhost:3030/workflows", { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token, refreshToken }) => {
    localStorage.setItem("agentflow_token", token);
    localStorage.setItem("agentflow_refresh_token", refreshToken);
  }, loginBody);

  console.log(`Navigating to /workflows/${wfBody.id}/editor...`);
  await page.goto(`http://localhost:3030/workflows/${wfBody.id}/editor`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  console.log("Waiting for editor to compile/render...");
  await page.waitForTimeout(6000);

  console.log("URL:", page.url());
  const bodyText = (await page.textContent("body"))?.slice(0, 500);
  console.log("Body text excerpt:", bodyText);

  const hasReactFlow = await page.$eval(".react-flow", (el) => !!el).catch(() => false);
  console.log("Has .react-flow canvas?", hasReactFlow);

  const buttons = await page.$$eval("button", (els) =>
    els.map((e) => e.textContent?.trim().slice(0, 60))
  );
  console.log("Buttons on page:", JSON.stringify(buttons));

  await browser.close();
}

run().catch(console.error);
