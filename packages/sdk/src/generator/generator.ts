export type JsonSchema = Record<string, any>;
export type Operation = Record<string, any>;

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

export interface ExtractedOperation {
  id: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
  operation: Operation;
  pathItem: Operation;
  requiresAuth: boolean;
}

export const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head"]);

export function identifier(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[A-Za-z_$]/.test(normalized) ? normalized : `_${normalized}`;
}

export function toPythonIdentifier(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9_]/g, "_");
  // Convert camelCase to snake_case
  const snake = clean.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  const res = snake.replace(/__+/g, "_");
  const reserved = new Set([
    "and", "as", "assert", "async", "await", "break", "class", "continue",
    "def", "del", "elif", "else", "except", "finally", "for", "from",
    "global", "if", "import", "in", "is", "lambda", "nonlocal", "not",
    "or", "pass", "raise", "return", "try", "while", "with", "yield",
    "none", "true", "false", "type", "id", "input", "format"
  ]);
  const finalId = reserved.has(res) ? `${res}_` : res;
  return /^[A-Za-z_]/.test(finalId) ? finalId : `_${finalId}`;
}

export function toPascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function operationId(method: string, path: string): string {
  const pieces = path.split("/").filter(Boolean).map((piece) => {
    const parameter = /^\{(.+)\}$/.exec(piece);
    const raw = parameter ? `by-${parameter[1]}` : piece;
    return raw.split(/[^A-Za-z0-9]+/).filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  });
  return identifier(method.toLowerCase() + pieces.join(""));
}

export function refName(ref: string): string {
  return ref.split("/").at(-1) ?? "Unknown";
}

export function extractOperations(doc: OpenApiDocument): ExtractedOperation[] {
  const operations: ExtractedOperation[] = [];

  for (const [path, rawPathItem] of Object.entries(doc.paths || {}).sort(([a], [b]) => a.localeCompare(b))) {
    const pathItem = (rawPathItem || {}) as Operation;
    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase()) || !rawOperation || typeof rawOperation !== "object") continue;
      const operation = rawOperation as Operation;
      const id = operation.operationId ?? operationId(method, path);
      const requiresAuth = Array.isArray(operation.security) && operation.security.length > 0;
      operations.push({
        id,
        method: method.toUpperCase(),
        path,
        summary: operation.summary,
        description: operation.description,
        tags: operation.tags,
        operation,
        pathItem,
        requiresAuth,
      });
    }
  }

  return operations.sort((a, b) => a.id.localeCompare(b.id));
}

export function parametersFor(operation: Operation, pathItem: Operation, location: "path" | "query"): JsonSchema[] {
  return [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]
    .filter((parameter: JsonSchema) => parameter && parameter.in === location && typeof parameter.name === "string");
}

export function requestBodySchema(operation: Operation): unknown {
  return operation.requestBody?.content?.["application/json"]?.schema;
}

export function responseSchema(operation: Operation): unknown {
  for (const [status, response] of Object.entries(operation.responses ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^2\d\d$/.test(status)) continue;
    return (response as JsonSchema)?.content?.["application/json"]?.schema;
  }
  return undefined;
}

export function schemaTypeToTs(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "unknown";
  const value = schema as JsonSchema;
  if (typeof value.$ref === "string") return `components["schemas"][${JSON.stringify(refName(value.$ref))}]`;
  if (value.const !== undefined) return JSON.stringify(value.const);
  if (Array.isArray(value.enum) && value.enum.length > 0) return value.enum.map((item: unknown) => JSON.stringify(item)).join(" | ");
  if (Array.isArray(value.oneOf)) return value.oneOf.map(schemaTypeToTs).join(" | ");
  if (Array.isArray(value.anyOf)) return value.anyOf.map(schemaTypeToTs).join(" | ");
  if (Array.isArray(value.allOf)) return value.allOf.map((item: unknown) => `(${schemaTypeToTs(item)})`).join(" & ");
  if (Array.isArray(value.type)) {
    return value.type.map((type: string) => type === "null" ? "null" : schemaTypeToTs({ ...value, type })).join(" | ");
  }

  let result: string;
  switch (value.type) {
    case "string": result = "string"; break;
    case "number":
    case "integer": result = "number"; break;
    case "boolean": result = "boolean"; break;
    case "null": result = "null"; break;
    case "array": result = `Array<${schemaTypeToTs(value.items)}>`; break;
    case "object":
    default: {
      if (value.properties || value.type === "object") {
        const required = new Set<string>(value.required ?? []);
        const properties = Object.entries(value.properties ?? {}).map(([name, child]) =>
          `${JSON.stringify(name)}${required.has(name) ? "" : "?"}: ${schemaTypeToTs(child)};`
        );
        if (value.additionalProperties) {
          properties.push(`[key: string]: ${value.additionalProperties === true ? "unknown" : schemaTypeToTs(value.additionalProperties)};`);
        }
        result = `{ ${properties.join(" ")} }`;
      } else {
        result = "unknown";
      }
    }
  }
  return value.nullable ? `${result} | null` : result;
}

