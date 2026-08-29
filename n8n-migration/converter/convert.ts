#!/usr/bin/env tsx
/**
 * n8n → AgentFlow Workflow Converter
 *
 * Standalone utility to parse n8n workflow JSON and emit normalized JSON/CSV
 * mapped to AgentFlow data models (Prisma/Postgres).
 *
 * Usage:
 *   npx tsx convert.ts <input-file> [options]
 *   npx tsx convert.ts --help
 *
 * Options:
 *   -o, --output <dir>      Output directory (default: ./convertido)
 *   -f, --format <fmt>      Output format: json|csv|both (default: json)
 *   -v, --verbose           Verbose logging
 *   --dry-run               Parse only, don't write files
 *
 * No network, no credentials, no commits - pure local transformation.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname, basename, extname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ════════════════════════════════════════════════════════════════════

export interface N8nWorkflow {
  name: string;
  nodes: N8nNode[];
  connections: N8nConnections;
  settings?: N8nSettings;
  staticData?: Record<string, any> | null;
  pinData?: Record<string, N8nPinData[]>;
  meta?: N8nMeta;
  id?: string;
  tags?: string[];
  active?: boolean;
  versionId?: string;
  createdAt?: string;
  updatedAt?: string;
  data?: N8nWorkflow; // Support wrapped workflows { data: { ... } }
}

export interface N8nNode {
  id?: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, any>;
  credentials?: Record<string, string>;
  disabled?: boolean;
  notes?: string;
  notesInFlow?: string;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  alwaysOutputData?: boolean;
  executeOnce?: boolean;
  continueOnFail?: boolean;
  runOnceForAllItems?: boolean;
  webhookId?: string;
}

export interface N8nConnections {
  [sourceNodeName: string]: {
    [outputType: string]: Array<Array<{
      node: string;
      type: string;
      index: number;
    }>>;
  };
}

export interface N8nSettings {
  executionOrder?: string;
  saveManualExecutions?: boolean;
  saveExecutionProgress?: boolean;
  executionTimeout?: number;
  errorWorkflow?: string;
  timezone?: string;
  callerPolicy?: string;
}

export interface N8nPinData {
  json: Record<string, any>;
  binary: Record<string, any>;
}

export interface N8nMeta {
  instanceId?: string;
  templateCredsSetupCompleted?: boolean;
  position?: { x: number; y: number };
}

// ════════════════════════════════════════════════════════════════════
// AGENTFLOW OUTPUT MODELS
// ════════════════════════════════════════════════════════════════════

export interface AgentFlowWorkflow {
  name: string;
  description?: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  config: Record<string, any>;
  meta: Record<string, any>;
  tags: string[];
  nodes: AgentFlowNode[];
  edges: AgentFlowEdge[];
  triggers: AgentFlowTrigger[];
  schedules: AgentFlowSchedule[];
  credentialsUsed: string[];
  webhooks: AgentFlowWebhook[];
}

export interface AgentFlowNode {
  id: string; // cuid-like or mapped ID
  type: string; // mapped AgentFlow type key
  label: string; // n8n node name
  config: {
    typeVersion: number;
    parameters: Record<string, any>;
    credentials?: Record<string, string>; // credential name references
    disabled?: boolean;
    notes?: string;
    notesInFlow?: string;
    retryOnFail?: boolean;
    maxTries?: number;
    waitBetweenTries?: number;
    continueOnFail?: boolean;
    runOnceForAllItems?: boolean;
    webhookId?: string;
    originalN8nType: string;
    originalN8nId?: string;
  };
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

export interface AgentFlowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string; // output port name
  targetHandle?: string; // input port name
  label?: string; // output index as string
  condition?: Record<string, any>; // for conditional edges
}

export interface AgentFlowTrigger {
  type: 'webhook' | 'cron' | 'manual' | 'api' | 'form' | 'gmail' | 'imap' | 'evaluation';
  config: Record<string, any>;
  nodeId: string;
}

export interface AgentFlowSchedule {
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  nodeId: string;
}

export interface AgentFlowWebhook {
  path: string;
  method: string;
  responseMode: 'onReceived' | 'lastNode' | 'responseNode';
  responseCode: number;
  nodeId: string;
}

export interface AgentFlowCredentialRef {
  nodeId: string;
  credentialType: string;
  credentialName: string;
}

export interface ConversionResult {
  workflow: AgentFlowWorkflow;
  nodes: AgentFlowNode[];
  edges: AgentFlowEdge[];
  triggers: AgentFlowTrigger[];
  schedules: AgentFlowSchedule[];
  webhooks: AgentFlowWebhook[];
  credentialsUsed: AgentFlowCredentialRef[];
  warnings: string[];
  errors: string[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    totalTriggers: number;
    totalCredentials: number;
    totalWebhooks: number;
  };
}

// ════════════════════════════════════════════════════════════════════
// NODE TYPE MAPPING (n8n → AgentFlow)
// ════════════════════════════════════════════════════════════════════

export const N8N_TO_AGENTFLOW_TYPE_MAP: Record<string, { type: string; category: string; isTrigger: boolean }> = {
  // Triggers
  'n8n-nodes-base.webhook': { type: 'webhook', category: 'trigger', isTrigger: true },
  'n8n-nodes-base.cron': { type: 'cron', category: 'trigger', isTrigger: true },
  'n8n-nodes-base.scheduleTrigger': { type: 'cron', category: 'trigger', isTrigger: true },
  'n8n-nodes-base.manualTrigger': { type: 'manual', category: 'trigger', isTrigger: true },
  'n8n-nodes-base.formTrigger': { type: 'form', category: 'trigger', isTrigger: true },
  'n8n-nodes-base.errorTrigger': { type: 'errorTrigger', category: 'trigger', isTrigger: true },
  'n8n-nodes-base.gmailTrigger': { type: 'gmailTrigger', category: 'trigger', isTrigger: true },
  'n8n-nodes-base.emailReadImap': { type: 'emailReadImap', category: 'trigger', isTrigger: true },
  'n8n-nodes-base.evaluationTrigger': { type: 'evaluationTrigger', category: 'trigger', isTrigger: true },

  // Actions & Services
  'n8n-nodes-base.httpRequest': { type: 'httpRequest', category: 'action', isTrigger: false },
  'n8n-nodes-base.emailSend': { type: 'emailSend', category: 'action', isTrigger: false },
  'n8n-nodes-base.telegram': { type: 'telegram', category: 'action', isTrigger: false },
  'n8n-nodes-base.gmail': { type: 'gmail', category: 'action', isTrigger: false },
  'n8n-nodes-base.googleDrive': { type: 'googleDrive', category: 'action', isTrigger: false },
  'n8n-nodes-base.slack': { type: 'slack', category: 'action', isTrigger: false },
  'n8n-nodes-base.discord': { type: 'discord', category: 'action', isTrigger: false },
  'n8n-nodes-base.whatsapp': { type: 'whatsapp', category: 'action', isTrigger: false },
  'n8n-nodes-base.stripe': { type: 'stripe', category: 'action', isTrigger: false },

  // Data & Databases
  'n8n-nodes-base.googleSheets': { type: 'googleSheets', category: 'data', isTrigger: false },
  'n8n-nodes-base.airtable': { type: 'airtable', category: 'data', isTrigger: false },
  'n8n-nodes-base.postgres': { type: 'postgres', category: 'data', isTrigger: false },
  'n8n-nodes-base.mysql': { type: 'mysql', category: 'data', isTrigger: false },
  'n8n-nodes-base.mySql': { type: 'mysql', category: 'data', isTrigger: false },
  'n8n-nodes-base.mongodb': { type: 'mongodb', category: 'data', isTrigger: false },
  'n8n-nodes-base.mongoDb': { type: 'mongodb', category: 'data', isTrigger: false },
  'n8n-nodes-base.redis': { type: 'redis', category: 'data', isTrigger: false },
  'n8n-nodes-base.graphql': { type: 'graphql', category: 'data', isTrigger: false },

  // Logic & Flow Control
  'n8n-nodes-base.if': { type: 'if', category: 'logic', isTrigger: false },
  'n8n-nodes-base.switch': { type: 'switch', category: 'logic', isTrigger: false },
  'n8n-nodes-base.merge': { type: 'merge', category: 'logic', isTrigger: false },
  'n8n-nodes-base.filter': { type: 'filter', category: 'logic', isTrigger: false },
  'n8n-nodes-base.splitInBatches': { type: 'splitInBatches', category: 'logic', isTrigger: false },
  'n8n-nodes-base.wait': { type: 'wait', category: 'logic', isTrigger: false },
  'n8n-nodes-base.delay': { type: 'delay', category: 'logic', isTrigger: false },

  // Transform
  'n8n-nodes-base.set': { type: 'set', category: 'transform', isTrigger: false },
  'n8n-nodes-base.code': { type: 'code', category: 'transform', isTrigger: false },
  'n8n-nodes-base.function': { type: 'code', category: 'transform', isTrigger: false },
  'n8n-nodes-base.functionItem': { type: 'code', category: 'transform', isTrigger: false },
  'n8n-nodes-base.itemLists': { type: 'itemLists', category: 'transform', isTrigger: false },

  // AI & Langchain
  '@n8n/n8n-nodes-langchain.openAi': { type: 'aiAgent', category: 'ai', isTrigger: false },
  '@n8n/n8n-nodes-langchain.agent': { type: 'aiAgent', category: 'ai', isTrigger: false },
  '@n8n/n8n-nodes-langchain.chain': { type: 'aiChain', category: 'ai', isTrigger: false },
  '@n8n/n8n-nodes-langchain.embeddings': { type: 'embeddings', category: 'ai', isTrigger: false },
  '@n8n/n8n-nodes-langchain.vectorStore': { type: 'vectorStore', category: 'ai', isTrigger: false },
  'n8n-nodes-base.openAi': { type: 'aiAgent', category: 'ai', isTrigger: false },

  // Webhook Response
  'n8n-nodes-base.webhookResponse': { type: 'webhookResponse', category: 'trigger', isTrigger: false },
  'n8n-nodes-base.respondToWebhook': { type: 'respondToWebhook', category: 'action', isTrigger: false },
};

// Credential type mapping
export const N8N_CREDENTIAL_TYPE_MAP: Record<string, string> = {
  'httpBasicAuth': 'basic',
  'headerAuth': 'apiKey',
  'oAuth1Api': 'oauth1',
  'oAuth2Api': 'oauth2',
  'googleOAuth2Api': 'oauth2',
  'githubOAuth2Api': 'oauth2',
  'telegramApi': 'apiKey',
  'openAiApi': 'apiKey',
  'gmailOAuth2Api': 'oauth2',
  'googleDriveOAuth2Api': 'oauth2',
  'googleSheetsOAuth2Api': 'oauth2',
  'slackOAuth2Api': 'oauth2',
  'airtableApi': 'apiKey',
  'postgres': 'database',
  'mysql': 'database',
  'mongodb': 'database',
  'redis': 'database',
  'imap': 'email',
  'smtp': 'email',
};

// ════════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════════

export function generateId(prefix = 'node'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}-${timestamp}${random}`;
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function mapNodeType(n8nType: string): { type: string; category: string; isTrigger: boolean } {
  const mapping = N8N_TO_AGENTFLOW_TYPE_MAP[n8nType];
  if (mapping) return mapping;

  // Fallback: extract base name
  const parts = n8nType.split('.');
  const base = parts[parts.length - 1] || n8nType;
  return { type: base, category: 'custom', isTrigger: false };
}

export function mapCredentialType(n8nCredType: string): string {
  return N8N_CREDENTIAL_TYPE_MAP[n8nCredType] || 'custom';
}

export function parseCronExpression(cronExpr: string): { valid: boolean; normalized?: string; error?: string } {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length < 5 || fields.length > 6) {
    return { valid: false, error: `Invalid cron expression: ${cronExpr} (expected 5-6 fields)` };
  }
  return { valid: true, normalized: cronExpr };
}

// ════════════════════════════════════════════════════════════════════
// MAIN CONVERSION LOGIC
// ════════════════════════════════════════════════════════════════════

export function convertWorkflow(rawInput: N8nWorkflow, verbose = false): ConversionResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Handle wrapped payload { data: { ... } }
  const n8nWorkflow: N8nWorkflow = rawInput.data ? rawInput.data : rawInput;

  if (!n8nWorkflow.name) {
    errors.push('Workflow missing "name"');
  }
  if (!n8nWorkflow.nodes || !Array.isArray(n8nWorkflow.nodes)) {
    errors.push('Workflow missing "nodes" array');
  }
  if (!n8nWorkflow.connections) {
    errors.push('Workflow missing "connections"');
  }

  if (errors.length > 0) {
    return {
      workflow: {
        name: n8nWorkflow.name || 'Untitled',
        status: 'DRAFT',
        config: {},
        meta: {},
        tags: [],
        nodes: [],
        edges: [],
        triggers: [],
        schedules: [],
        credentialsUsed: [],
        webhooks: [],
      },
      nodes: [],
      edges: [],
      triggers: [],
      schedules: [],
      webhooks: [],
      credentialsUsed: [],
      warnings,
      errors,
      stats: { totalNodes: 0, totalEdges: 0, totalTriggers: 0, totalCredentials: 0, totalWebhooks: 0 },
    };
  }

  // Build node ID map (n8n name → AgentFlow ID)
  const nodeIdMap = new Map<string, string>();
  const nodeNameMap = new Map<string, string>();

  // First pass: assign IDs to all nodes
  for (const node of n8nWorkflow.nodes) {
    const agentFlowId = node.id ? `node-${slugify(node.id)}` : generateId('node');
    nodeIdMap.set(node.name, agentFlowId);
    nodeNameMap.set(agentFlowId, node.name);
  }

  // Convert nodes
  const nodes: AgentFlowNode[] = [];
  const credentialsUsed: AgentFlowCredentialRef[] = [];
  const triggers: AgentFlowTrigger[] = [];
  const schedules: AgentFlowSchedule[] = [];
  const webhooks: AgentFlowWebhook[] = [];

  for (const n8nNode of n8nWorkflow.nodes) {
    const agentFlowId = nodeIdMap.get(n8nNode.name)!;
    const typeMapping = mapNodeType(n8nNode.type);

    // Extract credentials
    if (n8nNode.credentials && typeof n8nNode.credentials === 'object') {
      for (const [credType, credName] of Object.entries(n8nNode.credentials)) {
        if (typeof credName === 'string') {
          credentialsUsed.push({
            nodeId: agentFlowId,
            credentialType: mapCredentialType(credType),
            credentialName: credName,
          });
        }
      }
    }

    const params = n8nNode.parameters || {};

    // Handle trigger-specific config
    if (typeMapping.isTrigger) {
      if (n8nNode.type === 'n8n-nodes-base.webhook' || n8nNode.type === 'n8n-nodes-base.formTrigger') {
        const httpMethod = params.httpMethod || 'POST';
        const path = params.path || '';
        const responseMode = params.responseMode || 'onReceived';
        const responseCode = params.responseCode || 200;

        triggers.push({
          type: n8nNode.type === 'n8n-nodes-base.formTrigger' ? 'form' : 'webhook',
          config: {
            httpMethod,
            path,
            responseMode,
            responseCode,
            options: params.options || {},
          },
          nodeId: agentFlowId,
        });

        webhooks.push({
          path: path.startsWith('/') ? path : `/webhook/${path}`,
          method: httpMethod,
          responseMode: responseMode as any,
          responseCode,
          nodeId: agentFlowId,
        });
      } else if (n8nNode.type === 'n8n-nodes-base.gmailTrigger') {
        triggers.push({
          type: 'gmail',
          config: {
            event: params.event || 'messageReceived',
            pollTimes: params.pollTimes,
            filters: params.filters,
            options: params.options,
          },
          nodeId: agentFlowId,
        });
      } else if (n8nNode.type === 'n8n-nodes-base.emailReadImap') {
        triggers.push({
          type: 'imap',
          config: {
            options: params.options || {},
            mailbox: params.mailbox || 'INBOX',
          },
          nodeId: agentFlowId,
        });
      } else if (n8nNode.type === 'n8n-nodes-base.evaluationTrigger') {
        triggers.push({
          type: 'evaluation',
          config: {
            dataTableId: params.dataTableId,
          },
          nodeId: agentFlowId,
        });
      } else if (n8nNode.type === 'n8n-nodes-base.cron' || n8nNode.type === 'n8n-nodes-base.scheduleTrigger') {
        const triggerTimes = params.triggerTimes?.item || [];
        for (const item of triggerTimes) {
          if (item.mode === 'cron' && item.cronExpression) {
            const cronResult = parseCronExpression(item.cronExpression);
            if (!cronResult.valid) {
              warnings.push(`Node "${n8nNode.name}": ${cronResult.error}`);
            } else {
              schedules.push({
                cronExpression: cronResult.normalized!,
                timezone: item.timezone || n8nWorkflow.settings?.timezone || 'UTC',
                enabled: true,
                nodeId: agentFlowId,
              });
            }
          } else {
            schedules.push({
              cronExpression: '0 * * * *',
              timezone: n8nWorkflow.settings?.timezone || 'UTC',
              enabled: true,
              nodeId: agentFlowId,
            });
          }
        }
        triggers.push({
          type: 'cron',
          config: params,
          nodeId: agentFlowId,
        });
      } else {
        triggers.push({
          type: 'manual',
          config: params,
          nodeId: agentFlowId,
        });
      }
    }

    // Build AgentFlow node
    const pos = Array.isArray(n8nNode.position) && n8nNode.position.length >= 2
      ? { x: n8nNode.position[0], y: n8nNode.position[1] }
      : { x: 0, y: 0 };

    const node: AgentFlowNode = {
      id: agentFlowId,
      type: typeMapping.type,
      label: n8nNode.name,
      config: {
        typeVersion: n8nNode.typeVersion ?? 1,
        parameters: params,
        credentials: n8nNode.credentials,
        disabled: n8nNode.disabled,
        notes: n8nNode.notes,
        notesInFlow: n8nNode.notesInFlow,
        retryOnFail: n8nNode.retryOnFail,
        maxTries: n8nNode.maxTries,
        waitBetweenTries: n8nNode.waitBetweenTries,
        continueOnFail: n8nNode.continueOnFail,
        runOnceForAllItems: n8nNode.runOnceForAllItems,
        webhookId: n8nNode.webhookId,
        originalN8nType: n8nNode.type,
        originalN8nId: n8nNode.id,
      },
      position: pos,
    };

    nodes.push(node);

    if (verbose) {
      console.log(`  Node: ${n8nNode.name} (${n8nNode.type}) → ${typeMapping.type} [${typeMapping.category}]`);
    }
  }

  // Convert connections → edges
  const edges: AgentFlowEdge[] = [];

  for (const [sourceName, outputs] of Object.entries(n8nWorkflow.connections || {})) {
    const sourceId = nodeIdMap.get(sourceName);
    if (!sourceId) {
      warnings.push(`Connection source node not found: ${sourceName}`);
      continue;
    }

    for (const [outputType, connections] of Object.entries(outputs)) {
      for (const branch of connections) {
        if (Array.isArray(branch)) {
          for (const conn of branch) {
            const targetId = nodeIdMap.get(conn.node);
            if (!targetId) {
              warnings.push(`Connection target node not found: ${conn.node} (from ${sourceName})`);
              continue;
            }

            edges.push({
              id: generateId('edge'),
              sourceNodeId: sourceId,
              targetNodeId: targetId,
              sourceHandle: outputType === 'main' ? undefined : outputType,
              targetHandle: conn.type === 'main' ? undefined : conn.type,
              label: conn.index !== undefined ? String(conn.index) : undefined,
            });
          }
        }
      }
    }
  }

  // Build workflow object
  const workflow: AgentFlowWorkflow = {
    name: n8nWorkflow.name,
    description: '',
    status: n8nWorkflow.active ? 'ACTIVE' : 'DRAFT',
    config: {
      executionOrder: n8nWorkflow.settings?.executionOrder || 'v1',
      saveManualExecutions: n8nWorkflow.settings?.saveManualExecutions ?? true,
      saveExecutionProgress: n8nWorkflow.settings?.saveExecutionProgress ?? true,
      executionTimeout: n8nWorkflow.settings?.executionTimeout || 3600,
      errorWorkflow: n8nWorkflow.settings?.errorWorkflow,
      timezone: n8nWorkflow.settings?.timezone || 'UTC',
      callerPolicy: n8nWorkflow.settings?.callerPolicy || 'workflowsFromSameOwner',
    },
    meta: n8nWorkflow.meta || {},
    tags: n8nWorkflow.tags || [],
    nodes,
    edges,
    triggers,
    schedules,
    credentialsUsed: [...new Set(credentialsUsed.map(c => c.credentialName))],
    webhooks,
  };

  return {
    workflow,
    nodes,
    edges,
    triggers,
    schedules,
    webhooks,
    credentialsUsed,
    warnings,
    errors,
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      totalTriggers: triggers.length,
      totalCredentials: credentialsUsed.length,
      totalWebhooks: webhooks.length,
    },
  };
}

// ════════════════════════════════════════════════════════════════════
// OUTPUT FORMATTERS
// ════════════════════════════════════════════════════════════════════

export function toJson(result: ConversionResult, pretty = true): string {
  return JSON.stringify(result, null, pretty ? 2 : 0);
}

export function toCsv(result: ConversionResult): { nodes: string; edges: string; triggers: string; credentials: string; webhooks: string } {
  // Nodes CSV
  const nodesHeaders = ['id', 'type', 'label', 'category', 'x', 'y', 'typeVersion', 'disabled', 'originalN8nType'];
  const nodesRows = result.nodes.map(n => [
    n.id,
    n.type,
    `"${n.label.replace(/"/g, '""')}"`,
    getNodeCategory(n.type),
    n.position.x,
    n.position.y,
    n.config.typeVersion,
    n.config.disabled || false,
    n.config.originalN8nType,
  ].join(','));
  const nodesCsv = [nodesHeaders.join(','), ...nodesRows].join('\n');

  // Edges CSV
  const edgesHeaders = ['id', 'sourceNodeId', 'targetNodeId', 'sourceHandle', 'targetHandle', 'label'];
  const edgesRows = result.edges.map(e => [
    e.id,
    e.sourceNodeId,
    e.targetNodeId,
    e.sourceHandle || '',
    e.targetHandle || '',
    e.label || '',
  ].join(','));
  const edgesCsv = [edgesHeaders.join(','), ...edgesRows].join('\n');

  // Triggers CSV
  const triggersHeaders = ['nodeId', 'type', 'config'];
  const triggersRows = result.triggers.map(t => [
    t.nodeId,
    t.type,
    `"${JSON.stringify(t.config).replace(/"/g, '""')}"`,
  ].join(','));
  const triggersCsv = [triggersHeaders.join(','), ...triggersRows].join('\n');

  // Credentials CSV
  const credHeaders = ['nodeId', 'credentialType', 'credentialName'];
  const credRows = result.credentialsUsed.map(c => [
    c.nodeId,
    c.credentialType,
    c.credentialName,
  ].join(','));
  const credentialsCsv = [credHeaders.join(','), ...credRows].join('\n');

  // Webhooks CSV
  const webhookHeaders = ['nodeId', 'path', 'method', 'responseMode', 'responseCode'];
  const webhookRows = result.webhooks.map(w => [
    w.nodeId,
    w.path,
    w.method,
    w.responseMode,
    w.responseCode,
  ].join(','));
  const webhooksCsv = [webhookHeaders.join(','), ...webhookRows].join('\n');

  return { nodes: nodesCsv, edges: edgesCsv, triggers: triggersCsv, credentials: credentialsCsv, webhooks: webhooksCsv };
}

export function getNodeCategory(type: string): string {
  const mapping = N8N_TO_AGENTFLOW_TYPE_MAP[type];
  if (mapping) return mapping.category;
  if (type.startsWith('webhook') || type.startsWith('cron') || type.startsWith('form') || type.includes('Trigger') || type.includes('Imap')) return 'trigger';
  if (type.startsWith('http') || type.startsWith('email') || type.startsWith('telegram') || type.startsWith('slack') || type === 'gmail' || type === 'googleDrive') return 'action';
  if (type.startsWith('if') || type.startsWith('switch') || type.startsWith('merge') || type.startsWith('split') || type.startsWith('wait') || type.startsWith('delay')) return 'logic';
  if (type.startsWith('set') || type.startsWith('code') || type.startsWith('function') || type.startsWith('item')) return 'transform';
  if (type.startsWith('ai') || type.startsWith('embedding') || type.startsWith('vector')) return 'ai';
  return 'custom';
}

// ════════════════════════════════════════════════════════════════════
// CLI INTERFACE
// ════════════════════════════════════════════════════════════════════

export interface CliOptions {
  inputFile: string;
  outputDir: string;
  format: 'json' | 'csv' | 'both';
  verbose: boolean;
  dryRun: boolean;
}

export function parseArgs(args: string[]): CliOptions | null {
  const options: CliOptions = {
    inputFile: '',
    outputDir: join(__dirname, 'convertido'),
    format: 'json',
    verbose: false,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      return null;
    } else if (arg === '-o' || arg === '--output') {
      options.outputDir = args[++i];
    } else if (arg === '-f' || arg === '--format') {
      options.format = args[++i] as any;
    } else if (arg === '-v' || arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (!arg.startsWith('-')) {
      options.inputFile = arg;
    }
  }

  if (!options.inputFile) {
    return null;
  }

  return options;
}

export function showHelp(): void {
  console.log(`
n8n → AgentFlow Workflow Converter

Usage:
  npx tsx convert.ts <input-file> [options]

Options:
  -o, --output <dir>      Output directory (default: ./convertido)
  -f, --format <fmt>      Output format: json|csv|both (default: json)
  -v, --verbose           Verbose logging
  --dry-run               Parse only, don't write files
  -h, --help              Show this help

Examples:
  npx tsx convert.ts workflow.json
  npx tsx convert.ts workflow.json -o ./output -f both -v
  npx tsx convert.ts ./exemplo/*.json -f json
`);
}

export async function processFile(inputPath: string, options: CliOptions): Promise<ConversionResult> {
  const inputFile = resolve(inputPath);

  if (!existsSync(inputFile)) {
    throw new Error(`Input file not found: ${inputFile}`);
  }

  if (options.verbose) {
    console.log(`Reading: ${inputFile}`);
  }

  const content = readFileSync(inputFile, 'utf-8');
  let n8nWorkflow: N8nWorkflow;

  try {
    n8nWorkflow = JSON.parse(content);
  } catch (e) {
    throw new Error(`Invalid JSON in ${inputFile}: ${e}`);
  }

  const inner = n8nWorkflow.data ? n8nWorkflow.data : n8nWorkflow;

  // Validate required fields
  if (!inner.name) throw new Error('Workflow missing "name"');
  if (!inner.nodes || !Array.isArray(inner.nodes)) throw new Error('Workflow missing "nodes" array');
  if (!inner.connections) throw new Error('Workflow missing "connections"');

  if (options.verbose) {
    console.log(`Converting: ${inner.name} (${inner.nodes.length} nodes)`);
  }

  const result = convertWorkflow(n8nWorkflow, options.verbose);

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`ERROR: ${err}`);
    }
  }

  if (result.warnings.length > 0) {
    for (const warn of result.warnings) {
      console.warn(`WARN: ${warn}`);
    }
  }

  if (options.verbose) {
    console.log(`  Nodes: ${result.stats.totalNodes}`);
    console.log(`  Edges: ${result.stats.totalEdges}`);
    console.log(`  Triggers: ${result.stats.totalTriggers}`);
    console.log(`  Credentials: ${result.stats.totalCredentials}`);
    console.log(`  Webhooks: ${result.stats.totalWebhooks}`);
  }

  if (!options.dryRun) {
    mkdirSync(options.outputDir, { recursive: true });

    const baseName = basename(inputFile, extname(inputFile));
    const outputBase = join(options.outputDir, `${baseName}.converted`);

    if (options.format === 'json' || options.format === 'both') {
      const jsonPath = `${outputBase}.json`;
      writeFileSync(jsonPath, toJson(result));
      if (options.verbose) console.log(`  Written: ${jsonPath}`);
    }

    if (options.format === 'csv' || options.format === 'both') {
      const csv = toCsv(result);
      writeFileSync(`${outputBase}.nodes.csv`, csv.nodes);
      writeFileSync(`${outputBase}.edges.csv`, csv.edges);
      writeFileSync(`${outputBase}.triggers.csv`, csv.triggers);
      writeFileSync(`${outputBase}.credentials.csv`, csv.credentials);
      writeFileSync(`${outputBase}.webhooks.csv`, csv.webhooks);
      if (options.verbose) console.log(`  Written: ${outputBase}.*.csv (5 files)`);
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (!options) {
    showHelp();
    process.exit(options === null ? 0 : 1);
  }

  try {
    if (options.inputFile.includes('*')) {
      const dir = dirname(resolve(options.inputFile));
      const pattern = basename(options.inputFile);
      const files = readdirSync(dir).filter(f => {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(f);
      });

      if (files.length === 0) {
        console.error(`No files matching pattern: ${options.inputFile}`);
        process.exit(1);
      }

      for (const file of files) {
        await processFile(join(dir, file), options);
      }
    } else {
      await processFile(options.inputFile, options);
    }

    console.log('✅ Conversion complete');
  } catch (error) {
    console.error(`❌ Error: ${error}`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main();
}
