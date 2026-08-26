import { createHash, randomBytes } from "node:crypto";
import { ensureFreshOAuth2Token } from "../services/vault/oauth-refresh.js";
import { prisma } from "./prisma.js";
import { decryptVaultData } from "../services/vault/crypto.js";

export type HttpAuthType =
  | "none"
  | "basic"
  | "bearer"
  | "api_key"
  | "oauth2"
  | "digest"
  | "mtls";

export interface HttpAuthConfig {
  type: HttpAuthType;
  // Basic Auth
  username?: string;
  password?: string;
  // Bearer
  token?: string;
  // API Key
  apiKeyName?: string;
  apiKeyValue?: string;
  apiKeyIn?: "header" | "query";
  // OAuth2
  credentialId?: string;
  orgId?: string;
  // Digest Auth
  digestUsername?: string;
  digestPassword?: string;
  realm?: string;
  nonce?: string;
  uri?: string;
  nc?: string;
  cnonce?: string;
  qop?: string;
  algorithm?: "MD5" | "SHA-256";
  // mTLS
  cert?: string;
  key?: string;
  pfx?: string;
  passphrase?: string;
  ca?: string;
}

export interface PreparedHttpRequest {
  headers: Record<string, string>;
  url: string;
  tlsOptions?: {
    cert?: string;
    key?: string;
    pfx?: string;
    passphrase?: string;
    ca?: string;
  };
}

/**
 * Calculates RFC 7616 / RFC 2617 HTTP Digest Authorization Header.
 */
export function computeDigestAuthHeader(params: {
  username: string;
  password: string;
  method: string;
  uri: string;
  realm: string;
  nonce: string;
  nc?: string;
  cnonce?: string;
  qop?: string;
  algorithm?: "MD5" | "SHA-256";
}): string {
  const {
    username,
    password,
    method,
    uri,
    realm,
    nonce,
    nc = "00000001",
    cnonce = randomBytes(8).toString("hex"),
    qop = "auth",
    algorithm = "MD5",
  } = params;

  const hash = (input: string): string => {
    return algorithm === "SHA-256"
      ? createHash("sha256").update(input).digest("hex")
      : createHash("md5").update(input).digest("hex");
  };

  const ha1 = hash(`${username}:${realm}:${password}`);
  const ha2 = hash(`${method.toUpperCase()}:${uri}`);
  let response: string;

  if (qop === "auth" || qop === "auth-int") {
    response = hash(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
  } else {
    response = hash(`${ha1}:${nonce}:${ha2}`);
  }

  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];

  if (qop) {
    parts.push(`qop=${qop}`);
    parts.push(`nc=${nc}`);
    parts.push(`cnonce="${cnonce}"`);
  }

  if (algorithm && algorithm !== "MD5") {
    parts.push(`algorithm=${algorithm}`);
  }

  return `Digest ${parts.join(", ")}`;
}

/**
 * Applies the configured HTTP authentication scheme to the outgoing request headers, URL, and TLS options.
 */
export async function applyHttpAuthentication(
  rawUrl: string,
  method: string,
  authConfig?: HttpAuthConfig,
  existingHeaders: Record<string, string> = {}
): Promise<PreparedHttpRequest> {
  const headers = { ...existingHeaders };
  let url = rawUrl;
  let tlsOptions: PreparedHttpRequest["tlsOptions"] | undefined;

  if (!authConfig || authConfig.type === "none") {
    return { headers, url, tlsOptions };
  }

  switch (authConfig.type) {
    case "basic": {
      const u = authConfig.username ?? "";
      const p = authConfig.password ?? "";
      const encoded = Buffer.from(`${u}:${p}`, "utf8").toString("base64");
      headers["Authorization"] = `Basic ${encoded}`;
      break;
    }

    case "bearer": {
      const token = authConfig.token ?? "";
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      break;
    }

    case "api_key": {
      const name = authConfig.apiKeyName || "X-API-Key";
      const value = authConfig.apiKeyValue || "";
      if (authConfig.apiKeyIn === "query") {
        const parsedUrl = new URL(url);
        parsedUrl.searchParams.set(name, value);
        url = parsedUrl.toString();
      } else {
        headers[name] = value;
      }
      break;
    }

    case "oauth2": {
      if (authConfig.credentialId && authConfig.orgId) {
        const fresh = await ensureFreshOAuth2Token(authConfig.credentialId, authConfig.orgId);
        const prefix = fresh.tokenType || "Bearer";
        headers["Authorization"] = `${prefix} ${fresh.accessToken}`;
      } else if (authConfig.token) {
        headers["Authorization"] = `Bearer ${authConfig.token}`;
      }
      break;
    }

    case "digest": {
      if (authConfig.digestUsername && authConfig.digestPassword && authConfig.realm && authConfig.nonce) {
        const parsedUrl = new URL(url);
        const uri = authConfig.uri || parsedUrl.pathname + parsedUrl.search;
        const digestHeader = computeDigestAuthHeader({
          username: authConfig.digestUsername,
          password: authConfig.digestPassword,
          method,
          uri,
          realm: authConfig.realm,
          nonce: authConfig.nonce,
          nc: authConfig.nc,
          cnonce: authConfig.cnonce,
          qop: authConfig.qop,
          algorithm: authConfig.algorithm,
        });
        headers["Authorization"] = digestHeader;
      }
      break;
    }

    case "mtls": {
      tlsOptions = {
        cert: authConfig.cert,
        key: authConfig.key,
        pfx: authConfig.pfx,
        passphrase: authConfig.passphrase,
        ca: authConfig.ca,
      };
      break;
    }
  }

  return { headers, url, tlsOptions };
}