export function zodSchemaString(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "z.unknown()";
  const value = schema as JsonSchema;
  if (typeof value.$ref === "string") {
    return `z.lazy(() => componentSchemas[${JSON.stringify(refName(value.$ref))}])`;
  }
  if (value.const !== undefined) return `z.literal(${JSON.stringify(value.const)})`;
  if (Array.isArray(value.enum) && value.enum.length > 0) {
    if (value.enum.length === 1) return `z.literal(${JSON.stringify(value.enum[0])})`;
    if (value.enum.every((item: unknown) => typeof item === "string")) {
      return `z.enum(${JSON.stringify(value.enum)} as [string, ...string[]])`;
    }
    return `z.union([${value.enum.map((item: unknown) => `z.literal(${JSON.stringify(item)})`).join(", ")}])`;
  }
  if (Array.isArray(value.oneOf) || Array.isArray(value.anyOf)) {
    const variants = (value.oneOf ?? value.anyOf).map(zodSchemaString);
    return variants.length === 1 ? variants[0] : `z.union([${variants.join(", ")}])`;
  }
  if (Array.isArray(value.allOf)) {
    const variants = value.allOf.map(zodSchemaString);
    return variants.reduce((left: string, right: string) => `z.intersection(${left}, ${right})`);
  }
  if (Array.isArray(value.type)) {
    const nullable = value.type.includes("null");
    const nonNull = value.type.filter((type: string) => type !== "null");
    const base = nonNull.length === 1
      ? zodSchemaString({ ...value, type: nonNull[0] })
      : `z.union([${nonNull.map((type: string) => zodSchemaString({ ...value, type })).join(", ")}])`;
    return nullable ? `${base}.nullable()` : base;
  }

  let result: string;
  switch (value.type) {
    case "string": {
      result = "z.string()";
      if (value.format === "email") result += ".email()";
      else if (value.format === "date-time") result += ".datetime()";
      if (typeof value.minLength === "number") result += `.min(${value.minLength})`;
      if (typeof value.maxLength === "number") result += `.max(${value.maxLength})`;
      if (typeof value.pattern === "string") result += `.regex(new RegExp(${JSON.stringify(value.pattern)}))`;
      break;
    }
    case "integer": result = "z.number().int()"; break;
    case "number": result = "z.number()"; break;
    case "boolean": result = "z.boolean()"; break;
    case "null": result = "z.null()"; break;
    case "array": result = `z.array(${zodSchemaString(value.items)})`; break;
    case "object":
    default: {
      if (value.properties || value.type === "object") {
        const required = new Set<string>(value.required ?? []);
        const properties = Object.entries(value.properties ?? {}).map(([name, child]) => {
          const childSchema = zodSchemaString(child);
          return `${JSON.stringify(name)}: ${required.has(name) ? childSchema : `${childSchema}.optional()`}`;
        });
        result = `z.object({ ${properties.join(", ")} })`;
        if (value.additionalProperties) {
          result += `.catchall(${value.additionalProperties === true ? "z.unknown()" : zodSchemaString(value.additionalProperties)})`;
        } else {
          result += ".strip()";
        }
      } else {
        result = "z.unknown()";
      }
    }
  }
  return value.nullable ? `${result}.nullable()` : result;
}

