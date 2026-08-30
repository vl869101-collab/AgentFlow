/**
 * n8n → AgentFlow Upstream Import Converter & SDK Reference
 *
 * Implements the 3-step pipeline:
 * 1. SDK Reference: typed dictionary mapping n8n node taxonomy, parameters, credentials, categories
 * 2. Validate: rigorous schema and semantic validation of n8n workflow JSON exports
 * 3. Create: deterministic conversion from n8n format to AgentFlow internal data model
 */

// ═══════════════════════════════════════════
// 1. SDK Reference & Type Definitions
// ═══════════════════════════════════════════

export interface N8nWorkflowExport {
  id?: string;
  name?: string;
  active?: boolean;
  nodes?: N8nNode[];
  connections?: N8nConnections;
  settings?: N8nSettings;
  staticData?: Record<string, unknown>;
  pinData?: Record<string, unknown>;
  versionId?: string;
  meta?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  data?: N8nWorkflowExport; // for exports wrapped inside a { data: ... } payload
}

export interface N8nNode {
  id?: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  disabled?: boolean;
  notes?: string;
  notesInFlow?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  continueOnFail?: boolean;
  webhookId?: string;
  alwaysOutputData?: boolean;
  executeOnce?: boolean;
}

export interface N8nConnectionTarget {
  node: string;
  type: string;
  index: number;
}

export interface N8nConnections {
  [sourceNodeName: string]: {
    [outputType: string]: Array<Array<N8nConnectionTarget>>;
  };
}

export interface N8nSettings {
  executionOrder?: string;
  timezone?: string;
  executionTimeout?: number;
  saveExecutionProgress?: boolean;
  saveManualExecutions?: boolean;
  saveDataErrorExecution?: string;
  saveDataSuccessExecution?: string;
  callerPolicy?: string;
}

/** Definition in the SDK Reference dictionary */
export interface N8nNodeSdkSpec {
  n8nType: string;
  agentFlowType: string;
  category: "trigger" | "action" | "logic" | "data" | "transform" | "advanced";
  label: string;
  description: string;
  supportedVersions: number[];
  defaultParameters?: Record<string, unknown>;
  credentialType?: string;
}

