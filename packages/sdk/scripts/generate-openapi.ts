import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { openApiDocument } from "../../../apps/api/src/docs/openapi.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const generatedFile = resolve(packageDir, "src/generated/openapi.ts");
const snapshotFile = resolve(packageDir, "openapi/agentflow.openapi.json");
const checkOnly = process.argv.includes("--check");

const documentSchema = z.object({
  openapi: z.literal("3.1.0"),
  info: z.object({ title: z.string().min(1), version: z.string().min(1) }).passthrough(),
  paths: z.record(z.record(z.unknown())),
  components: z.object({ schemas: z.record(z.unknown()).optional() }).passthrough().optional(),
}).passthrough();

type JsonSchema = Record<string, any>;
type Operation = Record<string, any>;

// JSON round-trip strips library-only values and proves the served document is serializable.
const document = documentSchema.parse(JSON.parse(JSON.stringify(openApiDocument)));
const componentEntries = Object.entries(document.components?.schemas ?? {}).sort(([a], [b]) => a.localeCompare(b));
const methods = new Set(["get", "post", "put", "patch", "delete", "options", "head"]);

function identifier(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[A-Za-z_$]/.test(normalized) ? normalized : `_${normalized}`;
}

function operationId(method: string, path: string): string {
  const pieces = path.split("/").filter(Boolean).map((piece) => {
    const parameter = /^\{(.+)\}$/.exec(piece);
    const raw = parameter ? `by-${parameter[1]}` : piece;
    return raw.split(/[^A-Za-z0-9]+/).filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  });
  return identifier(method.toLowerCase() + pieces.join(""));
}

function refName(ref: string): string {
  return ref.split("/").at(-1) ?? "Unknown";
}

function schemaType(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "unknown";
  const value = schema as JsonSchema;
  if (typeof value.$ref === "string") return `components["schemas"][${JSON.stringify(refName(value.$ref))}]`;
  if (value.const !== undefined) return JSON.stringify(value.const);
  if (Array.isArray(value.enum) && value.enum.length > 0) return value.enum.map((item: unknown) => JSON.stringify(item)).join(" | ");
  if (Array.isArray(value.oneOf)) return value.oneOf.map(schemaType).join(" | ");
  if (Array.isArray(value.anyOf)) return value.anyOf.map(schemaType).join(" | ");
  if (Array.isArray(value.allOf)) return value.allOf.map((item: unknown) => `(${schemaType(item)})`).join(" & ");
  if (Array.isArray(value.type)) {
    return value.type.map((type: string) => type === "null" ? "null" : schemaType({ ...value, type })).join(" | ");
  }

  let result: string;
  switch (value.type) {
    case "string": result = "string"; break;
    case "number":
    case "integer": result = "number"; break;
    case "boolean": result = "boolean"; break;
    case "null": result = "null"; break;
    case "array": result = `Array<${schemaType(value.items)}>`; break;
    case "object":
    default: {
      if (value.properties || value.type === "object") {
        const required = new Set<string>(value.required ?? []);
        const properties = Object.entries(value.properties ?? {}).map(([name, child]) =>
          `${JSON.stringify(name)}${required.has(name) ? "" : "?"}: ${schemaType(child)};`
        );
        if (value.additionalProperties) {
          properties.push(`[key: string]: ${value.additionalProperties === true ? "unknown" : schemaType(value.additionalProperties)};`);
        }
        result = `{ ${properties.join(" ")} }`;
      } else {
        result = "unknown";
      }
    }
  }
  return value.nullable ? `${result} | null` : result;
}

