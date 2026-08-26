import type { CredentialBucket, ProviderSpec } from "./types.js";
import { BUCKET_DEFINITIONS } from "./buckets.js";

/**
 * AgentFlow Vault Provider Catalog
 * Comprehensive registry of 510+ pre-configured third-party service providers,
 * each mapped to its authentication bucket, sensitive fields, and default parameters.
 */
export const PROVIDER_CATALOG_DATA: Omit<ProviderSpec, "fields">[] = [
  {
    "id": "openai",
    "name": "OpenAI API",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://platform.openai.com/docs"
  },
  {
    "id": "anthropic",
    "name": "Anthropic Claude",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.anthropic.com"
  },
  {
    "id": "google_gemini",
    "name": "Google Gemini AI",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://ai.google.dev"
  },
  {
    "id": "cohere",
    "name": "Cohere LLM Platform",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.cohere.com"
  },
  {
    "id": "mistral_ai",
    "name": "Mistral AI",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.mistral.ai"
  },
  {
    "id": "huggingface",
    "name": "Hugging Face Inference",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://huggingface.co/docs"
  },
  {
    "id": "replicate",
    "name": "Replicate Model Hosting",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://replicate.com/docs"
  },
  {
    "id": "pinecone",
    "name": "Pinecone Vector Database",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.pinecone.io"
  },
  {
    "id": "qdrant",
    "name": "Qdrant Vector Search",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://qdrant.tech/documentation"
  },
  {
    "id": "weaviate",
    "name": "Weaviate Vector Engine",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://weaviate.io/developers/weaviate"
  },
  {
    "id": "chroma_db",
    "name": "Chroma Vector Database",
    "bucket": "header_auth",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.trychroma.com"
  },
  {
    "id": "elevenlabs",
    "name": "ElevenLabs AI Voice",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://elevenlabs.io/docs"
  },
  {
    "id": "deepgram",
    "name": "Deepgram Automated Speech Recognition",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://developers.deepgram.com"
  },
  {
    "id": "together_ai",
    "name": "Together AI GPU Compute",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.together.ai"
  },
  {
    "id": "groq",
    "name": "Groq Ultra-Fast LPU",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://console.groq.com/docs"
  },
  {
    "id": "perplexity",
    "name": "Perplexity AI Search & Sonar",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.perplexity.ai"
  },
  {
    "id": "runpod",
    "name": "RunPod AI GPU Pods",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.runpod.io"
  },
  {
    "id": "stability_ai",
    "name": "Stability AI Image Generation",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://platform.stability.ai/docs"
  },
  {
    "id": "fireworks_ai",
    "name": "Fireworks AI Fast Inference",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.fireworks.ai"
  },
  {
    "id": "anyscale",
    "name": "Anyscale Ray Platform",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.endpoints.anyscale.com"
  },
  {
    "id": "octoai",
    "name": "OctoAI Efficient Models",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.octoai.cloud"
  },
  {
    "id": "deepinfra",
    "name": "Deep Infra Open Source Models",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://deepinfra.com/docs"
  },
  {
    "id": "voyage_ai",
    "name": "Voyage AI High-Accuracy Embeddings",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.voyageai.com"
  },
  {
    "id": "assemblyai",
    "name": "AssemblyAI Speech-to-Text",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://www.assemblyai.com/docs"
  },
  {
    "id": "openrouter",
    "name": "OpenRouter Multi-LLM Gateway",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://openrouter.ai/docs"
  },
  {
    "id": "langchain_smith",
    "name": "LangSmith LLM Tracing",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.smith.langchain.com"
  },
  {
    "id": "helicone",
    "name": "Helicone LLM Observability",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.helicone.ai"
  },
  {
    "id": "langfuse",
    "name": "Langfuse Open LLM Engineering",
    "bucket": "basic_auth",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://langfuse.com/docs"
  },
  {
    "id": "braintrust",
    "name": "Braintrust AI Evaluations",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://www.braintrust.dev/docs"
  },
  {
    "id": "modal_labs",
    "name": "Modal Labs Serverless Cloud",
    "bucket": "basic_auth",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://modal.com/docs"
  },
  {
    "id": "cerebras",
    "name": "Cerebras Fast Inference",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://inference-docs.cerebras.net"
  },
  {
    "id": "sambanova",
    "name": "SambaNova Systems SN40L",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://community.sambanova.ai"
  },
  {
    "id": "fal_ai",
    "name": "fal.ai Generative Media APIs",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://fal.ai/docs"
  },
  {
    "id": "midjourney_proxy",
    "name": "Midjourney Proxy API",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.midjourney.com"
  },
  {
    "id": "tripo3d",
    "name": "Tripo3D Generative 3D Mesh",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://platform.tripo3d.ai"
  },
  {
    "id": "meshy_ai",
    "name": "Meshy AI 3D Model Generation",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.meshy.ai"
  },
  {
    "id": "hyperbolic",
    "name": "Hyperbolic Decentralized GPU AI",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.hyperbolic.xyz"
  },
  {
    "id": "novita_ai",
    "name": "Novita AI Serverless LLM",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://novita.ai/docs"
  },
  {
    "id": "monsterapi",
    "name": "MonsterAPI Fine-Tuning & Deploy",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://monsterapi.ai/docs"
  },
  {
    "id": "baseten",
    "name": "Baseten Model Deployment",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.baseten.co"
  },
  {
    "id": "lepton_ai",
    "name": "Lepton AI Cloud",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://www.lepton.ai/docs"
  },
  {
    "id": "deepseek",
    "name": "DeepSeek Coder & V3",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://platform.deepseek.com/api-docs"
  },
  {
    "id": "writer_ai",
    "name": "Writer Palmyra LLM Platform",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://dev.writer.com"
  },
  {
    "id": "ai21_labs",
    "name": "AI21 Labs Jamba & Jurassic",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.ai21.com"
  },
  {
    "id": "aleph_alpha",
    "name": "Aleph Alpha Luminous",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.aleph-alpha.com"
  },
  {
    "id": "cloudflare_ai",
    "name": "Cloudflare Workers AI",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://developers.cloudflare.com/workers-ai"
  },
  {
    "id": "aws_bedrock",
    "name": "AWS Bedrock Foundation Models",
    "bucket": "basic_auth",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.aws.amazon.com/bedrock"
  },
  {
    "id": "azure_openai",
    "name": "Azure OpenAI Service",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://learn.microsoft.com/en-us/azure/ai-services/openai"
  },
  {
    "id": "vertex_ai",
    "name": "Google Cloud Vertex AI",
    "bucket": "oauth2_managed",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://cloud.google.com/vertex-ai/docs"
  },
  {
    "id": "play_ht",
    "name": "PlayHT Conversational Voice",
    "bucket": "header_auth",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.play.ht"
  },
  {
    "id": "cartesia",
    "name": "Cartesia Sonic Ultra-Low Latency Voice",
    "bucket": "header_auth",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.cartesia.ai"
  },
  {
    "id": "tavus",
    "name": "Tavus Generative Video Replica",
    "bucket": "header_auth",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.tavus.io"
  },
  {
    "id": "synthesia",
    "name": "Synthesia AI Video Avatars",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.synthesia.io"
  },
  {
    "id": "heygen",
    "name": "HeyGen AI Video Generation",
    "bucket": "header_auth",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.heygen.com"
  },
  {
    "id": "d-id",
    "name": "D-ID Real-Time Facial Animation",
    "bucket": "basic_auth",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.d-id.com"
  },
  {
    "id": "runwayml",
    "name": "Runway Gen-3 Video",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.runwayml.com"
  },
  {
    "id": "luma_ai",
    "name": "Luma Dream Machine API",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://lumalabs.ai/dream-machine/api"
  },
  {
    "id": "kling_ai",
    "name": "Kling AI Video Studio",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://klingai.com"
  },
  {
    "id": "minimax",
    "name": "MiniMax Hailuo Video & Audio",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://api.minimax.chat"
  },
  {
    "id": "stepfun",
    "name": "StepFun Step-2 LLM",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://platform.stepfun.com"
  },
  {
    "id": "salesforce",
    "name": "Salesforce CRM",
    "bucket": "oauth2_managed",
    "category": "CRM & Sales",
    "documentationUrl": "https://developer.salesforce.com"
  },
  {
    "id": "hubspot",
    "name": "HubSpot CRM & Marketing",
    "bucket": "oauth2_managed",
    "category": "CRM & Sales",
    "documentationUrl": "https://developers.hubspot.com"
  },
  {
    "id": "activecampaign",
    "name": "ActiveCampaign API",
    "bucket": "api_key",
    "category": "CRM & Sales",
    "documentationUrl": "https://developers.activecampaign.com"
  },
  {
    "id": "pipedrive",
    "name": "Pipedrive CRM",
    "bucket": "oauth2_managed",
    "category": "CRM & Sales",
    "documentationUrl": "https://developers.pipedrive.com"
  },
  {
    "id": "close_crm",
    "name": "Close CRM",
    "bucket": "api_key",
    "category": "CRM & Sales",
    "documentationUrl": "https://developer.close.com"
  },
  {
    "id": "zoho_crm",
    "name": "Zoho CRM",
    "bucket": "oauth2_managed",
    "category": "CRM & Sales",
    "documentationUrl": "https://www.zoho.com/crm/developer/docs"
  },
  {
    "id": "copper_crm",
    "name": "Copper Google Workspace CRM",
    "bucket": "header_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://developer.copper.com"
  },
  {
    "id": "freshsales",
    "name": "Freshsales Suite",
    "bucket": "api_key",
    "category": "CRM & Sales",
    "documentationUrl": "https://crmsupport.freshworks.com"
  },
  {
    "id": "attio",
    "name": "Attio Data-Driven CRM",
    "bucket": "bearer_token",
    "category": "CRM & Sales",
    "documentationUrl": "https://attio.com/docs"
  },
  {
    "id": "folk_crm",
    "name": "Folk Intelligent CRM",
    "bucket": "api_key",
    "category": "CRM & Sales",
    "documentationUrl": "https://folk.app"
  },
  {
    "id": "outreach",
    "name": "Outreach Sales Execution",
    "bucket": "oauth2_managed",
    "category": "CRM & Sales",
    "documentationUrl": "https://api.outreach.io"
  },
  {
    "id": "salesloft",
    "name": "Salesloft Revenue Orchestration",
    "bucket": "oauth2_managed",
    "category": "CRM & Sales",
    "documentationUrl": "https://developer.salesloft.com"
  },
  {
    "id": "apollo_io",
    "name": "Apollo.io B2B Lead Intelligence",
    "bucket": "api_key",
    "category": "CRM & Sales",
    "documentationUrl": "https://apolloio.github.io/apollo-api-docs"
  },
  {
    "id": "leadfeeder",
    "name": "Leadfeeder Website Visitor Tracking",
    "bucket": "api_key",
    "category": "CRM & Sales",
    "documentationUrl": "https://docs.leadfeeder.com"
  },
  {
    "id": "affinity_crm",
    "name": "Affinity Relationship Intelligence",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://affinity-api.readme.io"
  },
  {
    "id": "keap",
    "name": "Keap / Infusionsoft Small Business CRM",
    "bucket": "oauth2_managed",
    "category": "CRM & Sales",
    "documentationUrl": "https://developer.keap.com"
  },
  {
    "id": "insightly",
    "name": "Insightly Unified CRM & Projects",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://api.insightly.com"
  },
  {
    "id": "nutshell",
    "name": "Nutshell Growth CRM",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://api.nutshell.com"
  },
  {
    "id": "capsule_crm",
    "name": "Capsule CRM Platform",
    "bucket": "bearer_token",
    "category": "CRM & Sales",
    "documentationUrl": "https://developer.capsulecrm.com"
  },
  {
    "id": "nimble_crm",
    "name": "Nimble Social CRM",
    "bucket": "bearer_token",
    "category": "CRM & Sales",
    "documentationUrl": "https://nimble.com"
  },
  {
    "id": "streak_crm",
    "name": "Streak CRM for Gmail",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://streak.com/api"
  },
  {
    "id": "sugar_crm",
    "name": "SugarCRM Enterprise",
    "bucket": "oauth2_managed",
    "category": "CRM & Sales",
    "documentationUrl": "https://support.sugarcrm.com"
  },
  {
    "id": "zendesk_sell",
    "name": "Zendesk Sell Sales CRM",
    "bucket": "bearer_token",
    "category": "CRM & Sales",
    "documentationUrl": "https://developer.zendesk.com/api-reference/sales-crm"
  },
  {
    "id": "less_annoying_crm",
    "name": "Less Annoying CRM",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://www.lessannoyingcrm.com/api"
  },
  {
    "id": "benchmarkone",
    "name": "BenchmarkONE Sales & Marketing",
    "bucket": "api_key",
    "category": "CRM & Sales",
    "documentationUrl": "https://benchmarkone.com"
  },
  {
    "id": "clearbit",
    "name": "Clearbit Enrichment & Reveal",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://clearbit.com/docs"
  },
  {
    "id": "hunter_io",
    "name": "Hunter.io Email Finder",
    "bucket": "query_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://hunter.io/api-documentation"
  },
  {
    "id": "dropcontact",
    "name": "Dropcontact B2B Enrichment",
    "bucket": "header_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://www.dropcontact.com"
  },
  {
    "id": "lusha",
    "name": "Lusha B2B Prospecting",
    "bucket": "header_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://www.lusha.com/docs"
  },
  {
    "id": "zoominfo",
    "name": "ZoomInfo Enterprise Data",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://api-docs.zoominfo.com"
  },
  {
    "id": "cognism",
    "name": "Cognism Prospector Data",
    "bucket": "header_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://cognism.com"
  },
  {
    "id": "seamless_ai",
    "name": "Seamless.AI Lead Sourcing",
    "bucket": "api_key",
    "category": "CRM & Sales",
    "documentationUrl": "https://seamless.ai"
  },
  {
    "id": "kaspr",
    "name": "Kaspr LinkedIn Prospecting",
    "bucket": "header_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://kaspr.io"
  },
  {
    "id": "lemlist",
    "name": "Lemlist Cold Outreach",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://developer.lemlist.com"
  },
  {
    "id": "instantly_ai",
    "name": "Instantly.ai Cold Email Scale",
    "bucket": "bearer_token",
    "category": "CRM & Sales",
    "documentationUrl": "https://developer.instantly.ai"
  },
  {
    "id": "smartlead",
    "name": "Smartlead.ai Cold Email Engine",
    "bucket": "query_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://api.smartlead.ai"
  },
  {
    "id": "woodpecker",
    "name": "Woodpecker.co Sales Automation",
    "bucket": "header_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://woodpecker.co/api"
  },
  {
    "id": "reply_io",
    "name": "Reply.io Multichannel Outreach",
    "bucket": "header_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://reply.io/api"
  },
  {
    "id": "saleshandy",
    "name": "Saleshandy Cold Email Outreach",
    "bucket": "header_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://saleshandy.com"
  },
  {
    "id": "klenty",
    "name": "Klenty Sales Engagement Platform",
    "bucket": "header_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://klenty.com"
  },
  {
    "id": "overloop",
    "name": "Overloop Outbound Sales CRM",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://overloop.com"
  },
  {
    "id": "vymo",
    "name": "Vymo Field Sales Automation",
    "bucket": "api_key",
    "category": "CRM & Sales",
    "documentationUrl": "https://vymo.com"
  },
  {
    "id": "creatio",
    "name": "Creatio CRM & Workflow No-Code",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://academy.creatio.com"
  },
  {
    "id": "bitrix24",
    "name": "Bitrix24 Unified Workspace",
    "bucket": "oauth2_managed",
    "category": "CRM & Sales",
    "documentationUrl": "https://training.bitrix24.com/rest_help"
  },
  {
    "id": "pipeliner_crm",
    "name": "Pipeliner Visual CRM",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://pipelinersales.com"
  },
  {
    "id": "slack",
    "name": "Slack Messaging & Workflow",
    "bucket": "oauth2_managed",
    "category": "Communication & Email",
    "documentationUrl": "https://api.slack.com"
  },
  {
    "id": "discord",
    "name": "Discord Bot & Server Webhooks",
    "bucket": "header_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://discord.com/developers/docs"
  },
  {
    "id": "telegram",
    "name": "Telegram Bot API",
    "bucket": "api_key",
    "category": "Communication & Email",
    "documentationUrl": "https://core.telegram.org/bots/api"
  },
  {
    "id": "twilio",
    "name": "Twilio Voice, SMS & Video",
    "bucket": "basic_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://www.twilio.com/docs"
  },
  {
    "id": "sendgrid",
    "name": "Twilio SendGrid Email API",
    "bucket": "bearer_token",
    "category": "Communication & Email",
    "documentationUrl": "https://docs.sendgrid.com"
  },
  {
    "id": "resend",
    "name": "Resend Modern Email API",
    "bucket": "bearer_token",
    "category": "Communication & Email",
    "documentationUrl": "https://resend.com/docs"
  },
  {
    "id": "postmark",
    "name": "Postmark Transactional Email",
    "bucket": "header_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://postmarkapp.com/developer"
  },
  {
    "id": "mailgun",
    "name": "Mailgun High-Volume Email",
    "bucket": "basic_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://documentation.mailgun.com"
  },
  {
    "id": "whatsapp_business",
    "name": "Meta WhatsApp Cloud API",
    "bucket": "bearer_token",
    "category": "Communication & Email",
    "documentationUrl": "https://developers.facebook.com/docs/whatsapp"
  },
  {
    "id": "pusher",
    "name": "Pusher Realtime Channels & Beams",
    "bucket": "api_key",
    "category": "Communication & Email",
    "documentationUrl": "https://pusher.com/docs"
  },
  {
    "id": "onesignal",
    "name": "OneSignal Omnichannel Push",
    "bucket": "basic_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://documentation.onesignal.com"
  },
  {
    "id": "loops_so",
    "name": "Loops Email Platform for SaaS",
    "bucket": "bearer_token",
    "category": "Communication & Email",
    "documentationUrl": "https://loops.so/docs"
  },
  {
    "id": "brevo_sendinblue",
    "name": "Brevo Marketing & Transactional",
    "bucket": "api_key",
    "category": "Communication & Email",
    "documentationUrl": "https://developers.brevo.com"
  },
  {
    "id": "messagebird",
    "name": "MessageBird Communications API",
    "bucket": "header_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://developers.messagebird.com"
  },
  {
    "id": "vonage_nexmo",
    "name": "Vonage Communications API",
    "bucket": "basic_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://developer.vonage.com"
  },
  {
    "id": "plivo",
    "name": "Plivo SMS & Voice Cloud",
    "bucket": "basic_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://www.plivo.com/docs"
  },
  {
    "id": "intercom",
    "name": "Intercom Customer Engagement",
    "bucket": "bearer_token",
    "category": "Communication & Email",
    "documentationUrl": "https://developers.intercom.com"
  },
  {
    "id": "front_app",
    "name": "Front Customer Operations Platform",
    "bucket": "bearer_token",
    "category": "Communication & Email",
    "documentationUrl": "https://dev.frontapp.com"
  },
  {
    "id": "crisp_chat",
    "name": "Crisp Customer Chat & Messaging",
    "bucket": "basic_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://docs.crisp.chat"
  },
  {
    "id": "drift",
    "name": "Drift Conversational Platform",
    "bucket": "oauth2_managed",
    "category": "Communication & Email",
    "documentationUrl": "https://devdocs.drift.com"
  },
  {
    "id": "courier",
    "name": "Courier Notification Orchestration",
    "bucket": "bearer_token",
    "category": "Communication & Email",
    "documentationUrl": "https://www.courier.com/docs"
  },
  {
    "id": "novu",
    "name": "Novu Open Source Notification Infrastructure",
    "bucket": "header_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://docs.novu.co"
  },
  {
    "id": "knock",
    "name": "Knock Flexible Notification Engine",
    "bucket": "bearer_token",
    "category": "Communication & Email",
    "documentationUrl": "https://docs.knock.app"
  },
  {
    "id": "magicbell",
    "name": "MagicBell In-App Notification Center",
    "bucket": "header_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://www.magicbell.com/docs"
  },
  {
    "id": "suprsend",
    "name": "SuprSend Unified Notification Platform",
    "bucket": "header_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://docs.suprsend.com"
  },
  {
    "id": "line_messaging",
    "name": "LINE Messaging API",
    "bucket": "bearer_token",
    "category": "Communication & Email",
    "documentationUrl": "https://developers.line.biz"
  },
  {
    "id": "viber_bot",
    "name": "Viber REST Bot API",
    "bucket": "header_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://developers.viber.com"
  },
  {
    "id": "wechat_work",
    "name": "WeChat Work / Enterprise WeChat",
    "bucket": "query_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://work.weixin.qq.com/api/doc"
  },
  {
    "id": "matrix_synapse",
    "name": "Matrix Protocol / Synapse Homeserver",
    "bucket": "bearer_token",
    "category": "Communication & Email",
    "documentationUrl": "https://spec.matrix.org"
  },
  {
    "id": "mattermost",
    "name": "Mattermost Secure Collaboration",
    "bucket": "bearer_token",
    "category": "Communication & Email",
    "documentationUrl": "https://api.mattermost.com"
  },
  {
    "id": "zulip",
    "name": "Zulip Thread-Based Team Chat",
    "bucket": "basic_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://zulip.com/api"
  },
  {
    "id": "rocket_chat",
    "name": "Rocket.Chat Omnichannel Platform",
    "bucket": "header_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://developer.rocket.chat"
  },
  {
    "id": "sinch",
    "name": "Sinch Customer Engagement Cloud",
    "bucket": "basic_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://developers.sinch.com"
  },
  {
    "id": "bandwidth",
    "name": "Bandwidth Telecom APIs",
    "bucket": "basic_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://dev.bandwidth.com"
  },
  {
    "id": "telnyx",
    "name": "Telnyx Next-Gen Communications",
    "bucket": "bearer_token",
    "category": "Communication & Email",
    "documentationUrl": "https://developers.telnyx.com"
  },
  {
    "id": "infobip",
    "name": "Infobip Global Enterprise Messaging",
    "bucket": "header_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://www.infobip.com/docs/api"
  },
  {
    "id": "amazon_ses",
    "name": "Amazon Simple Email Service (SES)",
    "bucket": "basic_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://docs.aws.amazon.com/ses"
  },
  {
    "id": "sparkpost",
    "name": "SparkPost Email Delivery",
    "bucket": "header_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://developers.sparkpost.com"
  },
  {
    "id": "mailjet",
    "name": "Mailjet Email Service",
    "bucket": "basic_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://dev.mailjet.com"
  },
  {
    "id": "sendinblue",
    "name": "Sendinblue REST API",
    "bucket": "header_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://developers.sendinblue.com"
  },
  {
    "id": "mailersend",
    "name": "MailerSend Transactional Messaging",
    "bucket": "bearer_token",
    "category": "Communication & Email",
    "documentationUrl": "https://developers.mailersend.com"
  },
  {
    "id": "emailjs",
    "name": "EmailJS Client-Side Delivery",
    "bucket": "basic_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://www.emailjs.com/docs"
  },
  {
    "id": "smtp2go",
    "name": "SMTP2GO Worldwide Email Delivery",
    "bucket": "header_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://apidoc.smtp2go.com"
  },
  {
    "id": "mandrill",
    "name": "Mandrill by Mailchimp",
    "bucket": "basic_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://mailchimp.com/developer/transactional"
  },
  {
    "id": "unione",
    "name": "UniOne Transactional Email",
    "bucket": "header_auth",
    "category": "Communication & Email",
    "documentationUrl": "https://docs.unione.io"
  },
  {
    "id": "github",
    "name": "GitHub API & Webhooks",
    "bucket": "oauth2_managed",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.github.com"
  },
  {
    "id": "gitlab",
    "name": "GitLab DevOps Platform",
    "bucket": "oauth2_managed",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.gitlab.com"
  },
  {
    "id": "bitbucket",
    "name": "Bitbucket Cloud Repository",
    "bucket": "oauth2_managed",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://developer.atlassian.com/cloud/bitbucket"
  },
  {
    "id": "jira",
    "name": "Jira Software & Agile",
    "bucket": "basic_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://developer.atlassian.com/cloud/jira/platform/rest/v3"
  },
  {
    "id": "linear",
    "name": "Linear Purpose-Built Issue Tracking",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://developers.linear.app"
  },
  {
    "id": "sentry",
    "name": "Sentry Application Performance & Errors",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.sentry.io/api"
  },
  {
    "id": "datadog",
    "name": "Datadog Cloud Monitoring",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.datadoghq.com/api"
  },
  {
    "id": "grafana",
    "name": "Grafana Dashboards & Alerting",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://grafana.com/docs/grafana/latest/developers/http_api"
  },
  {
    "id": "postman",
    "name": "Postman Collaborative API Platform",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://learning.postman.com"
  },
  {
    "id": "dockerhub",
    "name": "Docker Hub Container Registry",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.docker.com/docker-hub/api"
  },
  {
    "id": "launchdarkly",
    "name": "LaunchDarkly Feature Management",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://apidocs.launchdarkly.com"
  },
  {
    "id": "newrelic",
    "name": "New Relic Full-Stack Observability",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.newrelic.com/docs/apis"
  },
  {
    "id": "betterstack",
    "name": "Better Stack Observability & Uptime",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://betterstack.com/docs"
  },
  {
    "id": "pagerduty",
    "name": "PagerDuty Operations Cloud",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://developer.pagerduty.com"
  },
  {
    "id": "opsgenie",
    "name": "Atlassian Opsgenie",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.opsgenie.com"
  },
  {
    "id": "circleci",
    "name": "CircleCI Cloud CI/CD",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://circleci.com/docs/api"
  },
  {
    "id": "buildkite",
    "name": "Buildkite Enterprise CI/CD",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://buildkite.com/docs/apis"
  },
  {
    "id": "npm_registry",
    "name": "npm JavaScript Package Registry",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.npmjs.com"
  },
  {
    "id": "hashicorp_vault",
    "name": "HashiCorp Vault Secrets Engine",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://developer.hashicorp.com/vault/api-docs"
  },
  {
    "id": "snyk",
    "name": "Snyk Developer Security",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://snyk.docs.apiary.io"
  },
  {
    "id": "sonarqube",
    "name": "SonarQube Code Quality & Security",
    "bucket": "basic_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.sonarsource.com"
  },
  {
    "id": "jenkins",
    "name": "Jenkins Automation Server",
    "bucket": "basic_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://www.jenkins.io/doc/book/using/remote-access-api"
  },
  {
    "id": "travis_ci",
    "name": "Travis CI Automated Testing",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.travis-ci.com/api"
  },
  {
    "id": "semaphore_ci",
    "name": "Semaphore High-Speed CI/CD",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.semaphoreci.com"
  },
  {
    "id": "codecov",
    "name": "Codecov Code Coverage Insight",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.codecov.com"
  },
  {
    "id": "coveralls",
    "name": "Coveralls Test Coverage History",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.coveralls.io"
  },
  {
    "id": "rollbar",
    "name": "Rollbar Real-Time Error Alerting",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.rollbar.com/api"
  },
  {
    "id": "bugsnag",
    "name": "BugSnag Error Monitoring",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.bugsnag.com/api"
  },
  {
    "id": "logrocket",
    "name": "LogRocket Frontend Monitoring",
    "bucket": "basic_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.logrocket.com"
  },
  {
    "id": "appdynamics",
    "name": "Cisco AppDynamics APM",
    "bucket": "basic_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.appdynamics.com"
  },
  {
    "id": "dynatrace",
    "name": "Dynatrace Software Intelligence",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://www.dynatrace.com/support/help/dynatrace-api"
  },
  {
    "id": "splunk",
    "name": "Splunk Cloud & Enterprise",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.splunk.com/Documentation/Splunk/latest/RESTREF/RESTprolog"
  },
  {
    "id": "sumo_logic",
    "name": "Sumo Logic Continuous Intelligence",
    "bucket": "basic_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://help.sumologic.com/docs/api"
  },
  {
    "id": "papertrail",
    "name": "SolarWinds Papertrail Cloud Logging",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://www.papertrail.com/help"
  },
  {
    "id": "loggly",
    "name": "SolarWinds Loggly Log Management",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://documentation.solarwinds.com/en/success_center/loggly"
  },
  {
    "id": "honeycomb",
    "name": "Honeycomb Observability & Tracing",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.honeycomb.io"
  },
  {
    "id": "lightstep",
    "name": "ServiceNow Lightstep Tracing",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.lightstep.com"
  },
  {
    "id": "coralogix",
    "name": "Coralogix State-of-the-Art Streaming",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://coralogix.com/docs"
  },
  {
    "id": "scalyr",
    "name": "SentinelOne Scalyr / DataSet",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://app.scalyr.com/help/api"
  },
  {
    "id": "incident_io",
    "name": "incident.io Modern Incident Response",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://api-docs.incident.io"
  },
  {
    "id": "rootly",
    "name": "Rootly Incident Management Platform",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://rootly.com/docs"
  },
  {
    "id": "firehydrant",
    "name": "FireHydrant Incident Management",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://developer.firehydrant.io"
  },
  {
    "id": "checkly",
    "name": "Checkly Monitoring as Code",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://www.checklyhq.com/docs/api"
  },
  {
    "id": "statuspage",
    "name": "Atlassian Statuspage Communication",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://developer.statuspage.com"
  },
  {
    "id": "instatus",
    "name": "Instatus Fast & Beautiful Status Pages",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://instatus.com/help/api"
  },
  {
    "id": "statuspal",
    "name": "Statuspal Incident Communication",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://statuspal.io/docs/api"
  },
  {
    "id": "cachet",
    "name": "Cachet Open Source Status Page",
    "bucket": "header_auth",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://cachethq.io"
  },
  {
    "id": "upptime",
    "name": "Upptime GitHub-Powered Uptime Monitor",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://upptime.js.org"
  },
  {
    "id": "pingdom",
    "name": "SolarWinds Pingdom Web Performance",
    "bucket": "bearer_token",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://docs.pingdom.com/api"
  },
  {
    "id": "uptimerobot",
    "name": "UptimeRobot Monitoring Platform",
    "bucket": "api_key",
    "category": "Developer Tools & CI/CD",
    "documentationUrl": "https://uptimerobot.com/api"
  },
  {
    "id": "aws",
    "name": "Amazon Web Services (AWS)",
    "bucket": "basic_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.aws.amazon.com"
  },
  {
    "id": "google_cloud",
    "name": "Google Cloud Platform (GCP)",
    "bucket": "oauth2_managed",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://cloud.google.com/docs"
  },
  {
    "id": "azure",
    "name": "Microsoft Azure Cloud",
    "bucket": "oauth2_managed",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://learn.microsoft.com/en-us/azure"
  },
  {
    "id": "cloudflare",
    "name": "Cloudflare Workers, Pages & DNS",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://developers.cloudflare.com/api"
  },
  {
    "id": "digitalocean",
    "name": "DigitalOcean Droplets & Spaces",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.digitalocean.com/reference/api"
  },
  {
    "id": "vercel",
    "name": "Vercel Frontend Cloud",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://vercel.com/docs/rest-api"
  },
  {
    "id": "netlify",
    "name": "Netlify Composable Web Platform",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.netlify.com/api/get-started"
  },
  {
    "id": "render",
    "name": "Render Unified Cloud Platform",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://render.com/docs/api"
  },
  {
    "id": "railway",
    "name": "Railway Infrastructure Platform",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.railway.app"
  },
  {
    "id": "fly_io",
    "name": "Fly.io Global Application Platform",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://fly.io/docs"
  },
  {
    "id": "hetzner_cloud",
    "name": "Hetzner Cloud Server Management",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.hetzner.cloud"
  },
  {
    "id": "scaleway",
    "name": "Scaleway European Cloud Provider",
    "bucket": "header_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://www.scaleway.com/en/developers/api"
  },
  {
    "id": "linode_akamai",
    "name": "Linode / Akamai Connected Cloud",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://www.linode.com/docs/api"
  },
  {
    "id": "supabase",
    "name": "Supabase Postgres Backend-as-a-Service",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://supabase.com/docs"
  },
  {
    "id": "neon_database",
    "name": "Neon Serverless Postgres Cloud",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://neon.tech/docs"
  },
  {
    "id": "upstash",
    "name": "Upstash Serverless Redis & QStash",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://upstash.com/docs"
  },
  {
    "id": "heroku",
    "name": "Salesforce Heroku Cloud",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://devcenter.heroku.com/articles/platform-api-reference"
  },
  {
    "id": "ovhcloud",
    "name": "OVHcloud European Hyperscaler",
    "bucket": "header_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://api.ovh.com"
  },
  {
    "id": "vultr",
    "name": "Vultr High Performance Cloud",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://www.vultr.com/api"
  },
  {
    "id": "equinix_metal",
    "name": "Equinix Metal Bare Metal Cloud",
    "bucket": "header_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://metal.equinix.com/developers/api"
  },
  {
    "id": "exoscale",
    "name": "Exoscale Swiss Cloud",
    "bucket": "basic_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://community.exoscale.com/api"
  },
  {
    "id": "gcore",
    "name": "Gcore Global Edge Cloud & CDN",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://gcore.com/docs/api"
  },
  {
    "id": "fastly",
    "name": "Fastly Edge Cloud Network & CDN",
    "bucket": "header_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://developer.fastly.com/reference/api"
  },
  {
    "id": "akamai",
    "name": "Akamai Edge Technologies",
    "bucket": "header_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://techdocs.akamai.com"
  },
  {
    "id": "bunny_net",
    "name": "Bunny.net Next-Gen CDN & Storage",
    "bucket": "header_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.bunny.net"
  },
  {
    "id": "keycdn",
    "name": "KeyCDN Content Delivery Network",
    "bucket": "basic_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://www.keycdn.com/api"
  },
  {
    "id": "backblaze_b2",
    "name": "Backblaze B2 Cloud Object Storage",
    "bucket": "basic_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://www.backblaze.com/b2/docs"
  },
  {
    "id": "wasabi_storage",
    "name": "Wasabi Hot Cloud Storage",
    "bucket": "basic_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://wasabi.com/help/docs"
  },
  {
    "id": "scality",
    "name": "Scality Object Storage S3",
    "bucket": "basic_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://documentation.scality.com"
  },
  {
    "id": "minio",
    "name": "MinIO High Performance Object Store",
    "bucket": "basic_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://min.io/docs/minio/linux/index.html"
  },
  {
    "id": "storj",
    "name": "Storj Decentralized Cloud Storage",
    "bucket": "basic_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.storj.io"
  },
  {
    "id": "fleek",
    "name": "Fleek Web3 Hosting & IPFS",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://fleek.xyz/docs"
  },
  {
    "id": "web3_storage",
    "name": "Web3.Storage Decentralized Data",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://web3.storage/docs"
  },
  {
    "id": "pinata",
    "name": "Pinata IPFS Media Infrastructure",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.pinata.cloud"
  },
  {
    "id": "koyeb",
    "name": "Koyeb Serverless Engine",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://www.koyeb.com/docs"
  },
  {
    "id": "zeabur",
    "name": "Zeabur Container Deployment",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://zeabur.com/docs"
  },
  {
    "id": "coolify",
    "name": "Coolify Self-Hosted PaaS",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://coolify.io/docs"
  },
  {
    "id": "portainer",
    "name": "Portainer Container Management",
    "bucket": "header_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.portainer.io/api"
  },
  {
    "id": "rancher",
    "name": "SUSE Rancher Kubernetes Manager",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://rancher.com/docs"
  },
  {
    "id": "openstack",
    "name": "OpenStack Cloud Infrastructure",
    "bucket": "header_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.openstack.org/api-quick-start"
  },
  {
    "id": "vmware_vcenter",
    "name": "VMware vCenter Server",
    "bucket": "basic_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://developer.vmware.com"
  },
  {
    "id": "proxmox_ve",
    "name": "Proxmox VE Virtualization",
    "bucket": "header_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://pve.proxmox.com/pve-docs/api-viewer"
  },
  {
    "id": "civo",
    "name": "Civo Cloud Native Kubernetes",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://www.civo.com/learn/civo-api-overview"
  },
  {
    "id": "cloudsigma",
    "name": "CloudSigma Pure Cloud IaaS",
    "bucket": "basic_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://cloudsigma.com/api"
  },
  {
    "id": "kamatera",
    "name": "Kamatera Performance Cloud",
    "bucket": "header_auth",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://www.kamatera.com/api"
  },
  {
    "id": "stripe",
    "name": "Stripe Payment Processing & Billing",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://stripe.com/docs/api"
  },
  {
    "id": "shopify",
    "name": "Shopify Merchant Admin & Storefront",
    "bucket": "header_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://shopify.dev/docs/api/admin-rest"
  },
  {
    "id": "paypal",
    "name": "PayPal Checkout & Subscriptions",
    "bucket": "oauth2_managed",
    "category": "Payments & Commerce",
    "documentationUrl": "https://developer.paypal.com/docs/api"
  },
  {
    "id": "square",
    "name": "Square Point-of-Sale & Commerce",
    "bucket": "oauth2_managed",
    "category": "Payments & Commerce",
    "documentationUrl": "https://developer.squareup.com/docs"
  },
  {
    "id": "paddle",
    "name": "Paddle Global Merchant of Record",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://developer.paddle.com"
  },
  {
    "id": "lemonsqueezy",
    "name": "Lemon Squeezy Software Sales",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.lemonsqueezy.com"
  },
  {
    "id": "woocommerce",
    "name": "WooCommerce WordPress Store",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://woocommerce.github.io/woocommerce-rest-api-docs"
  },
  {
    "id": "bigcommerce",
    "name": "BigCommerce Enterprise Commerce",
    "bucket": "header_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://developer.bigcommerce.com"
  },
  {
    "id": "plaid",
    "name": "Plaid Financial Open Banking",
    "bucket": "header_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://plaid.com/docs/api"
  },
  {
    "id": "razorpay",
    "name": "Razorpay Payment Gateway",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://razorpay.com/docs/api"
  },
  {
    "id": "mollie",
    "name": "Mollie European Payments",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.mollie.com"
  },
  {
    "id": "chargebee",
    "name": "Chargebee Recurring Subscription",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://apidocs.chargebee.com"
  },
  {
    "id": "recurly",
    "name": "Recurly Subscription Management",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://developers.recurly.com"
  },
  {
    "id": "wise",
    "name": "Wise International Transfers",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://api-docs.wise.com"
  },
  {
    "id": "adyen",
    "name": "Adyen Global Unified Commerce",
    "bucket": "header_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.adyen.com/api-explorer"
  },
  {
    "id": "authorize_net",
    "name": "Authorize.Net Payment Processing",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://developer.authorize.net/api/reference"
  },
  {
    "id": "braintree",
    "name": "Braintree Payments by PayPal",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://developer.paypal.com/braintree/docs"
  },
  {
    "id": "worldpay",
    "name": "Worldpay Global Acquiring",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://developer.worldpay.com"
  },
  {
    "id": "checkout_com",
    "name": "Checkout.com Payment Platform",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://www.checkout.com/docs"
  },
  {
    "id": "klarna",
    "name": "Klarna Buy Now Pay Later",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.klarna.com"
  },
  {
    "id": "afterpay",
    "name": "Afterpay / Clearpay Instalments",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://developers.afterpay.com"
  },
  {
    "id": "affirm",
    "name": "Affirm Pay Over Time",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.affirm.com"
  },
  {
    "id": "sezzle",
    "name": "Sezzle Flexible Payments",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://sezzle.com/developers"
  },
  {
    "id": "coinbase_commerce",
    "name": "Coinbase Commerce Crypto Payments",
    "bucket": "header_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.cloud.coinbase.com/commerce"
  },
  {
    "id": "bitpay",
    "name": "BitPay Cryptocurrency Invoicing",
    "bucket": "header_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://bitpay.com/api"
  },
  {
    "id": "crypto_com",
    "name": "Crypto.com Pay Merchant",
    "bucket": "header_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://crypto.com/pay/docs"
  },
  {
    "id": "gocardless",
    "name": "GoCardless Direct Debit Network",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://developer.gocardless.com/api-reference"
  },
  {
    "id": "dwolla",
    "name": "Dwolla Account-to-Account ACH",
    "bucket": "oauth2_managed",
    "category": "Payments & Commerce",
    "documentationUrl": "https://developers.dwolla.com"
  },
  {
    "id": "finicity",
    "name": "Finicity Mastercard Open Banking",
    "bucket": "header_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://developer.mastercard.com/open-banking-us"
  },
  {
    "id": "yodlee",
    "name": "Envestnet Yodlee Financial Data",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://developer.yodlee.com"
  },
  {
    "id": "mx_technologies",
    "name": "MX Financial Intelligence Platform",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.mx.com"
  },
  {
    "id": "tink",
    "name": "Tink European Open Banking",
    "bucket": "oauth2_managed",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.tink.com"
  },
  {
    "id": "truelayer",
    "name": "TrueLayer Payments & Data API",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.truelayer.com"
  },
  {
    "id": "yapily",
    "name": "Yapily Open Banking Infrastructure",
    "bucket": "header_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.yapily.com"
  },
  {
    "id": "nordigen",
    "name": "GoCardless / Nordigen Bank Account Data",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://nordigen.com/en/docs/account-information/overview"
  },
  {
    "id": "magento",
    "name": "Adobe Commerce / Magento 2",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://developer.adobe.com/commerce/webapi/rest"
  },
  {
    "id": "prestashop",
    "name": "PrestaShop Open Source E-Commerce",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://devdocs.prestashop-project.org"
  },
  {
    "id": "ecwid",
    "name": "Ecwid by Lightspeed Online Store",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://api-docs.ecwid.com"
  },
  {
    "id": "squarespace_commerce",
    "name": "Squarespace Commerce Platform",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://developers.squarespace.com/commerce-apis/overview"
  },
  {
    "id": "wix_stores",
    "name": "Wix Stores REST eCommerce",
    "bucket": "header_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://dev.wix.com/api/rest/wix-stores"
  },
  {
    "id": "volusion",
    "name": "Volusion All-in-One E-Commerce",
    "bucket": "header_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://volusion.com/api"
  },
  {
    "id": "spree_commerce",
    "name": "Spree Commerce API v2",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://spreecommerce.org/docs"
  },
  {
    "id": "saleor",
    "name": "Saleor Headless GraphQL Commerce",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.saleor.io"
  },
  {
    "id": "medusa_js",
    "name": "Medusa.js Composable Commerce",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.medusajs.com"
  },
  {
    "id": "swell_commerce",
    "name": "Swell Headless E-Commerce",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://swell.is/docs/api"
  },
  {
    "id": "notion",
    "name": "Notion Workspace & Database",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developers.notion.com"
  },
  {
    "id": "airtable",
    "name": "Airtable Relational Cloud Sheets",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://airtable.com/developers/web/api/introduction"
  },
  {
    "id": "asana",
    "name": "Asana Work Management",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developers.asana.com"
  },
  {
    "id": "monday_com",
    "name": "Monday.com Work OS",
    "bucket": "header_auth",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developer.monday.com"
  },
  {
    "id": "clickup",
    "name": "ClickUp All-in-One Productivity",
    "bucket": "header_auth",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://clickup.com/api"
  },
  {
    "id": "trello",
    "name": "Trello Visual Project Boards",
    "bucket": "query_auth",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developer.atlassian.com/cloud/trello/rest"
  },
  {
    "id": "todoist",
    "name": "Todoist Task Manager",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developer.todoist.com"
  },
  {
    "id": "coda_io",
    "name": "Coda Interactive Canvas & Docs",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://coda.io/developers/apis/v1"
  },
  {
    "id": "basecamp",
    "name": "Basecamp Team Collaboration",
    "bucket": "oauth2_managed",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://github.com/basecamp/bc3-api"
  },
  {
    "id": "miro",
    "name": "Miro Visual Collaboration Whiteboard",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developers.miro.com"
  },
  {
    "id": "figma",
    "name": "Figma Design & Token Management",
    "bucket": "header_auth",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://www.figma.com/developers/api"
  },
  {
    "id": "loom",
    "name": "Loom Video Communication",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://loom.com"
  },
  {
    "id": "zoom",
    "name": "Zoom Video Meetings & Webinars",
    "bucket": "oauth2_managed",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developers.zoom.us"
  },
  {
    "id": "google_workspace",
    "name": "Google Workspace (Drive/Sheets/Docs)",
    "bucket": "oauth2_managed",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developers.google.com/workspace"
  },
  {
    "id": "microsoft_graph",
    "name": "Microsoft 365 / Graph API",
    "bucket": "oauth2_managed",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://learn.microsoft.com/en-us/graph"
  },
  {
    "id": "lucidchart",
    "name": "Lucid Software Visual Cloud",
    "bucket": "oauth2_managed",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developer.lucid.co"
  },
  {
    "id": "evernote",
    "name": "Evernote Digital Notes",
    "bucket": "oauth2_managed",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://dev.evernote.com"
  },
  {
    "id": "onenote",
    "name": "Microsoft OneNote REST API",
    "bucket": "oauth2_managed",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://learn.microsoft.com/en-us/graph/onenote-concept-overview"
  },
  {
    "id": "roam_research",
    "name": "Roam Research Networked Thought",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://roamresearch.com"
  },
  {
    "id": "obsidian_sync",
    "name": "Obsidian REST & Local Sync",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://obsidian.md"
  },
  {
    "id": "workflowy",
    "name": "WorkFlowy Outlining Notes",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://workflowy.com"
  },
  {
    "id": "slite",
    "name": "Slite Knowledge Base for Teams",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://slite.com/api"
  },
  {
    "id": "gitbook",
    "name": "GitBook Technical Documentation",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developer.gitbook.com"
  },
  {
    "id": "archbee",
    "name": "Archbee Documentation Engine",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.archbee.com"
  },
  {
    "id": "confluence",
    "name": "Atlassian Confluence Workspaces",
    "bucket": "basic_auth",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developer.atlassian.com/cloud/confluence/rest/v2/intro"
  },
  {
    "id": "box_cloud",
    "name": "Box Enterprise Content Cloud",
    "bucket": "oauth2_managed",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developer.box.com"
  },
  {
    "id": "dropbox",
    "name": "Dropbox Storage & Workflows",
    "bucket": "oauth2_managed",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://www.dropbox.com/developers/documentation"
  },
  {
    "id": "egnyte",
    "name": "Egnyte Hybrid Cloud Storage",
    "bucket": "oauth2_managed",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developers.egnyte.com"
  },
  {
    "id": "pandadoc",
    "name": "PandaDoc Document Automation",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developers.pandadoc.com"
  },
  {
    "id": "docusign",
    "name": "DocuSign eSignature & Agreements",
    "bucket": "oauth2_managed",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developers.docusign.com"
  },
  {
    "id": "hellosign_dropbox",
    "name": "Dropbox Sign / HelloSign",
    "bucket": "basic_auth",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://app.hellosign.com/api/reference"
  },
  {
    "id": "signrequest",
    "name": "SignRequest Electronic Signatures",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://signrequest.com/api/v1/docs"
  },
  {
    "id": "signwell",
    "name": "SignWell Legally Binding Signatures",
    "bucket": "header_auth",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://www.signwell.com/api/documentation"
  },
  {
    "id": "formium",
    "name": "Formium Cloud Form Backend",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://formium.io/docs"
  },
  {
    "id": "jotform",
    "name": "Jotform Advanced Online Forms",
    "bucket": "header_auth",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://api.jotform.com/docs"
  },
  {
    "id": "tally_forms",
    "name": "Tally Form Builder",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://tally.so/docs/api"
  },
  {
    "id": "fillout",
    "name": "Fillout Powerful Form Builder",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://www.fillout.com/help/api"
  },
  {
    "id": "feathery",
    "name": "Feathery Product Form Engine",
    "bucket": "header_auth",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.feathery.io"
  },
  {
    "id": "cal_com",
    "name": "Cal.com Open Source Scheduling",
    "bucket": "api_key",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://cal.com/docs/api"
  },
  {
    "id": "calendly",
    "name": "Calendly Meeting Scheduling",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developer.calendly.com"
  },
  {
    "id": "savvycal",
    "name": "SavvyCal Personalized Scheduling",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://savvycal.com/developers"
  },
  {
    "id": "youcanbookme",
    "name": "YouCanBook.me Calendar Booking",
    "bucket": "basic_auth",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://youcanbook.me/api"
  },
  {
    "id": "doodle",
    "name": "Doodle Group Polls & Scheduling",
    "bucket": "oauth2_managed",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://doodle.com"
  },
  {
    "id": "clockify",
    "name": "Clockify Time Tracking & Timesheets",
    "bucket": "header_auth",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://clockify.me/developers-api"
  },
  {
    "id": "toggl_track",
    "name": "Toggl Track Flexible Time Tracking",
    "bucket": "basic_auth",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developers.track.toggl.com"
  },
  {
    "id": "harvest",
    "name": "Harvest Time Tracking & Invoices",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://help.getharvest.com/api-v2"
  },
  {
    "id": "timely",
    "name": "Timely AI Automatic Time Tracking",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://dev.timelyapp.com"
  },
  {
    "id": "everhour",
    "name": "Everhour Project Time Management",
    "bucket": "header_auth",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://everhour.docs.apiary.io"
  },
  {
    "id": "hubstaff",
    "name": "Hubstaff Workforce Management",
    "bucket": "oauth2_managed",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://developer.hubstaff.com"
  },
  {
    "id": "time_doctor",
    "name": "Time Doctor Employee Tracking",
    "bucket": "oauth2_managed",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://api2.timedoctor.com"
  },
  {
    "id": "google_analytics",
    "name": "Google Analytics 4 (GA4)",
    "bucket": "oauth2_managed",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developers.google.com/analytics"
  },
  {
    "id": "mixpanel",
    "name": "Mixpanel Product & User Analytics",
    "bucket": "basic_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developer.mixpanel.com"
  },
  {
    "id": "amplitude",
    "name": "Amplitude Product Intelligence",
    "bucket": "header_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://www.amplitude.com/docs"
  },
  {
    "id": "segment",
    "name": "Segment Customer Data Infrastructure",
    "bucket": "basic_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://segment.com/docs/api"
  },
  {
    "id": "posthog",
    "name": "PostHog Open-Source Product OS",
    "bucket": "header_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://posthog.com/docs/api"
  },
  {
    "id": "mailchimp",
    "name": "Mailchimp Newsletters & Automation",
    "bucket": "basic_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://mailchimp.com/developer/marketing"
  },
  {
    "id": "klaviyo",
    "name": "Klaviyo Intelligent Marketing Cloud",
    "bucket": "header_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developers.klaviyo.com"
  },
  {
    "id": "convertkit",
    "name": "ConvertKit Creator Platform",
    "bucket": "query_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developers.convertkit.com"
  },
  {
    "id": "customer_io",
    "name": "Customer.io Automated Messaging",
    "bucket": "basic_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://customer.io/docs/api"
  },
  {
    "id": "typeform",
    "name": "Typeform Conversational Forms",
    "bucket": "bearer_token",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developer.typeform.com"
  },
  {
    "id": "formstack",
    "name": "Formstack Workplace Forms & Sign",
    "bucket": "bearer_token",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developers.formstack.com"
  },
  {
    "id": "webflow",
    "name": "Webflow Visual Site CMS",
    "bucket": "bearer_token",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developers.webflow.com"
  },
  {
    "id": "unbounce",
    "name": "Unbounce Landing Page Optimizer",
    "bucket": "basic_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developer.unbounce.com"
  },
  {
    "id": "heap_analytics",
    "name": "Heap Digital Insights Platform",
    "bucket": "header_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developers.heap.io"
  },
  {
    "id": "fullstory",
    "name": "FullStory Behavioral Data Engine",
    "bucket": "basic_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developer.fullstory.com"
  },
  {
    "id": "hotjar",
    "name": "Hotjar Heatmaps & User Feedback",
    "bucket": "basic_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://help.hotjar.com"
  },
  {
    "id": "crazy_egg",
    "name": "Crazy Egg Click Tracking & Recordings",
    "bucket": "basic_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://crazyegg.com"
  },
  {
    "id": "matomo",
    "name": "Matomo Privacy Analytics",
    "bucket": "query_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developer.matomo.org/api-reference/reporting-api"
  },
  {
    "id": "plausible",
    "name": "Plausible Lightweight Privacy Analytics",
    "bucket": "bearer_token",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://plausible.io/docs/stats-api"
  },
  {
    "id": "fathom",
    "name": "Fathom Privacy-First Analytics",
    "bucket": "bearer_token",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://usefathom.com/api"
  },
  {
    "id": "simple_analytics",
    "name": "Simple Analytics Privacy Platform",
    "bucket": "header_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://docs.simpleanalytics.com/api"
  },
  {
    "id": "rudderstack",
    "name": "RudderStack Warehouse-Native CDP",
    "bucket": "basic_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://www.rudderstack.com/docs/api"
  },
  {
    "id": "mparticle",
    "name": "mParticle Customer Data Platform",
    "bucket": "basic_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://docs.mparticle.com/developers/apis"
  },
  {
    "id": "freshpaint",
    "name": "Freshpaint Healthcare Data Privacy",
    "bucket": "bearer_token",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://documentation.freshpaint.io"
  },
  {
    "id": "meta_ads",
    "name": "Meta / Facebook Marketing API",
    "bucket": "bearer_token",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developers.facebook.com/docs/marketing-apis"
  },
  {
    "id": "google_ads",
    "name": "Google Ads API",
    "bucket": "oauth2_managed",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developers.google.com/google-ads/api/docs"
  },
  {
    "id": "tiktok_ads",
    "name": "TikTok for Business Marketing API",
    "bucket": "header_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://business-api.tiktok.com/portal/docs"
  },
  {
    "id": "linkedin_ads",
    "name": "LinkedIn Campaign Manager API",
    "bucket": "oauth2_managed",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://learn.microsoft.com/en-us/linkedin/marketing"
  },
  {
    "id": "twitter_ads",
    "name": "X / Twitter Ads API",
    "bucket": "oauth2_managed",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developer.x.com/en/docs/twitter-ads-api"
  },
  {
    "id": "pinterest_ads",
    "name": "Pinterest Commercial Ads API",
    "bucket": "bearer_token",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developers.pinterest.com/docs/api/v5"
  },
  {
    "id": "snapchat_ads",
    "name": "Snapchat Marketing Platform",
    "bucket": "oauth2_managed",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://marketingapi.snapchat.com/docs"
  },
  {
    "id": "reddit_ads",
    "name": "Reddit Ads Campaign API",
    "bucket": "oauth2_managed",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://ads-api.reddit.com/docs"
  },
  {
    "id": "amazon_ads",
    "name": "Amazon Ads & Sponsored Products",
    "bucket": "oauth2_managed",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://advertising.amazon.com/API/docs/en-us"
  },
  {
    "id": "semrush",
    "name": "Semrush SEO & Competitor Research",
    "bucket": "query_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://developer.semrush.com/api"
  },
  {
    "id": "ahrefs",
    "name": "Ahrefs Backlinks & Keyword API",
    "bucket": "header_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://ahrefs.com/api/documentation"
  },
  {
    "id": "moz_api",
    "name": "Moz Link Authority & SEO Metrics",
    "bucket": "basic_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://moz.com/help/moz-api"
  },
  {
    "id": "serpapi",
    "name": "SerpApi Google Search Scraper",
    "bucket": "query_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://serpapi.com/search-api"
  },
  {
    "id": "brightdata",
    "name": "Bright Data Web Scraping & Proxies",
    "bucket": "bearer_token",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://docs.brightdata.com"
  },
  {
    "id": "scrapingbee",
    "name": "ScrapingBee Headless Web Scraping",
    "bucket": "query_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://www.scrapingbee.com/documentation"
  },
  {
    "id": "zyte",
    "name": "Zyte Smart Web Extraction",
    "bucket": "basic_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://docs.zyte.com"
  },
  {
    "id": "diffbot",
    "name": "Diffbot Knowledge Graph & Extract",
    "bucket": "bearer_token",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://docs.diffbot.com"
  },
  {
    "id": "crawlee",
    "name": "Apify Cloud Actor & Scraper Engine",
    "bucket": "bearer_token",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://docs.apify.com/api/v2"
  },
  {
    "id": "octoparse",
    "name": "Octoparse Visual Data Extractor",
    "bucket": "basic_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://dataapi.octoparse.com"
  },
  {
    "id": "phantom_buster",
    "name": "PhantomBuster Social Lead Extraction",
    "bucket": "header_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://hub.phantombuster.com"
  },
  {
    "id": "captain_data",
    "name": "Captain Data Automated Data Extraction",
    "bucket": "header_auth",
    "category": "Marketing Automation & Analytics",
    "documentationUrl": "https://captaindata.co"
  },
  {
    "id": "postgres",
    "name": "PostgreSQL Database Engine",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://www.postgresql.org/docs"
  },
  {
    "id": "mysql",
    "name": "MySQL Relational Database",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://dev.mysql.com/doc"
  },
  {
    "id": "redis",
    "name": "Redis In-Memory Key-Value",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://redis.io/docs"
  },
  {
    "id": "mongodb_atlas",
    "name": "MongoDB Atlas Document Cloud",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://www.mongodb.com/docs"
  },
  {
    "id": "snowflake",
    "name": "Snowflake Cloud Data Warehouse",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.snowflake.com"
  },
  {
    "id": "google_bigquery",
    "name": "Google BigQuery Serverless",
    "bucket": "oauth2_managed",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://cloud.google.com/bigquery/docs"
  },
  {
    "id": "databricks",
    "name": "Databricks Unified Analytics",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.databricks.com"
  },
  {
    "id": "clickhouse",
    "name": "ClickHouse High Performance Columnar",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://clickhouse.com/docs"
  },
  {
    "id": "couchdb",
    "name": "Apache CouchDB JSON Database",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.couchdb.org"
  },
  {
    "id": "cassandra_datastax",
    "name": "DataStax Astra DB Cassandra",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datastax.com"
  },
  {
    "id": "elasticsearch",
    "name": "Elasticsearch Distributed Search",
    "bucket": "api_key",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://www.elastic.co/guide"
  },
  {
    "id": "meilisearch",
    "name": "Meilisearch Blazing Fast Search",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://www.meilisearch.com/docs"
  },
  {
    "id": "typesense",
    "name": "Typesense Open Source Search",
    "bucket": "header_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://typesense.org/docs"
  },
  {
    "id": "algolia",
    "name": "Algolia Search & Discovery Engine",
    "bucket": "header_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://www.algolia.com/doc/api-reference/rest-api"
  },
  {
    "id": "neo4j",
    "name": "Neo4j Graph Database Cloud",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://neo4j.com/docs"
  },
  {
    "id": "surrealdb",
    "name": "SurrealDB Multi-Model Database",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://surrealdb.com/docs"
  },
  {
    "id": "planetscale",
    "name": "PlanetScale Serverless MySQL Platform",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://planetscale.com/docs"
  },
  {
    "id": "cockroachdb",
    "name": "CockroachDB Distributed SQL Cloud",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://www.cockroachlabs.com/docs"
  },
  {
    "id": "faunadb",
    "name": "Fauna Serverless Document-Relational",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.fauna.com"
  },
  {
    "id": "edgedb",
    "name": "EdgeDB Graph-Relational Database",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://www.edgedb.com/docs"
  },
  {
    "id": "influxdb",
    "name": "InfluxDB Time Series Cloud",
    "bucket": "header_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.influxdata.com/influxdb/cloud/api"
  },
  {
    "id": "timescale",
    "name": "TimescaleDB Time-Series Postgres",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.timescale.com"
  },
  {
    "id": "questdb",
    "name": "QuestDB Fast SQL Time Series",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://questdb.io/docs"
  },
  {
    "id": "scylladb",
    "name": "ScyllaDB Ultra-Fast NoSQL",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.scylladb.com"
  },
  {
    "id": "aerospike",
    "name": "Aerospike Real-Time Data Platform",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.aerospike.com"
  },
  {
    "id": "couchbase",
    "name": "Couchbase Capella Cloud NoSQL",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.couchbase.com"
  },
  {
    "id": "ravendb",
    "name": "RavenDB ACID NoSQL Document DB",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://ravendb.net/docs"
  },
  {
    "id": "memcached",
    "name": "Memcached Distributed Memory Cache",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://memcached.org"
  },
  {
    "id": "dragonflydb",
    "name": "Dragonfly High Performance Cache",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://www.dragonflydb.io/docs"
  },
  {
    "id": "keydb",
    "name": "KeyDB Multithreaded Redis Alternative",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.keydb.dev"
  },
  {
    "id": "aws_dynamodb",
    "name": "Amazon DynamoDB Managed NoSQL",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.aws.amazon.com/amazondynamodb"
  },
  {
    "id": "aws_rds",
    "name": "Amazon Relational Database Service (RDS)",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.aws.amazon.com/rds"
  },
  {
    "id": "aws_redshift",
    "name": "Amazon Redshift Cloud Data Warehouse",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.aws.amazon.com/redshift"
  },
  {
    "id": "azure_cosmosdb",
    "name": "Azure Cosmos DB Global Multi-Model",
    "bucket": "header_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://learn.microsoft.com/en-us/azure/cosmos-db"
  },
  {
    "id": "azure_sql",
    "name": "Azure SQL Database",
    "bucket": "oauth2_managed",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://learn.microsoft.com/en-us/azure/azure-sql"
  },
  {
    "id": "firestore",
    "name": "Google Cloud Firestore NoSQL",
    "bucket": "oauth2_managed",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://firebase.google.com/docs/firestore"
  },
  {
    "id": "cloud_spanner",
    "name": "Google Cloud Spanner Global SQL",
    "bucket": "oauth2_managed",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://cloud.google.com/spanner/docs"
  },
  {
    "id": "cloud_sql",
    "name": "Google Cloud SQL",
    "bucket": "oauth2_managed",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://cloud.google.com/sql/docs"
  },
  {
    "id": "motherduck",
    "name": "MotherDuck Serverless DuckDB Cloud",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://motherduck.com/docs"
  },
  {
    "id": "singlestore",
    "name": "SingleStore Real-Time Analytics",
    "bucket": "basic_auth",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.singlestore.com"
  },
  {
    "id": "auth0",
    "name": "Auth0 by Okta Identity Platform",
    "bucket": "oauth2_managed",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://auth0.com/docs/api"
  },
  {
    "id": "okta",
    "name": "Okta Workforce & Customer Identity",
    "bucket": "header_auth",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://developer.okta.com/docs/api"
  },
  {
    "id": "clerk",
    "name": "Clerk Authentication & User Management",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://clerk.com/docs/reference/backend-api"
  },
  {
    "id": "stytch",
    "name": "Stytch Passwordless & B2B Auth",
    "bucket": "basic_auth",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://stytch.com/docs"
  },
  {
    "id": "kinde",
    "name": "Kinde Auth for Modern Applications",
    "bucket": "oauth2_managed",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://kinde.com/docs"
  },
  {
    "id": "workos",
    "name": "WorkOS Enterprise SSO, SCIM & FGA",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://workos.com/docs"
  },
  {
    "id": "onelogin",
    "name": "OneLogin Cloud Identity",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://developers.onelogin.com/api-docs"
  },
  {
    "id": "ping_identity",
    "name": "Ping Identity Enterprise Orchestration",
    "bucket": "oauth2_managed",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.pingidentity.com"
  },
  {
    "id": "descope",
    "name": "Descope Visual Drag & Drop Auth",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.descope.com"
  },
  {
    "id": "supertokens",
    "name": "SuperTokens Open Source Identity",
    "bucket": "header_auth",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://supertokens.com/docs"
  },
  {
    "id": "ory_cloud",
    "name": "Ory Kratos & Hydra Identity Cloud",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://www.ory.sh/docs"
  },
  {
    "id": "keycloak",
    "name": "Keycloak Open Source IAM",
    "bucket": "oauth2_managed",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://www.keycloak.org/docs-api"
  },
  {
    "id": "fusionauth",
    "name": "FusionAuth Customer Authentication",
    "bucket": "header_auth",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://fusionauth.io/docs"
  },
  {
    "id": "1password_connect",
    "name": "1Password Connect Secrets Server",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://developer.1password.com/docs/connect"
  },
  {
    "id": "bitwarden_secrets",
    "name": "Bitwarden Secrets Manager",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://bitwarden.com/help/secrets-manager-overview"
  },
  {
    "id": "doppler",
    "name": "Doppler Enterprise Secrets Sync",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.doppler.com/reference/api"
  },
  {
    "id": "infisical",
    "name": "Infisical Open Source Secret Management",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://infisical.com/docs"
  },
  {
    "id": "crowdstrike",
    "name": "CrowdStrike Falcon Cybersecurity",
    "bucket": "oauth2_managed",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://falcon.crowdstrike.com/documentation"
  },
  {
    "id": "palo_alto_cortex",
    "name": "Palo Alto Networks Cortex XDR",
    "bucket": "header_auth",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://cortex.pan.dev"
  },
  {
    "id": "sentinel_one",
    "name": "SentinelOne Singularity Platform",
    "bucket": "header_auth",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://www.sentinelone.com"
  },
  {
    "id": "splunk_phantom",
    "name": "Splunk SOAR / Phantom Automation",
    "bucket": "header_auth",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.splunk.com/Documentation/SOAR"
  },
  {
    "id": "torq",
    "name": "Torq Security Hyperautomation",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.torq.io"
  },
  {
    "id": "tines",
    "name": "Tines Smart Security Automation",
    "bucket": "header_auth",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://www.tines.com/docs"
  },
  {
    "id": "swimlane",
    "name": "Swimlane Turbine Security Engine",
    "bucket": "basic_auth",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://swimlane.com"
  },
  {
    "id": "vanta",
    "name": "Vanta Automated Trust & Compliance",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://developer.vanta.com"
  },
  {
    "id": "drata",
    "name": "Drata Continuous Compliance Monitoring",
    "bucket": "header_auth",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://developers.drata.com"
  },
  {
    "id": "secureframe",
    "name": "Secureframe Automated Compliance",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://secureframe.com"
  },
  {
    "id": "hyperproof",
    "name": "Hyperproof Compliance Operations",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://hyperproof.io"
  },
  {
    "id": "knowbe4",
    "name": "KnowBe4 Security Awareness Training",
    "bucket": "header_auth",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://developer.knowbe4.com"
  },
  {
    "id": "veracode",
    "name": "Veracode Application Security",
    "bucket": "basic_auth",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.veracode.com"
  },
  {
    "id": "checkmarx",
    "name": "Checkmarx AppSec Cloud",
    "bucket": "oauth2_managed",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://checkmarx.com"
  },
  {
    "id": "contrast_security",
    "name": "Contrast Security Code Assessment",
    "bucket": "header_auth",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.contrastsecurity.com"
  },
  {
    "id": "aqua_security",
    "name": "Aqua Security Cloud Native Security",
    "bucket": "basic_auth",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.aquasec.com"
  },
  {
    "id": "lacework",
    "name": "Lacework Data-Driven Cloud Security",
    "bucket": "header_auth",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://lacework.com"
  },
  {
    "id": "wiz_cloud",
    "name": "Wiz Cloud Security Graph",
    "bucket": "oauth2_managed",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.wiz.io"
  },
  {
    "id": "twitter_x",
    "name": "X / Twitter REST API v2",
    "bucket": "oauth2_managed",
    "category": "Social Media & Video",
    "documentationUrl": "https://developer.x.com/en/docs/twitter-api"
  },
  {
    "id": "linkedin",
    "name": "LinkedIn Consumer & Share API",
    "bucket": "oauth2_managed",
    "category": "Social Media & Video",
    "documentationUrl": "https://learn.microsoft.com/en-us/linkedin/consumer"
  },
  {
    "id": "facebook_graph",
    "name": "Meta / Facebook Graph API",
    "bucket": "bearer_token",
    "category": "Social Media & Video",
    "documentationUrl": "https://developers.facebook.com/docs/graph-api"
  },
  {
    "id": "instagram_graph",
    "name": "Instagram Graph API for Business",
    "bucket": "bearer_token",
    "category": "Social Media & Video",
    "documentationUrl": "https://developers.facebook.com/docs/instagram-api"
  },
  {
    "id": "youtube_data",
    "name": "YouTube Data API v3",
    "bucket": "oauth2_managed",
    "category": "Social Media & Video",
    "documentationUrl": "https://developers.google.com/youtube/v3"
  },
  {
    "id": "tiktok_content",
    "name": "TikTok Display & Content Posting",
    "bucket": "oauth2_managed",
    "category": "Social Media & Video",
    "documentationUrl": "https://developers.tiktok.com/doc/overview"
  },
  {
    "id": "reddit",
    "name": "Reddit Content & Community API",
    "bucket": "oauth2_managed",
    "category": "Social Media & Video",
    "documentationUrl": "https://www.reddit.com/dev/api"
  },
  {
    "id": "pinterest",
    "name": "Pinterest Boards & Pins API",
    "bucket": "bearer_token",
    "category": "Social Media & Video",
    "documentationUrl": "https://developers.pinterest.com/docs/api/v5"
  },
  {
    "id": "twitch",
    "name": "Twitch Interactive Live Streaming",
    "bucket": "oauth2_managed",
    "category": "Social Media & Video",
    "documentationUrl": "https://dev.twitch.tv/docs/api"
  },
  {
    "id": "vimeo",
    "name": "Vimeo Video Hosting & OTT",
    "bucket": "bearer_token",
    "category": "Social Media & Video",
    "documentationUrl": "https://developer.vimeo.com/api/guides/start"
  },
  {
    "id": "threads_meta",
    "name": "Threads API by Meta",
    "bucket": "bearer_token",
    "category": "Social Media & Video",
    "documentationUrl": "https://developers.facebook.com/docs/threads"
  },
  {
    "id": "bluesky_atproto",
    "name": "Bluesky / AT Protocol Decentralized",
    "bucket": "basic_auth",
    "category": "Social Media & Video",
    "documentationUrl": "https://atproto.com/docs"
  },
  {
    "id": "mastodon",
    "name": "Mastodon Fediverse Social API",
    "bucket": "bearer_token",
    "category": "Social Media & Video",
    "documentationUrl": "https://docs.joinmastodon.org/client/intro"
  },
  {
    "id": "snapchat_creative",
    "name": "Snapchat Creative Kit & Stories",
    "bucket": "oauth2_managed",
    "category": "Social Media & Video",
    "documentationUrl": "https://docs.snap.com"
  },
  {
    "id": "spotify_web",
    "name": "Spotify Web API & Playlists",
    "bucket": "oauth2_managed",
    "category": "Social Media & Video",
    "documentationUrl": "https://developer.spotify.com/documentation/web-api"
  },
  {
    "id": "soundcloud",
    "name": "SoundCloud Audio Streaming",
    "bucket": "oauth2_managed",
    "category": "Social Media & Video",
    "documentationUrl": "https://developers.soundcloud.com"
  },
  {
    "id": "apple_podcasts",
    "name": "Apple Podcasts Connect API",
    "bucket": "bearer_token",
    "category": "Social Media & Video",
    "documentationUrl": "https://help.apple.com/itc/podcasts_connect"
  },
  {
    "id": "wistia",
    "name": "Wistia Business Video Hosting",
    "bucket": "basic_auth",
    "category": "Social Media & Video",
    "documentationUrl": "https://wistia.com/support/developers/data-api"
  },
  {
    "id": "vidyard",
    "name": "Vidyard Video Messaging for Sales",
    "bucket": "bearer_token",
    "category": "Social Media & Video",
    "documentationUrl": "https://developer.vidyard.com"
  },
  {
    "id": "streamyard",
    "name": "StreamYard Broadcast Automation",
    "bucket": "oauth2_managed",
    "category": "Social Media & Video",
    "documentationUrl": "https://streamyard.com"
  },
  {
    "id": "restream",
    "name": "Restream Multi-Streaming Platform",
    "bucket": "oauth2_managed",
    "category": "Social Media & Video",
    "documentationUrl": "https://restream.io/developers"
  },
  {
    "id": "dailymotion",
    "name": "Dailymotion Video Platform",
    "bucket": "oauth2_managed",
    "category": "Social Media & Video",
    "documentationUrl": "https://developers.dailymotion.com"
  },
  {
    "id": "mux_video",
    "name": "Mux Video Streaming & Encoding",
    "bucket": "basic_auth",
    "category": "Social Media & Video",
    "documentationUrl": "https://docs.mux.com/api-reference"
  },
  {
    "id": "api_video",
    "name": "api.video On-Demand & Live Streaming",
    "bucket": "header_auth",
    "category": "Social Media & Video",
    "documentationUrl": "https://docs.api.video"
  },
  {
    "id": "livepeer",
    "name": "Livepeer Decentralized Video Infrastructure",
    "bucket": "bearer_token",
    "category": "Social Media & Video",
    "documentationUrl": "https://docs.livepeer.org"
  },
  {
    "id": "agora_io",
    "name": "Agora Real-Time Voice & Video RTC",
    "bucket": "basic_auth",
    "category": "Social Media & Video",
    "documentationUrl": "https://docs.agora.io/en"
  },
  {
    "id": "daily_co",
    "name": "Daily.co Real-Time WebRTC Video Calls",
    "bucket": "bearer_token",
    "category": "Social Media & Video",
    "documentationUrl": "https://docs.daily.co"
  },
  {
    "id": "whereby",
    "name": "Whereby Embedded Video Meetings",
    "bucket": "bearer_token",
    "category": "Social Media & Video",
    "documentationUrl": "https://whereby.com/information/embedded/docs"
  },
  {
    "id": "livekit",
    "name": "LiveKit Open Source WebRTC Engine",
    "bucket": "basic_auth",
    "category": "Social Media & Video",
    "documentationUrl": "https://docs.livekit.io"
  },
  {
    "id": "dyte_io",
    "name": "Dyte Interactive RTC SDKs",
    "bucket": "basic_auth",
    "category": "Social Media & Video",
    "documentationUrl": "https://docs.dyte.io"
  },
  {
    "id": "quickbooks_online",
    "name": "Intuit QuickBooks Online Accounting",
    "bucket": "oauth2_managed",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://developer.intuit.com/app/developer/qbo/docs/develop"
  },
  {
    "id": "xero",
    "name": "Xero Cloud Accounting Software",
    "bucket": "oauth2_managed",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://developer.xero.com/documentation/api/accounting/overview"
  },
  {
    "id": "netsuite",
    "name": "Oracle NetSuite Cloud ERP",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.oracle.com/en/cloud/saas/netsuite"
  },
  {
    "id": "sap_s4hana",
    "name": "SAP S/4HANA Cloud ERP Platform",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://api.sap.com"
  },
  {
    "id": "freshbooks",
    "name": "FreshBooks Cloud Accounting & Billing",
    "bucket": "oauth2_managed",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://www.freshbooks.com/api/start"
  },
  {
    "id": "wave_apps",
    "name": "Wave Financial Invoicing & Payments",
    "bucket": "bearer_token",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://developer.waveapps.com"
  },
  {
    "id": "gusto",
    "name": "Gusto People Platform & Payroll",
    "bucket": "oauth2_managed",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.gusto.com"
  },
  {
    "id": "deel",
    "name": "Deel Global Payroll & Contractor Compliance",
    "bucket": "bearer_token",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://developer.deel.com"
  },
  {
    "id": "rippling",
    "name": "Rippling Unified HR, IT & Finance",
    "bucket": "bearer_token",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://developer.rippling.com"
  },
  {
    "id": "expensify",
    "name": "Expensify Real-Time Expense Reports",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://integrations.expensify.com/Integration-Server/doc"
  },
  {
    "id": "ramp",
    "name": "Ramp Corporate Cards & Finance Ops",
    "bucket": "bearer_token",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.ramp.com/developer-api"
  },
  {
    "id": "brex",
    "name": "Brex Corporate Cards & Global Spend",
    "bucket": "bearer_token",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://developer.brex.com"
  },
  {
    "id": "bamboohr",
    "name": "BambooHR Complete HR Software",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://documentation.bamboohr.com"
  },
  {
    "id": "workday",
    "name": "Workday Enterprise Management Cloud",
    "bucket": "oauth2_managed",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://developer.workday.com"
  },
  {
    "id": "hibob",
    "name": "Bob (HiBob) People Management Platform",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://apidocs.hibob.com"
  },
  {
    "id": "personio",
    "name": "Personio All-in-One HR Software",
    "bucket": "bearer_token",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://developer.personio.de"
  },
  {
    "id": "greenhouse",
    "name": "Greenhouse Recruiting & ATS",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://developers.greenhouse.io"
  },
  {
    "id": "lever",
    "name": "Lever Talent Acquisition Suite",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://hire.lever.co/developer/documentation"
  },
  {
    "id": "workable",
    "name": "Workable Recruiting Software & ATS",
    "bucket": "bearer_token",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://workable.readme.io"
  },
  {
    "id": "ashby",
    "name": "Ashby High-Growth Recruiting Platform",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://developers.ashbyhq.com"
  },
  {
    "id": "recruitee",
    "name": "Recruitee Collaborative Hiring",
    "bucket": "bearer_token",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.recruitee.com"
  },
  {
    "id": "jazzhr",
    "name": "JazzHR Powerful ATS Software",
    "bucket": "query_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://help.jazzhr.com"
  },
  {
    "id": "fountain",
    "name": "Fountain High-Volume Hiring",
    "bucket": "header_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://developer.fountain.com"
  },
  {
    "id": "dover_hiring",
    "name": "Dover AI Recruiting Automation",
    "bucket": "bearer_token",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://dover.com"
  },
  {
    "id": "remote_com",
    "name": "Remote.com Global Employment Platform",
    "bucket": "bearer_token",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://remote.com/developer-api"
  },
  {
    "id": "mcp_generic",
    "name": "Generic Model Context Protocol Server",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_agentflow",
    "name": "AgentFlow MCP Tool Engine",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://agentflow.ai/docs/mcp"
  },
  {
    "id": "mcp_filesystem",
    "name": "MCP Local Filesystem Inspector",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_github",
    "name": "MCP GitHub Issue & PR Explorer",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_postgres",
    "name": "MCP PostgreSQL Schema & Query Engine",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_brave_search",
    "name": "MCP Brave Web Search Provider",
    "bucket": "api_key",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_google_drive",
    "name": "MCP Google Drive Document Navigator",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_slack",
    "name": "MCP Slack Channel Reader & Dispatcher",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_puppeteer",
    "name": "MCP Headless Puppeteer Browser",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_memory",
    "name": "MCP Graph Memory Knowledge Base",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_docker",
    "name": "MCP Docker Container Controller",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_fetch",
    "name": "MCP Secure Web Fetch & HTML Convert",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_git",
    "name": "MCP Local Git Worktree & Branching",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_sentry",
    "name": "MCP Sentry Error Analysis Assistant",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_cloudflare",
    "name": "MCP Cloudflare Workers & KV Tools",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_linear",
    "name": "MCP Linear Task Planning Assistant",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_kubernetes",
    "name": "MCP Kubernetes Cluster Diagnostics",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_redis",
    "name": "MCP Redis Cache Explorer & CLI",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_sqlite",
    "name": "MCP SQLite Embedded DB Reader",
    "bucket": "mcp_oauth2",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "mcp_everart",
    "name": "MCP EverArt Generative Image Creator",
    "bucket": "api_key",
    "category": "Model Context Protocol (MCP) & AI Agents",
    "documentationUrl": "https://modelcontextprotocol.io"
  },
  {
    "id": "ironclad",
    "name": "Ironclad Contract Lifecycle Management",
    "bucket": "bearer_token",
    "category": "Legal & Contracts",
    "documentationUrl": "https://ironcladapp.com"
  },
  {
    "id": "clio",
    "name": "Clio Cloud Legal Practice Management",
    "bucket": "oauth2_managed",
    "category": "Legal & Contracts",
    "documentationUrl": "https://app.clio.com/api/v4/documentation"
  },
  {
    "id": "conga",
    "name": "Conga Revenue & Contract Lifecycle",
    "bucket": "oauth2_managed",
    "category": "Legal & Contracts",
    "documentationUrl": "https://conga.com"
  },
  {
    "id": "contractbook",
    "name": "Contractbook Digital Contracts",
    "bucket": "bearer_token",
    "category": "Legal & Contracts",
    "documentationUrl": "https://contractbook.com"
  },
  {
    "id": "docue",
    "name": "Docue Automated Legal Document Drafting",
    "bucket": "bearer_token",
    "category": "Legal & Contracts",
    "documentationUrl": "https://docue.com"
  },
  {
    "id": "buildium",
    "name": "Buildium Property Management",
    "bucket": "header_auth",
    "category": "Real Estate & Property",
    "documentationUrl": "https://developer.buildium.com"
  },
  {
    "id": "appfolio",
    "name": "AppFolio Real Estate Operations",
    "bucket": "oauth2_managed",
    "category": "Real Estate & Property",
    "documentationUrl": "https://www.appfolio.com"
  },
  {
    "id": "yardi_voyager",
    "name": "Yardi Voyager Real Estate ERP",
    "bucket": "basic_auth",
    "category": "Real Estate & Property",
    "documentationUrl": "https://www.yardi.com"
  },
  {
    "id": "rent_manager",
    "name": "Rent Manager Property Software",
    "bucket": "header_auth",
    "category": "Real Estate & Property",
    "documentationUrl": "https://developer.rentmanager.com"
  },
  {
    "id": "entrata",
    "name": "Entrata Multifamily Management",
    "bucket": "basic_auth",
    "category": "Real Estate & Property",
    "documentationUrl": "https://www.entrata.com"
  },
  {
    "id": "canvas_lms",
    "name": "Instructure Canvas LMS",
    "bucket": "bearer_token",
    "category": "Education & LMS",
    "documentationUrl": "https://canvas.instructure.com/doc/api"
  },
  {
    "id": "blackboard_learn",
    "name": "Blackboard Learn LMS",
    "bucket": "oauth2_managed",
    "category": "Education & LMS",
    "documentationUrl": "https://developer.anthology.com"
  },
  {
    "id": "moodle",
    "name": "Moodle Open-Source Learning Management",
    "bucket": "query_auth",
    "category": "Education & LMS",
    "documentationUrl": "https://docs.moodle.org/dev/Web_services"
  },
  {
    "id": "teachable",
    "name": "Teachable Online Course Platform",
    "bucket": "header_auth",
    "category": "Education & LMS",
    "documentationUrl": "https://docs.teachable.com"
  },
  {
    "id": "thinkific",
    "name": "Thinkific Course & Community Platform",
    "bucket": "header_auth",
    "category": "Education & LMS",
    "documentationUrl": "https://developers.thinkific.com"
  },
  {
    "id": "kajabi",
    "name": "Kajabi All-in-One Creator Platform",
    "bucket": "basic_auth",
    "category": "Education & LMS",
    "documentationUrl": "https://kajabi.com"
  },
  {
    "id": "epic_fhir",
    "name": "Epic Systems FHIR Healthcare",
    "bucket": "oauth2_managed",
    "category": "Healthcare & Telehealth",
    "documentationUrl": "https://fhir.epic.com"
  },
  {
    "id": "cerner_fhir",
    "name": "Oracle Cerner Millenium FHIR",
    "bucket": "oauth2_managed",
    "category": "Healthcare & Telehealth",
    "documentationUrl": "https://fhir.cerner.com"
  },
  {
    "id": "athenahealth",
    "name": "athenahealth Cloud Electronic Health",
    "bucket": "oauth2_managed",
    "category": "Healthcare & Telehealth",
    "documentationUrl": "https://developer.athenahealth.com"
  },
  {
    "id": "doximity",
    "name": "Doximity Clinician Network",
    "bucket": "oauth2_managed",
    "category": "Healthcare & Telehealth",
    "documentationUrl": "https://www.doximity.com"
  },
  {
    "id": "kareo",
    "name": "Kareo Clinical EHR Platform",
    "bucket": "basic_auth",
    "category": "Healthcare & Telehealth",
    "documentationUrl": "https://www.kareo.com"
  },
  {
    "id": "practice_better",
    "name": "Practice Better Wellness EHR",
    "bucket": "header_auth",
    "category": "Healthcare & Telehealth",
    "documentationUrl": "https://practicebetter.io"
  },
  {
    "id": "eventbrite",
    "name": "Eventbrite Event Management & Tickets",
    "bucket": "bearer_token",
    "category": "Events & Hospitality",
    "documentationUrl": "https://www.eventbrite.com/platform/api"
  },
  {
    "id": "cvent",
    "name": "Cvent Event Management Cloud",
    "bucket": "oauth2_managed",
    "category": "Events & Hospitality",
    "documentationUrl": "https://developers.cvent.com"
  },
  {
    "id": "amadeus_travel",
    "name": "Amadeus Global Travel APIs",
    "bucket": "oauth2_managed",
    "category": "Events & Hospitality",
    "documentationUrl": "https://developers.amadeus.com"
  },
  {
    "id": "sabre_travel",
    "name": "Sabre Travel Network APIs",
    "bucket": "basic_auth",
    "category": "Events & Hospitality",
    "documentationUrl": "https://developer.sabre.com"
  },
  {
    "id": "duffel",
    "name": "Duffel Complete Flight Booking API",
    "bucket": "bearer_token",
    "category": "Events & Hospitality",
    "documentationUrl": "https://duffel.com/docs"
  },
  {
    "id": "tripactions_navan",
    "name": "Navan (TripActions) Travel & Spend",
    "bucket": "bearer_token",
    "category": "Events & Hospitality",
    "documentationUrl": "https://navan.com"
  },
  {
    "id": "cohere_embed",
    "name": "Cohere Multi-Lingual Embeddings",
    "bucket": "api_key",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.cohereembed.com"
  },
  {
    "id": "aleph_alpha_luminous",
    "name": "Aleph Alpha Luminous Extended",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.alephalphaluminous.com"
  },
  {
    "id": "deepseek_r1",
    "name": "DeepSeek R1 Reasoning Model",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.deepseekr1.com"
  },
  {
    "id": "qwen_alibaba",
    "name": "Alibaba Cloud Qwen LLM",
    "bucket": "header_auth",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.qwenalibaba.com"
  },
  {
    "id": "baichuan_ai",
    "name": "Baichuan AI Intelligence",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.baichuanai.com"
  },
  {
    "id": "zhipu_glm",
    "name": "Zhipu AI GLM-4 Series",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.zhipuglm.com"
  },
  {
    "id": "moonshot_kimi",
    "name": "Moonshot AI Kimi Long Context",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.moonshotkimi.com"
  },
  {
    "id": "yi_01_ai",
    "name": "01.AI Yi-Lightning Models",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.yi01ai.com"
  },
  {
    "id": "sensenova",
    "name": "SenseTime SenseNova Platform",
    "bucket": "header_auth",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.sensenova.com"
  },
  {
    "id": "coze_ai",
    "name": "Coze AI Agent Platform by ByteDance",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.cozeai.com"
  },
  {
    "id": "dify_ai",
    "name": "Dify.ai Open-Source LLM App Engine",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.difyai.com"
  },
  {
    "id": "flowise_ai",
    "name": "Flowise Low-Code LLM Automation",
    "bucket": "header_auth",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.flowiseai.com"
  },
  {
    "id": "langflow",
    "name": "Langflow UI Engine for RAG",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.langflow.com"
  },
  {
    "id": "crewai_enterprise",
    "name": "CrewAI Multi-Agent Cloud",
    "bucket": "bearer_token",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.crewaienterprise.com"
  },
  {
    "id": "autogen_studio",
    "name": "Microsoft AutoGen Studio API",
    "bucket": "basic_auth",
    "category": "AI & Machine Learning",
    "documentationUrl": "https://docs.autogenstudio.com"
  },
  {
    "id": "zendesk_support",
    "name": "Zendesk Support Helpdesk",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://docs.zendesksupport.com"
  },
  {
    "id": "freshdesk",
    "name": "Freshdesk Customer Support",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://docs.freshdesk.com"
  },
  {
    "id": "helpscout",
    "name": "Help Scout Customer Service",
    "bucket": "bearer_token",
    "category": "CRM & Sales",
    "documentationUrl": "https://docs.helpscout.com"
  },
  {
    "id": "gorgias",
    "name": "Gorgias E-Commerce Customer Service",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://docs.gorgias.com"
  },
  {
    "id": "kustomer",
    "name": "Kustomer Omnichannel CRM",
    "bucket": "bearer_token",
    "category": "CRM & Sales",
    "documentationUrl": "https://docs.kustomer.com"
  },
  {
    "id": "kayako",
    "name": "Kayako Help Desk Software",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://docs.kayako.com"
  },
  {
    "id": "groove_hq",
    "name": "Groove Helpdesk for Growing Teams",
    "bucket": "header_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://docs.groovehq.com"
  },
  {
    "id": "livechat_inc",
    "name": "LiveChat Customer Service Platform",
    "bucket": "bearer_token",
    "category": "CRM & Sales",
    "documentationUrl": "https://docs.livechatinc.com"
  },
  {
    "id": "tawk_to",
    "name": "tawk.to 100% Free Live Chat",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://docs.tawkto.com"
  },
  {
    "id": "chaport",
    "name": "Chaport Live Chat & Chatbots",
    "bucket": "basic_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://docs.chaport.com"
  },
  {
    "id": "tidio",
    "name": "Tidio Customer Service & Lyro AI",
    "bucket": "header_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://docs.tidio.com"
  },
  {
    "id": "smartsupp",
    "name": "Smartsupp Live Chat & Visitor Recordings",
    "bucket": "header_auth",
    "category": "CRM & Sales",
    "documentationUrl": "https://docs.smartsupp.com"
  },
  {
    "id": "shipstation",
    "name": "ShipStation Shipping Software",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.shipstation.com"
  },
  {
    "id": "shippo",
    "name": "Shippo Multi-Carrier Shipping API",
    "bucket": "header_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.shippo.com"
  },
  {
    "id": "easypost",
    "name": "EasyPost Multi-Carrier Logistics",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.easypost.com"
  },
  {
    "id": "fedex_developer",
    "name": "FedEx Compatible Developer API",
    "bucket": "oauth2_managed",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fedexdeveloper.com"
  },
  {
    "id": "ups_developer",
    "name": "UPS Developer API Portal",
    "bucket": "oauth2_managed",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.upsdeveloper.com"
  },
  {
    "id": "dhl_express",
    "name": "DHL Express Global Shipping API",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.dhlexpress.com"
  },
  {
    "id": "usps_web_tools",
    "name": "USPS Web Tools API",
    "bucket": "basic_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.uspswebtools.com"
  },
  {
    "id": "aftership",
    "name": "AfterShip Global Tracking & Returns",
    "bucket": "header_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.aftership.com"
  },
  {
    "id": "narvar",
    "name": "Narvar Post-Purchase Experience",
    "bucket": "header_auth",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.narvar.com"
  },
  {
    "id": "printful",
    "name": "Printful Print-on-Demand Dropshipping",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.printful.com"
  },
  {
    "id": "printify",
    "name": "Printify Print on Demand Network",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.printify.com"
  },
  {
    "id": "fintech_openbb_financial_terminal",
    "name": "OpenBB Financial Terminal",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechopenbbfinancialterminal.com"
  },
  {
    "id": "fintech_alpaca_trading_api",
    "name": "Alpaca Trading API",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechalpacatradingapi.com"
  },
  {
    "id": "fintech_polygon_io_market_data",
    "name": "Polygon.io Market Data",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechpolygoniomarketdata.com"
  },
  {
    "id": "fintech_iex_cloud_financial",
    "name": "IEX Cloud Financial",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechiexcloudfinancial.com"
  },
  {
    "id": "fintech_alpha_vantage_stock_api",
    "name": "Alpha Vantage Stock API",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechalphavantagestockapi.com"
  },
  {
    "id": "fintech_finnhub_financial_data",
    "name": "Finnhub Financial Data",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechfinnhubfinancialdata.com"
  },
  {
    "id": "fintech_coingecko_crypto_api",
    "name": "CoinGecko Crypto API",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechcoingeckocryptoapi.com"
  },
  {
    "id": "fintech_coinmarketcap_api",
    "name": "CoinMarketCap API",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechcoinmarketcapapi.com"
  },
  {
    "id": "fintech_etherscan_blockchain_explorer",
    "name": "Etherscan Blockchain Explorer",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechetherscanblockchainexplorer.com"
  },
  {
    "id": "fintech_bscscan_explorer_api",
    "name": "BscScan Explorer API",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechbscscanexplorerapi.com"
  },
  {
    "id": "fintech_solscan_solana_explorer",
    "name": "Solscan Solana Explorer",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechsolscansolanaexplorer.com"
  },
  {
    "id": "fintech_moralis_web3_apis",
    "name": "Moralis Web3 APIs",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechmoralisweb3apis.com"
  },
  {
    "id": "fintech_alchemy_ethereum_node",
    "name": "Alchemy Ethereum Node",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechalchemyethereumnode.com"
  },
  {
    "id": "fintech_infura_web3_node_service",
    "name": "Infura Web3 Node Service",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechinfuraweb3nodeservice.com"
  },
  {
    "id": "fintech_quicknode_global_web3",
    "name": "QuickNode Global Web3",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechquicknodeglobalweb3.com"
  },
  {
    "id": "fintech_tatum_blockchain_gateway",
    "name": "Tatum Blockchain Gateway",
    "bucket": "bearer_token",
    "category": "Payments & Commerce",
    "documentationUrl": "https://docs.fintechtatumblockchaingateway.com"
  },
  {
    "id": "marketing_tool_buzzsumo_content_insights",
    "name": "BuzzSumo Content Insights",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtoolbuzzsumocontentinsights.com"
  },
  {
    "id": "marketing_tool_sprout_social_management",
    "name": "Sprout Social Management",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtoolsproutsocialmanagement.com"
  },
  {
    "id": "marketing_tool_hootsuite_social_media_cloud",
    "name": "Hootsuite Social Media Cloud",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtoolhootsuitesocialmediacloud.com"
  },
  {
    "id": "marketing_tool_buffer_social_publishing",
    "name": "Buffer Social Publishing",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtoolbuffersocialpublishing.com"
  },
  {
    "id": "marketing_tool_later_visual_social_scheduler",
    "name": "Later Visual Social Scheduler",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtoollatervisualsocialscheduler.com"
  },
  {
    "id": "marketing_tool_agorapulse_social_inbox",
    "name": "Agorapulse Social Inbox",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtoolagorapulsesocialinbox.com"
  },
  {
    "id": "marketing_tool_mention_brand_monitoring",
    "name": "Mention Brand Monitoring",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtoolmentionbrandmonitoring.com"
  },
  {
    "id": "marketing_tool_brandwatch_consumer_intelligen",
    "name": "Brandwatch Consumer Intelligence",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtoolbrandwatchconsumerintelligen.com"
  },
  {
    "id": "marketing_tool_brand24_social_listening",
    "name": "Brand24 Social Listening",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtoolbrand24sociallistening.com"
  },
  {
    "id": "marketing_tool_talkwalker_social_analytics",
    "name": "Talkwalker Social Analytics",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtooltalkwalkersocialanalytics.com"
  },
  {
    "id": "marketing_tool_emplifi_social_marketing_cloud",
    "name": "Emplifi Social Marketing Cloud",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtoolemplifisocialmarketingcloud.com"
  },
  {
    "id": "marketing_tool_falcon_io_social_suite",
    "name": "Falcon.io Social Suite",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtoolfalconiosocialsuite.com"
  },
  {
    "id": "marketing_tool_sprinklr_unified_cxm",
    "name": "Sprinklr Unified CXM",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtoolsprinklrunifiedcxm.com"
  },
  {
    "id": "marketing_tool_planable_social_workflow",
    "name": "Planable Social Workflow",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtoolplanablesocialworkflow.com"
  },
  {
    "id": "marketing_tool_coschedule_marketing_calendar",
    "name": "CoSchedule Marketing Calendar",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtoolcoschedulemarketingcalendar.com"
  },
  {
    "id": "marketing_tool_meetedgar_evergreen_social",
    "name": "MeetEdgar Evergreen Social",
    "bucket": "header_auth",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.marketingtoolmeetedgarevergreensocial.com"
  },
  {
    "id": "dev_sec_trivy_container_vulnerability",
    "name": "Trivy Container Vulnerability",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devsectrivycontainervulnerability.com"
  },
  {
    "id": "dev_sec_checkov_iac_security_scanner",
    "name": "Checkov IaC Security Scanner",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devseccheckoviacsecurityscanner.com"
  },
  {
    "id": "dev_sec_gitleaks_secret_detection",
    "name": "Gitleaks Secret Detection",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devsecgitleakssecretdetection.com"
  },
  {
    "id": "dev_sec_semgrep_static_analysis",
    "name": "Semgrep Static Analysis",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devsecsemgrepstaticanalysis.com"
  },
  {
    "id": "dev_sec_sonarcloud_cloud_static_code",
    "name": "SonarCloud Cloud Static Code",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devsecsonarcloudcloudstaticcode.com"
  },
  {
    "id": "dev_sec_bearer_com_appsec_scanner",
    "name": "Bearer.com AppSec Scanner",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devsecbearercomappsecscanner.com"
  },
  {
    "id": "dev_sec_gitguardian_secret_detection",
    "name": "GitGuardian Secret Detection",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devsecgitguardiansecretdetection.com"
  },
  {
    "id": "dev_sec_spectralops_secret_security",
    "name": "SpectralOps Secret Security",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devsecspectralopssecretsecurity.com"
  },
  {
    "id": "dev_sec_bridgecrew_cloud_security",
    "name": "Bridgecrew Cloud Security",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devsecbridgecrewcloudsecurity.com"
  },
  {
    "id": "dev_sec_prisma_cloud_by_palo_alto",
    "name": "Prisma Cloud by Palo Alto",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devsecprismacloudbypaloalto.com"
  },
  {
    "id": "dev_sec_orca_security_cloud_cnapp",
    "name": "Orca Security Cloud CNAPP",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devsecorcasecuritycloudcnapp.com"
  },
  {
    "id": "dev_sec_sysdig_secure_monitor",
    "name": "Sysdig Secure & Monitor",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devsecsysdigsecuremonitor.com"
  },
  {
    "id": "dev_sec_deepfence_cloud_native_defense",
    "name": "Deepfence Cloud Native Defense",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devsecdeepfencecloudnativedefense.com"
  },
  {
    "id": "dev_sec_stackrox_kubernetes_security",
    "name": "StackRox Kubernetes Security",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devsecstackroxkubernetessecurity.com"
  },
  {
    "id": "dev_sec_neuvector_container_security",
    "name": "NeuVector Container Security",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devsecneuvectorcontainersecurity.com"
  },
  {
    "id": "dev_sec_falco_open_cloud_runtime",
    "name": "Falco Open Cloud Runtime",
    "bucket": "bearer_token",
    "category": "Security, Identity & Compliance",
    "documentationUrl": "https://docs.devsecfalcoopencloudruntime.com"
  },
  {
    "id": "data_pipeline_fivetran_automated_data_moveme",
    "name": "Fivetran Automated Data Movement",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelinefivetranautomateddatamoveme.com"
  },
  {
    "id": "data_pipeline_airbyte_open_source_elt",
    "name": "Airbyte Open Source ELT",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelineairbyteopensourceelt.com"
  },
  {
    "id": "data_pipeline_stitch_data_ingestion",
    "name": "Stitch Data Ingestion",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelinestitchdataingestion.com"
  },
  {
    "id": "data_pipeline_hevo_data_real_time_pipelines",
    "name": "Hevo Data Real-Time Pipelines",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelinehevodatarealtimepipelines.com"
  },
  {
    "id": "data_pipeline_meltano_dataops_platform",
    "name": "Meltano DataOps Platform",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelinemeltanodataopsplatform.com"
  },
  {
    "id": "data_pipeline_dbt_cloud_data_transformation",
    "name": "dbt Cloud Data Transformation",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelinedbtclouddatatransformation.com"
  },
  {
    "id": "data_pipeline_dagster_orchestration_platform",
    "name": "Dagster Orchestration Platform",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelinedagsterorchestrationplatform.com"
  },
  {
    "id": "data_pipeline_prefect_modern_workflow_engine",
    "name": "Prefect Modern Workflow Engine",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelineprefectmodernworkflowengine.com"
  },
  {
    "id": "data_pipeline_apache_airflow_managed",
    "name": "Apache Airflow Managed",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelineapacheairflowmanaged.com"
  },
  {
    "id": "data_pipeline_astronomer_airflow_cloud",
    "name": "Astronomer Airflow Cloud",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelineastronomerairflowcloud.com"
  },
  {
    "id": "data_pipeline_temporal_distributed_state",
    "name": "Temporal Distributed State",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelinetemporaldistributedstate.com"
  },
  {
    "id": "data_pipeline_inngest_event_driven_workflows",
    "name": "Inngest Event-Driven Workflows",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelineinngesteventdrivenworkflows.com"
  },
  {
    "id": "data_pipeline_trigger_dev_background_jobs",
    "name": "Trigger.dev Background Jobs",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelinetriggerdevbackgroundjobs.com"
  },
  {
    "id": "data_pipeline_qstash_serverless_messaging",
    "name": "QStash Serverless Messaging",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelineqstashserverlessmessaging.com"
  },
  {
    "id": "data_pipeline_kafka_confluent_cloud",
    "name": "Kafka Confluent Cloud",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelinekafkaconfluentcloud.com"
  },
  {
    "id": "data_pipeline_redpanda_streaming_data",
    "name": "Redpanda Streaming Data",
    "bucket": "bearer_token",
    "category": "Databases, Caches & Data Warehouses",
    "documentationUrl": "https://docs.datapipelineredpandastreamingdata.com"
  },
  {
    "id": "media_cdn_cloudinary_media_image_cdn",
    "name": "Cloudinary Media & Image CDN",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdncloudinarymediaimagecdn.com"
  },
  {
    "id": "media_cdn_imgix_real_time_image_processi",
    "name": "Imgix Real-Time Image Processing",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdnimgixrealtimeimageprocessi.com"
  },
  {
    "id": "media_cdn_imagekit_intelligent_media_cdn",
    "name": "ImageKit Intelligent Media CDN",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdnimagekitintelligentmediacdn.com"
  },
  {
    "id": "media_cdn_uploadcare_file_management",
    "name": "Uploadcare File Management",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdnuploadcarefilemanagement.com"
  },
  {
    "id": "media_cdn_filestack_file_uploading_api",
    "name": "Filestack File Uploading API",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdnfilestackfileuploadingapi.com"
  },
  {
    "id": "media_cdn_transloadit_media_encoding",
    "name": "Transloadit Media Encoding",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdntransloaditmediaencoding.com"
  },
  {
    "id": "media_cdn_cloudconvert_file_conversion",
    "name": "CloudConvert File Conversion",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdncloudconvertfileconversion.com"
  },
  {
    "id": "media_cdn_zamzar_file_conversion_api",
    "name": "Zamzar File Conversion API",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdnzamzarfileconversionapi.com"
  },
  {
    "id": "media_cdn_pdftron_document_sdk_cloud",
    "name": "PDFTron Document SDK Cloud",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdnpdftrondocumentsdkcloud.com"
  },
  {
    "id": "media_cdn_pdfshift_html_to_pdf_api",
    "name": "PDFShift HTML to PDF API",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdnpdfshifthtmltopdfapi.com"
  },
  {
    "id": "media_cdn_docraptor_html_to_pdf",
    "name": "DocRaptor HTML to PDF",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdndocraptorhtmltopdf.com"
  },
  {
    "id": "media_cdn_apitemplate_io_image_pdf",
    "name": "Apitemplate.io Image & PDF",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdnapitemplateioimagepdf.com"
  },
  {
    "id": "media_cdn_renderform_image_generator",
    "name": "RenderForm Image Generator",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdnrenderformimagegenerator.com"
  },
  {
    "id": "media_cdn_bannerbear_automated_image",
    "name": "Bannerbear Automated Image",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdnbannerbearautomatedimage.com"
  },
  {
    "id": "media_cdn_placid_app_dynamic_image_gener",
    "name": "Placid.app Dynamic Image Generator",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdnplacidappdynamicimagegener.com"
  },
  {
    "id": "media_cdn_robolly_image_automation",
    "name": "Robolly Image Automation",
    "bucket": "bearer_token",
    "category": "Cloud Infrastructure & Hosting",
    "documentationUrl": "https://docs.mediacdnrobollyimageautomation.com"
  },
  {
    "id": "doc_mgmt_notability_cloud_sync",
    "name": "Notability Cloud Sync",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtnotabilitycloudsync.com"
  },
  {
    "id": "doc_mgmt_goodnotes_cloud_backup",
    "name": "GoodNotes Cloud Backup",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtgoodnotescloudbackup.com"
  },
  {
    "id": "doc_mgmt_liquidtext_active_reader",
    "name": "LiquidText Active Reader",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtliquidtextactivereader.com"
  },
  {
    "id": "doc_mgmt_marginnote_document_notes",
    "name": "MarginNote Document Notes",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtmarginnotedocumentnotes.com"
  },
  {
    "id": "doc_mgmt_foxit_pdf_cloud_api",
    "name": "Foxit PDF Cloud API",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtfoxitpdfcloudapi.com"
  },
  {
    "id": "doc_mgmt_adobe_document_cloud_pdf",
    "name": "Adobe Document Cloud PDF",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtadobedocumentcloudpdf.com"
  },
  {
    "id": "doc_mgmt_nitro_software_pdf_cloud",
    "name": "Nitro Software PDF Cloud",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtnitrosoftwarepdfcloud.com"
  },
  {
    "id": "doc_mgmt_smallpdf_document_suite",
    "name": "Smallpdf Document Suite",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtsmallpdfdocumentsuite.com"
  },
  {
    "id": "doc_mgmt_ilovepdf_online_pdf_tools",
    "name": "iLovePDF Online PDF Tools",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtilovepdfonlinepdftools.com"
  },
  {
    "id": "doc_mgmt_sejda_web_pdf_automation",
    "name": "Sejda Web PDF Automation",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtsejdawebpdfautomation.com"
  },
  {
    "id": "doc_mgmt_pdf24_tools_online_api",
    "name": "PDF24 Tools Online API",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtpdf24toolsonlineapi.com"
  },
  {
    "id": "doc_mgmt_sodapdf_cloud_operations",
    "name": "SodaPDF Cloud Operations",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtsodapdfcloudoperations.com"
  },
  {
    "id": "doc_mgmt_pdffiller_document_editor",
    "name": "PDFFiller Document Editor",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtpdffillerdocumenteditor.com"
  },
  {
    "id": "doc_mgmt_formstack_documents_builder",
    "name": "Formstack Documents Builder",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtformstackdocumentsbuilder.com"
  },
  {
    "id": "doc_mgmt_anvil_pdf_generation_api",
    "name": "Anvil PDF Generation API",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtanvilpdfgenerationapi.com"
  },
  {
    "id": "doc_mgmt_process_street_checklist_workf",
    "name": "Process Street Checklist Workflow",
    "bucket": "bearer_token",
    "category": "Productivity & Workspace",
    "documentationUrl": "https://docs.docmgmtprocessstreetchecklistworkf.com"
  },
  {
    "id": "bi_analytics_looker_business_intelligence",
    "name": "Looker Business Intelligence",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticslookerbusinessintelligence.com"
  },
  {
    "id": "bi_analytics_tableau_cloud_analytics",
    "name": "Tableau Cloud Analytics",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticstableaucloudanalytics.com"
  },
  {
    "id": "bi_analytics_power_bi_microsoft_analytics",
    "name": "Power BI Microsoft Analytics",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticspowerbimicrosoftanalytics.com"
  },
  {
    "id": "bi_analytics_metabase_open_source_bi",
    "name": "Metabase Open Source BI",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticsmetabaseopensourcebi.com"
  },
  {
    "id": "bi_analytics_superset_apache_bi_platform",
    "name": "Superset Apache BI Platform",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticssupersetapachebiplatform.com"
  },
  {
    "id": "bi_analytics_mode_analytics_collaborative",
    "name": "Mode Analytics Collaborative",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticsmodeanalyticscollaborative.com"
  },
  {
    "id": "bi_analytics_sigma_computing_cloud_analytic",
    "name": "Sigma Computing Cloud Analytics",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticssigmacomputingcloudanalytic.com"
  },
  {
    "id": "bi_analytics_thoughtspot_search_analytics",
    "name": "ThoughtSpot Search Analytics",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticsthoughtspotsearchanalytics.com"
  },
  {
    "id": "bi_analytics_domo_business_cloud",
    "name": "Domo Business Cloud",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticsdomobusinesscloud.com"
  },
  {
    "id": "bi_analytics_sisense_analytics_platform",
    "name": "Sisense Analytics Platform",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticssisenseanalyticsplatform.com"
  },
  {
    "id": "bi_analytics_qlik_cloud_analytics",
    "name": "Qlik Cloud Analytics",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticsqlikcloudanalytics.com"
  },
  {
    "id": "bi_analytics_gooddata_analytics_platform",
    "name": "GoodData Analytics Platform",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticsgooddataanalyticsplatform.com"
  },
  {
    "id": "bi_analytics_count_co_collaborative_canvas",
    "name": "Count.co Collaborative Canvas",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticscountcocollaborativecanvas.com"
  },
  {
    "id": "bi_analytics_lightdash_open_source_bi",
    "name": "Lightdash Open Source BI",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticslightdashopensourcebi.com"
  },
  {
    "id": "bi_analytics_preset_managed_superset",
    "name": "Preset Managed Superset",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticspresetmanagedsuperset.com"
  },
  {
    "id": "bi_analytics_cluvio_r_sql_analytics",
    "name": "Cluvio R & SQL Analytics",
    "bucket": "oauth2_managed",
    "category": "Marketing & Analytics",
    "documentationUrl": "https://docs.bianalyticscluviorsqlanalytics.com"
  },
  {
    "id": "comms_iot_pubnub_real_time_communication",
    "name": "PubNub Real-Time Communication",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiotpubnubrealtimecommunication.com"
  },
  {
    "id": "comms_iot_ably_realtime_global_data",
    "name": "Ably Realtime Global Data",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiotablyrealtimeglobaldata.com"
  },
  {
    "id": "comms_iot_socketcluster_scalable_rtc",
    "name": "SocketCluster Scalable RTC",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiotsocketclusterscalablertc.com"
  },
  {
    "id": "comms_iot_sora_webrtc_cloud",
    "name": "Sora WebRTC Cloud",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiotsorawebrtccloud.com"
  },
  {
    "id": "comms_iot_liveswitch_webrtc_gateway",
    "name": "LiveSwitch WebRTC Gateway",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiotliveswitchwebrtcgateway.com"
  },
  {
    "id": "comms_iot_opentok_tokbox_video_api",
    "name": "OpenTok TokBox Video API",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiotopentoktokboxvideoapi.com"
  },
  {
    "id": "comms_iot_vidyo_cloud_collaboration",
    "name": "Vidyo Cloud Collaboration",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiotvidyocloudcollaboration.com"
  },
  {
    "id": "comms_iot_trueconf_video_sdk",
    "name": "TrueConf Video SDK",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiottrueconfvideosdk.com"
  },
  {
    "id": "comms_iot_ant_media_server_webrtc",
    "name": "Ant Media Server WebRTC",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiotantmediaserverwebrtc.com"
  },
  {
    "id": "comms_iot_janus_webrtc_gateway",
    "name": "Janus WebRTC Gateway",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiotjanuswebrtcgateway.com"
  },
  {
    "id": "comms_iot_kurento_media_server",
    "name": "Kurento Media Server",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiotkurentomediaserver.com"
  },
  {
    "id": "comms_iot_jitsi_meet_open_source_video",
    "name": "Jitsi Meet Open Source Video",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiotjitsimeetopensourcevideo.com"
  },
  {
    "id": "comms_iot_bigbluebutton_web_conference",
    "name": "BigBlueButton Web Conference",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiotbigbluebuttonwebconference.com"
  },
  {
    "id": "comms_iot_telnyx_video_webrtc",
    "name": "Telnyx Video WebRTC",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiottelnyxvideowebrtc.com"
  },
  {
    "id": "comms_iot_agora_chat_sdk",
    "name": "Agora Chat SDK",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiotagorachatsdk.com"
  },
  {
    "id": "comms_iot_sendbird_in_app_chat_calls",
    "name": "Sendbird In-App Chat & Calls",
    "bucket": "basic_auth",
    "category": "Communication & Messaging",
    "documentationUrl": "https://docs.commsiotsendbirdinappchatcalls.com"
  },
  {
    "id": "erp_supply_odoo_open_source_erp",
    "name": "Odoo Open Source ERP",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplyodooopensourceerp.com"
  },
  {
    "id": "erp_supply_erpnext_open_source_cloud",
    "name": "ERPNext Open Source Cloud",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplyerpnextopensourcecloud.com"
  },
  {
    "id": "erp_supply_acumatica_cloud_erp",
    "name": "Acumatica Cloud ERP",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplyacumaticaclouderp.com"
  },
  {
    "id": "erp_supply_infor_cloudsuite_erp",
    "name": "Infor CloudSuite ERP",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplyinforcloudsuiteerp.com"
  },
  {
    "id": "erp_supply_epicor_kinetic_erp",
    "name": "Epicor Kinetic ERP",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplyepicorkineticerp.com"
  },
  {
    "id": "erp_supply_sage_intacct_cloud_financials",
    "name": "Sage Intacct Cloud Financials",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplysageintacctcloudfinancials.com"
  },
  {
    "id": "erp_supply_sage_50cloud_accounts",
    "name": "Sage 50cloud Accounts",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplysage50cloudaccounts.com"
  },
  {
    "id": "erp_supply_sage_business_cloud",
    "name": "Sage Business Cloud",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplysagebusinesscloud.com"
  },
  {
    "id": "erp_supply_microsoft_dynamics_365_busines",
    "name": "Microsoft Dynamics 365 Business Central",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplymicrosoftdynamics365busines.com"
  },
  {
    "id": "erp_supply_microsoft_dynamics_365_finance",
    "name": "Microsoft Dynamics 365 Finance",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplymicrosoftdynamics365finance.com"
  },
  {
    "id": "erp_supply_syspro_enterprise_erp",
    "name": "SYSPRO Enterprise ERP",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplysysproenterpriseerp.com"
  },
  {
    "id": "erp_supply_unit4_erp_enterprise_software",
    "name": "Unit4 ERP Enterprise Software",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplyunit4erpenterprisesoftware.com"
  },
  {
    "id": "erp_supply_deltek_costpoint_government_er",
    "name": "Deltek Costpoint Government ERP",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplydeltekcostpointgovernmenter.com"
  },
  {
    "id": "erp_supply_plex_smart_manufacturing_erp",
    "name": "Plex Smart Manufacturing ERP",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplyplexsmartmanufacturingerp.com"
  },
  {
    "id": "erp_supply_qad_cloud_erp_manufacturing",
    "name": "QAD Cloud ERP Manufacturing",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplyqadclouderpmanufacturing.com"
  },
  {
    "id": "erp_supply_katana_cloud_manufacturing",
    "name": "Katana Cloud Manufacturing",
    "bucket": "basic_auth",
    "category": "ERP, Finance & Human Resources",
    "documentationUrl": "https://docs.erpsupplykatanacloudmanufacturing.com"
  }
];

