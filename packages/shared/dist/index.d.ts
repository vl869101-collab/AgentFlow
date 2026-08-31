import { z } from "zod";
export { type BinaryData, type PairedItemRef, type PairedItem, type NodeItem, type NormalizedItem, type ItemBatchContext, type ItemBatchResult, type ItemTransformOptions, type ItemExtractionOptions, type ItemUnwrapOptions, binaryDataSchema, pairedItemRefSchema, pairedItemSchema, nodeItemSchema, nodeItemsArraySchema, normalizePath, extractFieldByPath, setFieldByPath, isNodeItem, ensureNodeItem, wrapItems, unwrapItems, batchItems, mapItems, filterItems, mergeItemBatches, createPairedItem, linkPairedItems, normalizeToItemsContract, normalizeFromItemsContract, } from "./items.js";
export { computeWorkflowDiff, normalizeSnapshotNodes, normalizeSnapshotEdges, deepEqual, type WorkflowNodeSnapshot, type WorkflowEdgeSnapshot, type WorkflowSnapshot, type FieldDiff, type NodeModificationDiff, type EdgeModificationDiff, type VisualNodeDiffMarker, type VisualEdgeDiffMarker, type WorkflowVisualDiffMap, type WorkflowDiffResult, } from "./workflow-diff.js";
export { importN8nWorkflow, createAgentFlowFromN8n, validateN8nWorkflow, N8N_SDK_CATALOG, type N8nWorkflowExport, type N8nNode, type N8nConnections, type N8nNodeSdkSpec, type N8nValidationResult, type N8nValidationError, type AgentFlowImportResult, type ImportOptions, } from "./n8n-import.js";
export { kmsWrappedKeySchema, vaultEnvelopeSchema, type KmsWrappedKey, type VaultEnvelope, type KmsKeyMetadata, type KmsKeyProvider, type KmsProvider, } from "./kms.js";
export declare const signupSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    email: string;
    password: string;
}, {
    name: string;
    email: string;
    password: string;
}>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const createOrgSchema: z.ZodObject<{
    name: z.ZodString;
    slug: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    slug: string;
}, {
    name: string;
    slug: string;
}>;
export declare const inviteMemberSchema: z.ZodObject<{
    email: z.ZodString;
    role: z.ZodEnum<["MEMBER", "VIEWER"]>;
}, "strip", z.ZodTypeAny, {
    email: string;
    role: "MEMBER" | "VIEWER";
}, {
    email: string;
    role: "MEMBER" | "VIEWER";
}>;
export declare const workflowNodeTypeSchema: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
export declare const nodeConfigSchema: z.ZodEffects<z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
    label: z.ZodOptional<z.ZodString>;
    config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    position: z.ZodDefault<z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        x: number;
        y: number;
    }, {
        x: number;
        y: number;
    }>>;
    width: z.ZodOptional<z.ZodNumber>;
    height: z.ZodOptional<z.ZodNumber>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
    label: z.ZodOptional<z.ZodString>;
    config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    position: z.ZodDefault<z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        x: number;
        y: number;
    }, {
        x: number;
        y: number;
    }>>;
    width: z.ZodOptional<z.ZodNumber>;
    height: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
    label: z.ZodOptional<z.ZodString>;
    config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    position: z.ZodDefault<z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        x: number;
        y: number;
    }, {
        x: number;
        y: number;
    }>>;
    width: z.ZodOptional<z.ZodNumber>;
    height: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">>, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
    label: z.ZodOptional<z.ZodString>;
    config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    position: z.ZodDefault<z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        x: number;
        y: number;
    }, {
        x: number;
        y: number;
    }>>;
    width: z.ZodOptional<z.ZodNumber>;
    height: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
    label: z.ZodOptional<z.ZodString>;
    config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    position: z.ZodDefault<z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        x: number;
        y: number;
    }, {
        x: number;
        y: number;
    }>>;
    width: z.ZodOptional<z.ZodNumber>;
    height: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">>;
export declare const edgeConfigSchema: z.ZodEffects<z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    sourceNodeId: z.ZodOptional<z.ZodString>;
    targetNodeId: z.ZodOptional<z.ZodString>;
    source: z.ZodOptional<z.ZodString>;
    target: z.ZodOptional<z.ZodString>;
    sourceHandle: z.ZodOptional<z.ZodString>;
    targetHandle: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    condition: z.ZodOptional<z.ZodUnknown>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    sourceNodeId: z.ZodOptional<z.ZodString>;
    targetNodeId: z.ZodOptional<z.ZodString>;
    source: z.ZodOptional<z.ZodString>;
    target: z.ZodOptional<z.ZodString>;
    sourceHandle: z.ZodOptional<z.ZodString>;
    targetHandle: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    condition: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    sourceNodeId: z.ZodOptional<z.ZodString>;
    targetNodeId: z.ZodOptional<z.ZodString>;
    source: z.ZodOptional<z.ZodString>;
    target: z.ZodOptional<z.ZodString>;
    sourceHandle: z.ZodOptional<z.ZodString>;
    targetHandle: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    condition: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">>, z.objectOutputType<{
    id: z.ZodOptional<z.ZodString>;
    sourceNodeId: z.ZodOptional<z.ZodString>;
    targetNodeId: z.ZodOptional<z.ZodString>;
    source: z.ZodOptional<z.ZodString>;
    target: z.ZodOptional<z.ZodString>;
    sourceHandle: z.ZodOptional<z.ZodString>;
    targetHandle: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    condition: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodString>;
    sourceNodeId: z.ZodOptional<z.ZodString>;
    targetNodeId: z.ZodOptional<z.ZodString>;
    source: z.ZodOptional<z.ZodString>;
    target: z.ZodOptional<z.ZodString>;
    sourceHandle: z.ZodOptional<z.ZodString>;
    targetHandle: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    condition: z.ZodOptional<z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">>;
