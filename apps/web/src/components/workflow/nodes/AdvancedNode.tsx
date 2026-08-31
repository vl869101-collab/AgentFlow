"use client";

import { Bot, CheckCircle2, Cpu } from "lucide-react";
import { BaseNode, type WorkflowNodeProps } from "./BaseNode";

export function AdvancedNode(props: WorkflowNodeProps) {
  let Icon = Bot;
  if (props.data.type === "approval") {
    Icon = CheckCircle2;
  } else if (props.data.type === "ai_agent") {
    Icon = Bot;
  } else {
    Icon = Cpu;
  }

  return <BaseNode {...props} kind="advanced" icon={Icon} />;
}
