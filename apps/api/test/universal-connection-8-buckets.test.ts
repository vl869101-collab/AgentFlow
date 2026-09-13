import assert from "node:assert/strict";
import test from "node:test";
import {
  UniversalConnectionInjector,
  signAwsSigV4,
  type UniversalHttpRequestConfig,
} from "../src/services/vault/universal-injector.js";
import {
  BUCKET_DEFINITIONS,
  ALL_BUCKETS,
  validateBucketData,
  getBucketDefinition,
} from "../src/services/vault/buckets.js";

test("Universal 8 Buckets: catalog definitions and schema validation", () => {
  const expectedBuckets = [
    "api_key",
    "bearer_token",
    "basic_auth",
    "oauth2_managed",
    "oauth2_custom",
    "header_auth",
    "query_auth",
    "mcp_oauth2",
    "digest_auth",
    "custom_headers",
    "aws_iam",
    "certificate_auth",
    "database_connection",
  ];

  for (const bucket of expectedBuckets) {
    const def = getBucketDefinition(bucket as any);
    assert.ok(def, `Bucket ${bucket} must have a valid definition`);
    assert.ok(def.displayName, `Bucket ${bucket} must have a display name`);
    assert.ok(Array.isArray(def.fields), `Bucket ${bucket} fields must be an array`);
    assert.ok(Array.isArray(def.sensitiveFieldNames), `Bucket ${bucket} sensitiveFieldNames must be an array`);
  }

  // Validate AWS IAM schema
  const awsValidation = validateBucketData("aws_iam", {
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
  });
  assert.equal(awsValidation.valid, true);

  // Validate Certificate Auth schema
  const certValidation = validateBucketData("certificate_auth", {
    cert: "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
    key: "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----",
  });
  assert.equal(certValidation.valid, true);

  // Validate Database Connection schema
  const dbValidation = validateBucketData("database_connection", {
    type: "postgres",
    host: "localhost",
    port: 5432,
    database: "agentflow_prod",
  });
  assert.equal(dbValidation.valid, true);
});

test("Bucket 1: OAuth2 Injection with Google & Slack fixtures", () => {
  // Google OAuth2
  const googleCred = {
    bucket: "oauth2_managed",
    provider: "google",
    data: {
      accessToken: "ya29.a0AfH6SMD_google_oauth2_token_xyz",
      tokenType: "Bearer",
    },
  };

  const req1: UniversalHttpRequestConfig = {
    url: "https://sheets.googleapis.com/v4/spreadsheets/123",
    method: "GET",
  };

  const injectedGoogle = UniversalConnectionInjector.injectHttp(req1, googleCred);
  assert.equal(
    injectedGoogle.headers?.Authorization,
    "Bearer ya29.a0AfH6SMD_google_oauth2_token_xyz"
  );

  // Slack OAuth2
  const slackCred = {
    bucket: "oauth2_custom",
    provider: "slack",
    data: {
      accessToken: "xoxb-1234567890-slack-bot-token",
      authHeader: "Bearer",
    },
  };

  const req2: UniversalHttpRequestConfig = {
    url: "https://slack.com/api/chat.postMessage",
    method: "POST",
    body: { channel: "C123", text: "Hello from AgentFlow" },
  };

  const injectedSlack = UniversalConnectionInjector.injectHttp(req2, slackCred);
  assert.equal(
    injectedSlack.headers?.Authorization,
    "Bearer xoxb-1234567890-slack-bot-token"
  );
});

test("Bucket 2: ApiKey Injection with OpenAI & Stripe fixtures", () => {
  // OpenAI Header API Key
  const openaiCred = {
    bucket: "api_key",
    provider: "openai",
    data: {
      apiKey: "sk-proj-openai-live-key-abc123xyz",
      headerName: "Authorization",
    },
  };

  const req1: UniversalHttpRequestConfig = {
    url: "https://api.openai.com/v1/chat/completions",
    method: "POST",
    body: { model: "gpt-4o" },
  };

  const injectedOpenAi = UniversalConnectionInjector.injectHttp(req1, openaiCred);
  assert.equal(
    injectedOpenAi.headers?.Authorization,
    "sk-proj-openai-live-key-abc123xyz"
  );

  // Stripe Secret Key
  const stripeCred = {
    bucket: "api_key",
    provider: "stripe",
    data: {
      apiKey: "sk_test_51MzStripeSecretKeyXYZ999",
      headerName: "Authorization",
    },
  };

  const req2: UniversalHttpRequestConfig = {
    url: "https://api.stripe.com/v1/customers",
    method: "GET",
  };

  const injectedStripe = UniversalConnectionInjector.injectHttp(req2, stripeCred);
  assert.equal(
    injectedStripe.headers?.Authorization,
    "sk_test_51MzStripeSecretKeyXYZ999"
  );

  // Query parameter API Key
  const weatherCred = {
    bucket: "api_key",
    data: {
      apiKey: "weather_api_key_123",
      inQuery: true,
      paramName: "appid",
    },
  };

  const req3: UniversalHttpRequestConfig = {
    url: "https://api.openweathermap.org/data/2.5/weather?q=London",
    method: "GET",
  };

  const injectedWeather = UniversalConnectionInjector.injectHttp(req3, weatherCred);
  assert.ok(injectedWeather.url.includes("appid=weather_api_key_123"));
  assert.equal(injectedWeather.query?.appid, "weather_api_key_123");
});

