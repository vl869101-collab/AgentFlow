/**
 * Definicao NATIVA do workflow "My workflow 2"
 * no formato AgentFlow (nao usa converter/convert.ts).
 *
 * Esta definicao recria do zero o workflow n8n id 2ZImw8KzAbLMT7ca
 * usando o schema nativo: WorkflowNode.type + WorkflowNode.config.parameters.
 *
 * Node types: emailReadImap -> gmail (addLabels)
 * Conexoes: linear (1->2)
 */

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

export interface AgentFlowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
}

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

const NODE_IDS = {
  EMAIL_TRIGGER: "n8n-00b57fc2-a2f3-41c9-aa5b-e833a162659a",
  GMAIL_ACTION: "n8n-82fca877-6b61-4f40-902a-fccd7cf5beea",
};

const EMAIL_TRIGGER_PARAMS = {
  options: {
    mailbox: "INBOX",
    postProcess: "unread",
    markAsRead: true,
    stripAttachments: false,
    limit: undefined,
    filterBySubject: undefined,
  },
};

const GMAIL_ADD_LABELS_PARAMS = {
  operation: "addLabels",
  labelIds: ["Label_1"],
};

/** Cria a definicao nativa do workflow WF3 */
export function createWf3Workflow(): AgentFlowWorkflow {
  const emailNode: AgentFlowNode = {
    id: NODE_IDS.EMAIL_TRIGGER,
    type: "emailReadImap",
    label: "Email Trigger (IMAP)",
    config: {
      typeVersion: 2.2,
      originalN8nType: "n8n-nodes-base.emailReadImap",
      originalN8nId: "00b57fc2-a2f3-41c9-aa5b-e833a162659a",
      parameters: EMAIL_TRIGGER_PARAMS,
      credentials: { imap: "cred-imap-wf3" },
    },
    position: { x: 0, y: 0 },
  };

  const gmailNode: AgentFlowNode = {
    id: NODE_IDS.GMAIL_ACTION,
    type: "gmail",
    label: "Add label to message",
    config: {
      typeVersion: 2.2,
      originalN8nType: "n8n-nodes-base.gmail",
      originalN8nId: "82fca877-6b61-4f40-902a-fccd7cf5beea",
      parameters: GMAIL_ADD_LABELS_PARAMS,
      credentials: { gmail: "cred-gmail-oauth2-wf3" },
      webhookId: "09fc1dd4-a6dd-4e14-a817-de6d6c6503fd",
    },
    position: { x: 224, y: 0 },
  };

  const edges: AgentFlowEdge[] = [
    {
      id: "n8n-edge-wf3-1",
      sourceNodeId: NODE_IDS.EMAIL_TRIGGER,
      targetNodeId: NODE_IDS.GMAIL_ACTION,
      sourceHandle: "main",
      targetHandle: "main",
      label: "0",
    },
  ];

  return {
    id: "wf3-my-workflow-2",
    name: "My workflow 2",
    description: null,
    status: "DRAFT",
    orgId: "n8n-seed-org",
    ownerId: "n8n-seed-user",
    nodes: [emailNode, gmailNode],
    edges,
    settings: { executionOrder: "v1" },
    credentialRefs: ["cred-imap-wf3", "cred-gmail-oauth2-wf3"],
  };
}

export { NODE_IDS };
