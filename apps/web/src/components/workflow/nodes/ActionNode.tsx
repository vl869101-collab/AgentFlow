"use client";

import { Globe, Mail, MessageSquare, Send, Table2 } from "lucide-react";
import { BaseNode, type WorkflowNodeProps } from "./BaseNode";

export function ActionNode(props: WorkflowNodeProps) {
  const Icon = props.data.type === "http" ? Globe : props.data.type === "email" ? Mail : props.data.type === "discord" ? MessageSquare : props.data.type === "telegram" ? Send : Table2;
  return <BaseNode {...props} kind="action" icon={Icon} />;
}
