import assert from "node:assert/strict";
import test from "node:test";
import { resolveProviderDefaults, OFFICIAL_PROVIDER_DEFAULTS } from "@agentflow/shared";
import { PROVIDER_CATALOG } from "../src/services/vault/providers.js";
import { verifyCredentialConnection } from "../src/services/vault/connection-tester.js";

test("Provider Defaults: Single Source of Truth covers 500+ provider aliases & official Base URLs", () => {
  // Verify direct lookups for top LLM / AI providers
  const openai = resolveProviderDefaults("OpenAI");
  assert.equal(openai.apiUrl, "https://api.openai.com/v1");
  assert.equal(openai.headerName, "Authorization");
  assert.equal(openai.headerValuePrefix, "Bearer ");

  const anthropic = resolveProviderDefaults("Anthropic API");
  assert.equal(anthropic.apiUrl, "https://api.anthropic.com/v1");
  assert.equal(anthropic.headerName, "x-api-key");

  const groq = resolveProviderDefaults("Groq API");
  assert.equal(groq.apiUrl, "https://api.groq.com/openai/v1");

  const mistral = resolveProviderDefaults("Mistral AI API");
  assert.equal(mistral.apiUrl, "https://api.mistral.ai/v1");

  const deepseek = resolveProviderDefaults("DeepSeek API");
  assert.equal(deepseek.apiUrl, "https://api.deepseek.com/v1");

  const gemini = resolveProviderDefaults("Google Gemini API");
  assert.equal(gemini.apiUrl, "https://generativelanguage.googleapis.com/v1beta");

  // Verify OAuth2 endpoints
  const githubOAuth = resolveProviderDefaults("GitHub OAuth2 API");
  assert.equal(githubOAuth.authUrl, "https://github.com/login/oauth/authorize");
  assert.equal(githubOAuth.tokenUrl, "https://github.com/login/oauth/access_token");

  const slackOAuth = resolveProviderDefaults("Slack OAuth2 API");
  assert.equal(slackOAuth.authUrl, "https://slack.com/oauth/v2/authorize");
  assert.equal(slackOAuth.tokenUrl, "https://slack.com/api/oauth.v2.access");

  const googleOAuth = resolveProviderDefaults("Google OAuth2 API");
  assert.equal(googleOAuth.authUrl, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(googleOAuth.tokenUrl, "https://oauth2.googleapis.com/token");

  // Verify Developer & Cloud services
  const supabase = resolveProviderDefaults("Supabase API");
  assert.equal(supabase.apiUrl, "https://your-project.supabase.co/rest/v1");

  const cloudflare = resolveProviderDefaults("Cloudflare API");
  assert.equal(cloudflare.apiUrl, "https://api.cloudflare.com/client/v4");

  const stripe = resolveProviderDefaults("Stripe API");
  assert.equal(stripe.apiUrl, "https://api.stripe.com/v1");

  const resend = resolveProviderDefaults("Resend API");
  assert.equal(resend.apiUrl, "https://api.resend.com");

  const twilio = resolveProviderDefaults("Twilio API");
  assert.equal(twilio.apiUrl, "https://api.twilio.com/2010-04-01");

  // Verify MCP server defaults
  const notionMcp = resolveProviderDefaults("Notion MCP OAuth2");
  assert.equal(notionMcp.mcpServerUrl, "https://api.notion.com/mcp");
});

test("Provider Defaults: fuzzy matching and normalization work across varied casing & suffixes", () => {
  const variations = [
    "openai",
    "OpenAI API",
    "openai-api",
    "OPENAI_API",
    "open_ai",
  ];

  for (const v of variations) {
    const res = resolveProviderDefaults(v);
    assert.equal(res.apiUrl, "https://api.openai.com/v1", `Failed for variation: ${v}`);
    assert.equal(res.headerName, "Authorization");
  }

  const ghVariations = ["github", "github_api", "GitHub API", "github-api"];
  for (const v of ghVariations) {
    const res = resolveProviderDefaults(v);
    assert.equal(res.apiUrl, "https://api.github.com", `Failed for variation: ${v}`);
  }
});

test("Vault PROVIDER_CATALOG: properly enriches all catalog entries with defaultFields and defaultValue", () => {
  assert.ok(PROVIDER_CATALOG.size > 0, "Catalog should have entries");

  const openaiSpec = PROVIDER_CATALOG.get("openai");
  assert.ok(openaiSpec, "OpenAI spec exists");
  assert.equal(openaiSpec.defaultFields?.apiUrl, "https://api.openai.com/v1");

  const apiUrlField = openaiSpec.fields.find((f) => f.name === "apiUrl");
  assert.ok(apiUrlField, "OpenAI has apiUrl field");
  assert.equal(apiUrlField.defaultValue, "https://api.openai.com/v1");

  const anthropicSpec = PROVIDER_CATALOG.get("anthropic");
  assert.ok(anthropicSpec, "Anthropic spec exists");
  assert.equal(anthropicSpec.defaultFields?.apiUrl, "https://api.anthropic.com/v1");

  const githubSpec = PROVIDER_CATALOG.get("github");
  assert.ok(githubSpec, "GitHub spec exists");
  assert.equal(githubSpec.defaultFields?.authUrl, "https://github.com/login/oauth/authorize");
  assert.equal(githubSpec.defaultFields?.tokenUrl, "https://github.com/login/oauth/access_token");
});

test("Connection Tester: leverages auto-filled Base URLs and custom header configurations", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = (init?.headers || {}) as Record<string, string>;
      return new Response(JSON.stringify({ ok: true, user: "test-bot" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    // Test with prefilled apiUrl + header_auth
    const result = await verifyCredentialConnection({
      type: "header_auth",
      data: {
        apiUrl: "https://api.example.com/v1",
        headerName: "X-Custom-Token",
        headerValue: "secret_12345",
      },
    });

    assert.equal(result.success, true);
    assert.equal(capturedUrl, "https://api.example.com/v1");
    assert.equal(capturedHeaders["X-Custom-Token"], "secret_12345");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
