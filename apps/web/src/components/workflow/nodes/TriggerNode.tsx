"use client";

import { Clock, Webhook, Mail, Sparkles, Inbox } from "lucide-react";
import { BaseNode, type WorkflowNodeProps } from "./BaseNode";

export function TriggerNode(props: WorkflowNodeProps) {
  let Icon = Webhook;
  if (props.data.type === "cron") {
    Icon = Clock;
  } else if (props.data.type === "gmailTrigger") {
    Icon = Mail;
  } else if (props.data.type === "emailReadImap") {
    Icon = Inbox;
  } else if (props.data.type === "evaluationTrigger") {
    Icon = Sparkles;
  }

  return <BaseNode {...props} kind="trigger" icon={Icon} />;
}
