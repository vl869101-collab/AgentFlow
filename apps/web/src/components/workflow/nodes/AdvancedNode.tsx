"use client";

import { Brain, CheckCircle } from "lucide-react";
import { BaseNode, type WorkflowNodeProps } from "./BaseNode";

export function AdvancedNode(props: WorkflowNodeProps) {
  const Icon = props.data.type === "approval" ? CheckCircle : Brain;
  return <BaseNode {...props} kind="advanced" icon={Icon} />;
}