export function schemaTypeToPython(schema: unknown, options: { rootSchemas?: Record<string, unknown> } = {}): string {
  if (!schema || typeof schema !== "object") return "Any";
  const value = schema as JsonSchema;
  if (typeof value.$ref === "string") {
    return refName(value.$ref);
  }
  if (value.const !== undefined) {
    return `Literal[${JSON.stringify(value.const)}]`;
  }
  if (Array.isArray(value.enum) && value.enum.length > 0) {
    return `Literal[${value.enum.map((item: unknown) => JSON.stringify(item)).join(", ")}]`;
  }
  if (Array.isArray(value.oneOf) || Array.isArray(value.anyOf)) {
    const variants = (value.oneOf ?? value.anyOf).map((v: unknown) => schemaTypeToPython(v, options));
    return `Union[${variants.join(", ")}]`;
  }
  if (Array.isArray(value.allOf)) {
    const variants = value.allOf.map((v: unknown) => schemaTypeToPython(v, options));
    return variants.length === 1 ? variants[0] : `Union[${variants.join(", ")}]`;
  }
  if (Array.isArray(value.type)) {
    const nullable = value.type.includes("null");
    const nonNull = value.type.filter((t: string) => t !== "null");
    const base = nonNull.length === 1
      ? schemaTypeToPython({ ...value, type: nonNull[0] }, options)
      : `Union[${nonNull.map((t: string) => schemaTypeToPython({ ...value, type: t }, options)).join(", ")}]`;
    return nullable ? `Optional[${base}]` : base;
  }

  let result: string;
  switch (value.type) {
    case "string": result = "str"; break;
    case "integer": result = "int"; break;
    case "number": result = "float"; break;
    case "boolean": result = "bool"; break;
    case "null": result = "None"; break;
    case "array": result = `List[${schemaTypeToPython(value.items, options)}]`; break;
    case "object":
    default: {
      if (value.properties || value.type === "object") {
        result = "Dict[str, Any]";
      } else {
        result = "Any";
      }
    }
  }
  return value.nullable ? `Optional[${result}]` : result;
}

