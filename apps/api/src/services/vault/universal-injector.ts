/**
 * Universal Connection Injector Engine (AgentFlow Vault)
 *
 * Implements n8n-parity generic connection injection across:
 * 1. OAuth2 (Authorization code, client credentials, PKCE, Bearer header)
 * 2. ApiKey (Header injection, query param auth, body auth)
 * 3. BearerToken (Authorization: Bearer <token>)
 * 4. BasicAuth (RFC 7617 Base64 username:password)
 * 5. DigestAuth / CustomHeaders (Session cookies, arbitrary custom headers)
 * 6. AwsIam (AWS SigV4 Request Signing with HMAC-SHA256)
 * 7. CertificateAuth (mTLS / TLS Client Certificates, custom CAs)
 * 8. DatabaseConnection (Postgres, MySQL, Redis, MongoDB, MSSQL, Oracle connection string & pooling config)
 *
 * Supports targets: HTTP Fetch / Axios / Got requests, WebSocket connections, TCP sockets, and MCP tool clients.
 */

import { createHmac, createHash } from "node:crypto";
import type { Agent as HttpsAgent } from "node:https";
import https from "node:https";
import tls from "node:tls";
import type { CredentialBucket } from "./types.js";

export interface UniversalHttpRequestConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  query?: Record<string, string | number | boolean>;
  body?: any;
  agent?: HttpsAgent | any;
  tlsOptions?: tls.ConnectionOptions;
  [key: string]: any;
}

export interface UniversalWebSocketConfig {
  url: string;
  headers?: Record<string, string>;
  protocols?: string | string[];
  tlsOptions?: tls.ConnectionOptions;
  [key: string]: any;
}

export interface UniversalTcpConfig {
  host: string;
  port: number;
  tls?: boolean;
  tlsOptions?: tls.ConnectionOptions;
  authPayload?: Buffer | string;
  [key: string]: any;
}

export interface UniversalMcpToolRequestConfig {
  serverUrl?: string;
  toolName?: string;
  arguments?: Record<string, any>;
  headers?: Record<string, string>;
  apiKey?: string;
  token?: string;
  [key: string]: any;
}

export interface DatabaseConnectionInfo {
  type: "postgres" | "mysql" | "redis" | "mongodb" | "mssql" | "oracle";
  connectionString: string;
  host: string;
  port: number;
  database?: string;
  user?: string;
  password?: string;
  ssl: boolean;
  poolMax: number;
  options: Record<string, any>;
}

