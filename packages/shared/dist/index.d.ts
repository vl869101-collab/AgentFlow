import { z } from "zod";
export declare const signupSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    name: string;
}, {
    email: string;
    password: string;
    name: string;
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
export declare const workflowNodeTypeSchema: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "manual", "http", "email", "discord", "telegram", "sheets", "ai", "ai_agent", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "set_fields", "respond_webhook"]>;
export declare const nodeConfigSchema: z.ZodEffects<z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "manual", "http", "email", "discord", "telegram", "sheets", "ai", "ai_agent", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "set_fields", "respond_webhook"]>;
    label: z.ZodOptional<z.ZodString>;
    config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
    type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "manual", "http", "email", "discord", "telegram", "sheets", "ai", "ai_agent", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "set_fields", "respond_webhook"]>;
    label: z.ZodOptional<z.ZodString>;
    config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
    type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "manual", "http", "email", "discord", "telegram", "sheets", "ai", "ai_agent", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "set_fields", "respond_webhook"]>;
    label: z.ZodOptional<z.ZodString>;
    config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
    type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "manual", "http", "email", "discord", "telegram", "sheets", "ai", "ai_agent", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "set_fields", "respond_webhook"]>;
    label: z.ZodOptional<z.ZodString>;
    config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
    type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "manual", "http", "email", "discord", "telegram", "sheets", "ai", "ai_agent", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "set_fields", "respond_webhook"]>;
    label: z.ZodOptional<z.ZodString>;
    config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
    name?: string | undefined;
    status?: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED" | undefined;
    description?: string | undefined;
}, {
    name?: string | undefined;
    status?: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED" | undefined;
    description?: string | undefined;
}>;
export declare const saveWorkflowCanvasSchema: z.ZodObject<{
    nodes: z.ZodArray<z.ZodEffects<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "manual", "http", "email", "discord", "telegram", "sheets", "ai", "ai_agent", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "set_fields", "respond_webhook"]>;
        label: z.ZodOptional<z.ZodString>;
        config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "manual", "http", "email", "discord", "telegram", "sheets", "ai", "ai_agent", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "set_fields", "respond_webhook"]>;
        label: z.ZodOptional<z.ZodString>;
        config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "manual", "http", "email", "discord", "telegram", "sheets", "ai", "ai_agent", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "set_fields", "respond_webhook"]>;
        label: z.ZodOptional<z.ZodString>;
        config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "manual", "http", "email", "discord", "telegram", "sheets", "ai", "ai_agent", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "set_fields", "respond_webhook"]>;
        label: z.ZodOptional<z.ZodString>;
        config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "manual", "http", "email", "discord", "telegram", "sheets", "ai", "ai_agent", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "set_fields", "respond_webhook"]>;
        label: z.ZodOptional<z.ZodString>;
        config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "manual", "http", "email", "discord", "telegram", "sheets", "ai", "ai_agent", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "set_fields", "respond_webhook"]>;
        label: z.ZodOptional<z.ZodString>;
        config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "manual", "http", "email", "discord", "telegram", "sheets", "ai", "ai_agent", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "set_fields", "respond_webhook"]>;
        label: z.ZodOptional<z.ZodString>;
        config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
