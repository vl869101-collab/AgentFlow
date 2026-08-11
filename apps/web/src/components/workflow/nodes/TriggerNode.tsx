"use client";

import { Clock, Webhook } from "lucide-react";
import { getNodeMeta } from "@/lib/workflow";
import { BaseNode, type WorkflowNodeProps } from "./BaseNode";

export function TriggerNode(props: WorkflowNodeProps) {
  const Icon = props.data.type === "cron" ? Clock : Webhook;
  getNodeMeta(props.data.type);
  return <BaseNode {...props} kind="trigger" icon={Icon} />;
}