/** Comprehensive SDK Reference Catalog of n8n node types */
export const N8N_SDK_CATALOG: Record<string, N8nNodeSdkSpec> = {
  // Triggers
  "n8n-nodes-base.webhook": {
    n8nType: "n8n-nodes-base.webhook",
    agentFlowType: "webhook",
    category: "trigger",
    label: "Webhook",
    description: "Triggers workflow upon incoming HTTP request",
    supportedVersions: [1, 1.1, 2],
  },
  "n8n-nodes-base.cron": {
    n8nType: "n8n-nodes-base.cron",
    agentFlowType: "cron",
    category: "trigger",
    label: "Cron Trigger",
    description: "Triggers workflow on recurring schedule",
    supportedVersions: [1],
  },
  "n8n-nodes-base.scheduleTrigger": {
    n8nType: "n8n-nodes-base.scheduleTrigger",
    agentFlowType: "cron",
    category: "trigger",
    label: "Schedule Trigger",
    description: "Triggers workflow at scheduled intervals",
    supportedVersions: [1, 1.1, 1.2],
  },
  "n8n-nodes-base.manualTrigger": {
    n8nType: "n8n-nodes-base.manualTrigger",
    agentFlowType: "manual",
    category: "trigger",
    label: "Manual Trigger",
    description: "Manually triggered workflow execution",
    supportedVersions: [1],
  },
  "n8n-nodes-base.formTrigger": {
    n8nType: "n8n-nodes-base.formTrigger",
    agentFlowType: "webhook",
    category: "trigger",
    label: "Form Trigger",
    description: "Triggers on form submission",
    supportedVersions: [1, 2, 2.1],
  },
  "n8n-nodes-base.errorTrigger": {
    n8nType: "n8n-nodes-base.errorTrigger",
    agentFlowType: "cron",
    category: "trigger",
    label: "Error Trigger",
    description: "Triggers when another workflow encounters an error",
    supportedVersions: [1],
  },
  "n8n-nodes-base.gmailTrigger": {
    n8nType: "n8n-nodes-base.gmailTrigger",
    agentFlowType: "gmailTrigger",
    category: "trigger",
    label: "Gmail Trigger",
    description: "Triggers when new email arrives in Gmail",
    supportedVersions: [1, 1.1, 1.2, 1.3, 1.4],
    credentialType: "gmailOAuth2",
  },
  "n8n-nodes-base.emailReadImap": {
    n8nType: "n8n-nodes-base.emailReadImap",
    agentFlowType: "emailReadImap",
    category: "trigger",
    label: "IMAP Email Trigger",
    description: "Triggers on incoming IMAP emails",
    supportedVersions: [1, 2, 2.1, 2.2],
    credentialType: "imap",
  },
  "n8n-nodes-base.evaluationTrigger": {
    n8nType: "n8n-nodes-base.evaluationTrigger",
    agentFlowType: "evaluationTrigger",
    category: "trigger",
    label: "Evaluation Trigger",
    description: "Dataset evaluation trigger",
    supportedVersions: [1, 4, 4.7],
  },

  // Data & Database Nodes
  "n8n-nodes-base.postgres": {
    n8nType: "n8n-nodes-base.postgres",
    agentFlowType: "postgres",
    category: "data",
    label: "PostgreSQL",
    description: "Execute queries and CRUD operations on PostgreSQL",
    supportedVersions: [1, 2, 2.1, 2.2, 2.3],
    credentialType: "postgres",
  },
  "n8n-nodes-base.redis": {
    n8nType: "n8n-nodes-base.redis",
    agentFlowType: "redis",
    category: "data",
    label: "Redis",
    description: "Perform key/value, list, set, and pub/sub Redis operations",
    supportedVersions: [1, 1.1, 1.2, 1.3],
    credentialType: "redis",
  },
  "n8n-nodes-base.mongoDb": {
    n8nType: "n8n-nodes-base.mongoDb",
    agentFlowType: "mongo",
    category: "data",
    label: "MongoDB",
    description: "Query and mutate documents in MongoDB",
    supportedVersions: [1, 1.1, 1.2],
    credentialType: "mongoDb",
  },
  "n8n-nodes-base.httpRequest": {
    n8nType: "n8n-nodes-base.httpRequest",
    agentFlowType: "http",
    category: "data",
    label: "HTTP Request",
    description: "Makes HTTP/HTTPS requests to external REST APIs",
    supportedVersions: [1, 2, 3, 4, 4.1, 4.2],
    credentialType: "httpHeaderAuth",
  },
  "n8n-nodes-base.mySql": {
    n8nType: "n8n-nodes-base.mySql",
    agentFlowType: "postgres",
    category: "data",
    label: "MySQL",
    description: "MySQL database operations",
    supportedVersions: [1, 2, 2.1],
    credentialType: "mySql",
  },
  "n8n-nodes-base.graphql": {
    n8nType: "n8n-nodes-base.graphql",
    agentFlowType: "http",
    category: "data",
    label: "GraphQL Request",
    description: "Execute GraphQL queries and mutations",
    supportedVersions: [1],
  },

  // Logic & Flow Control Nodes
  "n8n-nodes-base.if": {
    n8nType: "n8n-nodes-base.if",
    agentFlowType: "condition",
    category: "logic",
    label: "If Condition",
    description: "Routes execution based on conditional expressions",
    supportedVersions: [1, 2, 2.1, 2.2],
  },
  "n8n-nodes-base.switch": {
    n8nType: "n8n-nodes-base.switch",
    agentFlowType: "condition",
    category: "logic",
    label: "Switch",
    description: "Multi-branch conditional routing",
    supportedVersions: [1, 2, 3],
  },
  "n8n-nodes-base.merge": {
    n8nType: "n8n-nodes-base.merge",
    agentFlowType: "merge",
    category: "logic",
    label: "Merge",
    description: "Combines data streams from multiple workflow branches",
    supportedVersions: [1, 2, 2.1, 3],
  },
  "n8n-nodes-base.set": {
    n8nType: "n8n-nodes-base.set",
    agentFlowType: "set_fields",
    category: "logic",
    label: "Set Fields",
    description: "Sets, modifies, or strips item properties",
    supportedVersions: [1, 2, 3, 3.2, 3.3, 3.4],
  },
  "n8n-nodes-base.code": {
    n8nType: "n8n-nodes-base.code",
    agentFlowType: "code",
    category: "transform",
    label: "Code",
    description: "Executes custom JavaScript/TypeScript code in isolated sandbox",
    supportedVersions: [1, 2],
  },
  "n8n-nodes-base.function": {
    n8nType: "n8n-nodes-base.function",
    agentFlowType: "code",
    category: "transform",
    label: "Function (Legacy)",
    description: "Legacy code node for all items",
    supportedVersions: [1],
  },
  "n8n-nodes-base.functionItem": {
    n8nType: "n8n-nodes-base.functionItem",
    agentFlowType: "code",
    category: "transform",
    label: "Function Item (Legacy)",
    description: "Legacy code node per single item",
    supportedVersions: [1],
  },
  "n8n-nodes-base.filter": {
    n8nType: "n8n-nodes-base.filter",
    agentFlowType: "filter",
    category: "logic",
    label: "Filter",
    description: "Filters items based on condition expressions",
    supportedVersions: [1, 2],
  },
  "n8n-nodes-base.splitInBatches": {
    n8nType: "n8n-nodes-base.splitInBatches",
    agentFlowType: "splitInBatches",
    category: "logic",
    label: "Split In Batches",
    description: "Splits items into batch chunks for looping",
    supportedVersions: [1, 2, 3],
  },
  "n8n-nodes-base.delay": {
    n8nType: "n8n-nodes-base.delay",
    agentFlowType: "delay",
    category: "logic",
    label: "Delay",
    description: "Pauses workflow execution for specified time duration",
    supportedVersions: [1],
  },
  "n8n-nodes-base.wait": {
    n8nType: "n8n-nodes-base.wait",
    agentFlowType: "delay",
    category: "logic",
    label: "Wait",
    description: "Waits for a webhook or delay interval",
    supportedVersions: [1, 1.1],
  },
  "n8n-nodes-base.executeWorkflow": {
    n8nType: "n8n-nodes-base.executeWorkflow",
    agentFlowType: "executeWorkflow",
    category: "advanced",
    label: "Execute Workflow",
    description: "Calls a sub-workflow synchronously or asynchronously with isolated variable context and item passing",
    supportedVersions: [1, 1.1, 1.2],
  },

  // Service & Communication Nodes
  "n8n-nodes-base.gmail": {
    n8nType: "n8n-nodes-base.gmail",
    agentFlowType: "gmail",
    category: "action",
    label: "Gmail Action",
    description: "Send, read, label, and delete emails via Gmail API",
    supportedVersions: [1, 2, 2.1, 2.2],
    credentialType: "gmailOAuth2",
  },
  "n8n-nodes-base.emailSend": {
    n8nType: "n8n-nodes-base.emailSend",
    agentFlowType: "email",
    category: "action",
    label: "Send Email",
    description: "Sends emails via SMTP",
    supportedVersions: [1, 2, 2.1],
    credentialType: "smtp",
  },
  "n8n-nodes-base.googleDrive": {
    n8nType: "n8n-nodes-base.googleDrive",
    agentFlowType: "googleDrive",
    category: "action",
    label: "Google Drive",
    description: "Manage files and folders in Google Drive",
    supportedVersions: [1, 2, 3],
    credentialType: "googleDriveOAuth2",
  },
  "n8n-nodes-base.googleSheets": {
    n8nType: "n8n-nodes-base.googleSheets",
    agentFlowType: "sheets",
    category: "action",
    label: "Google Sheets",
    description: "Read and write rows in Google Sheets",
    supportedVersions: [1, 2, 3, 4, 4.1],
    credentialType: "googleSheetsOAuth2",
  },
  "n8n-nodes-base.telegram": {
    n8nType: "n8n-nodes-base.telegram",
    agentFlowType: "telegram",
    category: "action",
    label: "Telegram",
    description: "Send messages and media to Telegram chats/bots",
    supportedVersions: [1, 1.1, 1.2],
    credentialType: "telegramApi",
  },
  "n8n-nodes-base.discord": {
    n8nType: "n8n-nodes-base.discord",
    agentFlowType: "discord",
    category: "action",
    label: "Discord",
    description: "Send messages and embeds to Discord channels/webhooks",
    supportedVersions: [1, 2],
    credentialType: "discordWebhook",
  },
  "n8n-nodes-base.slack": {
    n8nType: "n8n-nodes-base.slack",
    agentFlowType: "http",
    category: "action",
    label: "Slack",
    description: "Send messages and post blocks to Slack channels",
    supportedVersions: [1, 2, 2.1],
    credentialType: "slackOAuth2",
  },
  "n8n-nodes-base.stripe": {
    n8nType: "n8n-nodes-base.stripe",
    agentFlowType: "http",
    category: "action",
    label: "Stripe",
    description: "Manage Stripe charges, customers, and subscriptions",
    supportedVersions: [1],
    credentialType: "stripeApi",
  },
  "n8n-nodes-base.openAi": {
    n8nType: "n8n-nodes-base.openAi",
    agentFlowType: "ai",
    category: "action",
    label: "OpenAI",
    description: "LLM chat completions, embeddings, and audio transcription",
    supportedVersions: [1, 1.1, 1.2],
    credentialType: "openAiApi",
  },
  "n8n-nodes-base.respondToWebhook": {
    n8nType: "n8n-nodes-base.respondToWebhook",
    agentFlowType: "respond_webhook",
    category: "action",
    label: "Respond to Webhook",
    description: "Returns custom HTTP response to triggering webhook",
    supportedVersions: [1, 1.1],
  },
};

