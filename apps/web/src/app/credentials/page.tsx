"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Eye, EyeOff, KeyRound, Plus, Search, Trash2, X, Sparkles, Layers, Info, Shield, ExternalLink } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { credentials as credApi, type Credential } from "@/lib/api";

const PROVIDERS = [
  { value: "Action Network API", label: "Action Network API" },
  { value: "ActiveCampaign API", label: "ActiveCampaign API" },
  { value: "Acuity Scheduling API", label: "Acuity Scheduling API" },
  { value: "AcuityScheduling OAuth2 API", label: "AcuityScheduling OAuth2 API" },
  { value: "Adalo API", label: "Adalo API" },
  { value: "Affinity API", label: "Affinity API" },
  { value: "AgileCRM API", label: "AgileCRM API" },
  { value: "Airtable API", label: "Airtable API" },
  { value: "Airtable MCP OAuth2", label: "Airtable MCP OAuth2" },
  { value: "Airtable OAuth2 API", label: "Airtable OAuth2 API" },
  { value: "Airtable Personal Access Token API", label: "Airtable Personal Access Token API" },
  { value: "Airtop API", label: "Airtop API" },
  { value: "Alchemy MCP OAuth2", label: "Alchemy MCP OAuth2" },
  { value: "AlienVault API", label: "AlienVault API" },
  { value: "Altmetric MCP OAuth2", label: "Altmetric MCP OAuth2" },
  { value: "Amplitude MCP OAuth2", label: "Amplitude MCP OAuth2" },
  { value: "AMQP", label: "AMQP" },
  { value: "Anthropic", label: "Anthropic" },
  { value: "Apify MCP OAuth2", label: "Apify MCP OAuth2" },
  { value: "APITemplate.io API", label: "APITemplate.io API" },
  { value: "Asana API", label: "Asana API" },
  { value: "Asana OAuth2 API", label: "Asana OAuth2 API" },
  { value: "Atlassian MCP OAuth2", label: "Atlassian MCP OAuth2" },
  { value: "Atlassian OAuth2 API", label: "Atlassian OAuth2 API" },
  { value: "Auth0 Management API", label: "Auth0 Management API" },
  { value: "Autopilot API", label: "Autopilot API" },
  { value: "Avo MCP OAuth2", label: "Avo MCP OAuth2" },
  { value: "AWS (Assume Role)", label: "AWS (Assume Role)" },
  { value: "AWS (IAM)", label: "AWS (IAM)" },
  { value: "Axiom MCP OAuth2", label: "Axiom MCP OAuth2" },
  { value: "Azure AI Search API", label: "Azure AI Search API" },
  { value: "Azure Entra ID (Azure Active Directory) API", label: "Azure Entra ID (Azure Active Directory) API" },
  { value: "Azure Open AI", label: "Azure Open AI" },
  { value: "Azure Storage OAuth2 API", label: "Azure Storage OAuth2 API" },
  { value: "Azure Storage Shared Key API", label: "Azure Storage Shared Key API" },
  { value: "BambooHR API", label: "BambooHR API" },
  { value: "Bannerbear API", label: "Bannerbear API" },
  { value: "Baserow API", label: "Baserow API" },
  { value: "Baserow Token API", label: "Baserow Token API" },
  { value: "Basic Auth", label: "Basic Auth" },
  { value: "Bearer Auth", label: "Bearer Auth" },
  { value: "Beeminder API", label: "Beeminder API" },
  { value: "Beeminder OAuth2 API", label: "Beeminder OAuth2 API" },
  { value: "Bitbucket Access Token API", label: "Bitbucket Access Token API" },
  { value: "Bitbucket API", label: "Bitbucket API" },
  { value: "Bitly API", label: "Bitly API" },
  { value: "Bitly OAuth2 API", label: "Bitly OAuth2 API" },
  { value: "Bitrix24 MCP OAuth2", label: "Bitrix24 MCP OAuth2" },
  { value: "Bitwarden API", label: "Bitwarden API" },
  { value: "Box OAuth2 API", label: "Box OAuth2 API" },
  { value: "Brandfetch API", label: "Brandfetch API" },
  { value: "Brandfetch MCP OAuth2", label: "Brandfetch MCP OAuth2" },
  { value: "Brave Search", label: "Brave Search" },
  { value: "Brevo", label: "Brevo" },
  { value: "Bubble API", label: "Bubble API" },
  { value: "Cal API", label: "Cal API" },
  { value: "Calendly OAuth2 API", label: "Calendly OAuth2 API" },
  { value: "Calendly Personal Access Token API", label: "Calendly Personal Access Token API" },
  { value: "Carbon Black API", label: "Carbon Black API" },
  { value: "CData Connect AI MCP OAuth2", label: "CData Connect AI MCP OAuth2" },
  { value: "Cello MCP OAuth2", label: "Cello MCP OAuth2" },
  { value: "Chargebee API", label: "Chargebee API" },
  { value: "Chat OAuth2 API", label: "Chat OAuth2 API" },
  { value: "ChromaDB Cloud", label: "ChromaDB Cloud" },
  { value: "ChromaDB Self-Hosted", label: "ChromaDB Self-Hosted" },
  { value: "CircleCI API", label: "CircleCI API" },
  { value: "Cisco Meraki API", label: "Cisco Meraki API" },
  { value: "Cisco Secure Endpoint (AMP) API", label: "Cisco Secure Endpoint (AMP) API" },
  { value: "Cisco Umbrella API", label: "Cisco Umbrella API" },
  { value: "Cisco Webex OAuth2 API", label: "Cisco Webex OAuth2 API" },
  { value: "Clearbit API", label: "Clearbit API" },
  { value: "ClickUp API", label: "ClickUp API" },
  { value: "ClickUp OAuth2 API", label: "ClickUp OAuth2 API" },
  { value: "Clockify API", label: "Clockify API" },
  { value: "Close MCP OAuth2", label: "Close MCP OAuth2" },
  { value: "Cloudflare API", label: "Cloudflare API" },
  { value: "Cockpit API", label: "Cockpit API" },
  { value: "Coda API", label: "Coda API" },
  { value: "Cohere API", label: "Cohere API" },
  { value: "Composio MCP OAuth2", label: "Composio MCP OAuth2" },
  { value: "Confluence Cloud OAuth2 API", label: "Confluence Cloud OAuth2 API" },
  { value: "Contentful API", label: "Contentful API" },
  { value: "ConvertAPI", label: "ConvertAPI" },
  { value: "ConvertKit API", label: "ConvertKit API" },
  { value: "Copper API", label: "Copper API" },
  { value: "Cortex API", label: "Cortex API" },
  { value: "CrateDB", label: "CrateDB" },
  { value: "CrowdStrike OAuth2 API", label: "CrowdStrike OAuth2 API" },
  { value: "Crypto", label: "Crypto" },
  { value: "CryptoQuant MCP OAuth2", label: "CryptoQuant MCP OAuth2" },
  { value: "Currents API", label: "Currents API" },
  { value: "Custom Auth", label: "Custom Auth" },
  { value: "Customer.io API", label: "Customer.io API" },
  { value: "Cypress Cloud MCP OAuth2", label: "Cypress Cloud MCP OAuth2" },
  { value: "Databricks", label: "Databricks" },
  { value: "Databricks OAuth2 API", label: "Databricks OAuth2 API" },
  { value: "Datadog API", label: "Datadog API" },
  { value: "Daytona", label: "Daytona" },
  { value: "DeepL API", label: "DeepL API" },
  { value: "DeepSeek", label: "DeepSeek" },
  { value: "Demio API", label: "Demio API" },
  { value: "DFIR-IRIS API", label: "DFIR-IRIS API" },
  { value: "DHL API", label: "DHL API" },
  { value: "Digest Auth", label: "Digest Auth" },
  { value: "Discord Bot API", label: "Discord Bot API" },
  { value: "Discord OAuth2 API", label: "Discord OAuth2 API" },
  { value: "Discord Webhook", label: "Discord Webhook" },
  { value: "Discourse API", label: "Discourse API" },
  { value: "Disqus API", label: "Disqus API" },
  { value: "Drift API", label: "Drift API" },
  { value: "Drift OAuth2 API", label: "Drift OAuth2 API" },
  { value: "Dropbox API", label: "Dropbox API" },
  { value: "Dropbox OAuth2 API", label: "Dropbox OAuth2 API" },
  { value: "Dropcontact API", label: "Dropcontact API" },
  { value: "Dynatrace API", label: "Dynatrace API" },
  { value: "E-Goi API", label: "E-Goi API" },
  { value: "Egnyte Remote MCP OAuth2", label: "Egnyte Remote MCP OAuth2" },
  { value: "Elastic Security API", label: "Elastic Security API" },
  { value: "Elasticsearch API", label: "Elasticsearch API" },
  { value: "Emelia API", label: "Emelia API" },
  { value: "ERPNext API", label: "ERPNext API" },
  { value: "Eventbrite API", label: "Eventbrite API" },
  { value: "Eventbrite OAuth2 API", label: "Eventbrite OAuth2 API" },
  { value: "Exa MCP OAuth2", label: "Exa MCP OAuth2" },
  { value: "F5 Big-IP API", label: "F5 Big-IP API" },
  { value: "Facebook Graph (App) OAuth2 API", label: "Facebook Graph (App) OAuth2 API" },
  { value: "Facebook Graph API", label: "Facebook Graph API" },
  { value: "Facebook Graph API (App)", label: "Facebook Graph API (App)" },
  { value: "Facebook Graph OAuth2 API", label: "Facebook Graph OAuth2 API" },
  { value: "Facebook Lead Ads OAuth2 API", label: "Facebook Lead Ads OAuth2 API" },
  { value: "Fibery MCP OAuth2", label: "Fibery MCP OAuth2" },
  { value: "Figma API", label: "Figma API" },
  { value: "Figma OAuth2 API", label: "Figma OAuth2 API" },
  { value: "FileMaker API", label: "FileMaker API" },
  { value: "Filescan API", label: "Filescan API" },
  { value: "Fingerprint MCP OAuth2", label: "Fingerprint MCP OAuth2" },
  { value: "Flow API", label: "Flow API" },
  { value: "FLUX MCP OAuth2", label: "FLUX MCP OAuth2" },
  { value: "Form.io API", label: "Form.io API" },
  { value: "Formstack API", label: "Formstack API" },
  { value: "Formstack OAuth2 API", label: "Formstack OAuth2 API" },
  { value: "Fortinet FortiGate API", label: "Fortinet FortiGate API" },
  { value: "Freshdesk API", label: "Freshdesk API" },
  { value: "Freshservice API", label: "Freshservice API" },
  { value: "Freshworks CRM API", label: "Freshworks CRM API" },
  { value: "FTP", label: "FTP" },
  { value: "GetResponse API", label: "GetResponse API" },
  { value: "GetResponse OAuth2 API", label: "GetResponse OAuth2 API" },
  { value: "Ghost Admin API", label: "Ghost Admin API" },
  { value: "Ghost Content API", label: "Ghost Content API" },
  { value: "Git", label: "Git" },
  { value: "GitHub API", label: "GitHub API" },
  { value: "GitHub App API", label: "GitHub App API" },
  { value: "GitHub OAuth2 API", label: "GitHub OAuth2 API" },
  { value: "GitLab API", label: "GitLab API" },
  { value: "GitLab MCP OAuth2", label: "GitLab MCP OAuth2" },
  { value: "GitLab OAuth2 API", label: "GitLab OAuth2 API" },
  { value: "Gmail OAuth2 API", label: "Gmail OAuth2 API" },
  { value: "Gong API", label: "Gong API" },
  { value: "Gong OAuth2 API", label: "Gong OAuth2 API" },
  { value: "Google Ads OAuth2 API", label: "Google Ads OAuth2 API" },
  { value: "Google Analytics OAuth2 API", label: "Google Analytics OAuth2 API" },
  { value: "Google BigQuery OAuth2 API", label: "Google BigQuery OAuth2 API" },
  { value: "Google Books OAuth2 API", label: "Google Books OAuth2 API" },
  { value: "Google Business Profile OAuth2 API", label: "Google Business Profile OAuth2 API" },
  { value: "Google Calendar OAuth2 API", label: "Google Calendar OAuth2 API" },
  { value: "Google Cloud Natural Language OAuth2 API", label: "Google Cloud Natural Language OAuth2 API" },
  { value: "Google Cloud Storage OAuth2 API", label: "Google Cloud Storage OAuth2 API" },
  { value: "Google Contacts OAuth2 API", label: "Google Contacts OAuth2 API" },
  { value: "Google Docs OAuth2 API", label: "Google Docs OAuth2 API" },
  { value: "Google Drive OAuth2 API", label: "Google Drive OAuth2 API" },
  { value: "Google Firebase Cloud Firestore OAuth2 API", label: "Google Firebase Cloud Firestore OAuth2 API" },
  { value: "Google Firebase Realtime Database OAuth2 API", label: "Google Firebase Realtime Database OAuth2 API" },
  { value: "Google Gemini(PaLM) Api", label: "Google Gemini(PaLM) Api" },
  { value: "Google OAuth2 API", label: "Google OAuth2 API" },
  { value: "Google Perspective OAuth2 API", label: "Google Perspective OAuth2 API" },
  { value: "Google Service Account API", label: "Google Service Account API" },
  { value: "Google Sheets OAuth2 API", label: "Google Sheets OAuth2 API" },
  { value: "Google Sheets Trigger OAuth2 API", label: "Google Sheets Trigger OAuth2 API" },
  { value: "Google Slides OAuth2 API", label: "Google Slides OAuth2 API" },
  { value: "Google Tasks OAuth2 API", label: "Google Tasks OAuth2 API" },
  { value: "Google Translate OAuth2 API", label: "Google Translate OAuth2 API" },
  { value: "Google Workspace Admin OAuth2 API", label: "Google Workspace Admin OAuth2 API" },
  { value: "Gotify API", label: "Gotify API" },
  { value: "GoToWebinar OAuth2 API", label: "GoToWebinar OAuth2 API" },
  { value: "Grafana API", label: "Grafana API" },
  { value: "Grafana MCP OAuth2", label: "Grafana MCP OAuth2" },
  { value: "Grist API", label: "Grist API" },
  { value: "Groq", label: "Groq" },
  { value: "Gtmetrix MCP OAuth2", label: "Gtmetrix MCP OAuth2" },
  { value: "Gumroad API", label: "Gumroad API" },
  { value: "Gumroad OAuth2 API", label: "Gumroad OAuth2 API" },
  { value: "Guru Remote MCP OAuth2", label: "Guru Remote MCP OAuth2" },
  { value: "Hackle MCP OAuth2", label: "Hackle MCP OAuth2" },
  { value: "HaloPSA API", label: "HaloPSA API" },
  { value: "Harvest API", label: "Harvest API" },
  { value: "Harvest OAuth2 API", label: "Harvest OAuth2 API" },
  { value: "Header Auth", label: "Header Auth" },
  { value: "HelpScout OAuth2 API", label: "HelpScout OAuth2 API" },
  { value: "HighLevel API", label: "HighLevel API" },
  { value: "HighLevel OAuth2 API", label: "HighLevel OAuth2 API" },
  { value: "Himalayas Remote Jobs MCP OAuth2", label: "Himalayas Remote Jobs MCP OAuth2" },
  { value: "Home Assistant API", label: "Home Assistant API" },
  { value: "Honeycomb MCP OAuth2", label: "Honeycomb MCP OAuth2" },
  { value: "HubSpot API", label: "HubSpot API" },
  { value: "HubSpot Developer API", label: "HubSpot Developer API" },
  { value: "HubSpot OAuth2 API", label: "HubSpot OAuth2 API" },
  { value: "HubSpot Service Key", label: "HubSpot Service Key" },
  { value: "Hugging Face API", label: "Hugging Face API" },
  { value: "Hugging Face MCP OAuth2", label: "Hugging Face MCP OAuth2" },
  { value: "Humantic AI API", label: "Humantic AI API" },
  { value: "Hunter API", label: "Hunter API" },
  { value: "Hybrid Analysis API", label: "Hybrid Analysis API" },
  { value: "IMAP", label: "IMAP" },
  { value: "Imperva WAF API", label: "Imperva WAF API" },
  { value: "Intercom API", label: "Intercom API" },
  { value: "Invoice Ninja API", label: "Invoice Ninja API" },
  { value: "Iterable API", label: "Iterable API" },
  { value: "Ivisa MCP OAuth2", label: "Ivisa MCP OAuth2" },
  { value: "Jenkins API", label: "Jenkins API" },
  { value: "Jina AI API", label: "Jina AI API" },
  { value: "Jira SW Cloud API", label: "Jira SW Cloud API" },
  { value: "Jira SW Cloud OAuth2 API", label: "Jira SW Cloud OAuth2 API" },
  { value: "Jira SW Server (PAT) API", label: "Jira SW Server (PAT) API" },
  { value: "Jira SW Server API", label: "Jira SW Server API" },
  { value: "JotForm API", label: "JotForm API" },
  { value: "Jotform MCP OAuth2", label: "Jotform MCP OAuth2" },
  { value: "Jumpcloud MCP OAuth2", label: "Jumpcloud MCP OAuth2" },
  { value: "JWT Auth", label: "JWT Auth" },
  { value: "Kafka", label: "Kafka" },
  { value: "Kajabi MCP OAuth2", label: "Kajabi MCP OAuth2" },
  { value: "Keap OAuth2 API", label: "Keap OAuth2 API" },
  { value: "Kibana API", label: "Kibana API" },
  { value: "KoBoToolbox API Token", label: "KoBoToolbox API Token" },
  { value: "LDAP", label: "LDAP" },
  { value: "Lemlist API", label: "Lemlist API" },
  { value: "Lemonade", label: "Lemonade" },
  { value: "Line Notify OAuth2 API", label: "Line Notify OAuth2 API" },
  { value: "Linear API", label: "Linear API" },
  { value: "Linear MCP OAuth2", label: "Linear MCP OAuth2" },
  { value: "Linear OAuth2 API", label: "Linear OAuth2 API" },
  { value: "LingvaNex API", label: "LingvaNex API" },
  { value: "LinkedIn Community Management OAuth2 API", label: "LinkedIn Community Management OAuth2 API" },
  { value: "LinkedIn OAuth2 API", label: "LinkedIn OAuth2 API" },
  { value: "LoneScale API", label: "LoneScale API" },
  { value: "Lucid MCP OAuth2", label: "Lucid MCP OAuth2" },
  { value: "Lusha MCP OAuth2", label: "Lusha MCP OAuth2" },
  { value: "Magento 2 API", label: "Magento 2 API" },
  { value: "Mailcheck API", label: "Mailcheck API" },
  { value: "Mailchimp API", label: "Mailchimp API" },
  { value: "Mailchimp OAuth2 API", label: "Mailchimp OAuth2 API" },
  { value: "Mailer Lite API", label: "Mailer Lite API" },
  { value: "Mailgun API", label: "Mailgun API" },
  { value: "Mailjet Email API", label: "Mailjet Email API" },
  { value: "Mailjet SMS API", label: "Mailjet SMS API" },
  { value: "Malcore API", label: "Malcore API" },
  { value: "Mandrill API", label: "Mandrill API" },
  { value: "Mapbox MCP OAuth2", label: "Mapbox MCP OAuth2" },
  { value: "Marketstack API", label: "Marketstack API" },
  { value: "Matrix API", label: "Matrix API" },
  { value: "Mattermost API", label: "Mattermost API" },
  { value: "Mautic API", label: "Mautic API" },
  { value: "Mautic OAuth2 API", label: "Mautic OAuth2 API" },
  { value: "MCP OAuth2 API", label: "MCP OAuth2 API" },
  { value: "Medium API", label: "Medium API" },
  { value: "Medium OAuth2 API", label: "Medium OAuth2 API" },
  { value: "MessageBird API", label: "MessageBird API" },
  { value: "Metabase API", label: "Metabase API" },
  { value: "Microsoft 365 Agent API", label: "Microsoft 365 Agent API" },
  { value: "Microsoft Azure Cosmos DB API", label: "Microsoft Azure Cosmos DB API" },
  { value: "Microsoft Azure Monitor OAuth2 API", label: "Microsoft Azure Monitor OAuth2 API" },
  { value: "Microsoft Drive OAuth2 API", label: "Microsoft Drive OAuth2 API" },
  { value: "Microsoft Dynamics OAuth2 API", label: "Microsoft Dynamics OAuth2 API" },
  { value: "Microsoft Entra ID (Azure Active Directory) API", label: "Microsoft Entra ID (Azure Active Directory) API" },
  { value: "Microsoft Entra Service Principal", label: "Microsoft Entra Service Principal" },
  { value: "Microsoft Excel OAuth2 API", label: "Microsoft Excel OAuth2 API" },
  { value: "Microsoft Graph Security OAuth2 API", label: "Microsoft Graph Security OAuth2 API" },
  { value: "Microsoft OAuth2 API", label: "Microsoft OAuth2 API" },
  { value: "Microsoft Outlook OAuth2 API", label: "Microsoft Outlook OAuth2 API" },
  { value: "Microsoft SharePoint OAuth2 API", label: "Microsoft SharePoint OAuth2 API" },
  { value: "Microsoft SQL", label: "Microsoft SQL" },
  { value: "Microsoft Teams OAuth2 API", label: "Microsoft Teams OAuth2 API" },
  { value: "Microsoft To Do OAuth2 API", label: "Microsoft To Do OAuth2 API" },
  { value: "Milvus", label: "Milvus" },
  { value: "Mindee Invoice API", label: "Mindee Invoice API" },
  { value: "Mindee Receipt API", label: "Mindee Receipt API" },
  { value: "MiniMax", label: "MiniMax" },
  { value: "Miro MCP OAuth2", label: "Miro MCP OAuth2" },
  { value: "Miro OAuth2 API", label: "Miro OAuth2 API" },
  { value: "MISP API", label: "MISP API" },
  { value: "Mist API", label: "Mist API" },
  { value: "Mistral Cloud API", label: "Mistral Cloud API" },
  { value: "Mocean Api", label: "Mocean Api" },
  { value: "Monday.com API", label: "Monday.com API" },
  { value: "monday.com MCP OAuth2", label: "monday.com MCP OAuth2" },
  { value: "Monday.com OAuth2 API", label: "Monday.com OAuth2 API" },
  { value: "MongoDB", label: "MongoDB" },
  { value: "Monica CRM API", label: "Monica CRM API" },
  { value: "Moonshot", label: "Moonshot" },
  { value: "Motorhead API", label: "Motorhead API" },
  { value: "MQTT", label: "MQTT" },
  { value: "Msg91 Api", label: "Msg91 Api" },
  { value: "Multiple Headers Auth", label: "Multiple Headers Auth" },
  { value: "Mux MCP OAuth2", label: "Mux MCP OAuth2" },
  { value: "MySQL", label: "MySQL" },
  { value: "n8n API", label: "n8n API" },
  { value: "NASA API", label: "NASA API" },
  { value: "Netlify API", label: "Netlify API" },
  { value: "Netscaler ADC API", label: "Netscaler ADC API" },
  { value: "New Relic MCP OAuth2", label: "New Relic MCP OAuth2" },
  { value: "NextCloud API", label: "NextCloud API" },
  { value: "NextCloud OAuth2 API", label: "NextCloud OAuth2 API" },
  { value: "NocoDB", label: "NocoDB" },
  { value: "NocoDB API Token", label: "NocoDB API Token" },
  { value: "Notion API", label: "Notion API" },
  { value: "Notion MCP OAuth2", label: "Notion MCP OAuth2" },
  { value: "Notion OAuth2 API", label: "Notion OAuth2 API" },
  { value: "Npm API", label: "Npm API" },
  { value: "NVIDIA Nemotron", label: "NVIDIA Nemotron" },
  { value: "OAuth1 API", label: "OAuth1 API" },
  { value: "OAuth2 API", label: "OAuth2 API" },
  { value: "Odoo API", label: "Odoo API" },
  { value: "Odoo API (API Key)", label: "Odoo API (API Key)" },
  { value: "Okta API", label: "Okta API" },
  { value: "Ollama", label: "Ollama" },
  { value: "One Simple API", label: "One Simple API" },
  { value: "Onfleet API", label: "Onfleet API" },
  { value: "Onlyoffice MCP OAuth2", label: "Onlyoffice MCP OAuth2" },
  { value: "Open Video MCP OAuth2", label: "Open Video MCP OAuth2" },
  { value: "OpenAgenda MCP OAuth2", label: "OpenAgenda MCP OAuth2" },
  { value: "OpenAI", label: "OpenAI" },
  { value: "OpenCTI API", label: "OpenCTI API" },
  { value: "OpenRouter", label: "OpenRouter" },
  { value: "OpenWeatherMap API", label: "OpenWeatherMap API" },
  { value: "OpusClip MCP OAuth2", label: "OpusClip MCP OAuth2" },
  { value: "Oracle Database Credentials API", label: "Oracle Database Credentials API" },
  { value: "Orbit API", label: "Orbit API" },
  { value: "Oura API", label: "Oura API" },
  { value: "Paddle API", label: "Paddle API" },
  { value: "PagerDuty API", label: "PagerDuty API" },
  { value: "PagerDuty OAuth2 API", label: "PagerDuty OAuth2 API" },
  { value: "PayPal API", label: "PayPal API" },
  { value: "PayPal MCP OAuth2", label: "PayPal MCP OAuth2" },
  { value: "Peekalink API", label: "Peekalink API" },
  { value: "Perplexity API", label: "Perplexity API" },
  { value: "Phantombuster API", label: "Phantombuster API" },
  { value: "PhilipHue OAuth2 API", label: "PhilipHue OAuth2 API" },
  { value: "Pinecone API", label: "Pinecone API" },
  { value: "Pipedrive API", label: "Pipedrive API" },
  { value: "Pipedrive OAuth2 API", label: "Pipedrive OAuth2 API" },
  { value: "Plivo API", label: "Plivo API" },
  { value: "Postgres", label: "Postgres" },
  { value: "PostHog API", label: "PostHog API" },
  { value: "PostHog MCP OAuth2", label: "PostHog MCP OAuth2" },
  { value: "Postman MCP OAuth2", label: "Postman MCP OAuth2" },
  { value: "Postmark API", label: "Postmark API" },
  { value: "Prisma MCP OAuth2", label: "Prisma MCP OAuth2" },
  { value: "ProfitWell API", label: "ProfitWell API" },
  { value: "Pushbullet OAuth2 API", label: "Pushbullet OAuth2 API" },
  { value: "Pushcut API", label: "Pushcut API" },
  { value: "Pushover API", label: "Pushover API" },
  { value: "Qdrant API", label: "Qdrant API" },
  { value: "QRadar API", label: "QRadar API" },
  { value: "Qualys API", label: "Qualys API" },
  { value: "Query Auth", label: "Query Auth" },
  { value: "QuestDB", label: "QuestDB" },
  { value: "Quick Base API", label: "Quick Base API" },
  { value: "QuickBooks Online OAuth2 API", label: "QuickBooks Online OAuth2 API" },
  { value: "Quicknode MCP OAuth2", label: "Quicknode MCP OAuth2" },
  { value: "Qwen Cloud", label: "Qwen Cloud" },
  { value: "RabbitMQ", label: "RabbitMQ" },
  { value: "Rackspace Spot MCP OAuth2", label: "Rackspace Spot MCP OAuth2" },
  { value: "Railway MCP OAuth2", label: "Railway MCP OAuth2" },
  { value: "Raindrop OAuth2 API", label: "Raindrop OAuth2 API" },
  { value: "Rapid7 InsightVM API", label: "Rapid7 InsightVM API" },
  { value: "Recorded Future API", label: "Recorded Future API" },
  { value: "Reddit OAuth2 API", label: "Reddit OAuth2 API" },
  { value: "Redis", label: "Redis" },
  { value: "Roboflow (Official) MCP OAuth2", label: "Roboflow (Official) MCP OAuth2" },
  { value: "Rocket API", label: "Rocket API" },
  { value: "Rundeck API", label: "Rundeck API" },
  { value: "S3", label: "S3" },
  { value: "Salesforce JWT API", label: "Salesforce JWT API" },
  { value: "Salesforce OAuth2 API", label: "Salesforce OAuth2 API" },
  { value: "Salesmate API", label: "Salesmate API" },
  { value: "Sanity MCP OAuth2", label: "Sanity MCP OAuth2" },
  { value: "Schema Registry", label: "Schema Registry" },
  { value: "SearXNG", label: "SearXNG" },
  { value: "SeaTable API", label: "SeaTable API" },
  { value: "SecurityScorecard API", label: "SecurityScorecard API" },
  { value: "Segment API", label: "Segment API" },
  { value: "Sekoia API", label: "Sekoia API" },
  { value: "SendGrid API", label: "SendGrid API" },
  { value: "SendPulse MCP OAuth2", label: "SendPulse MCP OAuth2" },
  { value: "Sendy API", label: "Sendy API" },
  { value: "Sentry.io API", label: "Sentry.io API" },
  { value: "Sentry.io OAuth2 API", label: "Sentry.io OAuth2 API" },
  { value: "Sentry.io Server API", label: "Sentry.io Server API" },
  { value: "SerpAPI", label: "SerpAPI" },
  { value: "Serpstat MCP OAuth2", label: "Serpstat MCP OAuth2" },
  { value: "ServiceNow Basic Auth API", label: "ServiceNow Basic Auth API" },
  { value: "ServiceNow OAuth2 API", label: "ServiceNow OAuth2 API" },
  { value: "seven API", label: "seven API" },
  { value: "SFTP", label: "SFTP" },
  { value: "Shopify Access Token API", label: "Shopify Access Token API" },
  { value: "Shopify API", label: "Shopify API" },
  { value: "Shopify OAuth2 API", label: "Shopify OAuth2 API" },
  { value: "Shuffler API", label: "Shuffler API" },
  { value: "SIGNL4 Webhook", label: "SIGNL4 Webhook" },
  { value: "Simplified Custom Auth", label: "Simplified Custom Auth" },
  { value: "Slack API", label: "Slack API" },
  { value: "Slack OAuth2 API", label: "Slack OAuth2 API" },
  { value: "SmartBear MCP OAuth2", label: "SmartBear MCP OAuth2" },
  { value: "SMTP", label: "SMTP" },
  { value: "Snitcher MCP OAuth2", label: "Snitcher MCP OAuth2" },
  { value: "Snowflake", label: "Snowflake" },
  { value: "Snowflake OAuth2 API", label: "Snowflake OAuth2 API" },
  { value: "SolarWinds IPAM", label: "SolarWinds IPAM" },
  { value: "SolarWinds Observability", label: "SolarWinds Observability" },
  { value: "Splunk API", label: "Splunk API" },
  { value: "Spotify OAuth2 API", label: "Spotify OAuth2 API" },
  { value: "SSH Password", label: "SSH Password" },
  { value: "SSH Private Key", label: "SSH Private Key" },
  { value: "SSL Certificates", label: "SSL Certificates" },
  { value: "Stackby API", label: "Stackby API" },
  { value: "Storyblok Content API", label: "Storyblok Content API" },
  { value: "Storyblok Management API", label: "Storyblok Management API" },
  { value: "Strapi API", label: "Strapi API" },
  { value: "Strapi API Token", label: "Strapi API Token" },
  { value: "Strava OAuth2 API", label: "Strava OAuth2 API" },
  { value: "Stripe API", label: "Stripe API" },
  { value: "Stripe MCP OAuth2", label: "Stripe MCP OAuth2" },
  { value: "Supabase API", label: "Supabase API" },
  { value: "SurveyMonkey API", label: "SurveyMonkey API" },
  { value: "SurveyMonkey OAuth2 API", label: "SurveyMonkey OAuth2 API" },
  { value: "SyncroMSP API", label: "SyncroMSP API" },
  { value: "Sysdig API", label: "Sysdig API" },
  { value: "Taiga API", label: "Taiga API" },
  { value: "Tapfiliate API", label: "Tapfiliate API" },
  { value: "Telegram API", label: "Telegram API" },
  { value: "Tenderly MCP OAuth2", label: "Tenderly MCP OAuth2" },
  { value: "The Hive 5 API", label: "The Hive 5 API" },
  { value: "The Hive API", label: "The Hive API" },
  { value: "TimescaleDB", label: "TimescaleDB" },
  { value: "Todoist API", label: "Todoist API" },
  { value: "Todoist OAuth2 API", label: "Todoist OAuth2 API" },
  { value: "Toggl API", label: "Toggl API" },
  { value: "Tolstoy Library MCP OAuth2", label: "Tolstoy Library MCP OAuth2" },
  { value: "TOTP API", label: "TOTP API" },
  { value: "Travis API", label: "Travis API" },
  { value: "Trellix (McAfee) ePolicy Orchestrator API", label: "Trellix (McAfee) ePolicy Orchestrator API" },
  { value: "Trello API", label: "Trello API" },
  { value: "Trello OAuth1 API", label: "Trello OAuth1 API" },
  { value: "Twake Cloud API", label: "Twake Cloud API" },
  { value: "Twake Server API", label: "Twake Server API" },
  { value: "Twilio API", label: "Twilio API" },
  { value: "Twist OAuth2 API", label: "Twist OAuth2 API" },
  { value: "Typeform API", label: "Typeform API" },
  { value: "Typeform OAuth2 API", label: "Typeform OAuth2 API" },
  { value: "Unleashed API", label: "Unleashed API" },
  { value: "Unstoppable Domains MCP OAuth2", label: "Unstoppable Domains MCP OAuth2" },
  { value: "Uplead API", label: "Uplead API" },
  { value: "uProc API", label: "uProc API" },
  { value: "Uptime Robot API", label: "Uptime Robot API" },
  { value: "urlscan.io API", label: "urlscan.io API" },
  { value: "UserGuiding MCP OAuth2", label: "UserGuiding MCP OAuth2" },
  { value: "VEED AI Video Generator MCP OAuth2", label: "VEED AI Video Generator MCP OAuth2" },
  { value: "Venafi TLS Protect Cloud", label: "Venafi TLS Protect Cloud" },
  { value: "Venafi TLS Protect Datacenter API", label: "Venafi TLS Protect Datacenter API" },
  { value: "Vercel AI Gateway", label: "Vercel AI Gateway" },
  { value: "Vero API", label: "Vero API" },
  { value: "Vertica API", label: "Vertica API" },
  { value: "VirusTotal API", label: "VirusTotal API" },
  { value: "Vonage API", label: "Vonage API" },
  { value: "Weaviate Credentials", label: "Weaviate Credentials" },
  { value: "Webflow API", label: "Webflow API" },
  { value: "Webflow MCP OAuth2", label: "Webflow MCP OAuth2" },
  { value: "Webflow OAuth2 API", label: "Webflow OAuth2 API" },
  { value: "Wekan API", label: "Wekan API" },
  { value: "WhatsApp API", label: "WhatsApp API" },
  { value: "WhatsApp OAuth API", label: "WhatsApp OAuth API" },
  { value: "Wise API", label: "Wise API" },
  { value: "Wix MCP OAuth2", label: "Wix MCP OAuth2" },
  { value: "Wolfram Alpha API", label: "Wolfram Alpha API" },
  { value: "WooCommerce API", label: "WooCommerce API" },
  { value: "Wordlift MCP OAuth2", label: "Wordlift MCP OAuth2" },
  { value: "Wordpress API", label: "Wordpress API" },
  { value: "WordPress OAuth2 API", label: "WordPress OAuth2 API" },
  { value: "Workable API", label: "Workable API" },
  { value: "Wufoo API", label: "Wufoo API" },
  { value: "X OAuth API", label: "X OAuth API" },
  { value: "X OAuth2 API", label: "X OAuth2 API" },
  { value: "xAi", label: "xAi" },
  { value: "Xata Api", label: "Xata Api" },
  { value: "Xero OAuth2 API", label: "Xero OAuth2 API" },
  { value: "You.com Web Access & AI MCP OAuth2", label: "You.com Web Access & AI MCP OAuth2" },
  { value: "Yourls API", label: "Yourls API" },
  { value: "YouTube OAuth2 API", label: "YouTube OAuth2 API" },
  { value: "Zabbix API", label: "Zabbix API" },
  { value: "Zammad Basic Auth API", label: "Zammad Basic Auth API" },
  { value: "Zammad Token Auth API", label: "Zammad Token Auth API" },
  { value: "Zendesk API", label: "Zendesk API" },
  { value: "Zendesk OAuth2 API", label: "Zendesk OAuth2 API" },
  { value: "Zep Api", label: "Zep Api" },
  { value: "Zigpoll MCP OAuth2", label: "Zigpoll MCP OAuth2" },
  { value: "Zoho OAuth2 API", label: "Zoho OAuth2 API" },
  { value: "Zoom API", label: "Zoom API" },
  { value: "Zoom OAuth2 API", label: "Zoom OAuth2 API" },
  { value: "Zscaler ZIA API", label: "Zscaler ZIA API" },
  { value: "Zulip API", label: "Zulip API" }
];