export declare const createWorkflowSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description?: string | undefined;
}, {
    name: string;
    description?: string | undefined;
}>;
export declare const updateWorkflowSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED" | undefined;
    name?: string | undefined;
    description?: string | undefined;
}, {
    status?: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED" | undefined;
    name?: string | undefined;
    description?: string | undefined;
}>;
export declare const saveWorkflowCanvasSchema: z.ZodObject<{
    nodes: z.ZodArray<z.ZodEffects<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
        label: z.ZodOptional<z.ZodString>;
        config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        position: z.ZodDefault<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
        }, {
            x: number;
            y: number;
        }>>;
        width: z.ZodOptional<z.ZodNumber>;
        height: z.ZodOptional<z.ZodNumber>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        id: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
        label: z.ZodOptional<z.ZodString>;
        config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        position: z.ZodDefault<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
        }, {
            x: number;
            y: number;
        }>>;
        width: z.ZodOptional<z.ZodNumber>;
        height: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        id: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
        label: z.ZodOptional<z.ZodString>;
        config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        position: z.ZodDefault<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
        }, {
            x: number;
            y: number;
        }>>;
        width: z.ZodOptional<z.ZodNumber>;
        height: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>, z.objectOutputType<{
        id: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
        label: z.ZodOptional<z.ZodString>;
        config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        position: z.ZodDefault<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
        }, {
            x: number;
            y: number;
        }>>;
        width: z.ZodOptional<z.ZodNumber>;
        height: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        id: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
        label: z.ZodOptional<z.ZodString>;
        config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        position: z.ZodDefault<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
        }, {
            x: number;
            y: number;
        }>>;
        width: z.ZodOptional<z.ZodNumber>;
        height: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">>, "many">;
    edges: z.ZodArray<z.ZodEffects<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        sourceNodeId: z.ZodOptional<z.ZodString>;
        targetNodeId: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodString>;
        target: z.ZodOptional<z.ZodString>;
        sourceHandle: z.ZodOptional<z.ZodString>;
        targetHandle: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
        condition: z.ZodOptional<z.ZodUnknown>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        id: z.ZodOptional<z.ZodString>;
        sourceNodeId: z.ZodOptional<z.ZodString>;
        targetNodeId: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodString>;
        target: z.ZodOptional<z.ZodString>;
        sourceHandle: z.ZodOptional<z.ZodString>;
        targetHandle: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
        condition: z.ZodOptional<z.ZodUnknown>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        id: z.ZodOptional<z.ZodString>;
        sourceNodeId: z.ZodOptional<z.ZodString>;
        targetNodeId: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodString>;
        target: z.ZodOptional<z.ZodString>;
        sourceHandle: z.ZodOptional<z.ZodString>;
        targetHandle: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
        condition: z.ZodOptional<z.ZodUnknown>;
    }, z.ZodTypeAny, "passthrough">>, z.objectOutputType<{
        id: z.ZodOptional<z.ZodString>;
        sourceNodeId: z.ZodOptional<z.ZodString>;
        targetNodeId: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodString>;
        target: z.ZodOptional<z.ZodString>;
        sourceHandle: z.ZodOptional<z.ZodString>;
        targetHandle: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
        condition: z.ZodOptional<z.ZodUnknown>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        id: z.ZodOptional<z.ZodString>;
        sourceNodeId: z.ZodOptional<z.ZodString>;
        targetNodeId: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodString>;
        target: z.ZodOptional<z.ZodString>;
        sourceHandle: z.ZodOptional<z.ZodString>;
        targetHandle: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
        condition: z.ZodOptional<z.ZodUnknown>;
    }, z.ZodTypeAny, "passthrough">>, "many">;
}, "strip", z.ZodTypeAny, {
    nodes: z.objectOutputType<{
        id: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
        label: z.ZodOptional<z.ZodString>;
        config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        position: z.ZodDefault<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
        }, {
            x: number;
            y: number;
        }>>;
        width: z.ZodOptional<z.ZodNumber>;
        height: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">[];
    edges: z.objectOutputType<{
        id: z.ZodOptional<z.ZodString>;
        sourceNodeId: z.ZodOptional<z.ZodString>;
        targetNodeId: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodString>;
        target: z.ZodOptional<z.ZodString>;
        sourceHandle: z.ZodOptional<z.ZodString>;
        targetHandle: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
        condition: z.ZodOptional<z.ZodUnknown>;
    }, z.ZodTypeAny, "passthrough">[];
}, {
    nodes: z.objectInputType<{
        id: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
        label: z.ZodOptional<z.ZodString>;
        config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        position: z.ZodDefault<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
        }, {
            x: number;
            y: number;
        }>>;
        width: z.ZodOptional<z.ZodNumber>;
        height: z.ZodOptional<z.ZodNumber>;
    }, z.ZodTypeAny, "passthrough">[];
    edges: z.objectInputType<{
        id: z.ZodOptional<z.ZodString>;
        sourceNodeId: z.ZodOptional<z.ZodString>;
        targetNodeId: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodString>;
        target: z.ZodOptional<z.ZodString>;
        sourceHandle: z.ZodOptional<z.ZodString>;
        targetHandle: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
        condition: z.ZodOptional<z.ZodUnknown>;
    }, z.ZodTypeAny, "passthrough">[];
}>;
export declare const workflowDiffQuerySchema: z.ZodEffects<z.ZodObject<{
    fromVersion: z.ZodOptional<z.ZodNumber>;
    toVersion: z.ZodOptional<z.ZodNumber>;
    v1: z.ZodOptional<z.ZodNumber>;
    v2: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    fromVersion?: number | undefined;
    toVersion?: number | undefined;
    v1?: number | undefined;
    v2?: number | undefined;
}, {
    fromVersion?: number | undefined;
    toVersion?: number | undefined;
    v1?: number | undefined;
    v2?: number | undefined;
}>, {
    fromVersion: number;
    toVersion: number;
}, {
    fromVersion?: number | undefined;
    toVersion?: number | undefined;
    v1?: number | undefined;
    v2?: number | undefined;
}>;
export declare const workflowVersionParamsSchema: z.ZodObject<{
    version: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    version: number;
}, {
    version: number;
}>;
export declare const rollbackWorkflowSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    targetVersion: z.ZodOptional<z.ZodNumber>;
    version: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    version?: number | undefined;
    targetVersion?: number | undefined;
}, {
    version?: number | undefined;
    targetVersion?: number | undefined;
}>, {
    version?: number | undefined;
    targetVersion?: number | undefined;
}, {
    version?: number | undefined;
    targetVersion?: number | undefined;
}>, {
    targetVersion: number;
}, {
    version?: number | undefined;
    targetVersion?: number | undefined;
}>;
export declare const auditEventSchema: z.ZodObject<{
    action: z.ZodString;
    resource: z.ZodOptional<z.ZodString>;
    resourceId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    action: string;
    resource?: string | undefined;
    resourceId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    action: string;
    resource?: string | undefined;
    resourceId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export declare const auditListQuerySchema: z.ZodObject<{
    action: z.ZodOptional<z.ZodString>;
    resource: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action?: string | undefined;
    resource?: string | undefined;
}, {
    action?: string | undefined;
    resource?: string | undefined;
}>;
export declare const auditExportQuerySchema: z.ZodEffects<z.ZodObject<{
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    from?: string | undefined;
    to?: string | undefined;
}, {
    from?: string | undefined;
    to?: string | undefined;
}>, {
    from?: string | undefined;
    to?: string | undefined;
}, {
    from?: string | undefined;
    to?: string | undefined;
}>;
export declare const generatedWorkflowSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    nodes: z.ZodArray<z.ZodEffects<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
        label: z.ZodOptional<z.ZodString>;
        config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        position: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
        }, {
            x: number;
            y: number;
        }>;
        width: z.ZodOptional<z.ZodNumber>;
        height: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        type: "filter" | "code" | "condition" | "trigger" | "action" | "logic" | "transform" | "advanced" | "webhook" | "cron" | "manual" | "gmailTrigger" | "emailReadImap" | "evaluationTrigger" | "postgres" | "redis" | "mongo" | "http" | "merge" | "set_fields" | "splitInBatches" | "delay" | "gmail" | "email" | "googleDrive" | "sheets" | "telegram" | "discord" | "ai" | "respond_webhook" | "cronTrigger" | "httpRequest" | "postgresql" | "mongodb" | "telegramTrigger" | "slack" | "slackTrigger" | "googleSheets" | "drive" | "googleGmail" | "ai_agent" | "llm_model" | "llm_chain" | "vector_store" | "execute_workflow" | "output" | "approval" | "teams" | "whatsapp" | "whatsappTrigger" | "googleCalendar" | "googleDocs" | "errorTrigger";
        config: Record<string, unknown>;
        position: {
            x: number;
            y: number;
        };
        data?: Record<string, unknown> | undefined;
        label?: string | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }, {
        id: string;
        type: "filter" | "code" | "condition" | "trigger" | "action" | "logic" | "transform" | "advanced" | "webhook" | "cron" | "manual" | "gmailTrigger" | "emailReadImap" | "evaluationTrigger" | "postgres" | "redis" | "mongo" | "http" | "merge" | "set_fields" | "splitInBatches" | "delay" | "gmail" | "email" | "googleDrive" | "sheets" | "telegram" | "discord" | "ai" | "respond_webhook" | "cronTrigger" | "httpRequest" | "postgresql" | "mongodb" | "telegramTrigger" | "slack" | "slackTrigger" | "googleSheets" | "drive" | "googleGmail" | "ai_agent" | "llm_model" | "llm_chain" | "vector_store" | "execute_workflow" | "output" | "approval" | "teams" | "whatsapp" | "whatsappTrigger" | "googleCalendar" | "googleDocs" | "errorTrigger";
        position: {
            x: number;
            y: number;
        };
        data?: Record<string, unknown> | undefined;
        label?: string | undefined;
        config?: Record<string, unknown> | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }>, {
        id: string;
        type: "filter" | "code" | "condition" | "trigger" | "action" | "logic" | "transform" | "advanced" | "webhook" | "cron" | "manual" | "gmailTrigger" | "emailReadImap" | "evaluationTrigger" | "postgres" | "redis" | "mongo" | "http" | "merge" | "set_fields" | "splitInBatches" | "delay" | "gmail" | "email" | "googleDrive" | "sheets" | "telegram" | "discord" | "ai" | "respond_webhook" | "cronTrigger" | "httpRequest" | "postgresql" | "mongodb" | "telegramTrigger" | "slack" | "slackTrigger" | "googleSheets" | "drive" | "googleGmail" | "ai_agent" | "llm_model" | "llm_chain" | "vector_store" | "execute_workflow" | "output" | "approval" | "teams" | "whatsapp" | "whatsappTrigger" | "googleCalendar" | "googleDocs" | "errorTrigger";
        config: Record<string, unknown>;
        position: {
            x: number;
            y: number;
        };
        data?: Record<string, unknown> | undefined;
        label?: string | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }, {
        id: string;
        type: "filter" | "code" | "condition" | "trigger" | "action" | "logic" | "transform" | "advanced" | "webhook" | "cron" | "manual" | "gmailTrigger" | "emailReadImap" | "evaluationTrigger" | "postgres" | "redis" | "mongo" | "http" | "merge" | "set_fields" | "splitInBatches" | "delay" | "gmail" | "email" | "googleDrive" | "sheets" | "telegram" | "discord" | "ai" | "respond_webhook" | "cronTrigger" | "httpRequest" | "postgresql" | "mongodb" | "telegramTrigger" | "slack" | "slackTrigger" | "googleSheets" | "drive" | "googleGmail" | "ai_agent" | "llm_model" | "llm_chain" | "vector_store" | "execute_workflow" | "output" | "approval" | "teams" | "whatsapp" | "whatsappTrigger" | "googleCalendar" | "googleDocs" | "errorTrigger";
        position: {
            x: number;
            y: number;
        };
        data?: Record<string, unknown> | undefined;
        label?: string | undefined;
        config?: Record<string, unknown> | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }>, "many">;
    edges: z.ZodArray<z.ZodEffects<z.ZodObject<{
        id: z.ZodString;
        sourceNodeId: z.ZodOptional<z.ZodString>;
        targetNodeId: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodString>;
        target: z.ZodOptional<z.ZodString>;
        sourceHandle: z.ZodOptional<z.ZodString>;
        targetHandle: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
        condition: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        source?: string | undefined;
        label?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
        condition?: unknown;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
    }, {
        id: string;
        source?: string | undefined;
        label?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
        condition?: unknown;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
    }>, {
        id: string;
        source?: string | undefined;
        label?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
        condition?: unknown;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
    }, {
        id: string;
        source?: string | undefined;
        label?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
        condition?: unknown;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    nodes: {
        id: string;
        type: "filter" | "code" | "condition" | "trigger" | "action" | "logic" | "transform" | "advanced" | "webhook" | "cron" | "manual" | "gmailTrigger" | "emailReadImap" | "evaluationTrigger" | "postgres" | "redis" | "mongo" | "http" | "merge" | "set_fields" | "splitInBatches" | "delay" | "gmail" | "email" | "googleDrive" | "sheets" | "telegram" | "discord" | "ai" | "respond_webhook" | "cronTrigger" | "httpRequest" | "postgresql" | "mongodb" | "telegramTrigger" | "slack" | "slackTrigger" | "googleSheets" | "drive" | "googleGmail" | "ai_agent" | "llm_model" | "llm_chain" | "vector_store" | "execute_workflow" | "output" | "approval" | "teams" | "whatsapp" | "whatsappTrigger" | "googleCalendar" | "googleDocs" | "errorTrigger";
        config: Record<string, unknown>;
        position: {
            x: number;
            y: number;
        };
        data?: Record<string, unknown> | undefined;
        label?: string | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }[];
    edges: {
        id: string;
        source?: string | undefined;
        label?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
        condition?: unknown;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
    }[];
    name: string;
    description: string;
}, {
    nodes: {
        id: string;
        type: "filter" | "code" | "condition" | "trigger" | "action" | "logic" | "transform" | "advanced" | "webhook" | "cron" | "manual" | "gmailTrigger" | "emailReadImap" | "evaluationTrigger" | "postgres" | "redis" | "mongo" | "http" | "merge" | "set_fields" | "splitInBatches" | "delay" | "gmail" | "email" | "googleDrive" | "sheets" | "telegram" | "discord" | "ai" | "respond_webhook" | "cronTrigger" | "httpRequest" | "postgresql" | "mongodb" | "telegramTrigger" | "slack" | "slackTrigger" | "googleSheets" | "drive" | "googleGmail" | "ai_agent" | "llm_model" | "llm_chain" | "vector_store" | "execute_workflow" | "output" | "approval" | "teams" | "whatsapp" | "whatsappTrigger" | "googleCalendar" | "googleDocs" | "errorTrigger";
        position: {
            x: number;
            y: number;
        };
        data?: Record<string, unknown> | undefined;
        label?: string | undefined;
        config?: Record<string, unknown> | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }[];
    edges: {
        id: string;
        source?: string | undefined;
        label?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
        condition?: unknown;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
    }[];
    name: string;
    description: string;
}>, {
    nodes: {
        id: string;
        type: "filter" | "code" | "condition" | "trigger" | "action" | "logic" | "transform" | "advanced" | "webhook" | "cron" | "manual" | "gmailTrigger" | "emailReadImap" | "evaluationTrigger" | "postgres" | "redis" | "mongo" | "http" | "merge" | "set_fields" | "splitInBatches" | "delay" | "gmail" | "email" | "googleDrive" | "sheets" | "telegram" | "discord" | "ai" | "respond_webhook" | "cronTrigger" | "httpRequest" | "postgresql" | "mongodb" | "telegramTrigger" | "slack" | "slackTrigger" | "googleSheets" | "drive" | "googleGmail" | "ai_agent" | "llm_model" | "llm_chain" | "vector_store" | "execute_workflow" | "output" | "approval" | "teams" | "whatsapp" | "whatsappTrigger" | "googleCalendar" | "googleDocs" | "errorTrigger";
        config: Record<string, unknown>;
        position: {
            x: number;
            y: number;
        };
        data?: Record<string, unknown> | undefined;
        label?: string | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }[];
    edges: {
        id: string;
        source?: string | undefined;
        label?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
        condition?: unknown;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
    }[];
    name: string;
    description: string;
}, {
    nodes: {
        id: string;
        type: "filter" | "code" | "condition" | "trigger" | "action" | "logic" | "transform" | "advanced" | "webhook" | "cron" | "manual" | "gmailTrigger" | "emailReadImap" | "evaluationTrigger" | "postgres" | "redis" | "mongo" | "http" | "merge" | "set_fields" | "splitInBatches" | "delay" | "gmail" | "email" | "googleDrive" | "sheets" | "telegram" | "discord" | "ai" | "respond_webhook" | "cronTrigger" | "httpRequest" | "postgresql" | "mongodb" | "telegramTrigger" | "slack" | "slackTrigger" | "googleSheets" | "drive" | "googleGmail" | "ai_agent" | "llm_model" | "llm_chain" | "vector_store" | "execute_workflow" | "output" | "approval" | "teams" | "whatsapp" | "whatsappTrigger" | "googleCalendar" | "googleDocs" | "errorTrigger";
        position: {
            x: number;
            y: number;
        };
        data?: Record<string, unknown> | undefined;
        label?: string | undefined;
        config?: Record<string, unknown> | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }[];
    edges: {
        id: string;
        source?: string | undefined;
        label?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
        condition?: unknown;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
    }[];
    name: string;
    description: string;
}>;
export declare const workflowTemplateSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    category: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    icon: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
    connectors: z.ZodArray<z.ZodString, "many">;
    difficulty: z.ZodDefault<z.ZodEnum<["Iniciante", "Intermediário", "Avançado"]>>;
    estimatedSetupMinutes: z.ZodDefault<z.ZodNumber>;
    featured: z.ZodOptional<z.ZodBoolean>;
    workflow: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        nodes: z.ZodArray<z.ZodEffects<z.ZodObject<{
            id: z.ZodOptional<z.ZodString>;
            type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
            label: z.ZodOptional<z.ZodString>;
            config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            position: z.ZodDefault<z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>>;
            width: z.ZodOptional<z.ZodNumber>;
            height: z.ZodOptional<z.ZodNumber>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            id: z.ZodOptional<z.ZodString>;
            type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
            label: z.ZodOptional<z.ZodString>;
            config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            position: z.ZodDefault<z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>>;
            width: z.ZodOptional<z.ZodNumber>;
            height: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            id: z.ZodOptional<z.ZodString>;
            type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
            label: z.ZodOptional<z.ZodString>;
            config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            position: z.ZodDefault<z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>>;
            width: z.ZodOptional<z.ZodNumber>;
            height: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>, z.objectOutputType<{
            id: z.ZodOptional<z.ZodString>;
            type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
            label: z.ZodOptional<z.ZodString>;
            config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            position: z.ZodDefault<z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>>;
            width: z.ZodOptional<z.ZodNumber>;
            height: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            id: z.ZodOptional<z.ZodString>;
            type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
            label: z.ZodOptional<z.ZodString>;
            config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            position: z.ZodDefault<z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>>;
            width: z.ZodOptional<z.ZodNumber>;
            height: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">>, "many">;
        edges: z.ZodArray<z.ZodEffects<z.ZodObject<{
            id: z.ZodOptional<z.ZodString>;
            sourceNodeId: z.ZodOptional<z.ZodString>;
            targetNodeId: z.ZodOptional<z.ZodString>;
            source: z.ZodOptional<z.ZodString>;
            target: z.ZodOptional<z.ZodString>;
            sourceHandle: z.ZodOptional<z.ZodString>;
            targetHandle: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
            condition: z.ZodOptional<z.ZodUnknown>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            id: z.ZodOptional<z.ZodString>;
            sourceNodeId: z.ZodOptional<z.ZodString>;
            targetNodeId: z.ZodOptional<z.ZodString>;
            source: z.ZodOptional<z.ZodString>;
            target: z.ZodOptional<z.ZodString>;
            sourceHandle: z.ZodOptional<z.ZodString>;
            targetHandle: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
            condition: z.ZodOptional<z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            id: z.ZodOptional<z.ZodString>;
            sourceNodeId: z.ZodOptional<z.ZodString>;
            targetNodeId: z.ZodOptional<z.ZodString>;
            source: z.ZodOptional<z.ZodString>;
            target: z.ZodOptional<z.ZodString>;
            sourceHandle: z.ZodOptional<z.ZodString>;
            targetHandle: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
            condition: z.ZodOptional<z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">>, z.objectOutputType<{
            id: z.ZodOptional<z.ZodString>;
            sourceNodeId: z.ZodOptional<z.ZodString>;
            targetNodeId: z.ZodOptional<z.ZodString>;
            source: z.ZodOptional<z.ZodString>;
            target: z.ZodOptional<z.ZodString>;
            sourceHandle: z.ZodOptional<z.ZodString>;
            targetHandle: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
            condition: z.ZodOptional<z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            id: z.ZodOptional<z.ZodString>;
            sourceNodeId: z.ZodOptional<z.ZodString>;
            targetNodeId: z.ZodOptional<z.ZodString>;
            source: z.ZodOptional<z.ZodString>;
            target: z.ZodOptional<z.ZodString>;
            sourceHandle: z.ZodOptional<z.ZodString>;
            targetHandle: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
            condition: z.ZodOptional<z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">>, "many">;
    }, "strip", z.ZodTypeAny, {
        nodes: z.objectOutputType<{
            id: z.ZodOptional<z.ZodString>;
            type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
            label: z.ZodOptional<z.ZodString>;
            config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            position: z.ZodDefault<z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>>;
            width: z.ZodOptional<z.ZodNumber>;
            height: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">[];
        edges: z.objectOutputType<{
            id: z.ZodOptional<z.ZodString>;
            sourceNodeId: z.ZodOptional<z.ZodString>;
            targetNodeId: z.ZodOptional<z.ZodString>;
            source: z.ZodOptional<z.ZodString>;
            target: z.ZodOptional<z.ZodString>;
            sourceHandle: z.ZodOptional<z.ZodString>;
            targetHandle: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
            condition: z.ZodOptional<z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">[];
        name: string;
        description: string;
    }, {
        nodes: z.objectInputType<{
            id: z.ZodOptional<z.ZodString>;
            type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
            label: z.ZodOptional<z.ZodString>;
            config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            position: z.ZodDefault<z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>>;
            width: z.ZodOptional<z.ZodNumber>;
            height: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">[];
        edges: z.objectInputType<{
            id: z.ZodOptional<z.ZodString>;
            sourceNodeId: z.ZodOptional<z.ZodString>;
            targetNodeId: z.ZodOptional<z.ZodString>;
            source: z.ZodOptional<z.ZodString>;
            target: z.ZodOptional<z.ZodString>;
            sourceHandle: z.ZodOptional<z.ZodString>;
            targetHandle: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
            condition: z.ZodOptional<z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">[];
        name: string;
        description?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    description: string;
    category: string;
    tags: string[];
    connectors: string[];
    difficulty: "Iniciante" | "Intermediário" | "Avançado";
    estimatedSetupMinutes: number;
    workflow: {
        nodes: z.objectOutputType<{
            id: z.ZodOptional<z.ZodString>;
            type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
            label: z.ZodOptional<z.ZodString>;
            config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            position: z.ZodDefault<z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>>;
            width: z.ZodOptional<z.ZodNumber>;
            height: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">[];
        edges: z.objectOutputType<{
            id: z.ZodOptional<z.ZodString>;
            sourceNodeId: z.ZodOptional<z.ZodString>;
            targetNodeId: z.ZodOptional<z.ZodString>;
            source: z.ZodOptional<z.ZodString>;
            target: z.ZodOptional<z.ZodString>;
            sourceHandle: z.ZodOptional<z.ZodString>;
            targetHandle: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
            condition: z.ZodOptional<z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">[];
        name: string;
        description: string;
    };
    icon?: string | undefined;
    color?: string | undefined;
    featured?: boolean | undefined;
}, {
    id: string;
    name: string;
    description: string;
    category: string;
    tags: string[];
    connectors: string[];
    workflow: {
        nodes: z.objectInputType<{
            id: z.ZodOptional<z.ZodString>;
            type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
            label: z.ZodOptional<z.ZodString>;
            config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            position: z.ZodDefault<z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>>;
            width: z.ZodOptional<z.ZodNumber>;
            height: z.ZodOptional<z.ZodNumber>;
        }, z.ZodTypeAny, "passthrough">[];
        edges: z.objectInputType<{
            id: z.ZodOptional<z.ZodString>;
            sourceNodeId: z.ZodOptional<z.ZodString>;
            targetNodeId: z.ZodOptional<z.ZodString>;
            source: z.ZodOptional<z.ZodString>;
            target: z.ZodOptional<z.ZodString>;
            sourceHandle: z.ZodOptional<z.ZodString>;
            targetHandle: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
            condition: z.ZodOptional<z.ZodUnknown>;
        }, z.ZodTypeAny, "passthrough">[];
        name: string;
        description?: string | undefined;
    };
    icon?: string | undefined;
    color?: string | undefined;
    difficulty?: "Iniciante" | "Intermediário" | "Avançado" | undefined;
    estimatedSetupMinutes?: number | undefined;
    featured?: boolean | undefined;
}>;
export type WorkflowTemplate = z.infer<typeof workflowTemplateSchema>;
export declare const cloneTemplateSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    description?: string | undefined;
}, {
    name?: string | undefined;
    description?: string | undefined;
}>;
export declare const importTemplateSchema: z.ZodObject<{
    template: z.ZodUnion<[z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        category: z.ZodString;
        tags: z.ZodArray<z.ZodString, "many">;
        icon: z.ZodOptional<z.ZodString>;
        color: z.ZodOptional<z.ZodString>;
        connectors: z.ZodArray<z.ZodString, "many">;
        difficulty: z.ZodDefault<z.ZodEnum<["Iniciante", "Intermediário", "Avançado"]>>;
        estimatedSetupMinutes: z.ZodDefault<z.ZodNumber>;
        featured: z.ZodOptional<z.ZodBoolean>;
        workflow: z.ZodObject<{
            name: z.ZodString;
            description: z.ZodDefault<z.ZodOptional<z.ZodString>>;
            nodes: z.ZodArray<z.ZodEffects<z.ZodObject<{
                id: z.ZodOptional<z.ZodString>;
                type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
                label: z.ZodOptional<z.ZodString>;
                config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                position: z.ZodDefault<z.ZodObject<{
                    x: z.ZodNumber;
                    y: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    x: number;
                    y: number;
                }, {
                    x: number;
                    y: number;
                }>>;
                width: z.ZodOptional<z.ZodNumber>;
                height: z.ZodOptional<z.ZodNumber>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodOptional<z.ZodString>;
                type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
                label: z.ZodOptional<z.ZodString>;
                config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                position: z.ZodDefault<z.ZodObject<{
                    x: z.ZodNumber;
                    y: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    x: number;
                    y: number;
                }, {
                    x: number;
                    y: number;
                }>>;
                width: z.ZodOptional<z.ZodNumber>;
                height: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodOptional<z.ZodString>;
                type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
                label: z.ZodOptional<z.ZodString>;
                config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                position: z.ZodDefault<z.ZodObject<{
                    x: z.ZodNumber;
                    y: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    x: number;
                    y: number;
                }, {
                    x: number;
                    y: number;
                }>>;
                width: z.ZodOptional<z.ZodNumber>;
                height: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>, z.objectOutputType<{
                id: z.ZodOptional<z.ZodString>;
                type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
                label: z.ZodOptional<z.ZodString>;
                config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                position: z.ZodDefault<z.ZodObject<{
                    x: z.ZodNumber;
                    y: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    x: number;
                    y: number;
                }, {
                    x: number;
                    y: number;
                }>>;
                width: z.ZodOptional<z.ZodNumber>;
                height: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodOptional<z.ZodString>;
                type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
                label: z.ZodOptional<z.ZodString>;
                config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                position: z.ZodDefault<z.ZodObject<{
                    x: z.ZodNumber;
                    y: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    x: number;
                    y: number;
                }, {
                    x: number;
                    y: number;
                }>>;
                width: z.ZodOptional<z.ZodNumber>;
                height: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">>, "many">;
            edges: z.ZodArray<z.ZodEffects<z.ZodObject<{
                id: z.ZodOptional<z.ZodString>;
                sourceNodeId: z.ZodOptional<z.ZodString>;
                targetNodeId: z.ZodOptional<z.ZodString>;
                source: z.ZodOptional<z.ZodString>;
                target: z.ZodOptional<z.ZodString>;
                sourceHandle: z.ZodOptional<z.ZodString>;
                targetHandle: z.ZodOptional<z.ZodString>;
                label: z.ZodOptional<z.ZodString>;
                condition: z.ZodOptional<z.ZodUnknown>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                id: z.ZodOptional<z.ZodString>;
                sourceNodeId: z.ZodOptional<z.ZodString>;
                targetNodeId: z.ZodOptional<z.ZodString>;
                source: z.ZodOptional<z.ZodString>;
                target: z.ZodOptional<z.ZodString>;
                sourceHandle: z.ZodOptional<z.ZodString>;
                targetHandle: z.ZodOptional<z.ZodString>;
                label: z.ZodOptional<z.ZodString>;
                condition: z.ZodOptional<z.ZodUnknown>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodOptional<z.ZodString>;
                sourceNodeId: z.ZodOptional<z.ZodString>;
                targetNodeId: z.ZodOptional<z.ZodString>;
                source: z.ZodOptional<z.ZodString>;
                target: z.ZodOptional<z.ZodString>;
                sourceHandle: z.ZodOptional<z.ZodString>;
                targetHandle: z.ZodOptional<z.ZodString>;
                label: z.ZodOptional<z.ZodString>;
                condition: z.ZodOptional<z.ZodUnknown>;
            }, z.ZodTypeAny, "passthrough">>, z.objectOutputType<{
                id: z.ZodOptional<z.ZodString>;
                sourceNodeId: z.ZodOptional<z.ZodString>;
                targetNodeId: z.ZodOptional<z.ZodString>;
                source: z.ZodOptional<z.ZodString>;
                target: z.ZodOptional<z.ZodString>;
                sourceHandle: z.ZodOptional<z.ZodString>;
                targetHandle: z.ZodOptional<z.ZodString>;
                label: z.ZodOptional<z.ZodString>;
                condition: z.ZodOptional<z.ZodUnknown>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                id: z.ZodOptional<z.ZodString>;
                sourceNodeId: z.ZodOptional<z.ZodString>;
                targetNodeId: z.ZodOptional<z.ZodString>;
                source: z.ZodOptional<z.ZodString>;
                target: z.ZodOptional<z.ZodString>;
                sourceHandle: z.ZodOptional<z.ZodString>;
                targetHandle: z.ZodOptional<z.ZodString>;
                label: z.ZodOptional<z.ZodString>;
                condition: z.ZodOptional<z.ZodUnknown>;
            }, z.ZodTypeAny, "passthrough">>, "many">;
        }, "strip", z.ZodTypeAny, {
            nodes: z.objectOutputType<{
                id: z.ZodOptional<z.ZodString>;
                type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
                label: z.ZodOptional<z.ZodString>;
                config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                position: z.ZodDefault<z.ZodObject<{
                    x: z.ZodNumber;
                    y: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    x: number;
                    y: number;
                }, {
                    x: number;
                    y: number;
                }>>;
                width: z.ZodOptional<z.ZodNumber>;
                height: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">[];
            edges: z.objectOutputType<{
                id: z.ZodOptional<z.ZodString>;
                sourceNodeId: z.ZodOptional<z.ZodString>;
                targetNodeId: z.ZodOptional<z.ZodString>;
                source: z.ZodOptional<z.ZodString>;
                target: z.ZodOptional<z.ZodString>;
                sourceHandle: z.ZodOptional<z.ZodString>;
                targetHandle: z.ZodOptional<z.ZodString>;
                label: z.ZodOptional<z.ZodString>;
                condition: z.ZodOptional<z.ZodUnknown>;
            }, z.ZodTypeAny, "passthrough">[];
            name: string;
            description: string;
        }, {
            nodes: z.objectInputType<{
                id: z.ZodOptional<z.ZodString>;
                type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
                label: z.ZodOptional<z.ZodString>;
                config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                position: z.ZodDefault<z.ZodObject<{
                    x: z.ZodNumber;
                    y: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    x: number;
                    y: number;
                }, {
                    x: number;
                    y: number;
                }>>;
                width: z.ZodOptional<z.ZodNumber>;
                height: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">[];
            edges: z.objectInputType<{
                id: z.ZodOptional<z.ZodString>;
                sourceNodeId: z.ZodOptional<z.ZodString>;
                targetNodeId: z.ZodOptional<z.ZodString>;
                source: z.ZodOptional<z.ZodString>;
                target: z.ZodOptional<z.ZodString>;
                sourceHandle: z.ZodOptional<z.ZodString>;
                targetHandle: z.ZodOptional<z.ZodString>;
                label: z.ZodOptional<z.ZodString>;
                condition: z.ZodOptional<z.ZodUnknown>;
            }, z.ZodTypeAny, "passthrough">[];
            name: string;
            description?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        description: string;
        category: string;
        tags: string[];
        connectors: string[];
        difficulty: "Iniciante" | "Intermediário" | "Avançado";
        estimatedSetupMinutes: number;
        workflow: {
            nodes: z.objectOutputType<{
                id: z.ZodOptional<z.ZodString>;
                type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
                label: z.ZodOptional<z.ZodString>;
                config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                position: z.ZodDefault<z.ZodObject<{
                    x: z.ZodNumber;
                    y: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    x: number;
                    y: number;
                }, {
                    x: number;
                    y: number;
                }>>;
                width: z.ZodOptional<z.ZodNumber>;
                height: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">[];
            edges: z.objectOutputType<{
                id: z.ZodOptional<z.ZodString>;
                sourceNodeId: z.ZodOptional<z.ZodString>;
                targetNodeId: z.ZodOptional<z.ZodString>;
                source: z.ZodOptional<z.ZodString>;
                target: z.ZodOptional<z.ZodString>;
                sourceHandle: z.ZodOptional<z.ZodString>;
                targetHandle: z.ZodOptional<z.ZodString>;
                label: z.ZodOptional<z.ZodString>;
                condition: z.ZodOptional<z.ZodUnknown>;
            }, z.ZodTypeAny, "passthrough">[];
            name: string;
            description: string;
        };
        icon?: string | undefined;
        color?: string | undefined;
        featured?: boolean | undefined;
    }, {
        id: string;
        name: string;
        description: string;
        category: string;
        tags: string[];
        connectors: string[];
        workflow: {
            nodes: z.objectInputType<{
                id: z.ZodOptional<z.ZodString>;
                type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
                label: z.ZodOptional<z.ZodString>;
                config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                position: z.ZodDefault<z.ZodObject<{
                    x: z.ZodNumber;
                    y: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    x: number;
                    y: number;
                }, {
                    x: number;
                    y: number;
                }>>;
                width: z.ZodOptional<z.ZodNumber>;
                height: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">[];
            edges: z.objectInputType<{
                id: z.ZodOptional<z.ZodString>;
                sourceNodeId: z.ZodOptional<z.ZodString>;
                targetNodeId: z.ZodOptional<z.ZodString>;
                source: z.ZodOptional<z.ZodString>;
                target: z.ZodOptional<z.ZodString>;
                sourceHandle: z.ZodOptional<z.ZodString>;
                targetHandle: z.ZodOptional<z.ZodString>;
                label: z.ZodOptional<z.ZodString>;
                condition: z.ZodOptional<z.ZodUnknown>;
            }, z.ZodTypeAny, "passthrough">[];
            name: string;
            description?: string | undefined;
        };
        icon?: string | undefined;
        color?: string | undefined;
        difficulty?: "Iniciante" | "Intermediário" | "Avançado" | undefined;
        estimatedSetupMinutes?: number | undefined;
        featured?: boolean | undefined;
    }>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>;
    name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    template: Record<string, unknown> | {
        id: string;
        name: string;
        description: string;
        category: string;
        tags: string[];
        connectors: string[];
        difficulty: "Iniciante" | "Intermediário" | "Avançado";
        estimatedSetupMinutes: number;
        workflow: {
            nodes: z.objectOutputType<{
                id: z.ZodOptional<z.ZodString>;
                type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
                label: z.ZodOptional<z.ZodString>;
                config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                position: z.ZodDefault<z.ZodObject<{
                    x: z.ZodNumber;
                    y: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    x: number;
                    y: number;
                }, {
                    x: number;
                    y: number;
                }>>;
                width: z.ZodOptional<z.ZodNumber>;
                height: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">[];
            edges: z.objectOutputType<{
                id: z.ZodOptional<z.ZodString>;
                sourceNodeId: z.ZodOptional<z.ZodString>;
                targetNodeId: z.ZodOptional<z.ZodString>;
                source: z.ZodOptional<z.ZodString>;
                target: z.ZodOptional<z.ZodString>;
                sourceHandle: z.ZodOptional<z.ZodString>;
                targetHandle: z.ZodOptional<z.ZodString>;
                label: z.ZodOptional<z.ZodString>;
                condition: z.ZodOptional<z.ZodUnknown>;
            }, z.ZodTypeAny, "passthrough">[];
            name: string;
            description: string;
        };
        icon?: string | undefined;
        color?: string | undefined;
        featured?: boolean | undefined;
    };
    name?: string | undefined;
}, {
    template: Record<string, unknown> | {
        id: string;
        name: string;
        description: string;
        category: string;
        tags: string[];
        connectors: string[];
        workflow: {
            nodes: z.objectInputType<{
                id: z.ZodOptional<z.ZodString>;
                type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "cronTrigger", "manual", "http", "httpRequest", "postgres", "postgresql", "redis", "mongo", "mongodb", "email", "discord", "telegram", "telegramTrigger", "slack", "slackTrigger", "sheets", "googleSheets", "googleDrive", "drive", "gmail", "googleGmail", "gmailTrigger", "ai", "ai_agent", "llm_model", "llm_chain", "vector_store", "execute_workflow", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook", "teams", "whatsapp", "whatsappTrigger", "googleCalendar", "googleDocs", "evaluationTrigger", "emailReadImap", "errorTrigger"]>;
                label: z.ZodOptional<z.ZodString>;
                config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                position: z.ZodDefault<z.ZodObject<{
                    x: z.ZodNumber;
                    y: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    x: number;
                    y: number;
                }, {
                    x: number;
                    y: number;
                }>>;
                width: z.ZodOptional<z.ZodNumber>;
                height: z.ZodOptional<z.ZodNumber>;
            }, z.ZodTypeAny, "passthrough">[];
            edges: z.objectInputType<{
                id: z.ZodOptional<z.ZodString>;
                sourceNodeId: z.ZodOptional<z.ZodString>;
                targetNodeId: z.ZodOptional<z.ZodString>;
                source: z.ZodOptional<z.ZodString>;
                target: z.ZodOptional<z.ZodString>;
                sourceHandle: z.ZodOptional<z.ZodString>;
                targetHandle: z.ZodOptional<z.ZodString>;
                label: z.ZodOptional<z.ZodString>;
                condition: z.ZodOptional<z.ZodUnknown>;
            }, z.ZodTypeAny, "passthrough">[];
            name: string;
            description?: string | undefined;
        };
        icon?: string | undefined;
        color?: string | undefined;
        difficulty?: "Iniciante" | "Intermediário" | "Avançado" | undefined;
        estimatedSetupMinutes?: number | undefined;
        featured?: boolean | undefined;
    };
    name?: string | undefined;
}>;
export declare const executeWorkflowSchema: z.ZodObject<{
    input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    trigger: z.ZodDefault<z.ZodEnum<["manual", "webhook", "cron", "api"]>>;
}, "strip", z.ZodTypeAny, {
    trigger: "webhook" | "cron" | "manual" | "api";
    input?: Record<string, unknown> | undefined;
}, {
    input?: Record<string, unknown> | undefined;
    trigger?: "webhook" | "cron" | "manual" | "api" | undefined;
}>;
export declare const credentialBucketSchema: z.ZodEnum<["api_key", "bearer_token", "basic_auth", "oauth2_managed", "oauth2_custom", "header_auth", "query_auth", "mcp_oauth2", "oauth2", "basic", "token", "digest_auth", "custom_headers", "aws_iam", "certificate_auth", "database_connection"]>;
export declare const createCredentialSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodUnion<[z.ZodEnum<["api_key", "bearer_token", "basic_auth", "oauth2_managed", "oauth2_custom", "header_auth", "query_auth", "mcp_oauth2", "oauth2", "basic", "token", "digest_auth", "custom_headers", "aws_iam", "certificate_auth", "database_connection"]>, z.ZodString]>;
    provider: z.ZodString;
    data: z.ZodRecord<z.ZodString, z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    data: Record<string, any>;
    type: string;
    name: string;
    provider: string;
}, {
    data: Record<string, any>;
    type: string;
    name: string;
    provider: string;
}>;
export declare const createWebhookSchema: z.ZodObject<{
    path: z.ZodString;
    method: z.ZodDefault<z.ZodEnum<["GET", "POST", "PUT", "DELETE"]>>;
    workflowId: z.ZodOptional<z.ZodString>;
    secret: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE";
    workflowId?: string | undefined;
    secret?: string | undefined;
}, {
    path: string;
    method?: "GET" | "POST" | "PUT" | "DELETE" | undefined;
    workflowId?: string | undefined;
    secret?: string | undefined;
}>;
export declare const generateWorkflowSchema: z.ZodObject<{
    description: z.ZodString;
}, "strip", z.ZodTypeAny, {
    description: string;
}, {
    description: string;
}>;
export declare const explainErrorSchema: z.ZodObject<{
    executionId: z.ZodString;
    nodeId: z.ZodOptional<z.ZodString>;
    error: z.ZodString;
}, "strip", z.ZodTypeAny, {
    executionId: string;
    error: string;
    nodeId?: string | undefined;
}, {
    executionId: string;
    error: string;
    nodeId?: string | undefined;
}>;
export declare const decideApprovalSchema: z.ZodObject<{
    decision: z.ZodEnum<["APPROVED", "REJECTED"]>;
    message: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    decision: "APPROVED" | "REJECTED";
    message?: string | undefined;
}, {
    decision: "APPROVED" | "REJECTED";
    message?: string | undefined;
}>;
export type ApiResponse<T> = {
    data: T;
    meta?: {
        total?: number;
        page?: number;
        limit?: number;
    };
};
export type ApiError = {
    error: string;
    code: string;
    details?: Record<string, string[]>;
};
export declare const PlanEnum: z.ZodEnum<["FREE", "STARTER", "BASIC", "GROWTH", "PRO", "ENTERPRISE"]>;
export declare const MemberRoleEnum: z.ZodEnum<["OWNER", "ADMIN", "MEMBER", "VIEWER"]>;
export declare const WorkflowStatusEnum: z.ZodEnum<["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]>;
export declare const ExecutionStatusEnum: z.ZodEnum<["PENDING", "RUNNING", "SUCCESS", "FAILED", "CANCELLED", "WAITING_APPROVAL"]>;
export type Plan = z.infer<typeof PlanEnum>;
export type MemberRole = z.infer<typeof MemberRoleEnum>;
export type WorkflowStatus = z.infer<typeof WorkflowStatusEnum>;
export type ExecutionStatus = z.infer<typeof ExecutionStatusEnum>;
export declare const NODE_TYPES: readonly [{
    readonly type: "webhook";
    readonly label: "Webhook";
    readonly icon: "Webhook";
    readonly color: "#6366f1";
}, {
    readonly type: "cron";
    readonly label: "Schedule";
    readonly icon: "Clock";
    readonly color: "#8b5cf6";
}, {
    readonly type: "http";
    readonly label: "HTTP Request";
    readonly icon: "Globe";
    readonly color: "#06b6d4";
}, {
    readonly type: "postgres";
    readonly label: "PostgreSQL";
    readonly icon: "Database";
    readonly color: "#336791";
}, {
    readonly type: "redis";
    readonly label: "Redis";
    readonly icon: "Database";
    readonly color: "#dc382d";
}, {
    readonly type: "mongo";
    readonly label: "MongoDB";
    readonly icon: "Database";
    readonly color: "#13aa52";
}, {
    readonly type: "email";
    readonly label: "Send Email";
    readonly icon: "Mail";
    readonly color: "#10b981";
}, {
    readonly type: "discord";
    readonly label: "Discord";
    readonly icon: "MessageSquare";
    readonly color: "#5865f2";
}, {
    readonly type: "telegram";
    readonly label: "Telegram";
    readonly icon: "Send";
    readonly color: "#229ed9";
}, {
    readonly type: "sheets";
    readonly label: "Google Sheets";
    readonly icon: "Table";
    readonly color: "#34a853";
}, {
    readonly type: "condition";
    readonly label: "Condition";
    readonly icon: "GitBranch";
    readonly color: "#f59e0b";
}, {
    readonly type: "transform";
    readonly label: "Transform";
    readonly icon: "Shuffle";
    readonly color: "#ec4899";
}, {
    readonly type: "delay";
    readonly label: "Delay";
    readonly icon: "Timer";
    readonly color: "#64748b";
}, {
    readonly type: "code";
    readonly label: "Code Sandbox";
    readonly icon: "Code";
    readonly color: "#0ea5e9";
}, {
    readonly type: "ai_agent";
    readonly label: "AI Agent";
    readonly icon: "Brain";
    readonly color: "#a855f7";
}, {
    readonly type: "llm_model";
    readonly label: "LLM Model";
    readonly icon: "Cpu";
    readonly color: "#a855f7";
}, {
    readonly type: "llm_chain";
    readonly label: "LLM Chain";
    readonly icon: "Boxes";
    readonly color: "#8b5cf6";
}, {
    readonly type: "vector_store";
    readonly label: "Vector Store";
    readonly icon: "Layers";
    readonly color: "#06b6d4";
}, {
    readonly type: "execute_workflow";
    readonly label: "Execute Workflow";
    readonly icon: "Workflow";
    readonly color: "#10b981";
}, {
    readonly type: "approval";
    readonly label: "Approval";
    readonly icon: "CheckCircle";
    readonly color: "#ef4444";
}, {
    readonly type: "merge";
    readonly label: "Merge";
    readonly icon: "Merge";
    readonly color: "#06b6d4";
}, {
    readonly type: "filter";
    readonly label: "Filter";
    readonly icon: "Filter";
    readonly color: "#f97316";
}, {
    readonly type: "set_fields";
    readonly label: "Set Fields";
    readonly icon: "Pencil";
    readonly color: "#14b8a6";
}, {
    readonly type: "respond_webhook";
    readonly label: "Respond Webhook";
    readonly icon: "Reply";
    readonly color: "#8b5cf6";
}, {
    readonly type: "gmailTrigger";
    readonly label: "Gmail Trigger";
    readonly icon: "Mail";
    readonly color: "#ea4335";
}, {
    readonly type: "googleDrive";
    readonly label: "Google Drive";
    readonly icon: "HardDrive";
    readonly color: "#34a853";
}, {
    readonly type: "drive";
    readonly label: "Drive";
    readonly icon: "HardDrive";
    readonly color: "#34a853";
}, {
    readonly type: "evaluationTrigger";
    readonly label: "Evaluation Trigger";
    readonly icon: "ClipboardCheck";
    readonly color: "#f59e0b";
}, {
    readonly type: "emailReadImap";
    readonly label: "IMAP Email";
    readonly icon: "Mail";
    readonly color: "#06b6d4";
}, {
    readonly type: "gmail";
    readonly label: "Gmail";
    readonly icon: "Mail";
    readonly color: "#ea4335";
}, {
    readonly type: "googleGmail";
    readonly label: "Google Gmail";
    readonly icon: "Mail";
    readonly color: "#ea4335";
}, {
    readonly type: "googleSheets";
    readonly label: "Google Sheets";
    readonly icon: "Table";
    readonly color: "#34a853";
}, {
    readonly type: "slack";
    readonly label: "Slack";
    readonly icon: "MessageSquare";
    readonly color: "#4a154b";
}, {
    readonly type: "slackTrigger";
    readonly label: "Slack Trigger";
    readonly icon: "Zap";
    readonly color: "#4a154b";
}, {
    readonly type: "telegramTrigger";
    readonly label: "Telegram Trigger";
    readonly icon: "Zap";
    readonly color: "#229ed9";
}, {
    readonly type: "cronTrigger";
    readonly label: "Cron Trigger";
    readonly icon: "Clock";
    readonly color: "#8b5cf6";
}, {
    readonly type: "teams";
    readonly label: "Microsoft Teams";
    readonly icon: "MessageSquare";
    readonly color: "#6264a7";
}, {
    readonly type: "whatsapp";
    readonly label: "WhatsApp Cloud API";
    readonly icon: "MessageCircle";
    readonly color: "#25d366";
}, {
    readonly type: "whatsappTrigger";
    readonly label: "WhatsApp Trigger";
    readonly icon: "Zap";
    readonly color: "#25d366";
}, {
    readonly type: "googleCalendar";
    readonly label: "Google Calendar";
    readonly icon: "Calendar";
    readonly color: "#4285f4";
}, {
    readonly type: "googleDocs";
    readonly label: "Google Docs";
    readonly icon: "FileText";
    readonly color: "#4285f4";
}, {
    readonly type: "errorTrigger";
    readonly label: "Error Trigger";
    readonly icon: "AlertTriangle";
    readonly color: "#ef4444";
}];
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type SaveWorkflowCanvasInput = z.infer<typeof saveWorkflowCanvasSchema>;
export type WorkflowDiffQuery = z.infer<typeof workflowDiffQuerySchema>;
export type RollbackWorkflowInput = z.infer<typeof rollbackWorkflowSchema>;
export type AuditEventInput = z.infer<typeof auditEventSchema>;
export type NodeConfigInput = z.infer<typeof nodeConfigSchema>;
export type EdgeConfigInput = z.infer<typeof edgeConfigSchema>;
export type ExecuteWorkflowInput = z.infer<typeof executeWorkflowSchema>;
export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;
export type CredentialBucket = z.infer<typeof credentialBucketSchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type GenerateWorkflowInput = z.infer<typeof generateWorkflowSchema>;
export type ExplainErrorInput = z.infer<typeof explainErrorSchema>;
export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;
export type GeneratedWorkflow = z.infer<typeof generatedWorkflowSchema>;
export type CloneTemplateInput = z.infer<typeof cloneTemplateSchema>;
export type ImportTemplateInput = z.infer<typeof importTemplateSchema>;
export type PlanLimits = {
    executionsPerMonth: number;
    workflows: number;
    aiCallsPerMonth: number;
    members: number;
    concurrency: number;
    dataRetentionDays: number;
};
export type MetricUsage = {
    used: number;
    limit: number;
    remaining: number;
    percentage: number;
};
export type OrgUsageSummary = {
    orgId: string;
    plan: string;
    periodStart: string;
    periodEnd: string;
    limits: PlanLimits;
    metrics: {
        executions: MetricUsage;
        aiCalls: MetricUsage;
        workflows: MetricUsage;
        members: MetricUsage;
    };
};
export type UsageType = "execution" | "ai_call" | "integration_call" | "webhook_call";
export interface RecordUsageParams {
    orgId: string;
    userId?: string;
    type: UsageType | string;
    quantity?: number;
    metadata?: Record<string, unknown>;
}
export interface TraceContext {
    traceId: string;
    spanId: string;
    traceFlags: string;
    traceState?: string;
}
export type SpanStatusCode = "UNSET" | "OK" | "ERROR";
export interface SpanData {
    name: string;
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    startTime: number;
    endTime?: number;
    durationMs?: number;
    attributes: Record<string, string | number | boolean>;
    status: {
        code: SpanStatusCode;
        description?: string;
    };
    events: Array<{
        name: string;
        timestamp: number;
        attributes?: Record<string, unknown>;
    }>;
}
export interface TelemetryStats {
    service: string;
    timestamp: string;
    activeExecutions: number;
    counters: {
        httpRequests: number;
        workflowExecutions: number;
        aiGenerations: number;
    };
    spansRecorded: number;
}
export interface NodeTrace {
    id: string;
    nodeId: string;
    status: string;
    input?: unknown;
    output?: unknown;
    error?: string | null;
    startedAt: Date | string;
    finishedAt?: Date | string | null;
    duration?: number | null;
}
export interface ExecutionTrace {
    executionId: string;
    status: string;
    startedAt: Date | string;
    finishedAt?: Date | string | null;
    duration?: number | null;
    traces: NodeTrace[];
}
//# sourceMappingURL=index.d.ts.map