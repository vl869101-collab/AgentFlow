import type { ExecutionStatus, WorkflowStatus } from "@agentflow/shared";
import { initialWorkflowEdges, initialWorkflowNodes, type WorkflowCanvasNode } from "./workflow";

export interface MockWorkflow {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  updatedAt: string;
  runs: number;
  successRate: number;
  nodes: number;
  lastRun: string;
}

export interface MockExecution {
  id: string;
  workflow: string;
  status: ExecutionStatus;
  trigger: string;
  duration: string;
  startedAt: string;
  nodes: number;
  error?: string;
}

export const mockWorkflows: MockWorkflow[] = [
  { id: "order-risk-routing", name: "Order risk routing", description: "Score incoming orders, alert operations, and log every decision.", status: "ACTIVE", updatedAt: "2026-08-10T13:42:00Z", runs: 1284, successRate: 98.4, nodes: 5, lastRun: "2026-08-10T14:12:00Z" },
  { id: "customer-onboarding", name: "Customer onboarding", description: "Welcome new customers and create a clean workspace checklist.", status: "ACTIVE", updatedAt: "2026-08-09T17:05:00Z", runs: 864, successRate: 99.2, nodes: 7, lastRun: "2026-08-10T13:48:00Z" },
  { id: "weekly-revenue-digest", name: "Weekly revenue digest", description: "Summarize revenue movement every Monday for the leadership team.", status: "PAUSED", updatedAt: "2026-08-08T09:18:00Z", runs: 54, successRate: 100, nodes: 4, lastRun: "2026-08-04T09:00:00Z" },
  { id: "support-escalation", name: "Support escalation", description: "Detect high-sentiment tickets and route them to a human owner.", status: "DRAFT", updatedAt: "2026-08-07T15:36:00Z", runs: 0, successRate: 0, nodes: 6, lastRun: "2026-08-01T10:11:00Z" },
  { id: "content-approval", name: "Content approval", description: "Collect review feedback before publishing campaign content.", status: "ACTIVE", updatedAt: "2026-08-06T12:24:00Z", runs: 310, successRate: 96.8, nodes: 8, lastRun: "2026-08-10T12:10:00Z" },
  { id: "inventory-alerts", name: "Inventory alerts", description: "Notify the warehouse when stock levels move below a threshold.", status: "ARCHIVED", updatedAt: "2026-07-28T18:01:00Z", runs: 2210, successRate: 97.6, nodes: 3, lastRun: "2026-07-29T08:21:00Z" },
];

export const mockExecutions: MockExecution[] = [
  { id: "exe_01J8F8Q7A", workflow: "Order risk routing", status: "SUCCESS", trigger: "Webhook", duration: "12.4s", startedAt: "2026-08-10T14:12:00Z", nodes: 5 },
  { id: "exe_01J8F7Y3B", workflow: "Customer onboarding", status: "RUNNING", trigger: "Webhook", duration: "8.1s", startedAt: "2026-08-10T13:48:00Z", nodes: 7 },
  { id: "exe_01J8F6K9C", workflow: "Content approval", status: "WAITING_APPROVAL", trigger: "Manual", duration: "2m 18s", startedAt: "2026-08-10T12:10:00Z", nodes: 8 },
  { id: "exe_01J8EZA2D", workflow: "Order risk routing", status: "FAILED", trigger: "Webhook", duration: "4.8s", startedAt: "2026-08-10T10:44:00Z", nodes: 3, error: "Discord credential rejected the request" },
  { id: "exe_01J8EYW1E", workflow: "Weekly revenue digest", status: "SUCCESS", trigger: "Cron", duration: "46.2s", startedAt: "2026-08-04T09:00:00Z", nodes: 4 },
  { id: "exe_01J8EXR5F", workflow: "Customer onboarding", status: "SUCCESS", trigger: "API", duration: "18.7s", startedAt: "2026-08-09T18:34:00Z", nodes: 7 },
  { id: "exe_01J8EWC8G", workflow: "Order risk routing", status: "CANCELLED", trigger: "Manual", duration: "1.2s", startedAt: "2026-08-09T16:05:00Z", nodes: 1 },
  { id: "exe_01J8EVN4H", workflow: "Content approval", status: "SUCCESS", trigger: "Webhook", duration: "21.9s", startedAt: "2026-08-09T14:48:00Z", nodes: 8 },
];

export const dashboardStats = [
  { label: "Executions this month", value: "4,708", delta: "+18.2%", tone: "indigo", icon: "Activity" },
  { label: "Success rate", value: "98.6%", delta: "+1.4%", tone: "green", icon: "CheckCircle2" },
  { label: "Active workflows", value: "12", delta: "+3", tone: "violet", icon: "Workflow" },
  { label: "Time saved", value: "86h", delta: "+12h", tone: "amber", icon: "Clock3" },
] as const;

export const mockCredentials = [
  { id: "cred-1", name: "Production Discord", provider: "Discord", type: "Bot token", updatedAt: "Aug 08, 2026", value: "••••••••••••9F2A", icon: "MessageSquare", color: "bg-[#5865f2]/10 text-[#5865f2]" },
  { id: "cred-2", name: "Revenue Sheets", provider: "Google Sheets", type: "OAuth 2.0", updatedAt: "Aug 05, 2026", value: "••••••••••••mN7Q", icon: "Table2", color: "bg-[#34a853]/10 text-[#34a853]" },
  { id: "cred-3", name: "Northstar API", provider: "Custom API", type: "API key", updatedAt: "Jul 29, 2026", value: "••••••••••••4K1P", icon: "KeyRound", color: "bg-cyan-500/10 text-cyan-400" },
];

export const mockApprovals = [
  { id: "approval-1", title: "High-value order #10482", workflow: "Order risk routing", requestedBy: "Risk agent", requestedAt: "4 minutes ago", amount: "$1,840.00", reason: "Order score is above the review threshold and the shipping address is new.", tone: "amber" },
  { id: "approval-2", title: "Publish campaign: Autumn launch", workflow: "Content approval", requestedBy: "Content pipeline", requestedAt: "18 minutes ago", amount: "12 assets", reason: "The campaign is ready for final brand review before scheduling.", tone: "violet" },
  { id: "approval-3", title: "Refund request #8831", workflow: "Support escalation", requestedBy: "Support classifier", requestedAt: "42 minutes ago", amount: "$248.00", reason: "Customer sentiment is negative and the requested refund exceeds the auto-approve limit.", tone: "red" },
];

export const editorWorkflow = {
  name: "Order risk routing",
  description: "Route orders through an AI risk assessment before notifying the right team.",
  nodes: initialWorkflowNodes,
  edges: initialWorkflowEdges,
};

export function cloneEditorNodes(): WorkflowCanvasNode[] {
  return initialWorkflowNodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data, config: { ...node.data.config } } }));
}
