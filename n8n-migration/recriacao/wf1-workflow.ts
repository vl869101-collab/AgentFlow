/**
 * Definicao NATIVA do workflow "Save Gmail Attachments to Google Drive"
 * no formato AgentFlow (nao usa converter/convert.ts).
 *
 * Esta definicao recria do zero o workflow n8n id 7JJEwYx7pRTWLvSo
 * usando o schema nativo: WorkflowNode.type + WorkflowNode.config.parameters.
 *
 * Node types: gmailTrigger -> code -> googleDrive
 * Conexoes: linear (1->2->3)
 */

import type { GmailTriggerParameters } from "./handlers/gmailTrigger.js";
import type { CodeNodeParameters } from "./handlers/code.js";
import type { GoogleDriveParameters } from "./handlers/googleDrive.js";

/** WorkflowNode nativo do AgentFlow */
export interface AgentFlowNode {
  id: string;
  type: string;
  label: string;
  config: {
    typeVersion: number;
    originalN8nType: string;
    originalN8nId: string;
    parameters: Record<string, unknown>;
    credentials?: Record<string, unknown>;
    disabled?: boolean;
    webhookId?: string;
  };
  position: { x: number; y: number };
}

/** WorkflowEdge nativo do AgentFlow */
export interface AgentFlowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
}

/** WorkflowDefinition nativo */
export interface AgentFlowWorkflow {
  id: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  orgId: string;
  ownerId: string;
  nodes: AgentFlowNode[];
  edges: AgentFlowEdge[];
  settings?: Record<string, unknown>;
  credentialRefs: string[];
}

// IDs dos nodes preservados do n8n original (prefixados com n8n-)
const NODE_IDS = {
  GMAIL_TRIGGER: "n8n-35244a31-6691-422f-affd-ee2b75dfb50f",
  CODE: "n8n-f600ebdc-eaca-4de6-b104-4821a55f58e8",
  GOOGLE_DRIVE: "n8n-a4660b67-67b0-49f8-9ec8-8a8d330828af",
};

// jsCode original do node "Split Attachments" — preservado integralmente
const ATTACHMENT_SPLITTER_CODE = `const results = [];
const binary = $input.item.binary || {};
for (const key of Object.keys(binary)) {
  results.push({
    json: {
      fileName: binary[key].fileName || key,
      mimeType: binary[key].mimeType,
      subject: $input.item.json.subject,
      from: $input.item.json.from,
    },
    binary: { data: binary[key] },
  });
}
return results;`;

/** Cria a definicao nativa do workflow WF1 */
export function createWf1Workflow(): AgentFlowWorkflow {
  const gmailParams: GmailTriggerParameters = {
    event: "messageReceived",
    simple: false,
    pollTimes: { item: [{ mode: "everyMinute" }] },
    filters: { q: "has:attachment", readStatus: "unread" },
    options: {
      downloadAttachments: true,
      dataPropertyAttachmentsPrefixName: "attachment_",
    },
  };

  const codeParams: CodeNodeParameters = {
    mode: "runOnceForEachItem",
    jsCode: ATTACHMENT_SPLITTER_CODE,
  };

  const driveParams: GoogleDriveParameters = {
    resource: "file",
    operation: "upload",
    inputDataFieldName: "data",
    name: "={{ $json.fileName }}",
    driveId: { __rl: true, mode: "list", value: "My Drive", cachedResultName: "My Drive" },
    folderId: { __rl: true, mode: "list", value: "root", cachedResultName: "/ (Root folder)" },
  };

  const gmailNode: AgentFlowNode = {
    id: NODE_IDS.GMAIL_TRIGGER,
    type: "gmailTrigger",
    label: "On New Email",
    config: {
      typeVersion: 1.4,
      originalN8nType: "n8n-nodes-base.gmailTrigger",
      originalN8nId: "35244a31-6691-422f-affd-ee2b75dfb50f",
      parameters: gmailParams,
      credentials: {},
    },
    position: { x: 0, y: 0 },
  };

  const codeNode: AgentFlowNode = {
    id: NODE_IDS.CODE,
    type: "code",
    label: "Split Attachments",
    config: {
      typeVersion: 2,
      originalN8nType: "n8n-nodes-base.code",
      originalN8nId: "f600ebdc-eaca-4de6-b104-4821a55f58e8",
      parameters: codeParams,
      credentials: {},
    },
    position: { x: 224, y: 0 },
  };

  const driveNode: AgentFlowNode = {
    id: NODE_IDS.GOOGLE_DRIVE,
    type: "googleDrive",
    label: "Upload to Google Drive",
    config: {
      typeVersion: 3,
      originalN8nType: "n8n-nodes-base.googleDrive",
      originalN8nId: "a4660b67-67b0-49f8-9ec8-8a8d330828af",
      parameters: driveParams,
      credentials: {},
    },
    position: { x: 448, y: 0 },
  };

  const edges: AgentFlowEdge[] = [
    {
      id: "n8n-edge-1",
      sourceNodeId: NODE_IDS.GMAIL_TRIGGER,
      targetNodeId: NODE_IDS.CODE,
      sourceHandle: "main",
      label: "0",
    },
    {
      id: "n8n-edge-2",
      sourceNodeId: NODE_IDS.CODE,
      targetNodeId: NODE_IDS.GOOGLE_DRIVE,
      sourceHandle: "main",
      label: "0",
    },
  ];

  return {
    id: "wf1-save-gmail-attachments",
    name: "Save Gmail Attachments to Google Drive",
    description: null,
    status: "DRAFT",
    orgId: "n8n-seed-org",
    ownerId: "n8n-seed-user",
    nodes: [gmailNode, codeNode, driveNode],
    edges,
    settings: { executionOrder: "v1" },
    credentialRefs: ["gmail-oauth2-mock", "google-drive-oauth2-mock"],
  };
}

/** Exporta os IDs dos nodes para uso em testes */
export { NODE_IDS, ATTACHMENT_SPLITTER_CODE };
