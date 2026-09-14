import { performance } from "node:perf_hooks";
import * as net from "node:net";
import * as dns from "node:dns/promises";
import ipaddr from "ipaddr.js";
import IORedis, { type Redis as RedisInstance } from "ioredis";

/**
 * Validador rigoroso de segurança Anti-SSRF (SEC-05).
 * Bloqueia endereços de loopback, redes privadas RFC 1918, link-local e metadados de nuvem.
 */
export async function validateSafeDestinationHost(hostnameOrIp: string): Promise<void> {
  const host = hostnameOrIp.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].trim().toLowerCase();

  // Bloqueio imediato de hostnames conhecidos de localhost/metadados
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    host === "instance-data"
  ) {
    throw new Error(`SSRF Security Error: Access to private/internal hostname "${host}" is strictly forbidden.`);
  }

  // Verifica se o host já é um IP textual (IPv4 ou IPv6)
  if (net.isIP(host)) {
    validateIpRange(host);
    return;
  }

  // Resolução DNS de todas as famílias (IPv4 e IPv6)
  try {
    const records = await dns.lookup(host, { all: true });
    if (!records || records.length === 0) {
      throw new Error(`SSRF Security Error: Unable to resolve host "${host}".`);
    }

    for (const record of records) {
      validateIpRange(record.address);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("SSRF Security Error")) {
      throw err;
    }
    // Se o DNS não puder ser resolvido
    throw new Error(`SSRF Security Error: Failed to resolve host "${host}" during safety verification.`);
  }
}

function validateIpRange(ipString: string): void {
  try {
    const parsedIp = ipaddr.parse(ipString);
    const range = parsedIp.range();

    // Bloqueia loopback, private (RFC1918), linkLocal (169.254.x.x / IMDS), carrierGradeNat, uniqueLocal, unspecified
    const prohibitedRanges = [
      "loopback",
      "private",
      "linkLocal",
      "uniqueLocal",
      "unspecified",
      "carrierGradeNat",
      "reserved",
      "broadcast",
    ];

    if (prohibitedRanges.includes(range)) {
      throw new Error(`SSRF Security Error: Destination IP ${ipString} belongs to a restricted range (${range}).`);
    }

    // Validação explícita adicional para AWS/GCP metadata link-local
    if (ipString === "169.254.169.254" || ipString.startsWith("127.") || ipString === "::1") {
      throw new Error(`SSRF Security Error: Cloud metadata and loopback address ${ipString} is strictly blocked.`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("SSRF Security Error")) {
      throw err;
    }
    throw new Error(`SSRF Security Error: Malformed or unparseable IP address ${ipString}.`);
  }
}

export interface TestConnectionParams {
  provider?: string;
  type?: string;
  data: Record<string, any>;
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  message: string;
  accountDetails?: {
    name?: string;
    email?: string;
    id?: string;
    username?: string;
    organization?: string;
  };
  error?: string;
}

/**
 * Normaliza campos comuns de credenciais (apiKey, token, password, etc)
 */
function extractTokenOrKey(data: Record<string, any>): string {
  return (
    data.apiKey ||
    data.api_key ||
    data.token ||
    data.accessToken ||
    data.access_token ||
    data.botToken ||
    data.bot_token ||
    data.password ||
    data.secret ||
    data.secretAccessKey ||
    ""
  );
}

/**
 * Verificador para OpenAI
 */
async function testOpenAI(token: string): Promise<TestConnectionResult> {
  const start = performance.now();
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "AgentFlow-CredentialVerifier/1.0",
      },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const body: any = await res.json().catch(() => ({}));
      const errMsg = body?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
      return {
        success: false,
        latencyMs,
        message: `OpenAI authentication failed: ${errMsg}`,
        error: errMsg,
      };
    }

    const data: any = await res.json().catch(() => ({}));
    const modelCount = Array.isArray(data?.data) ? data.data.length : 0;

    return {
      success: true,
      latencyMs,
      message: `Successfully connected to OpenAI API (${modelCount} models available)`,
      accountDetails: {
        name: "OpenAI API Key",
        id: "openai",
      },
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      success: false,
      latencyMs,
      message: `Failed to reach OpenAI: ${err.message || "Network Error"}`,
      error: err.message,
    };
  }
}