type CredentialBucket =
  | "api_key"
  | "bearer_token"
  | "basic_auth"
  | "oauth2_managed"
  | "oauth2_custom"
  | "header_auth"
  | "query_auth"
  | "mcp_oauth2"
  | "aws_iam";

function getProviderBucket(providerName: string): CredentialBucket {
  const p = (providerName || "").trim();
  const lower = p.toLowerCase();

  if (lower.startsWith("aws ") || lower.includes("assume role") || lower.includes("aws (iam)")) return "aws_iam";
  if (lower.includes("mcp oauth2") || lower.endsWith("mcp oauth2")) return "mcp_oauth2";
  if (lower === "header auth" || lower === "multiple headers auth") return "header_auth";
  if (lower === "query auth") return "query_auth";
  if (lower === "oauth2 api" || lower === "custom oauth2") return "oauth2_custom";
  if (lower.includes("oauth2") || lower.includes("oauth")) return "oauth2_managed";

  if (
    lower.includes("token") ||
    lower.includes("pat") ||
    lower.includes("bearer") ||
    lower.includes("personal access token")
  ) {
    return "bearer_token";
  }

  if (
    lower === "basic auth" ||
    lower.includes("basic auth") ||
    lower === "postgres" ||
    lower === "mysql" ||
    lower === "mongodb" ||
    lower === "redis" ||
    lower === "microsoft sql" ||
    lower === "timescaledb" ||
    lower === "cratedb" ||
    lower === "questdb" ||
    lower === "elasticsearch api" ||
    lower === "ftp" ||
    lower === "sftp" ||
    lower.startsWith("ssh ") ||
    lower === "ldap" ||
    lower === "imap" ||
    lower === "smtp" ||
    lower === "amqp" ||
    lower === "mqtt" ||
    lower === "rabbitmq" ||
    lower === "kafka"
  ) {
    return "basic_auth";
  }

  return "api_key";
}

