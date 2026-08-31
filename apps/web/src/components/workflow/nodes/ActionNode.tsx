"use client";

import { Globe, Mail, MessageSquare, Send, Table2, HardDrive, Reply } from "lucide-react";
import { BaseNode, type WorkflowNodeProps } from "./BaseNode";

export function ActionNode(props: WorkflowNodeProps) {
  let Icon = Globe;
  if (props.data.type === "http") {
    Icon = Globe;
  } else if (props.data.type === "email" || props.data.type === "gmail") {
    Icon = Mail;
  } else if (props.data.type === "discord") {
    Icon = MessageSquare;
  } else if (props.data.type === "telegram") {
    Icon = Send;
  } else if (props.data.type === "sheets") {
    Icon = Table2;
  } else if (props.data.type === "googleDrive") {
    Icon = HardDrive;
  } else if (props.data.type === "respond_webhook") {
    Icon = Reply;
  }

  return <BaseNode {...props} kind="action" icon={Icon} />;
}