export declare const generatedWorkflowSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    nodes: z.ZodArray<z.ZodEffects<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["trigger", "action", "logic", "advanced", "webhook", "cron", "manual", "http", "email", "discord", "telegram", "sheets", "ai", "ai_agent", "condition", "transform", "delay", "code", "output", "approval", "merge", "filter", "set_fields", "respond_webhook"]>;
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
        type: "email" | "code" | "filter" | "trigger" | "action" | "logic" | "advanced" | "webhook" | "cron" | "manual" | "http" | "discord" | "telegram" | "sheets" | "ai" | "ai_agent" | "condition" | "transform" | "delay" | "output" | "approval" | "merge" | "set_fields" | "respond_webhook";
        id: string;
        config: Record<string, unknown>;
        position: {
            x: number;
            y: number;
        };
        label?: string | undefined;
        data?: Record<string, unknown> | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }, {
        type: "email" | "code" | "filter" | "trigger" | "action" | "logic" | "advanced" | "webhook" | "cron" | "manual" | "http" | "discord" | "telegram" | "sheets" | "ai" | "ai_agent" | "condition" | "transform" | "delay" | "output" | "approval" | "merge" | "set_fields" | "respond_webhook";
        id: string;
        position: {
            x: number;
            y: number;
        };
        label?: string | undefined;
        config?: Record<string, unknown> | undefined;
        data?: Record<string, unknown> | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }>, {
        type: "email" | "code" | "filter" | "trigger" | "action" | "logic" | "advanced" | "webhook" | "cron" | "manual" | "http" | "discord" | "telegram" | "sheets" | "ai" | "ai_agent" | "condition" | "transform" | "delay" | "output" | "approval" | "merge" | "set_fields" | "respond_webhook";
        id: string;
        config: Record<string, unknown>;
        position: {
            x: number;
            y: number;
        };
        label?: string | undefined;
        data?: Record<string, unknown> | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }, {
        type: "email" | "code" | "filter" | "trigger" | "action" | "logic" | "advanced" | "webhook" | "cron" | "manual" | "http" | "discord" | "telegram" | "sheets" | "ai" | "ai_agent" | "condition" | "transform" | "delay" | "output" | "approval" | "merge" | "set_fields" | "respond_webhook";
        id: string;
        position: {
            x: number;
            y: number;
        };
        label?: string | undefined;
        config?: Record<string, unknown> | undefined;
        data?: Record<string, unknown> | undefined;
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
        condition?: unknown;
        label?: string | undefined;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
        source?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
    }, {
        id: string;
        condition?: unknown;
        label?: string | undefined;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
        source?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
    }>, {
        id: string;
        condition?: unknown;
        label?: string | undefined;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
        source?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
    }, {
        id: string;
        condition?: unknown;
        label?: string | undefined;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
        source?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    nodes: {
        type: "email" | "code" | "filter" | "trigger" | "action" | "logic" | "advanced" | "webhook" | "cron" | "manual" | "http" | "discord" | "telegram" | "sheets" | "ai" | "ai_agent" | "condition" | "transform" | "delay" | "output" | "approval" | "merge" | "set_fields" | "respond_webhook";
        id: string;
        config: Record<string, unknown>;
        position: {
            x: number;
            y: number;
        };
        label?: string | undefined;
        data?: Record<string, unknown> | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }[];
    edges: {
        id: string;
        condition?: unknown;
        label?: string | undefined;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
        source?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
    }[];
}, {
    name: string;
    description: string;
    nodes: {
        type: "email" | "code" | "filter" | "trigger" | "action" | "logic" | "advanced" | "webhook" | "cron" | "manual" | "http" | "discord" | "telegram" | "sheets" | "ai" | "ai_agent" | "condition" | "transform" | "delay" | "output" | "approval" | "merge" | "set_fields" | "respond_webhook";
        id: string;
        position: {
            x: number;
            y: number;
        };
        label?: string | undefined;
        config?: Record<string, unknown> | undefined;
        data?: Record<string, unknown> | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }[];
    edges: {
        id: string;
        condition?: unknown;
        label?: string | undefined;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
        source?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
    }[];
}>, {
    name: string;
    description: string;
    nodes: {
        type: "email" | "code" | "filter" | "trigger" | "action" | "logic" | "advanced" | "webhook" | "cron" | "manual" | "http" | "discord" | "telegram" | "sheets" | "ai" | "ai_agent" | "condition" | "transform" | "delay" | "output" | "approval" | "merge" | "set_fields" | "respond_webhook";
        id: string;
        config: Record<string, unknown>;
        position: {
            x: number;
            y: number;
        };
        label?: string | undefined;
        data?: Record<string, unknown> | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }[];
    edges: {
        id: string;
        condition?: unknown;
        label?: string | undefined;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
        source?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
    }[];
}, {
    name: string;
    description: string;
    nodes: {
        type: "email" | "code" | "filter" | "trigger" | "action" | "logic" | "advanced" | "webhook" | "cron" | "manual" | "http" | "discord" | "telegram" | "sheets" | "ai" | "ai_agent" | "condition" | "transform" | "delay" | "output" | "approval" | "merge" | "set_fields" | "respond_webhook";
        id: string;
        position: {
            x: number;
            y: number;
        };
        label?: string | undefined;
        config?: Record<string, unknown> | undefined;
        data?: Record<string, unknown> | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }[];
    edges: {
        id: string;
        condition?: unknown;
        label?: string | undefined;
        sourceNodeId?: string | undefined;
        targetNodeId?: string | undefined;
        source?: string | undefined;
        target?: string | undefined;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
    }[];
}>;
export declare const executeWorkflowSchema: z.ZodObject<{
    input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    trigger: z.ZodDefault<z.ZodEnum<["manual", "webhook", "cron", "api"]>>;
}, "strip", z.ZodTypeAny, {
    trigger: "webhook" | "cron" | "manual" | "api";
    input?: Record<string, unknown> | undefined;
}, {
    trigger?: "webhook" | "cron" | "manual" | "api" | undefined;
    input?: Record<string, unknown> | undefined;
}>;
export declare const createCredentialSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodEnum<["api_key", "oauth2", "basic", "token"]>;
    provider: z.ZodString;
    data: z.ZodRecord<z.ZodString, z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    type: "api_key" | "oauth2" | "basic" | "token";
    data: Record<string, string>;
    provider: string;
}, {
    name: string;
    type: "api_key" | "oauth2" | "basic" | "token";
    data: Record<string, string>;
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
export declare const PlanEnum: z.ZodEnum<["FREE", "STARTER", "PRO", "ENTERPRISE"]>;
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
    readonly type: "ai_agent";
    readonly label: "AI Agent";
    readonly icon: "Brain";
    readonly color: "#a855f7";
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
}];
//# sourceMappingURL=index.d.ts.map