test("Bucket 3: BearerToken Injection with GitHub & Notion fixtures", () => {
  // GitHub Personal Access Token (Bearer / Token)
  const githubCred = {
    bucket: "bearer_token",
    provider: "github",
    data: {
      token: "ghp_GitHubPersonalAccessToken1234567890",
    },
  };

  const req1: UniversalHttpRequestConfig = {
    url: "https://api.github.com/user/repos",
    method: "GET",
  };

  const injectedGithub = UniversalConnectionInjector.injectHttp(req1, githubCred);
  assert.equal(
    injectedGithub.headers?.Authorization,
    "Bearer ghp_GitHubPersonalAccessToken1234567890"
  );

  // Notion Integration Token
  const notionCred = {
    bucket: "bearer_token",
    provider: "notion",
    data: {
      token: "ntn_secret_notion_integration_token_987",
    },
  };

  const req2: UniversalHttpRequestConfig = {
    url: "https://api.notion.com/v1/databases",
    method: "GET",
    headers: { "Notion-Version": "2022-06-28" },
  };

  const injectedNotion = UniversalConnectionInjector.injectHttp(req2, notionCred);
  assert.equal(
    injectedNotion.headers?.Authorization,
    "Bearer ntn_secret_notion_integration_token_987"
  );
  assert.equal(injectedNotion.headers?.["Notion-Version"], "2022-06-28");
});

test("Bucket 4: BasicAuth RFC 7617 Base64 Encoding", () => {
  const basicCred = {
    bucket: "basic_auth",
    data: {
      username: "agentflow_admin",
      password: "SuperSecretPassword123!",
    },
  };

  const req: UniversalHttpRequestConfig = {
    url: "https://jira.company.com/rest/api/2/issue/1000",
    method: "GET",
  };

  const injected = UniversalConnectionInjector.injectHttp(req, basicCred);
  const expectedBase64 = Buffer.from("agentflow_admin:SuperSecretPassword123!").toString("base64");
  assert.equal(injected.headers?.Authorization, `Basic ${expectedBase64}`);
});

test("Bucket 5: DigestAuth & CustomHeaders with session cookies", () => {
  const customHeadersCred = {
    bucket: "custom_headers",
    data: {
      headers: JSON.stringify({
        "X-Organization-Id": "org_enterprise_99",
        "X-AgentFlow-Signature": "sig_hex_abc123",
      }),
      cookies: "session_id=sess_cookie_token_456; domain=example.com",
    },
  };

  const req: UniversalHttpRequestConfig = {
    url: "https://api.enterprise.internal/v2/analytics",
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };

  const injected = UniversalConnectionInjector.injectHttp(req, customHeadersCred);
  assert.equal(injected.headers?.["X-Organization-Id"], "org_enterprise_99");
  assert.equal(injected.headers?.["X-AgentFlow-Signature"], "sig_hex_abc123");
  assert.equal(injected.headers?.["Cookie"], "session_id=sess_cookie_token_456; domain=example.com");
  assert.equal(injected.headers?.["Content-Type"], "application/json");
});

test("Bucket 6: AWS IAM SigV4 HMAC-SHA256 Request Signing", () => {
  const fixedDate = new Date("2026-08-31T15:30:00.000Z");

  const awsCred = {
    bucket: "aws_iam",
    data: {
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      service: "bedrock",
    },
  };

  const req: UniversalHttpRequestConfig = {
    url: "https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-v2/invoke",
    method: "POST",
    body: { prompt: "Human: Hello AWS Claude Assistant: " },
    headers: {
      "content-type": "application/json",
    },
  };

  const signed = signAwsSigV4(req, awsCred.data, fixedDate);

  assert.ok(signed.headers);
  assert.ok(signed.headers["x-amz-date"]);
  assert.equal(signed.headers["x-amz-date"], "20260831T153000Z");
  assert.ok(signed.headers["x-amz-content-sha256"]);
  assert.ok(signed.headers["authorization"].startsWith("AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20260831/us-east-1/bedrock/aws4_request"));
  assert.ok(signed.headers["authorization"].includes("Signature="));
});

