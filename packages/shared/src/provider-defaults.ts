/**
 * AgentFlow Vault Provider Defaults & Auth Schemes
 * Maps provider IDs, names, and aliases to their official API Base URLs,
 * default headers, query params, OAuth2 endpoints, and MCP configurations.
 */

export interface ProviderAuthDefaults {
  apiUrl?: string;
  headerName?: string;
  headerValuePrefix?: string;
  paramName?: string;
  authUrl?: string;
  tokenUrl?: string;
  scopes?: string;
  mcpServerUrl?: string;
  allowedDomains?: string;
  region?: string;
  databasePort?: string;
}

/**
 * Standard registry of official Base URLs and authentication scheme details.
 */
export const OFFICIAL_PROVIDER_DEFAULTS: Record<string, ProviderAuthDefaults> = {
  // ═══════════════════════════════════════════
  // AI & Machine Learning
  // ═══════════════════════════════════════════
  openai: {
    apiUrl: "https://api.openai.com/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.openai.com",
  },
  "openai-api": {
    apiUrl: "https://api.openai.com/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.openai.com",
  },
  anthropic: {
    apiUrl: "https://api.anthropic.com/v1",
    headerName: "x-api-key",
    allowedDomains: "api.anthropic.com",
  },
  "anthropic-claude": {
    apiUrl: "https://api.anthropic.com/v1",
    headerName: "x-api-key",
    allowedDomains: "api.anthropic.com",
  },
  google_gemini: {
    apiUrl: "https://generativelanguage.googleapis.com/v1beta",
    paramName: "key",
    headerName: "x-goog-api-key",
    allowedDomains: "generativelanguage.googleapis.com",
  },
  "google-gemini-ai": {
    apiUrl: "https://generativelanguage.googleapis.com/v1beta",
    paramName: "key",
    headerName: "x-goog-api-key",
    allowedDomains: "generativelanguage.googleapis.com",
  },
  cohere: {
    apiUrl: "https://api.cohere.com/v2",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.cohere.com",
  },
  "cohere-llm-platform": {
    apiUrl: "https://api.cohere.com/v2",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.cohere.com",
  },
  mistral_ai: {
    apiUrl: "https://api.mistral.ai/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.mistral.ai",
  },
  "mistral-ai": {
    apiUrl: "https://api.mistral.ai/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.mistral.ai",
  },
  groq: {
    apiUrl: "https://api.groq.com/openai/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.groq.com",
  },
  deepseek: {
    apiUrl: "https://api.deepseek.com/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.deepseek.com",
  },
  perplexity: {
    apiUrl: "https://api.perplexity.ai",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.perplexity.ai",
  },
  together_ai: {
    apiUrl: "https://api.together.xyz/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.together.xyz",
  },
  openrouter: {
    apiUrl: "https://openrouter.ai/api/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "openrouter.ai",
  },
  huggingface: {
    apiUrl: "https://api-inference.huggingface.co",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api-inference.huggingface.co",
  },
  "hugging-face-inference": {
    apiUrl: "https://api-inference.huggingface.co",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api-inference.huggingface.co",
  },
  replicate: {
    apiUrl: "https://api.replicate.com/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.replicate.com",
  },
  "replicate-model-hosting": {
    apiUrl: "https://api.replicate.com/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.replicate.com",
  },
  pinecone: {
    apiUrl: "https://api.pinecone.io",
    headerName: "Api-Key",
    allowedDomains: "api.pinecone.io",
  },
  "pinecone-vector-database": {
    apiUrl: "https://api.pinecone.io",
    headerName: "Api-Key",
    allowedDomains: "api.pinecone.io",
  },
  qdrant: {
    apiUrl: "https://xyz-example.eu-central.aws.cloud.qdrant.io:6333",
    headerName: "api-key",
  },
  "qdrant-vector-search": {
    apiUrl: "https://xyz-example.eu-central.aws.cloud.qdrant.io:6333",
    headerName: "api-key",
  },
  weaviate: {
    apiUrl: "https://your-cluster.weaviate.network/v1",
    headerName: "X-Weaviate-Api-Key",
  },
  "weaviate-vector-engine": {
    apiUrl: "https://your-cluster.weaviate.network/v1",
    headerName: "X-Weaviate-Api-Key",
  },
  chroma_db: {
    apiUrl: "http://localhost:8000/api/v1",
    headerName: "X-Chroma-Token",
  },
  "chroma-vector-database": {
    apiUrl: "http://localhost:8000/api/v1",
    headerName: "X-Chroma-Token",
  },
  elevenlabs: {
    apiUrl: "https://api.elevenlabs.io/v1",
    headerName: "xi-api-key",
    allowedDomains: "api.elevenlabs.io",
  },
  "elevenlabs-ai-voice": {
    apiUrl: "https://api.elevenlabs.io/v1",
    headerName: "xi-api-key",
    allowedDomains: "api.elevenlabs.io",
  },
  runway: {
    apiUrl: "https://api.dev.runwayml.com/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.dev.runwayml.com",
  },
  stability_ai: {
    apiUrl: "https://api.stability.ai/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.stability.ai",
  },

  // ═══════════════════════════════════════════
  // Developer Tools, Git & CI/CD
  // ═══════════════════════════════════════════
  github: {
    apiUrl: "https://api.github.com",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: "repo,read:user,user:email",
    allowedDomains: "api.github.com",
  },
  "github-api": {
    apiUrl: "https://api.github.com",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: "repo,read:user,user:email",
    allowedDomains: "api.github.com",
  },
  gitlab: {
    apiUrl: "https://gitlab.com/api/v4",
    headerName: "PRIVATE-TOKEN",
    authUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    scopes: "api,read_user,read_repository,write_repository",
    allowedDomains: "gitlab.com",
  },
  "gitlab-api": {
    apiUrl: "https://gitlab.com/api/v4",
    headerName: "PRIVATE-TOKEN",
    authUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    scopes: "api,read_user,read_repository,write_repository",
    allowedDomains: "gitlab.com",
  },
  bitbucket: {
    apiUrl: "https://api.bitbucket.org/2.0",
    authUrl: "https://bitbucket.org/site/oauth2/authorize",
    tokenUrl: "https://bitbucket.org/site/oauth2/access_token",
    scopes: "repository,account",
    allowedDomains: "api.bitbucket.org",
  },
  linear: {
    apiUrl: "https://api.linear.app/graphql",
    headerName: "Authorization",
    authUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    scopes: "read,write,issues:create,comments:create",
    allowedDomains: "api.linear.app",
  },
  jira: {
    apiUrl: "https://your-domain.atlassian.net/rest/api/3",
    authUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    scopes: "read:jira-work,write:jira-work,read:jira-user,offline_access",
  },
  confluence: {
    apiUrl: "https://your-domain.atlassian.net/wiki/rest/api",
    authUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    scopes: "read:confluence-space,read:confluence-content.all,write:confluence-content,offline_access",
  },
  sentry: {
    apiUrl: "https://sentry.io/api/0",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "sentry.io",
  },
  postman: {
    apiUrl: "https://api.getpostman.com",
    headerName: "X-Api-Key",
    allowedDomains: "api.getpostman.com",
  },
  circleci: {
    apiUrl: "https://circleci.com/api/v2",
    headerName: "Circle-Token",
    allowedDomains: "circleci.com",
  },
  dockerhub: {
    apiUrl: "https://hub.docker.com/v2",
    allowedDomains: "hub.docker.com",
  },
  datadog: {
    apiUrl: "https://api.datadoghq.com/api/v1",
    headerName: "DD-API-KEY",
    allowedDomains: "api.datadoghq.com",
  },
  newrelic: {
    apiUrl: "https://api.newrelic.com/v2",
    headerName: "Api-Key",
    allowedDomains: "api.newrelic.com",
  },

  // ═══════════════════════════════════════════
  // Communication & Messaging
  // ═══════════════════════════════════════════
  slack: {
    apiUrl: "https://slack.com/api",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: "chat:write,channels:read,channels:history,users:read,files:write",
    allowedDomains: "slack.com",
  },
  "slack-api": {
    apiUrl: "https://slack.com/api",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: "chat:write,channels:read,channels:history,users:read,files:write",
    allowedDomains: "slack.com",
  },
  discord: {
    apiUrl: "https://discord.com/api/v10",
    headerName: "Authorization",
    headerValuePrefix: "Bot ",
    authUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scopes: "bot,messages.read,identify",
    allowedDomains: "discord.com",
  },
  "discord-api": {
    apiUrl: "https://discord.com/api/v10",
    headerName: "Authorization",
    headerValuePrefix: "Bot ",
    authUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scopes: "bot,messages.read,identify",
    allowedDomains: "discord.com",
  },
  telegram: {
    apiUrl: "https://api.telegram.org/bot<token>",
    headerName: "Authorization",
    allowedDomains: "api.telegram.org",
  },
  "telegram-bot-api": {
    apiUrl: "https://api.telegram.org/bot<token>",
    headerName: "Authorization",
    allowedDomains: "api.telegram.org",
  },
  twilio: {
    apiUrl: "https://api.twilio.com/2010-04-01",
    allowedDomains: "api.twilio.com",
  },
  "twilio-api": {
    apiUrl: "https://api.twilio.com/2010-04-01",
    allowedDomains: "api.twilio.com",
  },
  sendgrid: {
    apiUrl: "https://api.sendgrid.com/v3",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.sendgrid.com",
  },
  "sendgrid-api": {
    apiUrl: "https://api.sendgrid.com/v3",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.sendgrid.com",
  },
  resend: {
    apiUrl: "https://api.resend.com",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.resend.com",
  },
  postmark: {
    apiUrl: "https://api.postmarkapp.com",
    headerName: "X-Postmark-Server-Token",
    allowedDomains: "api.postmarkapp.com",
  },
  mailgun: {
    apiUrl: "https://api.mailgun.net/v3",
    allowedDomains: "api.mailgun.net",
  },
  brevo: {
    apiUrl: "https://api.brevo.com/v3",
    headerName: "api-key",
    allowedDomains: "api.brevo.com",
  },

  // ═══════════════════════════════════════════
  // Productivity & Workspace
  // ═══════════════════════════════════════════
  notion: {
    apiUrl: "https://api.notion.com/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    allowedDomains: "api.notion.com",
  },
  "notion-api": {
    apiUrl: "https://api.notion.com/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    allowedDomains: "api.notion.com",
  },
  airtable: {
    apiUrl: "https://api.airtable.com/v0",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    authUrl: "https://airtable.com/oauth2/v1/authorize",
    tokenUrl: "https://airtable.com/oauth2/v1/token",
    scopes: "data.records:read,data.records:write,schema.bases:read",
    allowedDomains: "api.airtable.com",
  },
  "airtable-api": {
    apiUrl: "https://api.airtable.com/v0",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    authUrl: "https://airtable.com/oauth2/v1/authorize",
    tokenUrl: "https://airtable.com/oauth2/v1/token",
    scopes: "data.records:read,data.records:write,schema.bases:read",
    allowedDomains: "api.airtable.com",
  },
  asana: {
    apiUrl: "https://app.asana.com/api/1.0",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    authUrl: "https://app.asana.com/-/oauth_authorize",
    tokenUrl: "https://app.asana.com/-/oauth_token",
    scopes: "default",
    allowedDomains: "app.asana.com",
  },
  clickup: {
    apiUrl: "https://api.clickup.com/api/v2",
    headerName: "Authorization",
    authUrl: "https://app.clickup.com/api",
    tokenUrl: "https://api.clickup.com/api/v2/oauth/token",
    allowedDomains: "api.clickup.com",
  },
  trello: {
    apiUrl: "https://api.trello.com/1",
    paramName: "key",
    authUrl: "https://trello.com/1/authorize",
    allowedDomains: "api.trello.com",
  },
  monday: {
    apiUrl: "https://api.monday.com/v2",
    headerName: "Authorization",
    authUrl: "https://auth.monday.com/oauth2/authorize",
    tokenUrl: "https://auth.monday.com/oauth2/token",
    scopes: "me:read,boards:read,boards:write,updates:read,updates:write",
    allowedDomains: "api.monday.com",
  },
  coda: {
    apiUrl: "https://coda.io/apis/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "coda.io",
  },
  google_drive: {
    apiUrl: "https://www.googleapis.com/drive/v3",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly",
    allowedDomains: "www.googleapis.com",
  },
  google_sheets: {
    apiUrl: "https://sheets.googleapis.com/v4/spreadsheets",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
    allowedDomains: "sheets.googleapis.com",
  },
  google_calendar: {
    apiUrl: "https://www.googleapis.com/calendar/v3",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
    allowedDomains: "www.googleapis.com",
  },
  google_docs: {
    apiUrl: "https://docs.googleapis.com/v1/documents",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: "https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.file",
    allowedDomains: "docs.googleapis.com",
  },
  gmail: {
    apiUrl: "https://gmail.googleapis.com/gmail/v1/users/me",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify",
    allowedDomains: "gmail.googleapis.com",
  },
  google_oauth2: {
    apiUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: "openid email profile",
    allowedDomains: "accounts.google.com,www.googleapis.com",
  },
  "google-oauth2": {
    apiUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: "openid email profile",
    allowedDomains: "accounts.google.com,www.googleapis.com",
  },
  "google-oauth2-api": {
    apiUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: "openid email profile",
    allowedDomains: "accounts.google.com,www.googleapis.com",
  },

  // ═══════════════════════════════════════════
  // CRM & Sales
  // ═══════════════════════════════════════════
  hubspot: {
    apiUrl: "https://api.hubapi.com",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    authUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scopes: "crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.deals.read crm.objects.deals.write",
    allowedDomains: "api.hubapi.com",
  },
  "hubspot-api": {
    apiUrl: "https://api.hubapi.com",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    authUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scopes: "crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.deals.read crm.objects.deals.write",
    allowedDomains: "api.hubapi.com",
  },
  salesforce: {
    apiUrl: "https://your-instance.my.salesforce.com/services/data/v59.0",
    authUrl: "https://login.salesforce.com/services/oauth2/authorize",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    scopes: "api,refresh_token,offline_access",
  },
  "salesforce-api": {
    apiUrl: "https://your-instance.my.salesforce.com/services/data/v59.0",
    authUrl: "https://login.salesforce.com/services/oauth2/authorize",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    scopes: "api,refresh_token,offline_access",
  },
  pipedrive: {
    apiUrl: "https://api.pipedrive.com/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    paramName: "api_token",
    authUrl: "https://oauth.pipedrive.com/oauth/authorize",
    tokenUrl: "https://oauth.pipedrive.com/oauth/token",
    scopes: "deals:full,contacts:full,activities:full",
    allowedDomains: "api.pipedrive.com",
  },
  activecampaign: {
    apiUrl: "https://your-account.api-us1.com/api/3",
    headerName: "Api-Token",
  },
  "activecampaign-api": {
    apiUrl: "https://your-account.api-us1.com/api/3",
    headerName: "Api-Token",
  },
  intercom: {
    apiUrl: "https://api.intercom.io",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    authUrl: "https://app.intercom.com/oauth",
    tokenUrl: "https://api.intercom.io/auth/eagle/token",
    allowedDomains: "api.intercom.io",
  },
  zendesk: {
    apiUrl: "https://your-subdomain.zendesk.com/api/v2",
    authUrl: "https://your-subdomain.zendesk.com/oauth/authorizations/new",
    tokenUrl: "https://your-subdomain.zendesk.com/oauth/tokens",
    scopes: "read write",
  },

  // ═══════════════════════════════════════════
  // Payments & Commerce
  // ═══════════════════════════════════════════
  stripe: {
    apiUrl: "https://api.stripe.com/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.stripe.com",
  },
  "stripe-api": {
    apiUrl: "https://api.stripe.com/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.stripe.com",
  },
  paypal: {
    apiUrl: "https://api-m.paypal.com/v1",
    authUrl: "https://www.paypal.com/signin/authorize",
    tokenUrl: "https://api-m.paypal.com/v1/oauth2/token",
    allowedDomains: "api-m.paypal.com",
  },
  shopify: {
    apiUrl: "https://your-store.myshopify.com/admin/api/2024-01",
    headerName: "X-Shopify-Access-Token",
    authUrl: "https://your-store.myshopify.com/admin/oauth/authorize",
    tokenUrl: "https://your-store.myshopify.com/admin/oauth/access_token",
    scopes: "read_products,write_products,read_orders,write_orders,read_customers",
  },
  square: {
    apiUrl: "https://connect.squareup.com/v2",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    authUrl: "https://connect.squareup.com/oauth2/authorize",
    tokenUrl: "https://connect.squareup.com/oauth2/token",
    scopes: "MERCHANT_PROFILE_READ,PAYMENTS_READ,PAYMENTS_WRITE,ORDERS_READ,ORDERS_WRITE",
    allowedDomains: "connect.squareup.com",
  },
  paddle: {
    apiUrl: "https://api.paddle.com",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.paddle.com",
  },
  chargebee: {
    apiUrl: "https://your-site.chargebee.com/api/v2",
    headerName: "Authorization",
  },

  // ═══════════════════════════════════════════
  // Cloud Infrastructure & Hosting
  // ═══════════════════════════════════════════
  aws: {
    apiUrl: "https://amazonaws.com",
    region: "us-east-1",
  },
  "aws-iam": {
    apiUrl: "https://amazonaws.com",
    region: "us-east-1",
  },
  cloudflare: {
    apiUrl: "https://api.cloudflare.com/client/v4",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.cloudflare.com",
  },
  vercel: {
    apiUrl: "https://api.vercel.com/v9",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.vercel.com",
  },
  supabase: {
    apiUrl: "https://your-project.supabase.co/rest/v1",
    headerName: "apikey",
  },
  firebase: {
    apiUrl: "https://firestore.googleapis.com/v1/projects/your-project/databases/(default)/documents",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase",
  },
  digitalocean: {
    apiUrl: "https://api.digitalocean.com/v2",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    authUrl: "https://cloud.digitalocean.com/v1/oauth/authorize",
    tokenUrl: "https://cloud.digitalocean.com/v1/oauth/token",
    scopes: "read write",
    allowedDomains: "api.digitalocean.com",
  },
  hetzner: {
    apiUrl: "https://api.hetzner.cloud/v1",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
    allowedDomains: "api.hetzner.cloud",
  },

  // ═══════════════════════════════════════════
  // Model Context Protocol (MCP) & AI Agents
  // ═══════════════════════════════════════════
  mcp_generic: {
    mcpServerUrl: "http://localhost:3000/mcp/http",
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
  },
  composio: {
    apiUrl: "https://backend.composio.dev/api/v1",
    mcpServerUrl: "https://backend.composio.dev/mcp",
    headerName: "x-api-key",
    allowedDomains: "backend.composio.dev",
  },
  "composio-mcp-oauth2": {
    apiUrl: "https://backend.composio.dev/api/v1",
    mcpServerUrl: "https://backend.composio.dev/mcp",
    headerName: "x-api-key",
    authUrl: "https://backend.composio.dev/oauth/authorize",
    tokenUrl: "https://backend.composio.dev/oauth/token",
  },
  "github-mcp-oauth2": {
    apiUrl: "https://api.github.com",
    mcpServerUrl: "https://api.github.com/mcp",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: "repo,read:user",
  },
  "slack-mcp-oauth2": {
    apiUrl: "https://slack.com/api",
    mcpServerUrl: "https://slack.com/api/mcp",
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: "chat:write,channels:read",
  },
  "notion-mcp-oauth2": {
    apiUrl: "https://api.notion.com/v1",
    mcpServerUrl: "https://api.notion.com/mcp",
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
  },
  "airtable-mcp-oauth2": {
    apiUrl: "https://api.airtable.com/v0",
    mcpServerUrl: "https://api.airtable.com/mcp",
    authUrl: "https://airtable.com/oauth2/v1/authorize",
    tokenUrl: "https://airtable.com/oauth2/v1/token",
  },

  // ═══════════════════════════════════════════
  // Databases & Caching Engines
  // ═══════════════════════════════════════════
  postgres: {
    apiUrl: "postgresql://user:password@localhost:5432/database?sslmode=prefer",
    databasePort: "5432",
  },
  mysql: {
    apiUrl: "mysql://user:password@localhost:3306/database",
    databasePort: "3306",
  },
  redis: {
    apiUrl: "redis://default:password@localhost:6379",
    databasePort: "6379",
  },
  mongodb: {
    apiUrl: "mongodb+srv://user:password@cluster.mongodb.net/database?retryWrites=true&w=majority",
    databasePort: "27017",
  },
  elasticsearch: {
    apiUrl: "https://localhost:9200",
    headerName: "Authorization",
    headerValuePrefix: "ApiKey ",
  },
};

