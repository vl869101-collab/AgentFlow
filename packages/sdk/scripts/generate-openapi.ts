import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { openApiDocument } from "../../../apps/api/src/docs/openapi.js";
import {
  generateTypeScriptSource,
  generatePythonModels,
  generatePythonClient,
  extractOperations,
  type OpenApiDocument,
} from "../src/generator/generator.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const generatedTsFile = resolve(packageDir, "src/generated/openapi.ts");
const snapshotFile = resolve(packageDir, "openapi/agentflow.openapi.json");
const generatedPyModelsFile = resolve(packageDir, "python/agentflow/models.py");
const generatedPyClientFile = resolve(packageDir, "python/agentflow/client.py");
const generatedPyInitFile = resolve(packageDir, "python/agentflow/__init__.py");
const checkOnly = process.argv.includes("--check");

const documentSchema = z.object({
  openapi: z.literal("3.1.0"),
  info: z.object({ title: z.string().min(1), version: z.string().min(1) }).passthrough(),
  paths: z.record(z.record(z.unknown())),
  components: z.object({ schemas: z.record(z.unknown()).optional() }).passthrough().optional(),
}).passthrough();

// JSON round-trip strips library-only values and proves the served document is serializable.
const rawDoc = JSON.parse(JSON.stringify(openApiDocument));
const document = documentSchema.parse(rawDoc) as OpenApiDocument;

const tsSource = generateTypeScriptSource(document);
const snapshotSource = `${JSON.stringify(document, null, 2)}\n`;
const pyModelsSource = generatePythonModels(document);
const pyClientSource = generatePythonClient(document);
const pyInitSource = `# AgentFlow Python SDK
from .client import AgentFlowClient, AgentFlowApiError
from .models import *

__all__ = ["AgentFlowClient", "AgentFlowApiError"]
`;

async function emit(path: string, content: string): Promise<void> {
  if (checkOnly) {
    const existing = await readFile(path, "utf8").catch(() => "");
    if (existing !== content) throw new Error(`Generated SDK artifact is stale: ${path}`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

await emit(generatedTsFile, tsSource);
await emit(snapshotFile, snapshotSource);
await emit(generatedPyModelsFile, pyModelsSource);
await emit(generatedPyClientFile, pyClientSource);
await emit(generatedPyInitFile, pyInitSource);

const operations = extractOperations(document);
console.log(
  checkOnly
    ? "OpenAPI SDK artifacts (TypeScript & Python) are synchronized"
    : `Generated ${operations.length} SDK operations & types for TypeScript and Python from OpenAPI 3.1`
);