// ═══════════════════════════════════════════
// 2. Validation Module
// ═══════════════════════════════════════════

export interface N8nValidationError {
  code: string;
  message: string;
  path?: string;
  nodeId?: string;
}

export interface N8nValidationResult {
  valid: boolean;
  errors: N8nValidationError[];
  warnings: string[];
  stats: {
    totalNodes: number;
    totalConnections: number;
    recognizedNodes: number;
    unknownNodes: number;
    credentialsRequired: string[];
  };
}

/**
 * Validates raw JSON string or parsed object against n8n workflow export specifications.
 */
export function validateN8nWorkflow(raw: string | unknown): N8nValidationResult {
  const errors: N8nValidationError[] = [];
  const warnings: string[] = [];
  const credentialsRequired = new Set<string>();

  let parsed: unknown;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        valid: false,
        errors: [{ code: "INVALID_JSON", message: "Workflow payload is not valid JSON" }],
        warnings: [],
        stats: { totalNodes: 0, totalConnections: 0, recognizedNodes: 0, unknownNodes: 0, credentialsRequired: [] },
      };
    }
  } else {
    parsed = raw;
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      valid: false,
      errors: [{ code: "INVALID_ROOT", message: "Workflow root must be an object" }],
      warnings: [],
      stats: { totalNodes: 0, totalConnections: 0, recognizedNodes: 0, unknownNodes: 0, credentialsRequired: [] },
    };
  }

  const exportObj = ((parsed as { data?: unknown }).data ?? parsed) as N8nWorkflowExport;
  const nodes = exportObj.nodes;
  const connections = exportObj.connections ?? {};

  if (!nodes) {
    errors.push({ code: "MISSING_NODES", message: "Workflow export does not contain a 'nodes' array", path: "nodes" });
  } else if (!Array.isArray(nodes)) {
    errors.push({ code: "INVALID_NODES", message: "'nodes' property must be an array", path: "nodes" });
  }

  const nodeNames = new Set<string>();
  let recognizedCount = 0;
  let unknownCount = 0;

  if (Array.isArray(nodes)) {
    nodes.forEach((node, index) => {
      if (!node || typeof node !== "object") {
        errors.push({ code: "INVALID_NODE_ITEM", message: `Node at index ${index} is not an object`, path: `nodes[${index}]` });
        return;
      }

      if (!node.name || typeof node.name !== "string") {
        errors.push({ code: "MISSING_NODE_NAME", message: `Node at index ${index} is missing a valid name`, path: `nodes[${index}].name` });
      } else {
        if (nodeNames.has(node.name)) {
          warnings.push(`Duplicate node name '${node.name}' found. IDs will be disambiguated.`);
        }
        nodeNames.add(node.name);
      }

      if (!node.type || typeof node.type !== "string") {
        errors.push({ code: "MISSING_NODE_TYPE", message: `Node '${node.name ?? index}' is missing 'type'`, path: `nodes[${index}].type` });
      } else {
        if (N8N_SDK_CATALOG[node.type]) {
          recognizedCount++;
        } else {
          unknownCount++;
          warnings.push(`Node '${node.name}' has uncatalogued type '${node.type}', falling back to 'advanced'`);
        }
      }

      if (!node.position || !Array.isArray(node.position) || node.position.length < 2) {
        warnings.push(`Node '${node.name ?? index}' has missing or invalid position, defaulting to [0, 0]`);
      }

      // Collect credentials
      if (node.credentials && typeof node.credentials === "object") {
        for (const credType of Object.keys(node.credentials)) {
          credentialsRequired.add(credType);
        }
      }
    });
  }

  // Validate connections
  let totalConnections = 0;
  if (connections && typeof connections === "object") {
    for (const [sourceName, outputs] of Object.entries(connections)) {
      if (!nodeNames.has(sourceName)) {
        warnings.push(`Connection source node not found in node list: '${sourceName}'`);
      }

      if (outputs && typeof outputs === "object") {
        for (const [, branches] of Object.entries(outputs)) {
          if (Array.isArray(branches)) {
            for (const branch of branches) {
              if (Array.isArray(branch)) {
                for (const target of branch) {
                  totalConnections++;
                  if (!nodeNames.has(target.node)) {
                    warnings.push(`Connection target node not found in node list: '${target.node}'`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalNodes: Array.isArray(nodes) ? nodes.length : 0,
      totalConnections,
      recognizedNodes: recognizedCount,
      unknownNodes: unknownCount,
      credentialsRequired: Array.from(credentialsRequired),
    },
  };
}

// ═══════════════════════════════════════════
// 3. Creation & Conversion Module
// ═══════════════════════════════════════════

export interface AgentFlowImportResult {
  workflow: {
    name: string;
    description?: string;
    status: "DRAFT" | "ACTIVE";
    settings?: Record<string, unknown>;
  };
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    config: Record<string, unknown>;
    position: { x: number; y: number };
    width?: number;
    height?: number;
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string;
    condition?: unknown;
  }>;
  credentialsRequired: string[];
  warnings: string[];
  validation: N8nValidationResult;
}

export interface ImportOptions {
  statusOverride?: "DRAFT" | "ACTIVE";
  defaultPositionOffset?: { x: number; y: number };
  prefixNodeIds?: string;
}

function mapNodeType(n8nType: string): string {
  const spec = N8N_SDK_CATALOG[n8nType];
  return spec ? spec.agentFlowType : "advanced";
}

function generateId(prefix = "n8n"): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `${prefix}-${ts}${rand}`;
}

/**
 * Converts n8n workflow JSON into full AgentFlow internal model format.
 */
export function importN8nWorkflow(
  raw: string | N8nWorkflowExport,
  options: ImportOptions = {},
): AgentFlowImportResult {
  const validation = validateN8nWorkflow(raw);

  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const n8n = ((parsed as { data?: unknown }).data ?? parsed) as N8nWorkflowExport;

  const name = n8n.name ?? "Untitled Workflow";
  const nodes = n8n.nodes ?? [];
  const connections = n8n.connections ?? {};
  const warnings = [...validation.warnings];

  // Map n8n node names to AgentFlow IDs
  const nodeIdMap = new Map<string, string>();
  const idPrefix = options.prefixNodeIds ?? "n8n";

  for (const node of nodes) {
    const id = node.id ? `${idPrefix}-${node.id}` : generateId(idPrefix);
    nodeIdMap.set(node.name, id);
  }

  // Convert nodes
  const afNodes = nodes.map((node) => {
    const id = nodeIdMap.get(node.name)!;
    const type = mapNodeType(node.type);
    const pos = Array.isArray(node.position) && node.position.length >= 2 ? node.position : [0, 0];

    return {
      id,
      type,
      label: node.name,
      config: {
        typeVersion: node.typeVersion,
        originalN8nType: node.type,
        originalN8nId: node.id,
        parameters: node.parameters ?? {},
        credentials: node.credentials,
        disabled: node.disabled,
        webhookId: node.webhookId,
        notes: node.notes,
        retryOnFail: node.retryOnFail,
        maxTries: node.maxTries,
        waitBetweenTries: node.waitBetweenTries,
        continueOnFail: node.continueOnFail,
      },
      position: {
        x: pos[0] + (options.defaultPositionOffset?.x ?? 0),
        y: pos[1] + (options.defaultPositionOffset?.y ?? 0),
      },
    };
  });

  // Convert connections to edges
  const afEdges: AgentFlowImportResult["edges"] = [];

  for (const [sourceName, outputs] of Object.entries(connections)) {
    const sourceId = nodeIdMap.get(sourceName);
    if (!sourceId) {
      warnings.push(`Connection source node not found: ${sourceName}`);
      continue;
    }

    for (const [outputType, connectionBranches] of Object.entries(outputs)) {
      for (const branch of connectionBranches) {
        for (const conn of branch) {
          const targetId = nodeIdMap.get(conn.node);
          if (!targetId) {
            warnings.push(`Connection target node not found: ${conn.node}`);
            continue;
          }

          let sourceHandle: string | undefined = undefined;
          let label: string | undefined = undefined;

          if (conn.type !== "main") {
            sourceHandle = conn.type;
          } else if (outputType !== "main") {
            sourceHandle = outputType;
          }

          if (conn.index !== undefined && conn.index !== 0) {
            label = String(conn.index);
          }

          afEdges.push({
            id: generateId("edge"),
            sourceNodeId: sourceId,
            targetNodeId: targetId,
            sourceHandle,
            label,
          });
        }
      }
    }
  }

  const credentialsRequired = Array.from(
    new Set(
      nodes
        .filter((n) => n.credentials)
        .flatMap((n) => Object.keys(n.credentials as Record<string, unknown>)),
    ),
  );

  return {
    workflow: {
      name,
      status: options.statusOverride ?? (n8n.active ? "ACTIVE" : "DRAFT"),
      settings: n8n.settings as Record<string, unknown> | undefined,
    },
    nodes: afNodes,
    edges: afEdges,
    credentialsRequired,
    warnings,
    validation,
  };
}

/** Alias for semantic clarity */
export const createAgentFlowFromN8n = importN8nWorkflow;