function zodSchema(schema: unknown): string {
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
    const variants = (value.oneOf ?? value.anyOf).map(zodSchema);
    return variants.length === 1 ? variants[0] : `z.union([${variants.join(", ")}])`;
  }
  if (Array.isArray(value.allOf)) {
    const variants = value.allOf.map(zodSchema);
    return variants.reduce((left: string, right: string) => `z.intersection(${left}, ${right})`);
  }
  if (Array.isArray(value.type)) {
    const nullable = value.type.includes("null");
    const nonNull = value.type.filter((type: string) => type !== "null");
    const base = nonNull.length === 1
      ? zodSchema({ ...value, type: nonNull[0] })
      : `z.union([${nonNull.map((type: string) => zodSchema({ ...value, type })).join(", ")}])`;
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
    case "array": result = `z.array(${zodSchema(value.items)})`; break;
    case "object":
    default: {
      if (value.properties || value.type === "object") {
        const required = new Set<string>(value.required ?? []);
        const properties = Object.entries(value.properties ?? {}).map(([name, child]) => {
          const childSchema = zodSchema(child);
          return `${JSON.stringify(name)}: ${required.has(name) ? childSchema : `${childSchema}.optional()`}`;
        });
        result = `z.object({ ${properties.join(", ")} })`;
        if (value.additionalProperties) {
          result += `.catchall(${value.additionalProperties === true ? "z.unknown()" : zodSchema(value.additionalProperties)})`;
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

function parametersFor(operation: Operation, pathItem: Operation, location: "path" | "query") {
  return [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]
    .filter((parameter: JsonSchema) => parameter && parameter.in === location && typeof parameter.name === "string");
}

function requestBodySchema(operation: Operation): unknown {
  return operation.requestBody?.content?.["application/json"]?.schema;
}

function responseSchema(operation: Operation): unknown {
  for (const [status, response] of Object.entries(operation.responses ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^2\d\d$/.test(status)) continue;
    return (response as JsonSchema)?.content?.["application/json"]?.schema;
  }
  return undefined;
}

function objectTypeForParameters(parameters: JsonSchema[]): string {
  if (parameters.length === 0) return "Record<string, never>";
  return `{ ${parameters.map((parameter) =>
    `${JSON.stringify(parameter.name)}${parameter.required ? "" : "?"}: ${schemaType(parameter.schema)};`
  ).join(" ")} }`;
}

function objectZodForParameters(parameters: JsonSchema[]): string {
  const fields = parameters.map((parameter) => {
    const schema = zodSchema(parameter.schema);
    return `${JSON.stringify(parameter.name)}: ${parameter.required ? schema : `${schema}.optional()`}`;
  });
  return `z.object({ ${fields.join(", ")} }).strip()`;
}

const operations: Array<{
  id: string;
  method: string;
  path: string;
  operation: Operation;
  pathItem: Operation;
}> = [];

for (const [path, rawPathItem] of Object.entries(document.paths).sort(([a], [b]) => a.localeCompare(b))) {
  const pathItem = rawPathItem as Operation;
  for (const [method, rawOperation] of Object.entries(pathItem)) {
    if (!methods.has(method.toLowerCase()) || !rawOperation || typeof rawOperation !== "object") continue;
    const operation = rawOperation as Operation;
    operations.push({ id: operation.operationId ?? operationId(method, path), method: method.toUpperCase(), path, operation, pathItem });
  }
}
operations.sort((a, b) => a.id.localeCompare(b.id));

const operationTypeLines = operations.map(({ id, operation, pathItem }) => {
  const pathParameters = parametersFor(operation, pathItem, "path");
  const queryParameters = parametersFor(operation, pathItem, "query");
  const body = requestBodySchema(operation);
  return `    ${JSON.stringify(id)}: { request: { path: ${objectTypeForParameters(pathParameters)}; query: ${objectTypeForParameters(queryParameters)}; body: ${body ? schemaType(body) : "undefined"}; }; response: ${schemaType(responseSchema(operation))}; };`;
});

const manifestLines = operations.map(({ id, method, path, operation }) =>
  `  ${JSON.stringify(id)}: { method: ${JSON.stringify(method)}, path: ${JSON.stringify(path)}, requiresAuth: ${JSON.stringify(Array.isArray(operation.security) && operation.security.length > 0)} },`
);

const operationSchemaLines = operations.map(({ id, operation, pathItem }) => {
  const pathParameters = parametersFor(operation, pathItem, "path");
  const queryParameters = parametersFor(operation, pathItem, "query");
  const body = requestBodySchema(operation);
  const bodySchema = body ? zodSchema(body) : "z.undefined().optional()";
  const pathSchema = `${objectZodForParameters(pathParameters)}${pathParameters.length === 0 ? ".default({})" : ""}`;
  const querySchema = `${objectZodForParameters(queryParameters)}${queryParameters.length === 0 ? ".default({})" : ""}`;
  return `  ${JSON.stringify(id)}: z.object({ path: ${pathSchema}, query: ${querySchema}, body: ${bodySchema} }).strip(),`;
});

const generatedSource = `/* eslint-disable */
// Generated by scripts/generate-openapi.ts. Do not edit manually.
import { z } from "zod";

export interface components {
  schemas: {
${componentEntries.map(([name, schema]) => `    ${JSON.stringify(name)}: ${schemaType(schema)};`).join("\n")}
  };
}

export interface operations {
${operationTypeLines.join("\n")}
}

export type OpenApiOperationId = keyof operations;
export type OperationRequest<Id extends OpenApiOperationId> = operations[Id]["request"];
export type OperationResponse<Id extends OpenApiOperationId> = operations[Id]["response"];

export const componentSchemas: Record<keyof components["schemas"], z.ZodTypeAny> = {
${componentEntries.map(([name, schema]) => `  ${JSON.stringify(name)}: ${zodSchema(schema)},`).join("\n")}
};

export const operationManifest = {
${manifestLines.join("\n")}
} as const satisfies Record<OpenApiOperationId, { method: string; path: string; requiresAuth: boolean }>;

export const operationSchemas: Record<OpenApiOperationId, z.ZodTypeAny> = {
${operationSchemaLines.join("\n")}
};
`;

const snapshotSource = `${JSON.stringify(document, null, 2)}\n`;

async function emit(path: string, content: string): Promise<void> {
  if (checkOnly) {
    const existing = await readFile(path, "utf8").catch(() => "");
    if (existing !== content) throw new Error(`Generated SDK artifact is stale: ${path}`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

await emit(generatedFile, generatedSource);
await emit(snapshotFile, snapshotSource);
console.log(checkOnly ? "OpenAPI SDK artifacts are synchronized" : `Generated ${operations.length} SDK operations from OpenAPI 3.1`);