export function generateTypeScriptSource(doc: OpenApiDocument): string {
  const componentEntries = Object.entries(doc.components?.schemas ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const operations = extractOperations(doc);

  const operationTypeLines = operations.map(({ id, operation, pathItem }) => {
    const pathParameters = parametersFor(operation, pathItem, "path");
    const queryParameters = parametersFor(operation, pathItem, "query");
    const body = requestBodySchema(operation);
    const pathType = pathParameters.length === 0 ? "Record<string, never>" : `{ ${pathParameters.map((p) => `${JSON.stringify(p.name)}${p.required ? "" : "?"}: ${schemaTypeToTs(p.schema)};`).join(" ")} }`;
    const queryType = queryParameters.length === 0 ? "Record<string, never>" : `{ ${queryParameters.map((p) => `${JSON.stringify(p.name)}${p.required ? "" : "?"}: ${schemaTypeToTs(p.schema)};`).join(" ")} }`;
    return `    ${JSON.stringify(id)}: { request: { path: ${pathType}; query: ${queryType}; body: ${body ? schemaTypeToTs(body) : "undefined"}; }; response: ${schemaTypeToTs(responseSchema(operation))}; };`;
  });

  const manifestLines = operations.map(({ id, method, path, requiresAuth }) =>
    `  ${JSON.stringify(id)}: { method: ${JSON.stringify(method)}, path: ${JSON.stringify(path)}, requiresAuth: ${JSON.stringify(requiresAuth)} },`
  );

  const operationSchemaLines = operations.map(({ id, operation, pathItem }) => {
    const pathParameters = parametersFor(operation, pathItem, "path");
    const queryParameters = parametersFor(operation, pathItem, "query");
    const body = requestBodySchema(operation);
    const bodySchema = body ? zodSchemaString(body) : "z.undefined().optional()";
    const pathFields = pathParameters.map((p) => `${JSON.stringify(p.name)}: ${p.required ? zodSchemaString(p.schema) : `${zodSchemaString(p.schema)}.optional()`}`);
    const queryFields = queryParameters.map((p) => `${JSON.stringify(p.name)}: ${p.required ? zodSchemaString(p.schema) : `${zodSchemaString(p.schema)}.optional()`}`);
    const pathSchema = `z.object({ ${pathFields.join(", ")} }).strip()${pathParameters.length === 0 ? ".default({})" : ""}`;
    const querySchema = `z.object({ ${queryFields.join(", ")} }).strip()${queryParameters.length === 0 ? ".default({})" : ""}`;
    return `  ${JSON.stringify(id)}: z.object({ path: ${pathSchema}, query: ${querySchema}, body: ${bodySchema} }).strip(),`;
  });

  return `/* eslint-disable */
// Generated by @agentflow/sdk OpenAPI generator. Do not edit manually.
import { z } from "zod";

export interface components {
  schemas: {
${componentEntries.map(([name, schema]) => `    ${JSON.stringify(name)}: ${schemaTypeToTs(schema)};`).join("\n")}
  };
}

export interface operations {
${operationTypeLines.join("\n")}
}

export type OpenApiOperationId = keyof operations;
export type OperationRequest<Id extends OpenApiOperationId> = operations[Id]["request"];
export type OperationResponse<Id extends OpenApiOperationId> = operations[Id]["response"];

export const componentSchemas: Record<keyof components["schemas"], z.ZodTypeAny> = {
${componentEntries.map(([name, schema]) => `  ${JSON.stringify(name)}: ${zodSchemaString(schema)},`).join("\n")}
};

export const operationManifest = {
${manifestLines.join("\n")}
} as const satisfies Record<OpenApiOperationId, { method: string; path: string; requiresAuth: boolean }>;

export const operationSchemas: Record<OpenApiOperationId, z.ZodTypeAny> = {
${operationSchemaLines.join("\n")}
};
`;
}

export function generatePythonModels(doc: OpenApiDocument): string {
  const componentEntries = Object.entries(doc.components?.schemas ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const classBlocks: string[] = [];

  for (const [name, rawSchema] of componentEntries) {
    const schema = (rawSchema ?? {}) as JsonSchema;
    if (schema.type === "object" || schema.properties) {
      const required = new Set<string>(schema.required ?? []);
      const fieldLines: string[] = [];
      const props = Object.entries(schema.properties ?? {});
      if (props.length === 0) {
        fieldLines.push("    pass");
      } else {
        for (const [propName, rawChildSchema] of props) {
          const childSchema = (rawChildSchema ?? {}) as JsonSchema;
          const pyName = toPythonIdentifier(propName);
          const pyType = schemaTypeToPython(childSchema);
          const isReq = required.has(propName);
          const alias = pyName !== propName ? `, alias="${propName}"` : "";
          if (isReq && !childSchema.nullable && !pyType.startsWith("Optional[")) {
            fieldLines.push(`    ${pyName}: ${pyType} = Field(...${alias})`);
          } else {
            const optType = pyType.startsWith("Optional[") ? pyType : `Optional[${pyType}]`;
            fieldLines.push(`    ${pyName}: ${optType} = Field(default=None${alias})`);
          }
        }
      }

      classBlocks.push(`class ${name}(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
${fieldLines.join("\n")}
`);
    } else {
      const aliasType = schemaTypeToPython(schema);
      classBlocks.push(`${name} = ${aliasType}\n`);
    }
  }

  return `# Generated by @agentflow/sdk OpenAPI generator. Do not edit manually.
from __future__ import annotations
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field

${classBlocks.join("\n")}
`;
}

export function generatePythonClient(doc: OpenApiDocument): string {
  const operations = extractOperations(doc);

  const methodBlocks: string[] = [];

  for (const op of operations) {
    const pyMethodName = toPythonIdentifier(op.id);
    const pathParams = parametersFor(op.operation, op.pathItem, "path");
    const queryParams = parametersFor(op.operation, op.pathItem, "query");
    const body = requestBodySchema(op.operation);
    const response = responseSchema(op.operation);

    const args: string[] = ["self"];
    for (const p of pathParams) {
      args.push(`${toPythonIdentifier(p.name)}: ${schemaTypeToPython(p.schema)}`);
    }
    for (const q of queryParams) {
      const pyType = schemaTypeToPython(q.schema);
      const isReq = q.required;
      if (isReq) {
        args.push(`${toPythonIdentifier(q.name)}: ${pyType}`);
      } else {
        args.push(`${toPythonIdentifier(q.name)}: Optional[${pyType}] = None`);
      }
    }
    if (body) {
      args.push(`body: Optional[Union[${schemaTypeToPython(body)}, Dict[str, Any]]] = None`);
    }

    const returnType = response ? schemaTypeToPython(response) : "Any";
    const docstring = op.summary || op.description ? `        \"\"\"${op.summary ?? op.description}\"\"\"\n` : "";

    // Path formatting
    let pathExpr = JSON.stringify(op.path);
    for (const p of pathParams) {
      const pyPName = toPythonIdentifier(p.name);
      pathExpr = pathExpr.replace(`{${p.name}}`, `{${pyPName}}`);
    }
    pathExpr = `f${pathExpr}`;

    // Query params dict
    const queryItems = queryParams.map(q => {
      const pyQName = toPythonIdentifier(q.name);
      return `"${q.name}": ${pyQName}`;
    });
    const queryDictExpr = queryItems.length > 0
      ? `{k: v for k, v in {${queryItems.join(", ")}}.items() if v is not None}`
      : "None";

    const bodyExpr = body ? "body if isinstance(body, dict) else (body.model_dump(by_alias=True) if hasattr(body, 'model_dump') else body)" : "None";

    methodBlocks.push(`    def ${pyMethodName}(${args.join(", ")}) -> ${returnType}:
${docstring}        return self._request(
            method="${op.method}",
            path=${pathExpr},
            params=${queryDictExpr},
            json=${bodyExpr},
            requires_auth=${op.requiresAuth ? "True" : "False"},
        )
`);
  }

  return `# Generated by @agentflow/sdk OpenAPI generator. Do not edit manually.
from __future__ import annotations
from typing import Any, Dict, List, Literal, Optional, Union
import json
import urllib.request
import urllib.error
import urllib.parse
from .models import *

class AgentFlowApiError(Exception):
    def __init__(self, message: str, status_code: int = 500, error_code: str = "API_ERROR", details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details or {}

class AgentFlowClient:
    """AgentFlow Official Python Client generated from OpenAPI 3.1."""

    def __init__(
        self,
        base_url: str = "http://localhost:3001",
        token: Optional[str] = None,
        api_key: Optional[str] = None,
        org_id: Optional[str] = None,
        timeout: float = 30.0,
        headers: Optional[Dict[str, str]] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.api_key = api_key
        self.org_id = org_id
        self.timeout = timeout
        self.headers = headers or {}

    def set_token(self, token: Optional[str]) -> None:
        self.token = token

    def set_api_key(self, api_key: Optional[str]) -> None:
        self.api_key = api_key

    def set_org_id(self, org_id: Optional[str]) -> None:
        self.org_id = org_id

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Any] = None,
        requires_auth: bool = True,
    ) -> Any:
        url = f"{self.base_url}/{path.lstrip('/')}"
        if params:
            query = urllib.parse.urlencode({k: str(v) for k, v in params.items() if v is not None})
            if query:
                url = f"{url}?{query}"

        req_headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            **self.headers,
        }

        if requires_auth:
            if self.token:
                req_headers["Authorization"] = self.token if self.token.startswith("Bearer ") else f"Bearer {self.token}"
            elif self.api_key:
                req_headers["x-api-key"] = self.api_key
            if self.org_id:
                req_headers["x-org-id"] = self.org_id

        data = None
        if json is not None:
            data = urllib.request.json.dumps(json).encode("utf-8") if hasattr(urllib.request, "json") else __import__("json").dumps(json).encode("utf-8")

        req = urllib.request.Request(url=url, data=data, headers=req_headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                status = resp.getcode()
                if status == 204:
                    return None
                raw = resp.read().decode("utf-8")
                content_type = resp.headers.get("content-type", "")
                if "application/json" in content_type:
                    res_data = __import__("json").loads(raw)
                    if isinstance(res_data, dict) and res_data.get("jsonrpc") == "2.0" and "result" in res_data:
                        return res_data["result"]
                    return res_data
                return raw
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            try:
                payload = __import__("json").loads(err_body)
                msg = payload.get("error") or payload.get("message") or str(e)
                code = payload.get("code") or "HTTP_ERROR"
                details = payload.get("details")
                raise AgentFlowApiError(msg, status_code=e.code, error_code=code, details=details)
            except (ValueError, KeyError):
                raise AgentFlowApiError(err_body or str(e), status_code=e.code, error_code="HTTP_ERROR")
        except Exception as e:
            if isinstance(e, AgentFlowApiError):
                raise
            raise AgentFlowApiError(str(e), status_code=500, error_code="NETWORK_ERROR")

    def health(self) -> Dict[str, Any]:
        return self._request(method="GET", path="/health", requires_auth=False)

${methodBlocks.join("\n")}
`;
}