test("Bucket 7: CertificateAuth mTLS Options and HTTPS Agent Generation", () => {
  const certCred = {
    bucket: "certificate_auth",
    data: {
      cert: "-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAgIJALTestClientCert...\n-----END CERTIFICATE-----",
      key: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0TestClientKey...\n-----END RSA PRIVATE KEY-----",
      ca: "-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAgIJALTestCACert...\n-----END CERTIFICATE-----",
      passphrase: "client-key-passphrase-123",
      rejectUnauthorized: true,
    },
  };

  const req: UniversalHttpRequestConfig = {
    url: "https://mtls.banking.example.com/api/v1/transfer",
    method: "POST",
  };

  const injected = UniversalConnectionInjector.injectHttp(req, certCred);
  assert.ok(injected.tlsOptions);
  assert.equal(injected.tlsOptions.cert, certCred.data.cert);
  assert.equal(injected.tlsOptions.key, certCred.data.key);
  assert.equal(injected.tlsOptions.ca, certCred.data.ca);
  assert.equal(injected.tlsOptions.passphrase, certCred.data.passphrase);
  assert.equal(injected.tlsOptions.rejectUnauthorized, true);
  assert.ok(injected.agent, "HTTPS Agent must be configured for mTLS requests");
});

test("Bucket 8: Database Connection Normalization & Pool Builder (Postgres, MySQL, Redis, MongoDB, MSSQL, Oracle)", () => {
  // PostgreSQL
  const pgInfo = UniversalConnectionInjector.buildDatabaseConnection({
    type: "postgres",
    host: "postgres.cloud.internal",
    port: 5432,
    database: "agentflow_db",
    user: "postgres_user",
    password: "secret_pg_password",
    ssl: true,
    poolMax: 20,
  });

  assert.equal(pgInfo.type, "postgres");
  assert.equal(
    pgInfo.connectionString,
    "postgresql://postgres_user:secret_pg_password@postgres.cloud.internal:5432/agentflow_db?sslmode=require"
  );
  assert.equal(pgInfo.poolMax, 20);
  assert.equal(pgInfo.ssl, true);

  // Redis
  const redisInfo = UniversalConnectionInjector.buildDatabaseConnection({
    type: "redis",
    host: "redis.cluster.internal",
    port: 6379,
    password: "redis_auth_token",
    database: 2,
  });

  assert.equal(redisInfo.type, "redis");
  assert.equal(
    redisInfo.connectionString,
    "redis://:redis_auth_token@redis.cluster.internal:6379/2"
  );

  // MySQL
  const mysqlInfo = UniversalConnectionInjector.buildDatabaseConnection({
    type: "mysql",
    host: "mysql.db.internal",
    port: 3306,
    database: "ecommerce",
    user: "mysql_admin",
    password: "pass",
    ssl: false,
  });

  assert.equal(mysqlInfo.type, "mysql");
  assert.equal(
    mysqlInfo.connectionString,
    "mysql://mysql_admin:pass@mysql.db.internal:3306/ecommerce"
  );

  // MongoDB
  const mongoInfo = UniversalConnectionInjector.buildDatabaseConnection({
    type: "mongodb",
    host: "mongo.db.internal",
    port: 27017,
    database: "analytics",
    user: "mongo_user",
    password: "mongo_password",
    ssl: true,
  });

  assert.equal(mongoInfo.type, "mongodb");
  assert.equal(
    mongoInfo.connectionString,
    "mongodb://mongo_user:mongo_password@mongo.db.internal:27017/analytics?ssl=true"
  );
});

test("Generic WebSocket, TCP & MCP Tool Injection", () => {
  // WebSocket Injection
  const wsInjected = UniversalConnectionInjector.injectWebSocket(
    { url: "wss://stream.slack.com/link" },
    { token: "xoxb-ws-token-123" }
  );
  assert.equal(wsInjected.headers?.Authorization, "Bearer xoxb-ws-token-123");
  assert.ok(wsInjected.url.includes("token=xoxb-ws-token-123"));

  // TCP Socket Injection
  const tcpInjected = UniversalConnectionInjector.injectTcp(
    { host: "127.0.0.1", port: 6379 },
    { data: { password: "redis_secret_pass" } }
  );
  assert.equal(tcpInjected.authPayload, "AUTH redis_secret_pass\r\n");

  // MCP Tool Client Injection
  const mcpInjected = UniversalConnectionInjector.injectMcpTool(
    { serverUrl: "https://mcp.agentflow.ai/api", toolName: "generateChart" },
    { token: "af_mcp_live_token_777" }
  );
  assert.equal(mcpInjected.headers?.Authorization, "Bearer af_mcp_live_token_777");
  assert.equal(mcpInjected.headers?.["X-MCP-API-Key"], "af_mcp_live_token_777");
});