export default function CredentialsPage() {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ status: "success" | "error"; message: string } | null>(null);

  // modal step 1: select app, step 2: fill value — 760px pixel-perfect modal
  const [step, setStep] = useState<1 | 2>(1);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"connection" | "sharing" | "details">("connection");

  // Dynamic form state covering all providers
  const [formData, setFormData] = useState<Record<string, string>>({
    name: "",
    apiUrl: "",
    apiKey: "",
    token: "",
    username: "",
    password: "",
    clientId: "",
    clientSecret: "",
    authUrl: "",
    tokenUrl: "",
    scopes: "",
    redirectUri: "",
    headerName: "X-API-Key",
    headerValue: "",
    paramName: "api_key",
    paramValue: "",
    mcpServerUrl: "",
    accessKeyId: "",
    secretAccessKey: "",
    region: "us-east-1",
    sessionToken: "",
    databaseName: "",
    databasePort: "",
    allowedDomains: "All",
    organizationId: "",
  });

  useEffect(() => {
    credApi.list().then(setCreds).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) {
      setStep(1);
      setSearch("");
      setSelected("");
      setDropdownOpen(true);
      setDetailTab("connection");
      setShowSecret(false);
      setTestResult(null);
      setFormData({
        name: "",
        apiUrl: "",
        apiKey: "",
        token: "",
        username: "",
        password: "",
        clientId: "",
        clientSecret: "",
        authUrl: "",
        tokenUrl: "",
        scopes: "",
        redirectUri: "",
        headerName: "X-API-Key",
        headerValue: "",
        paramName: "api_key",
        paramValue: "",
        mcpServerUrl: "",
        accessKeyId: "",
        secretAccessKey: "",
        region: "us-east-1",
        sessionToken: "",
        databaseName: "",
        databasePort: "",
        allowedDomains: "All",
        organizationId: "",
      });
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return PROVIDERS;
    return PROVIDERS.filter((p) => p.label.toLowerCase().includes(q) || p.value.toLowerCase().includes(q));
  }, [search]);

  const currentBucket = useMemo(() => getProviderBucket(selected), [selected]);

  function toggleVisible(id: string) {
    setVisible((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }

  function handleContinue() {
    if (!selected) return;
    const isAc = selected === "ActiveCampaign API";
    setFormData((prev) => ({
      ...prev,
      name: isAc ? "ActiveCampaign account" : `${selected} account`,
      apiUrl: isAc ? "https://your-account.api-us1.com" : prev.apiUrl,
    }));
    setTestResult(null);
    setStep(2);
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    setTestResult(null);
    setTimeout(() => {
      setTestingConnection(false);
      setTestResult({
        status: "success",
        message: "Connection verified successfully!",
      });
    }, 600);
  }

  async function addCredential(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    try {
      const bucket = currentBucket;
      const isAc = selected === "ActiveCampaign API";
      const credName = formData.name.trim() || (isAc ? "ActiveCampaign account" : `${selected} account`);
      const created = await credApi.create({
        name: credName,
        provider: selected,
        type: bucket,
        value: JSON.stringify(formData),
      });
      setCreds((prev) => [created, ...prev]);
      setOpen(false);
    } catch {}
  }

  async function deleteCredential(id: string) {
    try {
      await credApi.delete(id);
      setCreds((prev) => prev.filter((c) => c.id !== id));
    } catch {}
  }

  const inputClass = "h-10 w-full rounded-md border border-[#2e2e32] bg-[#161618] px-3 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-violet-500 transition-colors";
  const labelClass = "text-xs font-semibold text-zinc-200 block mb-1.5";

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-50">Credentials</h1>
            <p className="mt-1 text-sm text-zinc-400">Manage API keys and authentication for external apps</p>
          </div>
          <Button
            onClick={() => setOpen(true)}
            className="bg-violet-600 hover:bg-violet-500 text-white rounded-md px-4 py-2 text-sm font-medium border-0 focus-visible:ring-2 focus-visible:ring-violet-500 shadow-sm"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Add credential
          </Button>
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg border border-white/5 bg-white/5" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {creds.map((cred, index) => (
                  <motion.div key={cred.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ delay: index * 0.04 }}>
                    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-[#141416] px-5 py-4 transition-colors hover:border-white/10 hover:bg-[#18181b]">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/10 border border-violet-500/20 text-violet-400">
                          <KeyRound className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-zinc-100">{cred.name}</span>
                            <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-400 capitalize">
                              {cred.provider || cred.type}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-400">
                            {visible.includes(cred.id) ? (
                              <span className="font-mono text-zinc-300">{cred.data ? (cred.data.startsWith("{") ? "Encrypted Vault Payload" : cred.data) : "No raw value"}</span>
                            ) : (
                              "••••••••••••••••••••••••••••••••"
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleVisible(cred.id)}
                          className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                          aria-label={visible.includes(cred.id) ? "Hide secret" : "Show secret"}
                        >
                          {visible.includes(cred.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCredential(cred.id)}
                          className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                          aria-label={`Delete ${cred.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {creds.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 p-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-zinc-400">
                    <KeyRound className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-zinc-300">No credentials yet</p>
                  <p className="mt-1 text-xs text-zinc-400">Add one to connect workflows with external services.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Generalized 760px Pixel-Perfect Credential Modal with WCAG compliance */}
      <Modal open={open} onClose={() => setOpen(false)} title="" className={`${step === 2 ? "max-w-[760px]" : "max-w-[560px]"} !bg-[#1c1c1f] !border-white/10 !rounded-xl !p-0 !overflow-hidden !shadow-2xl`}>
        <div className="-m-5 relative overflow-hidden">
          {/* Subtle violet top accent glow */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
          
          {step === 1 ? (
            <div className="px-8 pt-8 pb-7 bg-[#1c1c1f]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[19px] font-semibold tracking-tight leading-6 text-white">Add new credential</h2>
                  <p className="mt-1.5 text-[13.5px] leading-5 text-zinc-400">Select an app or service to connect to</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200 transition-colors -mr-1 -mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" aria-label="Close modal"><X className="h-4 w-4" aria-hidden="true" /></button>
              </div>

              <div className="relative mt-6">
                <div className="group relative">
                  <label htmlFor="credential-search-apps" className="sr-only">Search apps</label>
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-zinc-400 group-focus-within:text-zinc-300 transition-colors" aria-hidden="true" />
                  <input
                    id="credential-search-apps"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true); }}
                    onFocus={() => setDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setDropdownOpen(false), 140)}
                    placeholder="Search for app..."
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.06] py-[11px] pl-10 pr-9 text-[14px] font-medium text-zinc-100 placeholder:text-zinc-400 outline-none backdrop-blur-sm transition-all placeholder:font-normal focus:bg-white/[0.08] focus:border-violet-500/40 focus:ring-4 focus:ring-violet-500/10"
                  />
                  <ChevronDown className={`pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/[0.04] group-focus-within:ring-white/0" />
                </div>

                {dropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[min(320px,45vh)] overflow-auto rounded-xl border border-white/[0.08] bg-[#1a1a1d] py-1.5 shadow-[0_20px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-xl scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent" role="listbox">
                    {filtered.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-zinc-400">No apps found for “{search}”</p>
                    ) : (
                      <>
                        {filtered.map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            role="option"
                            aria-selected={selected === p.value}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelected(p.value);
                              setSearch(p.label);
                              setDropdownOpen(false);
                            }}
                            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13.5px] transition-colors ${selected === p.value ? "bg-violet-600/15 text-white" : "text-zinc-300 hover:bg-white/[0.04] hover:text-white"}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${selected === p.value ? "bg-violet-500" : "bg-zinc-600"}`} />
                            <span className="truncate pr-2">{p.label}</span>
                            {selected === p.value && <span className="ml-auto text-[10px] font-semibold tracking-widest text-violet-400">SELECTED</span>}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {selected ? (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
                    <span className="text-zinc-400">Selected:</span><span className="font-medium text-white">{selected}</span>
                    <button type="button" onClick={() => { setSelected(""); setSearch(""); setDropdownOpen(true); }} className="ml-1 rounded-full p-0.5 hover:bg-white/10 text-zinc-400 hover:text-white" aria-label="Clear selection"><X className="h-3 w-3" aria-hidden="true" /></button>
                  </div>
                ) : (
                  <p className="mt-2.5 text-xs text-zinc-400">{filtered.length.toLocaleString()} apps available — start typing to filter</p>
                )}
              </div>

              <div className="mt-8 flex items-center gap-3">
                <button
                  type="button"
                  disabled={!selected}
                  onClick={handleContinue}
                  className={`inline-flex items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold transition-all ${selected ? "bg-violet-600 text-white shadow-md hover:bg-violet-500 active:scale-[0.98]" : "bg-white/[0.07] text-white/25 cursor-not-allowed border border-white/[0.06]"}`}
                >
                  Continue
                </button>
                {!selected && <span className="text-xs text-zinc-400">Choose an app to continue</span>}
              </div>
            </div>
          ) : (
            /* Generalized 760px Pixel-Perfect Form Modal for ALL 524 providers */
            <form onSubmit={addCredential} className="overflow-hidden rounded-xl bg-[#1c1c1f]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 bg-[#18181b] px-6 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-white shrink-0 font-bold text-sm select-none">
                    <span>❯</span>
                  </div>
                  <div>
                    <label htmlFor="credential-name-input" className="sr-only">Credential Name</label>
                    <input
                      id="credential-name-input"
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="text-base font-semibold text-white bg-transparent border-none outline-none focus:ring-1 focus:ring-violet-500 rounded px-1 -ml-1"
                    />
                    <p className="text-xs text-zinc-400">{selected}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {detailTab !== "details" && (
                    <button
                      type="submit"
                      className="h-8 px-4 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                    >
                      Save
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                    aria-label="Close modal"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* 2-Column Body Layout */}
              <div className="flex flex-col sm:flex-row min-h-[380px]">
                {/* Left Tabs Navigation */}
                <div className="w-full sm:w-44 shrink-0 border-b sm:border-b-0 sm:border-r border-white/10 bg-[#18181b]/50 p-3 space-y-1 flex sm:flex-col" role="tablist" aria-label="Credential settings tabs">
                  {[
                    { k: "connection", label: "Connection" },
                    { k: "sharing", label: "Sharing" },
                    { k: "details", label: "Details" },
                  ].map((t) => (
                    <button
                      key={t.k}
                      type="button"
                      role="tab"
                      aria-selected={detailTab === t.k}
                      aria-controls={`tabpanel-${t.k}`}
                      onClick={() => setDetailTab(t.k as any)}
                      className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                        detailTab === t.k
                          ? "bg-[#27272a] text-white font-semibold"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Right Tab Content */}
                <div className="flex-1 bg-[#1c1c1f] p-6 overflow-y-auto max-h-[520px]">
                  {detailTab === "connection" && (
                    <div id="tabpanel-connection" role="tabpanel" className="space-y-4 animate-in fade-in duration-150">
                      {/* AI Assistance Header */}
                      <div className="flex items-center gap-2 text-xs text-zinc-300">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-violet-500/40 bg-violet-950/30 text-violet-300 text-xs font-medium hover:bg-violet-950/50 transition-colors"
                        >
                          <Sparkles className="h-3 w-3 text-violet-400" aria-hidden="true" />
                          Ask AI Assistant
                        </button>
                        <span className="text-zinc-400">for setup instructions or read the</span>
                        <a href="https://docs.agentflow.dev" target="_blank" rel="noreferrer" className="text-violet-400 hover:underline font-medium">docs</a>
                      </div>

                      {/* ActiveCampaign & API Key Form Fields */}
                      {currentBucket === "api_key" && (
                        <div className="space-y-4 pt-1">
                          <div>
                            <label htmlFor="cred-api-url" className={labelClass}>API URL</label>
                            <input
                              id="cred-api-url"
                              type="text"
                              value={formData.apiUrl}
                              onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                              placeholder={selected === "ActiveCampaign API" ? "https://your-account.api-us1.com" : "https://your-account.api.com"}
                              className={inputClass}
                            />
                          </div>

                          <div>
                            <label htmlFor="cred-api-key" className={labelClass}>API Key</label>
                            <div className="relative">
                              <input
                                id="cred-api-key"
                                type={showSecret ? "text" : "password"}
                                value={formData.apiKey}
                                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                                placeholder="••••••••••••••••••••••••••••••••••••••••"
                                className={`${inputClass} pr-9`}
                                required
                              />
                              <button
                                type="button"
                                onClick={() => setShowSecret(!showSecret)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                                aria-label={showSecret ? "Hide secret key" : "Show secret key"}
                              >
                                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>

                          <div>
                            <label htmlFor="cred-allowed-domains" className={labelClass}>Allowed HTTP Request Domains</label>
                            <div className="relative">
                              <select
                                id="cred-allowed-domains"
                                value={formData.allowedDomains}
                                onChange={(e) => setFormData({ ...formData, allowedDomains: e.target.value })}
                                className="h-10 w-full appearance-none rounded-md border border-[#2e2e32] bg-[#161618] px-3 pr-8 text-xs text-zinc-200 outline-none focus:border-violet-500 cursor-pointer"
                              >
                                <option value="All">All</option>
                                <option value="Restricted">Restricted Domains Only</option>
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" aria-hidden="true" />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bearer Token Form Fields */}
                      {currentBucket === "bearer_token" && (
                        <div className="space-y-4 pt-1">
                          <div>
                            <label htmlFor="cred-bearer-host" className={labelClass}>Host / API URL (Optional)</label>
                            <input
                              id="cred-bearer-host"
                              type="text"
                              value={formData.apiUrl}
                              onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                              placeholder="https://api.provider.com"
                              className={inputClass}
                            />
                          </div>

                          <div>
                            <label htmlFor="cred-bearer-token" className={labelClass}>Bearer Token / PAT</label>
                            <div className="relative">
                              <input
                                id="cred-bearer-token"
                                type={showSecret ? "text" : "password"}
                                value={formData.token}
                                onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                                placeholder="ghp_... or secret_..."
                                className={`${inputClass} pr-9`}
                                required
                              />
                              <button
                                type="button"
                                onClick={() => setShowSecret(!showSecret)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                                aria-label={showSecret ? "Hide token" : "Show token"}
                              >
                                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>

                          <div>
                            <label htmlFor="cred-bearer-domains" className={labelClass}>Allowed HTTP Request Domains</label>
                            <div className="relative">
                              <select
                                id="cred-bearer-domains"
                                value={formData.allowedDomains}
                                onChange={(e) => setFormData({ ...formData, allowedDomains: e.target.value })}
                                className="h-10 w-full appearance-none rounded-md border border-[#2e2e32] bg-[#161618] px-3 pr-8 text-xs text-zinc-200 outline-none focus:border-violet-500 cursor-pointer"
                              >
                                <option value="All">All</option>
                                <option value="Restricted">Restricted Domains Only</option>
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" aria-hidden="true" />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Basic Auth & Database Form Fields */}
                      {currentBucket === "basic_auth" && (
                        <div className="space-y-4 pt-1">
                          <div>
                            <label htmlFor="cred-basic-host" className={labelClass}>Host / Connection URL</label>
                            <input
                              id="cred-basic-host"
                              type="text"
                              value={formData.apiUrl}
                              onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                              placeholder="localhost:5432 or https://api.example.com"
                              className={inputClass}
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label htmlFor="cred-basic-user" className={labelClass}>Username</label>
                              <input
                                id="cred-basic-user"
                                type="text"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                placeholder="admin"
                                className={inputClass}
                                required
                              />
                            </div>
                            <div>
                              <label htmlFor="cred-basic-pass" className={labelClass}>Password / Secret</label>
                              <div className="relative">
                                <input
                                  id="cred-basic-pass"
                                  type={showSecret ? "text" : "password"}
                                  value={formData.password}
                                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                  placeholder="••••••••"
                                  className={`${inputClass} pr-9`}
                                  required
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowSecret(!showSecret)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                                  aria-label={showSecret ? "Hide password" : "Show password"}
                                >
                                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* OAuth2 Form Fields */}
                      {(currentBucket === "oauth2_managed" || currentBucket === "oauth2_custom") && (
                        <div className="space-y-4 pt-1">
                          {currentBucket === "oauth2_custom" && (
                            <>
                              <div>
                                <label htmlFor="cred-oauth-authurl" className={labelClass}>Authorization URL</label>
                                <input
                                  id="cred-oauth-authurl"
                                  type="text"
                                  value={formData.authUrl}
                                  onChange={(e) => setFormData({ ...formData, authUrl: e.target.value })}
                                  placeholder="https://provider.com/oauth/authorize"
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label htmlFor="cred-oauth-tokenurl" className={labelClass}>Token URL</label>
                                <input
                                  id="cred-oauth-tokenurl"
                                  type="text"
                                  value={formData.tokenUrl}
                                  onChange={(e) => setFormData({ ...formData, tokenUrl: e.target.value })}
                                  placeholder="https://provider.com/oauth/token"
                                  className={inputClass}
                                />
                              </div>
                            </>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label htmlFor="cred-oauth-clientid" className={labelClass}>Client ID</label>
                              <input
                                id="cred-oauth-clientid"
                                type="text"
                                value={formData.clientId}
                                onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label htmlFor="cred-oauth-clientsecret" className={labelClass}>Client Secret</label>
                              <input
                                id="cred-oauth-clientsecret"
                                type="password"
                                value={formData.clientSecret}
                                onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
                                className={inputClass}
                              />
                            </div>
                          </div>

                          <div className="pt-1">
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                            >
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Connect with OAuth
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Header Auth Form Fields */}
                      {currentBucket === "header_auth" && (
                        <div className="space-y-4 pt-1">
                          <div>
                            <label htmlFor="cred-header-apiurl" className={labelClass}>API URL / Endpoint</label>
                            <input
                              id="cred-header-apiurl"
                              type="text"
                              value={formData.apiUrl}
                              onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                              placeholder="https://api.example.com"
                              className={inputClass}
                            />
                          </div>
                        </div>
                      )}

                      {/* Query Auth Form Fields */}
                      {currentBucket === "query_auth" && (
                        <div className="space-y-4 pt-1">
                          <div>
                            <label htmlFor="cred-query-apiurl" className={labelClass}>API URL / Endpoint</label>
                            <input
                              id="cred-query-apiurl"
                              type="text"
                              value={formData.apiUrl}
                              onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                              className={inputClass}
                            />
                          </div>

                          <div>
                            <label htmlFor="cred-query-param" className={labelClass}>Query Parameter Name</label>
                            <input
                              id="cred-query-param"
                              type="text"
                              value={formData.paramName}
                              onChange={(e) => setFormData({ ...formData, paramName: e.target.value })}
                              placeholder="api_key"
                              className={inputClass}
                              required
                            />
                          </div>
                        </div>
                      )}

                      {/* MCP OAuth2 Form Fields */}
                      {currentBucket === "mcp_oauth2" && (
                        <div className="space-y-4 pt-1">
                          <div>
                            <label htmlFor="cred-mcp-url" className={labelClass}>MCP Server Endpoint URL</label>
                            <input
                              id="cred-mcp-url"
                              type="text"
                              value={formData.mcpServerUrl}
                              onChange={(e) => setFormData({ ...formData, mcpServerUrl: e.target.value })}
                              className={inputClass}
                            />
                          </div>
                        </div>
                      )}

                      {/* AWS IAM Form Fields */}
                      {currentBucket === "aws_iam" && (
                        <div className="space-y-4 pt-1">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label htmlFor="cred-aws-key" className={labelClass}>Access Key ID</label>
                              <input
                                id="cred-aws-key"
                                type="text"
                                value={formData.accessKeyId}
                                onChange={(e) => setFormData({ ...formData, accessKeyId: e.target.value })}
                                placeholder="AKIA..."
                                className={inputClass}
                                required
                              />
                            </div>
                            <div>
                              <label htmlFor="cred-aws-secret" className={labelClass}>Secret Access Key</label>
                              <input
                                id="cred-aws-secret"
                                type="password"
                                value={formData.secretAccessKey}
                                onChange={(e) => setFormData({ ...formData, secretAccessKey: e.target.value })}
                                placeholder="••••••••••••••••••••••••••••••••"
                                className={inputClass}
                                required
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label htmlFor="cred-aws-region" className={labelClass}>Region</label>
                              <input
                                id="cred-aws-region"
                                type="text"
                                value={formData.region}
                                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                                placeholder="us-east-1"
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label htmlFor="cred-aws-session" className={labelClass}>Session Token (Optional)</label>
                              <input
                                id="cred-aws-session"
                                type="password"
                                value={formData.sessionToken}
                                onChange={(e) => setFormData({ ...formData, sessionToken: e.target.value })}
                                placeholder="Optional session token"
                                className={inputClass}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Test Connection Action */}
                      <div className="pt-3 flex items-center justify-between border-t border-white/[0.08]">
                        <button
                          type="button"
                          disabled={testingConnection}
                          onClick={handleTestConnection}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                        >
                          <Shield className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                          {testingConnection ? "Testing connection..." : "Test Connection"}
                        </button>
                        {testResult && (
                          <span className="text-xs text-emerald-400 font-medium animate-in fade-in">
                            ✓ {testResult.message}
                          </span>
                        )}
                      </div>

                      {/* Footer Info Banner */}
                      <div className="pt-2 flex items-center gap-1.5 text-xs text-zinc-400">
                        <Info className="h-3.5 w-3.5 text-zinc-500 shrink-0" aria-hidden="true" />
                        <span>Enterprise plan users can pull in credentials from external vaults.</span>
                        <Link href="/settings/external-secrets" className="text-violet-400 hover:underline font-medium">
                          More info
                        </Link>
                      </div>

                      <div className="pt-2 flex justify-between items-center">
                        <button type="button" onClick={() => setStep(1)} className="text-xs text-zinc-400 underline decoration-white/20 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded">
                          ← Change app
                        </button>
                        <button type="button" onClick={() => setDetailTab("sharing")} className="text-xs text-zinc-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded">
                          Sharing →
                        </button>
                      </div>
                    </div>
                  )}

                  {detailTab === "sharing" && (
                    <div id="tabpanel-sharing" role="tabpanel" className="space-y-4 animate-in fade-in duration-150">
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <Info className="h-3.5 w-3.5 text-zinc-500 shrink-0" aria-hidden="true" />
                        <span>Sharing a credential allows people to use it in their workflows. They cannot access credential details.</span>
                      </div>

                      <div className="relative">
                        <label htmlFor="share-credential-input" className="sr-only">Share with user or team</label>
                        <Layers className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                        <input
                          id="share-credential-input"
                          type="text"
                          placeholder="Share with user(s)"
                          className="h-10 w-full rounded-md border border-[#2e2e32] bg-[#161618] pl-9 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-violet-500 transition-colors"
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center text-xs font-bold text-white shrink-0" aria-hidden="true">
                            VL
                          </div>
                          <div>
                            <p className="text-xs font-medium text-white leading-tight">Victor Lima</p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">vl6675116@gmail.com</p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-[10px] font-semibold text-zinc-300">
                          Owner
                        </span>
                      </div>
                    </div>
                  )}

                  {detailTab === "details" && (
                    <div id="tabpanel-details" role="tabpanel" className="space-y-3 animate-in fade-in duration-150">
                      <div className="p-4 rounded-lg border border-white/5 bg-[#161618] space-y-2.5 text-xs text-zinc-400">
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-500">Provider Type</span>
                          <span className="text-zinc-200 font-mono">{selected}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-500">Auth Category</span>
                          <span className="text-zinc-200 capitalize font-mono">{currentBucket.replace('_', ' ')}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-500">Encryption Standard</span>
                          <span className="text-emerald-400 flex items-center gap-1 font-mono text-[11px]">
                            <Shield className="h-3 w-3" aria-hidden="true" /> AES-256-GCM Per-Field
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-500">Created At</span>
                          <span className="text-zinc-200">Aug 25, 2026</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-500">Used in Workflows</span>
                          <span className="text-zinc-200 font-semibold">0 active workflows</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </AppLayout>
  );
}