export const PROVIDER_CATALOG: Map<string, ProviderSpec> = new Map(
  PROVIDER_CATALOG_DATA.map((p) => {
    const bucketDef = BUCKET_DEFINITIONS[p.bucket] || BUCKET_DEFINITIONS.api_key;
    return [
      p.id,
      {
        ...p,
        fields: bucketDef.fields,
      },
    ];
  })
);

export function getProvider(id: string): ProviderSpec | undefined {
  return PROVIDER_CATALOG.get(id);
}

export function getProviderCount(): number {
  return PROVIDER_CATALOG.size;
}

export function getAllProviders(): ProviderSpec[] {
  return Array.from(PROVIDER_CATALOG.values());
}

export function getCategories(): string[] {
  const categories = new Set<string>();
  for (const p of PROVIDER_CATALOG.values()) {
    categories.add(p.category);
  }
  return Array.from(categories).sort();
}

export function listProviders(filter?: {
  category?: string;
  bucket?: CredentialBucket;
  search?: string;
}): ProviderSpec[] {
  let list = Array.from(PROVIDER_CATALOG.values());

  if (filter?.category) {
    const cat = filter.category.toLowerCase();
    list = list.filter((p) => p.category.toLowerCase() === cat);
  }

  if (filter?.bucket) {
    list = list.filter((p) => p.bucket === filter.bucket);
  }

  if (filter?.search) {
    const term = filter.search.toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.id.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term)
    );
  }

  return list;
}

export function mapCredentialToBucket(
  providerId: string,
  rawData: Record<string, any>
): { bucket: CredentialBucket; data: Record<string, any> } {
  const provider = getProvider(providerId);
  const bucket: CredentialBucket = provider?.bucket || "api_key";

  // Standardize common keys (e.g., token -> apiKey or apiKey -> token) if needed
  const data = { ...rawData };
  if (bucket === "api_key" && !data.apiKey && data.token) {
    data.apiKey = data.token;
  } else if (bucket === "bearer_token" && !data.token && data.apiKey) {
    data.token = data.apiKey;
  }

  return { bucket, data };
}
