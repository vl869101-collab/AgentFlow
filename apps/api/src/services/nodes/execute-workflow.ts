/**
 * Execute Workflow Node Handler (compatível com n8n Execute Workflow / Sub-workflows)
 *
 * Suporta:
 * - Execução de workflows filhos (sub-workflows) modulares.
 * - Modo Síncrono (wait / sync): executa o child workflow, aguarda término e retorna os NodeItems de saída.
 * - Modo Assíncrono (fireAndForget / async): despacha a execução filha para fila (ou background runner) e retorna imediatamente metadados com lineage.
 * - Isolamento estrito de variáveis e escopo (variáveis de workflow pai não vazam, nem do filho para o pai).
 * - Passagem e retorno com contrato rígido de NodeItem[] (Items Contract Engine).
 * - Timeout configurável por sub-chamada com fallback ou erro.
 * - Herança segura de contexto organizacional (rejeita execução de workflows de outra organização - tenant isolation).
 * - Suporte a parentExecutionId e rastreamento de linhagem (lineage / execution hierarchy).
 */

import {
  NodeHandler,
  NodeExecutionContext,
  NodeExecutionResult,
  NodeItem,
  wrapItems,
  ensureNodeItem,
} from "./types.js";
import { prisma } from "../../lib/prisma.js";
import { createWorkflowExecution, runExecution } from "../executor.js";
import { enqueueExecution } from "../queue.js";

export interface ExecuteWorkflowConfig {
  workflowId?: string;
  source?: "database" | "parameter" | "id";
  mode?: "sync" | "async" | "wait" | "fireAndForget";
  waitForSubWorkflow?: boolean;
  timeoutMs?: number;
  inputDataMode?: "allInputData" | "custom" | "passThrough";
  customData?: Record<string, unknown>;
  inheritOrgContext?: boolean;
  workflowName?: string;
  [key: string]: unknown;
}

export class ExecuteWorkflowNodeHandler implements NodeHandler {
  type = "executeWorkflow";
  category = "advanced";

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = (ctx.nodeConfig.parameters as ExecuteWorkflowConfig) ?? (ctx.nodeConfig as ExecuteWorkflowConfig) ?? {};

    // 1. Resolver o ID do sub-workflow alvo
    const targetWorkflowId = String(
      config.workflowId ??
      config.workflow ??
      ctx.nodeConfig.workflowId ??
      ""
    ).trim();

    if (!targetWorkflowId) {
      throw new Error("ExecuteWorkflow node requires a valid target workflowId");
    }

    // 2. Tenant Isolation & Segurança Organizacional
    // O sub-workflow DEVE pertencer à mesma organização do workflow pai
    const childWorkflow = await prisma.workflow.findFirst({
      where: {
        id: targetWorkflowId,
        orgId: ctx.orgId,
      },
      include: {
        nodes: true,
        edges: true,
        versions: { orderBy: { version: "desc" }, take: 1 },
      },
    });

    if (!childWorkflow) {
      throw new Error(
        `Sub-workflow '${targetWorkflowId}' not found or access denied for organization '${ctx.orgId}'`
      );
    }

    // 3. Preparar e Isolar os dados de entrada para o sub-workflow
    // Garantir que variáveis locais ou estado do pai não vazem acidentalmente
    let payloadToSend: unknown;
    const inputItems = wrapItems(ctx.input);

    if (config.inputDataMode === "custom" && config.customData) {
      // Isola e clona o customData
      const clonedCustom = JSON.parse(JSON.stringify(config.customData));
      payloadToSend = wrapItems(clonedCustom);
    } else {
      // Clona profundamente os itens de entrada para garantir isolamento de escopo por valor
      payloadToSend = JSON.parse(JSON.stringify(inputItems));
    }

    // 4. Determinar modo de execução: síncrono (default / wait) vs assíncrono (fireAndForget / async)
    const isAsync =
      config.mode === "async" ||
      config.mode === "fireAndForget" ||
      config.waitForSubWorkflow === false;

    // Timeout específico configurado no nó ou timeout padrão de sub-workflow (60s)
    const timeoutMs = typeof config.timeoutMs === "number" && config.timeoutMs > 0
      ? config.timeoutMs
      : 60_000;

    // 5. Criar execução do filho vinculada ao parentExecutionId
    const childExecution = await createWorkflowExecution(
      targetWorkflowId,
      payloadToSend,
      {
        trigger: "subworkflow",
        parentExecutionId: ctx.executionId,
      }
    );

    // 6. Modo Assíncrono (Desacoplado via fila ou background)
    if (isAsync) {
      const enqueued = await enqueueExecution(childExecution.id, {
        parentExecutionId: ctx.executionId,
        parentNodeId: ctx.nodeId,
        parentWorkflowId: ctx.workflowId,
      });

      if (!enqueued) {
        // Se a fila estiver desativada (em ambiente de teste/offline), executa em background sem bloquear
        void runExecution(childExecution.id, {
          parentExecutionId: ctx.executionId,
        }).catch((err) => {
          console.error(`[sub-workflow async background error] Execution ${childExecution.id}:`, err);
        });
      }

      const resultItem: NodeItem = ensureNodeItem({
        executionId: childExecution.id,
        workflowId: targetWorkflowId,
        parentExecutionId: ctx.executionId,
        status: "PENDING",
        mode: "async",
        enqueued,
        startedAt: childExecution.startedAt,
        message: `Sub-workflow '${childWorkflow.name}' enqueued successfully.`,
      });

      return {
        items: [resultItem],
        logs: [
          `[ExecuteWorkflow] Dispatched async child execution ${childExecution.id} for sub-workflow ${targetWorkflowId}`,
        ],
      };
    }

    // 7. Modo Síncrono (Aguardar término com timeout)
    const executionPromise = runExecution(childExecution.id, {
      parentExecutionId: ctx.executionId,
    });

    let timeoutTimer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => {
        reject(
          new Error(
            `Sub-workflow '${childWorkflow.name || targetWorkflowId}' timed out after ${timeoutMs}ms (executionId: ${childExecution.id})`
          )
        );
      }, timeoutMs);
    });

    let completedChild: any;
    try {
      completedChild = await Promise.race([executionPromise, timeoutPromise]);
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
    }

    if (completedChild.status === "FAILED") {
      throw new Error(
        `Sub-workflow execution failed: ${completedChild.error || "Unknown sub-workflow error"} (childExecutionId: ${childExecution.id})`
      );
    }

    // 8. Normalizar saída do sub-workflow para NodeItem[]
    // Preserva o isolamento de variáveis do escopo pai
    let outputItems: NodeItem[];
    if (completedChild.output !== undefined && completedChild.output !== null) {
      outputItems = wrapItems(completedChild.output);
    } else {
      outputItems = [];
    }

    return {
      items: outputItems,
      logs: [
        `[ExecuteWorkflow] Successfully executed sub-workflow ${targetWorkflowId} (childExecution: ${childExecution.id}, duration: ${completedChild.duration ?? 0}ms)`,
      ],
    };
  }
}