/**
 * Normalizes any provider name/id into a lookup key
 */
function normalizeKey(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Derives official Base URL and authentication scheme details for any provider name or id.
 */
export function resolveProviderDefaults(providerNameOrId: string): ProviderAuthDefaults {
  if (!providerNameOrId) return {};

  const raw = providerNameOrId.trim();
  const lower = raw.toLowerCase();
  const stripped = lower.replace(/[^a-z0-9]/g, "");
  const normalized = normalizeKey(raw);
  const dashed = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // 1. Direct exact key match
  if (OFFICIAL_PROVIDER_DEFAULTS[raw]) return OFFICIAL_PROVIDER_DEFAULTS[raw];
  if (OFFICIAL_PROVIDER_DEFAULTS[lower]) return OFFICIAL_PROVIDER_DEFAULTS[lower];
  if (OFFICIAL_PROVIDER_DEFAULTS[normalized]) return OFFICIAL_PROVIDER_DEFAULTS[normalized];
  if (OFFICIAL_PROVIDER_DEFAULTS[dashed]) return OFFICIAL_PROVIDER_DEFAULTS[dashed];
  if (OFFICIAL_PROVIDER_DEFAULTS[stripped]) return OFFICIAL_PROVIDER_DEFAULTS[stripped];

  // 2. Pattern and substring matches for popular platforms
  if (stripped.includes("openai") || stripped.includes("chatgpt")) {
    return OFFICIAL_PROVIDER_DEFAULTS.openai;
  }
  if (stripped.includes("anthropic") || stripped.includes("claude")) {
    return OFFICIAL_PROVIDER_DEFAULTS.anthropic;
  }
  if (stripped.includes("gemini") || lower.includes("google ai")) {
    return OFFICIAL_PROVIDER_DEFAULTS.google_gemini;
  }
  if (stripped.includes("google") && (lower.includes("oauth") || lower.includes("auth"))) {
    return OFFICIAL_PROVIDER_DEFAULTS.google_oauth2;
  }
  if (lower.includes("mistral")) {
    return OFFICIAL_PROVIDER_DEFAULTS.mistral_ai;
  }
  if (lower.includes("cohere")) {
    return OFFICIAL_PROVIDER_DEFAULTS.cohere;
  }
  if (lower.includes("groq")) {
    return OFFICIAL_PROVIDER_DEFAULTS.groq;
  }
  if (lower.includes("deepseek")) {
    return OFFICIAL_PROVIDER_DEFAULTS.deepseek;
  }
  if (lower.includes("perplexity")) {
    return OFFICIAL_PROVIDER_DEFAULTS.perplexity;
  }
  if (lower.includes("together")) {
    return OFFICIAL_PROVIDER_DEFAULTS.together_ai;
  }
  if (lower.includes("openrouter")) {
    return OFFICIAL_PROVIDER_DEFAULTS.openrouter;
  }
  if (lower.includes("huggingface") || lower.includes("hugging face")) {
    return OFFICIAL_PROVIDER_DEFAULTS.huggingface;
  }
  if (lower.includes("replicate")) {
    return OFFICIAL_PROVIDER_DEFAULTS.replicate;
  }
  if (lower.includes("pinecone")) {
    return OFFICIAL_PROVIDER_DEFAULTS.pinecone;
  }
  if (lower.includes("qdrant")) {
    return OFFICIAL_PROVIDER_DEFAULTS.qdrant;
  }
  if (lower.includes("weaviate")) {
    return OFFICIAL_PROVIDER_DEFAULTS.weaviate;
  }
  if (lower.includes("chroma")) {
    return OFFICIAL_PROVIDER_DEFAULTS.chroma_db;
  }
  if (lower.includes("elevenlabs") || lower.includes("eleven labs")) {
    return OFFICIAL_PROVIDER_DEFAULTS.elevenlabs;
  }
  if (lower.includes("github")) {
    return lower.includes("mcp") ? OFFICIAL_PROVIDER_DEFAULTS["github-mcp-oauth2"] : OFFICIAL_PROVIDER_DEFAULTS.github;
  }
  if (lower.includes("gitlab")) {
    return OFFICIAL_PROVIDER_DEFAULTS.gitlab;
  }
  if (lower.includes("bitbucket")) {
    return OFFICIAL_PROVIDER_DEFAULTS.bitbucket;
  }
  if (lower.includes("linear")) {
    return OFFICIAL_PROVIDER_DEFAULTS.linear;
  }
  if (lower.includes("jira")) {
    return OFFICIAL_PROVIDER_DEFAULTS.jira;
  }
  if (lower.includes("confluence")) {
    return OFFICIAL_PROVIDER_DEFAULTS.confluence;
  }
  if (lower.includes("sentry")) {
    return OFFICIAL_PROVIDER_DEFAULTS.sentry;
  }
  if (lower.includes("postman")) {
    return OFFICIAL_PROVIDER_DEFAULTS.postman;
  }
  if (lower.includes("slack")) {
    return lower.includes("mcp") ? OFFICIAL_PROVIDER_DEFAULTS["slack-mcp-oauth2"] : OFFICIAL_PROVIDER_DEFAULTS.slack;
  }
  if (lower.includes("discord")) {
    return OFFICIAL_PROVIDER_DEFAULTS.discord;
  }
  if (lower.includes("telegram")) {
    return OFFICIAL_PROVIDER_DEFAULTS.telegram;
  }
  if (lower.includes("twilio")) {
    return OFFICIAL_PROVIDER_DEFAULTS.twilio;
  }
  if (lower.includes("sendgrid")) {
    return OFFICIAL_PROVIDER_DEFAULTS.sendgrid;
  }
  if (lower.includes("resend")) {
    return OFFICIAL_PROVIDER_DEFAULTS.resend;
  }
  if (lower.includes("postmark")) {
    return OFFICIAL_PROVIDER_DEFAULTS.postmark;
  }
  if (lower.includes("mailgun")) {
    return OFFICIAL_PROVIDER_DEFAULTS.mailgun;
  }
  if (lower.includes("brevo") || lower.includes("sendinblue")) {
    return OFFICIAL_PROVIDER_DEFAULTS.brevo;
  }
  if (lower.includes("notion")) {
    return lower.includes("mcp") ? OFFICIAL_PROVIDER_DEFAULTS["notion-mcp-oauth2"] : OFFICIAL_PROVIDER_DEFAULTS.notion;
  }
  if (lower.includes("airtable")) {
    return lower.includes("mcp") ? OFFICIAL_PROVIDER_DEFAULTS["airtable-mcp-oauth2"] : OFFICIAL_PROVIDER_DEFAULTS.airtable;
  }
  if (lower.includes("asana")) {
    return OFFICIAL_PROVIDER_DEFAULTS.asana;
  }
  if (lower.includes("clickup")) {
    return OFFICIAL_PROVIDER_DEFAULTS.clickup;
  }
  if (lower.includes("trello")) {
    return OFFICIAL_PROVIDER_DEFAULTS.trello;
  }
  if (lower.includes("monday")) {
    return OFFICIAL_PROVIDER_DEFAULTS.monday;
  }
  if (lower.includes("coda")) {
    return OFFICIAL_PROVIDER_DEFAULTS.coda;
  }
  if (lower.includes("google drive") || lower.includes("googledrive")) {
    return OFFICIAL_PROVIDER_DEFAULTS.google_drive;
  }
  if (lower.includes("google sheets") || lower.includes("googlesheets")) {
    return OFFICIAL_PROVIDER_DEFAULTS.google_sheets;
  }
  if (lower.includes("google calendar") || lower.includes("googlecalendar")) {
    return OFFICIAL_PROVIDER_DEFAULTS.google_calendar;
  }
  if (lower.includes("google docs") || lower.includes("googledocs")) {
    return OFFICIAL_PROVIDER_DEFAULTS.google_docs;
  }
  if (lower.includes("gmail")) {
    return OFFICIAL_PROVIDER_DEFAULTS.gmail;
  }
  if (lower.includes("hubspot")) {
    return OFFICIAL_PROVIDER_DEFAULTS.hubspot;
  }
  if (lower.includes("salesforce")) {
    return OFFICIAL_PROVIDER_DEFAULTS.salesforce;
  }
  if (lower.includes("pipedrive")) {
    return OFFICIAL_PROVIDER_DEFAULTS.pipedrive;
  }
  if (lower.includes("activecampaign")) {
    return OFFICIAL_PROVIDER_DEFAULTS.activecampaign;
  }
  if (lower.includes("intercom")) {
    return OFFICIAL_PROVIDER_DEFAULTS.intercom;
  }
  if (lower.includes("zendesk")) {
    return OFFICIAL_PROVIDER_DEFAULTS.zendesk;
  }
  if (lower.includes("stripe")) {
    return OFFICIAL_PROVIDER_DEFAULTS.stripe;
  }
  if (lower.includes("paypal")) {
    return OFFICIAL_PROVIDER_DEFAULTS.paypal;
  }
  if (lower.includes("shopify")) {
    return OFFICIAL_PROVIDER_DEFAULTS.shopify;
  }
  if (lower.includes("square")) {
    return OFFICIAL_PROVIDER_DEFAULTS.square;
  }
  if (lower.includes("paddle")) {
    return OFFICIAL_PROVIDER_DEFAULTS.paddle;
  }
  if (lower.includes("chargebee")) {
    return OFFICIAL_PROVIDER_DEFAULTS.chargebee;
  }
  if (lower.includes("cloudflare")) {
    return OFFICIAL_PROVIDER_DEFAULTS.cloudflare;
  }
  if (lower.includes("vercel")) {
    return OFFICIAL_PROVIDER_DEFAULTS.vercel;
  }
  if (lower.includes("supabase")) {
    return OFFICIAL_PROVIDER_DEFAULTS.supabase;
  }
  if (lower.includes("firebase") || lower.includes("firestore")) {
    return OFFICIAL_PROVIDER_DEFAULTS.firebase;
  }
  if (lower.includes("digitalocean") || lower.includes("digital ocean")) {
    return OFFICIAL_PROVIDER_DEFAULTS.digitalocean;
  }
  if (lower.includes("hetzner")) {
    return OFFICIAL_PROVIDER_DEFAULTS.hetzner;
  }
  if (lower.includes("composio")) {
    return OFFICIAL_PROVIDER_DEFAULTS.composio;
  }
  if (lower.includes("postgres")) {
    return OFFICIAL_PROVIDER_DEFAULTS.postgres;
  }
  if (lower.includes("mysql") || lower.includes("mariadb")) {
    return OFFICIAL_PROVIDER_DEFAULTS.mysql;
  }
  if (lower.includes("redis") || lower.includes("valkey") || lower.includes("upstash")) {
    return OFFICIAL_PROVIDER_DEFAULTS.redis;
  }
  if (lower.includes("mongo")) {
    return OFFICIAL_PROVIDER_DEFAULTS.mongodb;
  }
  if (lower.includes("elastic")) {
    return OFFICIAL_PROVIDER_DEFAULTS.elasticsearch;
  }

  // 3. Fallback derivation for MCP or generic APIs
  if (lower.includes("mcp")) {
    return {
      mcpServerUrl: `https://mcp.${normalized.replace(/_mcp.*$/, "")}.com/mcp/http`,
      headerName: "Authorization",
      headerValuePrefix: "Bearer ",
    };
  }

  return {
    apiUrl: `https://api.${normalized.replace(/_api.*$/, "")}.com`,
    headerName: "Authorization",
    headerValuePrefix: "Bearer ",
  };
}