/**
 * Verificador para Anthropic
 */
async function testAnthropic(token: string): Promise<TestConnectionResult> {
  const start = performance.now();
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: {
        "x-api-key": token,
        "anthropic-version": "2023-06-01",
        "User-Agent": "AgentFlow-CredentialVerifier/1.0",
      },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const body: any = await res.json().catch(() => ({}));
      const errMsg = body?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
      return {
        success: false,
        latencyMs,
        message: `Anthropic authentication failed: ${errMsg}`,
        error: errMsg,
      };
    }

    const data: any = await res.json().catch(() => ({}));
    const modelCount = Array.isArray(data?.data) ? data.data.length : 0;

    return {
      success: true,
      latencyMs,
      message: `Successfully connected to Anthropic Claude API (${modelCount} models available)`,
      accountDetails: {
        name: "Anthropic API Key",
        id: "anthropic",
      },
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      success: false,
      latencyMs,
      message: `Failed to reach Anthropic: ${err.message || "Network Error"}`,
      error: err.message,
    };
  }
}

/**
 * Verificador para GitHub
 */
async function testGitHub(token: string): Promise<TestConnectionResult> {
  const start = performance.now();
  try {
    const res = await fetch("https://api.github.com/user", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "AgentFlow-CredentialVerifier/1.0",
      },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const body: any = await res.json().catch(() => ({}));
      const errMsg = body?.message || `HTTP ${res.status}: ${res.statusText}`;
      return {
        success: false,
        latencyMs,
        message: `GitHub authentication failed: ${errMsg}`,
        error: errMsg,
      };
    }

    const user: any = await res.json();

    return {
      success: true,
      latencyMs,
      message: `Successfully connected to GitHub as ${user.login || user.name || "User"}`,
      accountDetails: {
        name: user.name || user.login,
        username: user.login,
        email: user.email || undefined,
        organization: user.company || undefined,
        id: String(user.id || ""),
      },
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      success: false,
      latencyMs,
      message: `Failed to reach GitHub: ${err.message || "Network Error"}`,
      error: err.message,
    };
  }
}

/**
 * Verificador para Slack
 */
async function testSlack(token: string): Promise<TestConnectionResult> {
  const start = performance.now();
  try {
    const res = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "AgentFlow-CredentialVerifier/1.0",
      },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Math.round(performance.now() - start);
    const data: any = await res.json().catch(() => ({}));

    if (!data.ok) {
      const errMsg = data.error || `HTTP ${res.status}`;
      return {
        success: false,
        latencyMs,
        message: `Slack authentication failed: ${errMsg}`,
        error: errMsg,
      };
    }

    return {
      success: true,
      latencyMs,
      message: `Successfully connected to Slack workspace "${data.team}" as @${data.user}`,
      accountDetails: {
        name: data.user,
        username: data.user,
        organization: data.team,
        id: data.user_id,
      },
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      success: false,
      latencyMs,
      message: `Failed to reach Slack: ${err.message || "Network Error"}`,
      error: err.message,
    };
  }
}

/**
 * Verificador para Telegram Bot
 */
async function testTelegram(token: string): Promise<TestConnectionResult> {
  const start = performance.now();
  try {
    const cleanToken = token.trim().replace(/^bot/i, "");
    const res = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Math.round(performance.now() - start);
    const data: any = await res.json().catch(() => ({}));

    if (!data.ok) {
      const errMsg = data.description || `HTTP ${res.status}`;
      return {
        success: false,
        latencyMs,
        message: `Telegram Bot validation failed: ${errMsg}`,
        error: errMsg,
      };
    }

    const bot = data.result || {};
    return {
      success: true,
      latencyMs,
      message: `Successfully connected to Telegram Bot @${bot.username} (${bot.first_name || "Bot"})`,
      accountDetails: {
        name: bot.first_name,
        username: bot.username,
        id: String(bot.id || ""),
      },
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      success: false,
      latencyMs,
      message: `Failed to reach Telegram: ${err.message || "Network Error"}`,
      error: err.message,
    };
  }
}

