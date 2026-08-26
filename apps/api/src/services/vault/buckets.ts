import type { BucketDefinition, CredentialBucket } from "./types.js";

export const BUCKET_DEFINITIONS: Record<CredentialBucket, BucketDefinition> = {
  api_key: {
    bucket: "api_key",
    displayName: "API Key Authentication",
    description: "Authenticates requests using an API Key passed in headers, query parameters, or cookies.",
    sensitiveFieldNames: ["apiKey", "key", "secret", "value"],
    fields: [
      {
        name: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        sensitive: true,
        placeholder: "ak_live_••••••••••••••••",
        description: "The secret API key provided by the service.",
      },
      {
        name: "headerName",
        label: "Header Name",
        type: "text",
        required: false,
        sensitive: false,
        defaultValue: "Authorization",
        placeholder: "X-API-Key or Authorization",
        description: "Header name to transmit the API Key (default: X-API-Key or Authorization).",
      },
      {
        name: "apiUrl",
        label: "API URL / Base Endpoint",
        type: "text",
        required: false,
        sensitive: false,
        placeholder: "https://api.service.com/v1",
        description: "Optional custom base URL or account endpoint.",
      },
      {
        name: "domains",
        label: "Allowed Request Domains",
        type: "select",
        required: false,
        sensitive: false,
        defaultValue: "All",
        options: [
          { value: "All", label: "All Domains" },
          { value: "Restricted", label: "Restricted Domains Only" },
        ],
        description: "Limits outgoing HTTP requests to allowed domain patterns.",
      },
    ],
  },

  bearer_token: {
    bucket: "bearer_token",
    displayName: "Bearer Token Authentication",
    description: "Authenticates requests using an HTTP Authorization: Bearer <token> header.",
    sensitiveFieldNames: ["token", "accessToken", "jwt"],
    fields: [
      {
        name: "token",
        label: "Bearer Token",
        type: "password",
        required: true,
        sensitive: true,
        placeholder: "ey••••••••••••••••",
        description: "The Bearer Token or JWT string.",
      },
      {
        name: "domains",
        label: "Allowed Request Domains",
        type: "select",
        required: false,
        sensitive: false,
        defaultValue: "All",
        options: [
          { value: "All", label: "All Domains" },
          { value: "Restricted", label: "Restricted Domains Only" },
        ],
        description: "Limits outgoing HTTP requests to allowed domain patterns.",
      },
    ],
  },

  basic_auth: {
    bucket: "basic_auth",
    displayName: "Basic HTTP Authentication",
    description: "Authenticates requests using standard RFC 7617 HTTP Basic Authentication (username & password).",
    sensitiveFieldNames: ["password", "secret"],
    fields: [
      {
        name: "username",
        label: "Username / Email",
        type: "text",
        required: true,
        sensitive: false,
        placeholder: "user@example.com",
        description: "The account username or email identifier.",
      },
      {
        name: "password",
        label: "Password / API Token",
        type: "password",
        required: true,
        sensitive: true,
        placeholder: "••••••••••••••••",
        description: "The account password or API token.",
      },
      {
        name: "domain",
        label: "Target Host / Domain",
        type: "text",
        required: false,
        sensitive: false,
        placeholder: "api.domain.com",
        description: "Optional target hostname or domain restriction.",
      },
    ],
  },

  oauth2_managed: {
    bucket: "oauth2_managed",
    displayName: "Managed OAuth2 Authentication",
    description: "AgentFlow-managed OAuth 2.0 flow with automatic token refresh and lifecycle management.",
    sensitiveFieldNames: ["clientSecret", "accessToken", "refreshToken"],
    fields: [
      {
        name: "clientId",
        label: "Client ID",
        type: "text",
        required: true,
        sensitive: false,
        placeholder: "client_id_••••••••",
        description: "The OAuth2 Client ID registered with the provider.",
      },
      {
        name: "clientSecret",
        label: "Client Secret",
        type: "password",
        required: true,
        sensitive: true,
        placeholder: "client_secret_••••••••",
        description: "The OAuth2 Client Secret registered with the provider.",
      },
      {
        name: "accessToken",
        label: "Access Token",
        type: "password",
        required: false,
        sensitive: true,
        placeholder: "act_••••••••••••••••",
        description: "Current valid OAuth2 access token.",
      },
      {
        name: "refreshToken",
        label: "Refresh Token",
        type: "password",
        required: false,
        sensitive: true,
        placeholder: "rft_••••••••••••••••",
        description: "OAuth2 refresh token for automatic token rotation.",
      },
      {
        name: "authUrl",
        label: "Authorization URL",
        type: "text",
        required: false,
        sensitive: false,
        placeholder: "https://provider.com/oauth/authorize",
      },
      {
        name: "tokenUrl",
        label: "Token URL",
        type: "text",
        required: false,
        sensitive: false,
        placeholder: "https://provider.com/oauth/token",
      },
      {
        name: "scopes",
        label: "Scopes",
        type: "text",
        required: false,
        sensitive: false,
        placeholder: "read,write,admin",
        description: "Space- or comma-separated OAuth scopes.",
      },
    ],
  },

  oauth2_custom: {
    bucket: "oauth2_custom",
    displayName: "Custom OAuth2 / OpenID Connect",
    description: "Customizable OAuth 2.0 flow supporting custom parameters, token endpoints, and PKCE.",
    sensitiveFieldNames: ["clientSecret", "accessToken", "refreshToken"],
    fields: [
      {
        name: "clientId",
        label: "Client ID",
        type: "text",
        required: true,
        sensitive: false,
        placeholder: "client_id_••••••••",
      },
      {
        name: "clientSecret",
        label: "Client Secret",
        type: "password",
        required: true,
        sensitive: true,
        placeholder: "client_secret_••••••••",
      },
      {
        name: "authUrl",
        label: "Authorization Endpoint",
        type: "text",
        required: true,
        sensitive: false,
        placeholder: "https://auth.company.com/oauth/authorize",
      },
      {
        name: "tokenUrl",
        label: "Token Endpoint",
        type: "text",
        required: true,
        sensitive: false,
        placeholder: "https://auth.company.com/oauth/token",
      },
      {
        name: "accessToken",
        label: "Access Token",
        type: "password",
        required: false,
        sensitive: true,
      },
      {
        name: "refreshToken",
        label: "Refresh Token",
        type: "password",
        required: false,
        sensitive: true,
      },
      {
        name: "scopes",
        label: "Requested Scopes",
        type: "text",
        required: false,
        sensitive: false,
        placeholder: "openid profile email api",
      },
      {
        name: "authHeader",
        label: "Header Prefix",
        type: "text",
        required: false,
        sensitive: false,
        defaultValue: "Bearer",
        placeholder: "Bearer or Token",
      },
    ],
  },

  header_auth: {
    bucket: "header_auth",
    displayName: "Custom Header Authentication",
    description: "Injects custom HTTP headers for proprietary or multi-header authentication schemes.",
    sensitiveFieldNames: ["headerValue", "secret", "value"],
    fields: [
      {
        name: "headerName",
        label: "Header Name",
        type: "text",
        required: true,
        sensitive: false,
        placeholder: "X-Custom-Auth",
        description: "The custom HTTP header key.",
      },
      {
        name: "headerValue",
        label: "Header Value",
        type: "password",
        required: true,
        sensitive: true,
        placeholder: "••••••••••••••••",
        description: "The secret header value or signature key.",
      },
      {
        name: "domains",
        label: "Allowed Request Domains",
        type: "select",
        required: false,
        sensitive: false,
        defaultValue: "All",
        options: [
          { value: "All", label: "All Domains" },
          { value: "Restricted", label: "Restricted Domains Only" },
        ],
      },
    ],
  },

  query_auth: {
    bucket: "query_auth",
    displayName: "Query Parameter Authentication",
    description: "Appends secret authentication parameters directly to outgoing HTTP query strings.",
    sensitiveFieldNames: ["paramValue", "key", "token"],
    fields: [
      {
        name: "paramName",
        label: "Parameter Name",
        type: "text",
        required: true,
        sensitive: false,
        placeholder: "api_key or access_token",
        description: "The query parameter key name.",
      },
      {
        name: "paramValue",
        label: "Parameter Value",
        type: "password",
        required: true,
        sensitive: true,
        placeholder: "••••••••••••••••",
        description: "The secret query parameter value.",
      },
      {
        name: "domains",
        label: "Allowed Request Domains",
        type: "select",
        required: false,
        sensitive: false,
        defaultValue: "All",
        options: [
          { value: "All", label: "All Domains" },
          { value: "Restricted", label: "Restricted Domains Only" },
        ],
      },
    ],
  },

  mcp_oauth2: {
    bucket: "mcp_oauth2",
    displayName: "Model Context Protocol (MCP) OAuth2",
    description: "OAuth 2.0 authentication tailored for Model Context Protocol servers and tool exposure.",
    sensitiveFieldNames: ["clientSecret", "accessToken", "refreshToken"],
    fields: [
      {
        name: "mcpServerUrl",
        label: "MCP Server URL",
        type: "text",
        required: true,
        sensitive: false,
        placeholder: "https://mcp.agentflow.ai/mcp/http",
        description: "Target MCP Streamable HTTP or SSE endpoint.",
      },
      {
        name: "clientId",
        label: "Client ID / App ID",
        type: "text",
        required: true,
        sensitive: false,
        placeholder: "af_mcp_••••••••",
      },
      {
        name: "clientSecret",
        label: "Client Secret",
        type: "password",
        required: true,
        sensitive: true,
        placeholder: "••••••••••••••••",
      },
      {
        name: "accessToken",
        label: "MCP Access Token",
        type: "password",
        required: false,
        sensitive: true,
        placeholder: "af_••••••••••••••••",
      },
      {
        name: "refreshToken",
        label: "MCP Refresh Token",
        type: "password",
        required: false,
        sensitive: true,
      },
      {
        name: "discoveryUrl",
        label: "OAuth Discovery URL",
        type: "text",
        required: false,
        sensitive: false,
        placeholder: "https://auth.mcp-provider.com/.well-known/openid-configuration",
      },
    ],
  },
};

export const ALL_BUCKETS = Object.keys(BUCKET_DEFINITIONS) as CredentialBucket[];

export function getBucketDefinition(bucket: CredentialBucket): BucketDefinition {
  const def = BUCKET_DEFINITIONS[bucket];
  if (!def) {
    throw new Error(`Unknown credential bucket: ${bucket}`);
  }
  return def;
}

export function validateBucketData(
  bucket: CredentialBucket,
  data: Record<string, any>
): { valid: boolean; errors: string[] } {
  const definition = BUCKET_DEFINITIONS[bucket];
  if (!definition) {
    return { valid: false, errors: [`Unknown bucket: ${bucket}`] };
  }

  const errors: string[] = [];
  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Credential data must be a non-null object"] };
  }

  for (const field of definition.fields) {
    if (field.required) {
      const val = data[field.name];
      if (val === undefined || val === null || val === "") {
        errors.push(`Field '${field.label}' (${field.name}) is required for bucket '${bucket}'`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
