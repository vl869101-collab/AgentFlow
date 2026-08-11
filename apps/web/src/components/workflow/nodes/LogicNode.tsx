"use client";

import { GitBranch, Shuffle, Timer } from "lucide-react";
import { BaseNode, type WorkflowNodeProps } from "./BaseNode";

export function LogicNode(props: WorkflowNodeProps) {
  const Icon = props.data.type === "condition" ? GitBranch : props.data.type === "transform" ? Shuffle : Timer;
  return <BaseNode {...props} kind="logic" icon={Icon} />;
}