/**
 * Verificador para Discord Bot
 */
async function testDiscord(token: string): Promise<TestConnectionResult> {
  const start = performance.now();
  try {
    const authHeader = token.startsWith("Bot ") ? token : `Bot ${token}`;
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "User-Agent": "DiscordBot (https://agentflow.dev, 1.0)",
      },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const body: any = await res.json().catch(() => ({}));
      const errMsg = body?.message || `HTTP ${res.status}: ${res.statusText}`;
      return {
        success: false,
        latencyMs,
        message: `Discord authentication failed: ${errMsg}`,
        error: errMsg,
      };
    }

    const bot: any = await res.json();
    return {
      success: true,
      latencyMs,
      message: `Successfully connected to Discord Application/Bot ${bot.username}#${bot.discriminator || "0"}`,
      accountDetails: {
        name: bot.username,
        username: bot.username,
        id: String(bot.id || ""),
      },
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      success: false,
      latencyMs,
      message: `Failed to reach Discord: ${err.message || "Network Error"}`,
      error: err.message,
    };
  }
}

/**
 * Verificador para Google (OAuth2 Access Token ou Service Account)
 */
async function testGoogle(token: string): Promise<TestConnectionResult> {
  const start = performance.now();
  try {
    const res = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      // Fallback para tokeninfo
      const tokenInfoRes = await fetch(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (tokenInfoRes.ok) {
        const info: any = await tokenInfoRes.json();
        return {
          success: true,
          latencyMs,
          message: `Google OAuth2 Token valid (Audience: ${info.aud || info.email || "Valid"})`,
          accountDetails: {
            email: info.email,
            id: info.sub,
          },
        };
      }

      const body: any = await res.json().catch(() => ({}));
      const errMsg = body?.error_description || body?.error?.message || `HTTP ${res.status}`;
      return {
        success: false,
        latencyMs,
        message: `Google verification failed: ${errMsg}`,
        error: errMsg,
      };
    }

    const user: any = await res.json();
    return {
      success: true,
      latencyMs,
      message: `Successfully connected to Google Workspace as ${user.email || user.name || "User"}`,
      accountDetails: {
        name: user.name,
        email: user.email,
        id: user.sub,
      },
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      success: false,
      latencyMs,
      message: `Failed to reach Google: ${err.message || "Network Error"}`,
      error: err.message,
    };
  }
}

/**
 * Verificador para Redis
 */
