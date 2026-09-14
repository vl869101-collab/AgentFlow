/**
 * Canonical Subworkflow Node Handler
 *
 * Implements WF-ENG Item 6: canonical export of SubworkflowNodeHandler
 * as an alias of ExecuteWorkflowNodeHandler.
 */

import {
  ExecuteWorkflowNodeHandler,
  type ExecuteWorkflowConfig,
} from "./execute-workflow.js";

export class SubworkflowNodeHandler extends ExecuteWorkflowNodeHandler {
  override type = "subworkflow";
}

export {
  ExecuteWorkflowNodeHandler,
  type ExecuteWorkflowConfig,
  type ExecuteWorkflowConfig as SubworkflowConfig,
};

export default SubworkflowNodeHandler;