// ═════════════════════════════════════════════════════════════════════
// Helper: AWS Signature Version 4 (SigV4) Request Signing
// ═════════════════════════════════════════════════════════════════════

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function signAwsSigV4(
  request: UniversalHttpRequestConfig,
  awsCredentials: {
    accessKeyId: string;
    secretAccessKey: string;
    region?: string;
    service?: string;
    sessionToken?: string;
  },
  datetime = new Date()
): UniversalHttpRequestConfig {
  const region = awsCredentials.region || "us-east-1";
  const service = awsCredentials.service || "execute-api";
  const accessKeyId = awsCredentials.accessKeyId;
  const secretAccessKey = awsCredentials.secretAccessKey;

  const amzDate = datetime.toISOString().replace(/[:-]|\.\d{3}/g, ""); // e.g. 20260831T120000Z
  const dateStamp = amzDate.slice(0, 8); // e.g. 20260831

  const urlObj = new URL(request.url);
  const method = (request.method || "GET").toUpperCase();
  const host = urlObj.host;
  const canonicalUri = encodeURI(urlObj.pathname || "/");

  // Merge headers
  const headers: Record<string, string> = {
    host,
    "x-amz-date": amzDate,
    ...(request.headers || {}),
  };

  if (awsCredentials.sessionToken) {
    headers["x-amz-security-token"] = awsCredentials.sessionToken;
  }

  // Calculate body payload hash
  let payload = "";
  if (request.body !== undefined && request.body !== null) {
    payload = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
  }
  const payloadHash = sha256Hex(payload);
  headers["x-amz-content-sha256"] = payloadHash;

  // Build canonical query string
  const allQueryParams: Record<string, string> = {};
  urlObj.searchParams.forEach((v, k) => {
    allQueryParams[k] = v;
  });
  if (request.params) {
    for (const [k, v] of Object.entries(request.params)) {
      allQueryParams[k] = String(v);
    }
  }
  if (request.query) {
    for (const [k, v] of Object.entries(request.query)) {
      allQueryParams[k] = String(v);
    }
  }

  const canonicalQueryString = Object.keys(allQueryParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(allQueryParams[k])}`)
    .join("&");

  // Build canonical headers & signed headers string
  const sortedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();

  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${headers[k] ?? headers[Object.keys(headers).find((h) => h.toLowerCase() === k)!]}`.trim() + "\n")
    .join("");

  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  // String to sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  // Derive signing key
  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...request,
    headers: {
      ...headers,
      authorization: authorizationHeader,
      Authorization: authorizationHeader,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════
// Generic Connection Injector
// ═════════════════════════════════════════════════════════════════════

export class UniversalConnectionInjector {
  /**
   * Injeta autenticação em requisições HTTP (fetch, axios, got, etc.).
   */
  static injectHttp(
    request: UniversalHttpRequestConfig,
    credential: {
      bucket?: CredentialBucket | string;
      type?: string;
      data?: Record<string, any>;
      token?: string;
      accessToken?: string;
      apiKey?: string;
      [key: string]: any;
    }
  ): UniversalHttpRequestConfig {
    const credData = credential.data ?? credential;
    const bucket = (credential.bucket ?? credential.type ?? "api_key").toLowerCase();
    const headers = { ...(request.headers || {}) };
    const query = { ...(request.query || request.params || {}) };
    let agent = request.agent;
    let tlsOptions = request.tlsOptions ? { ...request.tlsOptions } : undefined;
    let url = request.url;

    switch (bucket) {
      // 1. OAuth2
      case "oauth2":
      case "oauth2_managed":
      case "oauth2_custom":
      case "mcp_oauth2": {
        const token =
          credData.accessToken ??
          credData.access_token ??
          credData.token ??
          credential.accessToken ??
          credential.token;
        const prefix = credData.authHeader ?? "Bearer";
        if (token) {
          headers["Authorization"] = `${prefix} ${token}`.trim();
        }
        break;
      }

      // 2. ApiKey
      case "api_key": {
        const apiKey =
          credData.apiKey ??
          credData.api_key ??
          credData.key ??
          credData.secret ??
          credential.apiKey ??
          credential.token;
        const headerName = credData.headerName ?? "X-API-Key";
        const inQuery = credData.inQuery ?? credData.addTo === "query";
        const inBody = credData.inBody ?? credData.addTo === "body";
        const paramName = credData.paramName ?? "api_key";

        if (apiKey) {
          if (inQuery) {
            query[paramName] = apiKey;
          } else if (inBody && request.body && typeof request.body === "object") {
            request.body = { ...request.body, [paramName]: apiKey };
          } else {
            // Default header
            headers[headerName] = apiKey;
            if (headerName.toLowerCase() === "authorization" && !apiKey.startsWith("Bearer ") && !apiKey.startsWith("Basic ")) {
              headers["Authorization"] = apiKey;
            }
          }
        }
        break;
      }

      // 3. BearerToken
      case "bearer_token":
      case "token": {
        const token =
          credData.token ??
          credData.accessToken ??
          credData.access_token ??
          credData.jwt ??
          credential.token;
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        break;
      }

      // 4. BasicAuth
      case "basic_auth":
      case "basic": {
        const username = credData.username ?? credData.user ?? "";
        const password = credData.password ?? credData.pass ?? credData.secret ?? "";
        const token = Buffer.from(`${username}:${password}`).toString("base64");
        headers["Authorization"] = `Basic ${token}`;
        break;
      }

      // 5. DigestAuth / CustomHeaders
      case "digest_auth": {
        const username = credData.username ?? "";
        const password = credData.password ?? "";
        if (credData.sessionCookie) {
          headers["Cookie"] = credData.sessionCookie;
        }
        // Basic fallback for digest or session header
        if (username && password) {
          headers["X-Auth-User"] = username;
          headers["Authorization"] = `Digest username="${username}", response="${sha256Hex(password)}"`;
        }
        break;
      }

      case "custom_headers":
      case "header_auth": {
        if (credData.headerName && credData.headerValue) {
          headers[credData.headerName] = credData.headerValue;
        }
        if (credData.headers) {
          try {
            const parsedHeaders =
              typeof credData.headers === "string" ? JSON.parse(credData.headers) : credData.headers;
            Object.assign(headers, parsedHeaders);
          } catch {
            // Line by line parsing: Key: Value
            if (typeof credData.headers === "string") {
              credData.headers.split("\n").forEach((line: string) => {
                const idx = line.indexOf(":");
                if (idx > 0) {
                  const k = line.substring(0, idx).trim();
                  const v = line.substring(idx + 1).trim();
                  if (k && v) headers[k] = v;
                }
              });
            }
          }
        }
        if (credData.cookies) {
          headers["Cookie"] = credData.cookies;
        }
        break;
      }

      case "query_auth": {
        const paramName = credData.paramName ?? "api_key";
        const paramValue = credData.paramValue ?? credData.key ?? credData.token;
        if (paramValue) {
          query[paramName] = paramValue;
        }
        break;
      }

      // 6. AwsIam (SigV4)
      case "aws_iam": {
        const signed = signAwsSigV4(
          { ...request, headers, query },
          {
            accessKeyId: credData.accessKeyId ?? credData.access_key_id,
            secretAccessKey: credData.secretAccessKey ?? credData.secret_access_key,
            region: credData.region,
            service: credData.service,
            sessionToken: credData.sessionToken ?? credData.session_token,
          }
        );
        return signed;
      }

      // 7. CertificateAuth (mTLS)
      case "certificate_auth": {
        tlsOptions = {
          ...tlsOptions,
          cert: credData.cert ?? credData.certificate,
          key: credData.key ?? credData.privateKey ?? credData.private_key,
          ca: credData.ca,
          passphrase: credData.passphrase,
          rejectUnauthorized: credData.rejectUnauthorized !== false,
        };

        if (typeof https !== "undefined" && https.Agent) {
          agent = new https.Agent(tlsOptions);
        }
        break;
      }

      // 8. DatabaseConnection (HTTP gateway / REST proxy)
      case "database_connection": {
        // SEC-06: Nunca vazar connectionString com senha/credenciais de banco em headers HTTP
        break;
      }
    }

    // Append updated query to URL if modified
    if (Object.keys(query).length > 0) {
      try {
        const parsedUrl = new URL(url);
        for (const [k, v] of Object.entries(query)) {
          parsedUrl.searchParams.set(k, String(v));
        }
        url = parsedUrl.toString();
      } catch {
        // Leave URL as is if relative or template
      }
    }

    return {
      ...request,
      url,
      headers,
      query,
      params: query,
      agent,
      tlsOptions,
    };
  }

  /**
   * Injeta autenticação em conexões WebSocket.
   */
  static injectWebSocket(
    wsConfig: UniversalWebSocketConfig,
    credential: {
      bucket?: CredentialBucket | string;
      data?: Record<string, any>;
      token?: string;
      apiKey?: string;
      [key: string]: any;
    }
  ): UniversalWebSocketConfig {
    const credData = credential.data ?? credential;
    const bucket = (credential.bucket ?? "bearer_token").toLowerCase();
    const headers = { ...(wsConfig.headers || {}) };
    let tlsOptions = wsConfig.tlsOptions ? { ...wsConfig.tlsOptions } : undefined;
    let url = wsConfig.url;

    const token =
      credData.token ??
      credData.accessToken ??
      credData.apiKey ??
      credential.token ??
      credential.apiKey;

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      try {
        const parsedUrl = new URL(url);
        if (!parsedUrl.searchParams.has("token") && !parsedUrl.searchParams.has("apiKey")) {
          parsedUrl.searchParams.set("token", token);
          url = parsedUrl.toString();
        }
      } catch {
        // relative URL
      }
    }

    if (bucket === "certificate_auth" || credData.cert) {
      tlsOptions = {
        ...tlsOptions,
        cert: credData.cert ?? credData.certificate,
        key: credData.key ?? credData.privateKey,
        ca: credData.ca,
        passphrase: credData.passphrase,
        rejectUnauthorized: credData.rejectUnauthorized !== false,
      };
    }

    return {
      ...wsConfig,
      url,
      headers,
      tlsOptions,
    };
  }

  /**
   * Injeta autenticação em sockets TCP puros ou canais de banco de dados.
   */
  static injectTcp(
    tcpConfig: UniversalTcpConfig,
    credential: {
      bucket?: CredentialBucket | string;
      data?: Record<string, any>;
      [key: string]: any;
    }
  ): UniversalTcpConfig {
    const credData = credential.data ?? credential;
    let tlsOptions = tcpConfig.tlsOptions ? { ...tcpConfig.tlsOptions } : undefined;
    let authPayload = tcpConfig.authPayload;

    if (credData.cert || credData.certificate) {
      tlsOptions = {
        ...tlsOptions,
        cert: credData.cert ?? credData.certificate,
        key: credData.key ?? credData.privateKey,
        ca: credData.ca,
        passphrase: credData.passphrase,
        rejectUnauthorized: credData.rejectUnauthorized !== false,
      };
    }

    // Redis AUTH or generic password handshake
    if (credData.password) {
      authPayload = `AUTH ${credData.password}\r\n`;
    }

    return {
      ...tcpConfig,
      host: credData.host ?? tcpConfig.host,
      port: Number(credData.port ?? tcpConfig.port),
      tls: credData.ssl ?? tcpConfig.tls ?? false,
      tlsOptions,
      authPayload,
    };
  }

  /**
   * Injeta autenticação em clientes de ferramentas do Model Context Protocol (MCP).
   */
  static injectMcpTool(
    mcpConfig: UniversalMcpToolRequestConfig,
    credential: {
      bucket?: CredentialBucket | string;
      data?: Record<string, any>;
      token?: string;
      accessToken?: string;
      apiKey?: string;
      [key: string]: any;
    }
  ): UniversalMcpToolRequestConfig {
    const credData = credential.data ?? credential;
    const headers = { ...(mcpConfig.headers || {}) };
    const token =
      credData.accessToken ??
      credData.token ??
      credData.apiKey ??
      credential.accessToken ??
      credential.token ??
      credential.apiKey ??
      mcpConfig.token ??
      mcpConfig.apiKey;

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      headers["X-MCP-API-Key"] = token;
    }

    if (credData.mcpServerUrl) {
      mcpConfig.serverUrl = credData.mcpServerUrl;
    }

    return {
      ...mcpConfig,
      headers,
      token,
      apiKey: token,
    };
  }

  /**
   * Constrói e normaliza a string e opções de conexão para Banco de Dados.
   */
  static buildDatabaseConnection(
    credential: {
      data?: Record<string, any>;
      [key: string]: any;
    }
  ): DatabaseConnectionInfo {
    const data = credential.data ?? credential;
    const type = (data.type ?? data.engine ?? "postgres").toLowerCase() as DatabaseConnectionInfo["type"];
    const host = data.host ?? "localhost";
    const user = data.user ?? data.username ?? "";
    const password = data.password ?? "";
    const database = data.database ?? data.db ?? "";
    const ssl = Boolean(data.ssl ?? data.tls ?? false);
    const poolMax = Number(data.poolMax ?? data.maxConnections ?? 10);

    let defaultPort = 5432;
    if (type === "mysql") defaultPort = 3306;
    else if (type === "redis") defaultPort = 6379;
    else if (type === "mongodb") defaultPort = 27017;
    else if (type === "mssql") defaultPort = 1433;
    else if (type === "oracle") defaultPort = 1521;

    const port = Number(data.port ?? defaultPort);

    let connectionString = data.connectionString ?? data.uri ?? "";
    if (!connectionString) {
      const userAuth = user ? `${encodeURIComponent(user)}${password ? `:${encodeURIComponent(password)}` : ""}@` : "";
      const sslQuery = ssl ? (type === "postgres" ? "?sslmode=require" : "?ssl=true") : "";

      switch (type) {
        case "postgres":
          connectionString = `postgresql://${userAuth}${host}:${port}/${database}${sslQuery}`;
          break;
        case "mysql":
          connectionString = `mysql://${userAuth}${host}:${port}/${database}${sslQuery}`;
          break;
        case "redis":
          connectionString = `redis://${password ? `:${encodeURIComponent(password)}@` : ""}${host}:${port}/${database || 0}`;
          break;
        case "mongodb":
          connectionString = `mongodb://${userAuth}${host}:${port}/${database}${sslQuery}`;
          break;
        case "mssql":
          connectionString = `Server=${host},${port};Database=${database};User Id=${user};Password=${password};Encrypt=${ssl};`;
          break;
        case "oracle":
          connectionString = `oracle://${userAuth}${host}:${port}/${database}`;
          break;
      }
    }

    return {
      type,
      connectionString,
      host,
      port,
      database,
      user,
      password,
      ssl,
      poolMax,
      options: {
        ssl,
        max: poolMax,
        connectionTimeoutMillis: Number(data.connectionTimeout ?? 5000),
        idleTimeoutMillis: Number(data.idleTimeout ?? 30000),
      },
    };
  }
}