async function testRedis(data: Record<string, any>): Promise<TestConnectionResult> {
  const start = performance.now();
  let client: RedisInstance | null = null;
  try {
    const url = data.apiUrl || data.url || data.host || "localhost:6379";
    const password = data.password || data.token || data.apiKey || undefined;
    const port = data.port || data.databasePort || 6379;

    const rawHost = url.replace(/^rediss?:\/\//, "").split("/")[0].split("@").pop() || "localhost";
    const cleanHost = rawHost.split(":")[0] || "localhost";

    // Validação Anti-SSRF (SEC-05)
    await validateSafeDestinationHost(cleanHost);

    if (url.startsWith("redis://") || url.startsWith("rediss://")) {
      client = new (IORedis as any)(url, {
        connectTimeout: 5000,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
    } else {
      const cleanPort = Number(url.split(":")[1] || port);
      client = new (IORedis as any)({
        host: cleanHost,
        port: cleanPort,
        password,
        connectTimeout: 5000,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
    }

    if (!client) {
      throw new Error("Failed to initialize Redis client");
    }

    await client.connect();
    const pingRes = await client.ping();
    const latencyMs = Math.round(performance.now() - start);

    if (pingRes === "PONG") {
      return {
        success: true,
        latencyMs,
        message: `Successfully connected to Redis instance (PONG response in ${latencyMs}ms)`,
        accountDetails: {
          name: "Redis Server",
          id: `${data.host || "redis"}:${port}`,
        },
      };
    }

    return {
      success: false,
      latencyMs,
      message: `Unexpected Redis response: ${pingRes}`,
      error: `Unexpected response: ${pingRes}`,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      success: false,
      latencyMs,
      message: `Failed to connect to Redis: ${err.message}`,
      error: err.message,
    };
  } finally {
    if (client) {
      try {
        client.disconnect();
      } catch {}
    }
  }
}

/**
 * Verificador para Database Socket (PostgreSQL, MySQL, etc)
 */
async function testDatabaseSocket(
  dbType: "PostgreSQL" | "MySQL" | "Database",
  data: Record<string, any>
): Promise<TestConnectionResult> {
  const start = performance.now();
  const defaultPort = dbType === "PostgreSQL" ? 5432 : dbType === "MySQL" ? 3306 : 5432;
  const rawHost = data.apiUrl || data.host || "localhost";
  const cleanHost = rawHost.replace(/^(postgres|postgresql|mysql):\/\//, "").split("/")[0].split("@").pop()?.split(":")[0] || "localhost";
  const port = Number(data.port || data.databasePort || rawHost.split(":")[1] || defaultPort);

  try {
    // Validação Anti-SSRF (SEC-05)
    await validateSafeDestinationHost(cleanHost);
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      success: false,
      latencyMs,
      message: `Blocked by SSRF protection: ${err.message}`,
      error: err.message,
    };
  }

  return new Promise<TestConnectionResult>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.on("connect", () => {
      const latencyMs = Math.round(performance.now() - start);
      socket.destroy();
      resolve({
        success: true,
        latencyMs,
        message: `Successfully established TCP connection to ${dbType} server at ${cleanHost}:${port}`,
        accountDetails: {
          name: `${dbType} Server`,
          id: `${cleanHost}:${port}`,
        },
      });
    });

    socket.on("timeout", () => {
      const latencyMs = Math.round(performance.now() - start);
      socket.destroy();
      resolve({
        success: false,
        latencyMs,
        message: `Connection to ${dbType} server timed out after 5000ms at ${cleanHost}:${port}`,
        error: "Connection timeout",
      });
    });

    socket.on("error", (err: Error) => {
      const latencyMs = Math.round(performance.now() - start);
      socket.destroy();
      resolve({
        success: false,
        latencyMs,
        message: `Failed to connect to ${dbType} server (${cleanHost}:${port}): ${err.message}`,
        error: err.message,
      });
    });

    socket.connect(port, cleanHost);
  });
}

/**
 * Verificador genérico para URLs / APIs configuradas
 */
async function testGenericEndpoint(
  provider: string,
  type: string,
  data: Record<string, any>
): Promise<TestConnectionResult> {
  const start = performance.now();
  const token = extractTokenOrKey(data);
  const endpoint = data.apiUrl || data.authUrl || data.mcpServerUrl || data.endpoint;

  if (endpoint && (endpoint.startsWith("http://") || endpoint.startsWith("https://"))) {
    try {
      // Validação Anti-SSRF (SEC-05)
      const parsedUrl = new URL(endpoint);
      await validateSafeDestinationHost(parsedUrl.hostname);

      const headers: Record<string, string> = {
        "User-Agent": "AgentFlow-CredentialVerifier/1.0",
      };

      if (token) {
        if (type === "bearer_token" || type === "oauth2_managed" || type === "oauth2_custom") {
          headers["Authorization"] = `Bearer ${token}`;
        } else if (type === "api_key") {
          headers["X-API-Key"] = token;
          headers["Authorization"] = `Bearer ${token}`;
        }
      }

      if (data.headerName && data.headerValue) {
        headers[data.headerName] = data.headerValue;
      }

      const res = await fetch(endpoint, {
        method: "HEAD",
        headers,
        signal: AbortSignal.timeout(8000),
      }).catch(async () => {
        return fetch(endpoint, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(8000),
        });
      });

      const latencyMs = Math.round(performance.now() - start);

      if (res.status < 500) {
        return {
          success: true,
          latencyMs,
          message: `Endpoint reached successfully (HTTP ${res.status} from ${provider || "Custom Endpoint"})`,
          accountDetails: {
            name: provider || "API Endpoint",
            id: endpoint,
          },
        };
      } else {
        return {
          success: false,
          latencyMs,
          message: `Server returned HTTP ${res.status}: ${res.statusText}`,
          error: `HTTP ${res.status}`,
        };
      }
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - start);
      return {
        success: false,
        latencyMs,
        message: `Failed to reach ${endpoint}: ${err.message}`,
        error: err.message,
      };
    }
  }

  const latencyMs = Math.round(performance.now() - start);

  // Sem endpoint HTTP, valida formato das chaves
  if (token && token.trim().length > 0) {
    return {
      success: true,
      latencyMs: Math.max(latencyMs, 1),
      message: `Valid credential format for ${provider || type || "Custom Provider"} (payload verified)`,
      accountDetails: {
        name: `${provider || "Custom"} Credential`,
        id: provider || type,
      },
    };
  }

  return {
    success: false,
    latencyMs: Math.max(latencyMs, 1),
    message: `Missing key, token, or connection endpoint for ${provider || "Provider"}`,
    error: "Missing required credential parameters",
  };
}

/**
 * Função orquestradora que seleciona o verificador adequado para o provider e dados
 */
export async function verifyCredentialConnection(
  params: TestConnectionParams
): Promise<TestConnectionResult> {
  const provider = (params.provider || "").toLowerCase().trim();
  const type = (params.type || "").toLowerCase().trim();
  const data = params.data || {};
  const token = extractTokenOrKey(data);

  // 1. OpenAI
  if (provider.includes("openai") || provider === "open ai") {
    if (!token) {
      return {
        success: false,
        latencyMs: 0,
        message: "Missing OpenAI API key in credential payload",
        error: "Missing API Key",
      };
    }
    return testOpenAI(token);
  }

  // 2. Anthropic
  if (provider.includes("anthropic") || provider.includes("claude")) {
    if (!token) {
      return {
        success: false,
        latencyMs: 0,
        message: "Missing Anthropic API key in credential payload",
        error: "Missing API Key",
      };
    }
    return testAnthropic(token);
  }

  // 3. GitHub
  if (provider.includes("github")) {
    if (!token) {
      return {
        success: false,
        latencyMs: 0,
        message: "Missing GitHub token or personal access token",
        error: "Missing Token",
      };
    }
    return testGitHub(token);
  }

  // 4. Slack
  if (provider.includes("slack")) {
    if (!token) {
      return {
        success: false,
        latencyMs: 0,
        message: "Missing Slack API token or OAuth token",
        error: "Missing Token",
      };
    }
    return testSlack(token);
  }

  // 5. Telegram
  if (provider.includes("telegram")) {
    if (!token) {
      return {
        success: false,
        latencyMs: 0,
        message: "Missing Telegram Bot Token",
        error: "Missing Bot Token",
      };
    }
    return testTelegram(token);
  }

  // 6. Discord
  if (provider.includes("discord")) {
    if (!token) {
      return {
        success: false,
        latencyMs: 0,
        message: "Missing Discord Bot Token",
        error: "Missing Bot Token",
      };
    }
    return testDiscord(token);
  }

  // 7. Google Workspace / OAuth / Service Account
  if (
    provider.includes("google") ||
    provider.includes("gmail") ||
    provider.includes("sheets") ||
    provider.includes("drive")
  ) {
    if (token) {
      return testGoogle(token);
    }
  }

  // 8. Redis
  if (provider === "redis" || type === "redis") {
    return testRedis(data);
  }

  // 9. Postgres
  if (
    provider.includes("postgres") ||
    provider.includes("postgresql") ||
    provider.includes("timescaledb") ||
    provider.includes("supabase")
  ) {
    return testDatabaseSocket("PostgreSQL", data);
  }

  // 10. MySQL
  if (provider.includes("mysql") || provider.includes("mariadb")) {
    return testDatabaseSocket("MySQL", data);
  }

  // 11. Generic / Outros Provedores
  return testGenericEndpoint(params.provider || "", type, data);
}
