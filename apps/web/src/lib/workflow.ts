import { NODE_TYPES, type ExecutionStatus } from "@agentflow/shared";
import type { Edge, Node, XYPosition } from "@xyflow/react";

export type NodeTypeKey = (typeof NODE_TYPES)[number]["type"];
export type CanvasNodeKind = "trigger" | "action" | "logic" | "advanced";

export interface WorkflowNodeData extends Record<string, unknown> {
  type: NodeTypeKey;
  label: string;
  description: string;
  status?: ExecutionStatus;
  config: Record<string, string | number | boolean>;
}

export type WorkflowCanvasNode = Node<WorkflowNodeData, CanvasNodeKind>;

export interface NodeStyleTokens {
  iconBg: string;
  iconColor: string;
  borderColor: string;
  badgeColor: string;
}

const defaultNodeStyle: NodeStyleTokens = {
  iconBg: "bg-indigo-500/10",
  iconColor: "text-indigo-400",
  borderColor: "border-l-indigo-500",
  badgeColor: "bg-indigo-500/10",
};

const nodeStyles: Partial<Record<NodeTypeKey, NodeStyleTokens>> = {
  webhook: { iconBg: "bg-indigo-500/10", iconColor: "text-indigo-400", borderColor: "border-l-indigo-500", badgeColor: "bg-indigo-500/10" },
  cron: { iconBg: "bg-violet-500/10", iconColor: "text-violet-400", borderColor: "border-l-violet-500", badgeColor: "bg-violet-500/10" },
  http: { iconBg: "bg-cyan-500/10", iconColor: "text-cyan-400", borderColor: "border-l-cyan-400", badgeColor: "bg-cyan-500/10" },
  email: { iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400", borderColor: "border-l-emerald-400", badgeColor: "bg-emerald-500/10" },
  discord: { iconBg: "bg-[#5865f2]/10", iconColor: "text-[#5865f2]", borderColor: "border-l-[#5865f2]", badgeColor: "bg-[#5865f2]/10" },
  telegram: { iconBg: "bg-[#229ed9]/10", iconColor: "text-[#229ed9]", borderColor: "border-l-[#229ed9]", badgeColor: "bg-[#229ed9]/10" },
  sheets: { iconBg: "bg-[#34a853]/10", iconColor: "text-[#34a853]", borderColor: "border-l-[#34a853]", badgeColor: "bg-[#34a853]/10" },
  condition: { iconBg: "bg-amber-500/10", iconColor: "text-amber-400", borderColor: "border-l-amber-400", badgeColor: "bg-amber-500/10" },
  transform: { iconBg: "bg-pink-500/10", iconColor: "text-pink-400", borderColor: "border-l-pink-400", badgeColor: "bg-pink-500/10" },
  delay: { iconBg: "bg-slate-500/10", iconColor: "text-slate-400", borderColor: "border-l-slate-400", badgeColor: "bg-slate-500/10" },
  ai_agent: { iconBg: "bg-purple-500/10", iconColor: "text-purple-400", borderColor: "border-l-purple-400", badgeColor: "bg-purple-500/10" },
  approval: { iconBg: "bg-red-500/10", iconColor: "text-red-400", borderColor: "border-l-red-400", badgeColor: "bg-red-500/10" },
  merge: { iconBg: "bg-cyan-500/10", iconColor: "text-cyan-400", borderColor: "border-l-cyan-400", badgeColor: "bg-cyan-500/10" },
  filter: { iconBg: "bg-amber-500/10", iconColor: "text-amber-400", borderColor: "border-l-amber-400", badgeColor: "bg-amber-500/10" },
  set_fields: { iconBg: "bg-pink-500/10", iconColor: "text-pink-400", borderColor: "border-l-pink-400", badgeColor: "bg-pink-500/10" },
  respond_webhook: { iconBg: "bg-indigo-500/10", iconColor: "text-indigo-400", borderColor: "border-l-indigo-400", badgeColor: "bg-indigo-500/10" },
  gmailTrigger: { iconBg: "bg-red-500/10", iconColor: "text-red-400", borderColor: "border-l-red-400", badgeColor: "bg-red-500/10" },
  googleDrive: { iconBg: "bg-green-500/10", iconColor: "text-green-400", borderColor: "border-l-green-400", badgeColor: "bg-green-500/10" },
  evaluationTrigger: { iconBg: "bg-amber-500/10", iconColor: "text-amber-400", borderColor: "border-l-amber-400", badgeColor: "bg-amber-500/10" },
  emailReadImap: { iconBg: "bg-cyan-500/10", iconColor: "text-cyan-400", borderColor: "border-l-cyan-400", badgeColor: "bg-cyan-500/10" },
  gmail: { iconBg: "bg-red-500/10", iconColor: "text-red-400", borderColor: "border-l-red-400", badgeColor: "bg-red-500/10" },
};

export function getNodeMeta(type: NodeTypeKey) {
  const definition = NODE_TYPES.find((node) => node.type === type) ?? NODE_TYPES[0];
  return { ...definition, styles: nodeStyles[type] ?? defaultNodeStyle };
}

export function nodeKindFor(type: NodeTypeKey): CanvasNodeKind {
  if (type === "webhook" || type === "cron") return "trigger";
  if (["http", "email", "discord", "telegram", "sheets"].includes(type)) return "action";
  if (["condition", "transform", "delay"].includes(type)) return "logic";
  return "advanced";
}

export function createNodeData(type: NodeTypeKey, label?: string): WorkflowNodeData {
  const meta = getNodeMeta(type);
  return {
    type,
    label: label ?? meta.label,
    description: defaultDescription(type),
    status: "PENDING",
    config: defaultConfig(type),
  };
}

function defaultDescription(type: NodeTypeKey) {
  const descriptions: Partial<Record<NodeTypeKey, string>> = {
    webhook: "Receive a signed event from any app",
    cron: "Start on a reliable schedule",
    http: "Call an external API endpoint",
    email: "Send a transactional email",
    discord: "Post a message to a channel",
    telegram: "Send an update to a chat",
    sheets: "Read or write a spreadsheet row",
    condition: "Route based on a data rule",
    transform: "Shape data for the next step",
    delay: "Pause before continuing",
    ai_agent: "Reason over context with an AI model",
    approval: "Wait for a human decision",
    merge: "Combine data from multiple parallel branches",
    filter: "Pass or block items based on a condition",
    set_fields: "Add or override fields in the data",
    respond_webhook: "Send a custom response back to the webhook source",
    gmailTrigger: "Start when a Gmail event arrives",
    googleDrive: "Read or write files in Google Drive",
    evaluationTrigger: "Start from an evaluation event",
    emailReadImap: "Read messages from an IMAP inbox",
    gmail: "Send or manage Gmail messages",
  };
  return descriptions[type] ?? "Execute workflow node";
}

function defaultConfig(type: NodeTypeKey): Record<string, string | number | boolean> {
  const configs: Partial<Record<NodeTypeKey, Record<string, string | number | boolean>>> = {
    webhook: { path: "/v1/order-events", method: "POST" },
    cron: { schedule: "0 9 * * 1-5", timezone: "UTC" },
    http: { method: "POST", url: "https://api.acme.test/orders", timeout: 30 },
    email: { to: "ops@northstar.dev", subject: "Order received" },
    discord: { channel: "#ops-alerts", message: "New order received" },
    telegram: { chat: "Operations", message: "New order received" },
    sheets: { spreadsheet: "Revenue tracker", worksheet: "Orders" },
    condition: { expression: "payload.total > 500" },
    transform: { expression: "return { ...payload, priority: 'high' }" },
    delay: { duration: 15, unit: "minutes" },
    ai_agent: { model: "nvidia/llama-3.1-70b-instruct", prompt: "Classify the order risk" },
    approval: { reviewers: "ops@northstar.dev", sla: 60 },
    merge: { strategy: "combine" },
    filter: { expression: "true" },
    set_fields: { fieldName: "value" },
    respond_webhook: { statusCode: 200, body: "OK" },
    gmailTrigger: { event: "messageReceived" },
    googleDrive: { resource: "file", operation: "download" },
    evaluationTrigger: { dataTableId: "" },
    emailReadImap: { mailbox: "INBOX" },
    gmail: { operation: "send" },
  };
  return configs[type] ?? {};
}

export const initialWorkflowNodes: WorkflowCanvasNode[] = [
  { id: "trigger-order", type: "trigger", position: { x: 80, y: 220 }, data: createNodeData("webhook", "Order received") },
  { id: "risk-agent", type: "advanced", position: { x: 380, y: 220 }, data: createNodeData("ai_agent", "Assess order risk") },
  { id: "high-value", type: "logic", position: { x: 700, y: 220 }, data: createNodeData("condition", "High-value order") },
  { id: "notify-ops", type: "action", position: { x: 1020, y: 90 }, data: createNodeData("discord", "Notify operations") },
  { id: "write-sheet", type: "action", position: { x: 1020, y: 350 }, data: createNodeData("sheets", "Record in tracker") },
];

export const initialWorkflowEdges: Edge[] = [
  { id: "edge-trigger-agent", source: "trigger-order", target: "risk-agent", animated: true, style: { stroke: "#8b5cf6", strokeWidth: 2 } },
  { id: "edge-agent-condition", source: "risk-agent", target: "high-value", animated: true, style: { stroke: "#8b5cf6", strokeWidth: 2 } },
  { id: "edge-condition-notify", source: "high-value", sourceHandle: "true", target: "notify-ops", label: "true", animated: true, style: { stroke: "#f59e0b", strokeWidth: 2 } },
  { id: "edge-condition-sheet", source: "high-value", sourceHandle: "false", target: "write-sheet", label: "false", animated: true, style: { stroke: "#64748b", strokeWidth: 2 } },
];

export function createCanvasNode(type: NodeTypeKey, position: XYPosition, id = `node-${Date.now()}`): WorkflowCanvasNode {
  return { id, type: nodeKindFor(type), position, data: createNodeData(type) };
}
