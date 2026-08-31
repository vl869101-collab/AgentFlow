"use client";

import { GitBranch, Shuffle, Timer, GitMerge, Filter, Edit3 } from "lucide-react";
import { BaseNode, type WorkflowNodeProps } from "./BaseNode";

export function LogicNode(props: WorkflowNodeProps) {
  let Icon = GitBranch;
  if (props.data.type === "condition") {
    Icon = GitBranch;
  } else if (props.data.type === "transform") {
    Icon = Shuffle;
  } else if (props.data.type === "delay") {
    Icon = Timer;
  } else if (props.data.type === "merge") {
    Icon = GitMerge;
  } else if (props.data.type === "filter") {
    Icon = Filter;
  } else if (props.data.type === "set_fields") {
    Icon = Edit3;
  }

  return <BaseNode {...props} kind="logic" icon={Icon} />;
}
