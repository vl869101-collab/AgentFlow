/**
 * Handler para node type `googleDrive` (n8n-nodes-base.googleDrive v3)
 *
 * Simula o upload de arquivos para o Google Drive. Em producao, este handler
 * faria chamadas reais a la API do Google Drive via OAuth2.
 *
 * Para testes, usa credenciais mock/fake e registra os uploads simulados.
 */
import { NodeHandler, NodeExecutionContext, NodeExecutionResult, GoogleDriveUploadResult } from "./types.js";

export interface GoogleDriveParameters {
  resource: string;
  operation: string;
  inputDataFieldName?: string;
  name?: string;
  driveId?: Record<string, unknown>;
  folderId?: Record<string, unknown>;
  binaryPropertyName?: string;
}

/** Handler googleDrive — upload simulado com mock credentials */
export class GoogleDriveHandler implements NodeHandler {
  readonly type = "googleDrive";
  readonly category = "action";

  // Armazenamento em memoria dos uploads simulados (para testes)
  uploads: GoogleDriveUploadResult[] = [];

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const params = (ctx.nodeConfig.parameters as GoogleDriveParameters) ?? {};
    const logs: string[] = [];
    const results: Array<{ json: Record<string, unknown>; binary?: Record<string, unknown> }> = [];

    const operation = params.operation ?? "upload";
    const resource = params.resource ?? "file";

    if (resource !== "file" || operation !== "upload") {
      logs.push(`googleDrive: skipping (${resource}/${operation})`);
      return { items: [], logs };
    }

    // Determina onde esta o dado binario do anexo
    const binaryProp = params.binaryPropertyName ?? "data";
    const nameTemplate = params.name ?? "";

    const inputItems = normalizeInputItems(ctx.input);

    for (let i = 0; i < inputItems.length; i++) {
      const item = inputItems[i];
      const fileName = resolveExpression(nameTemplate, item.json, ctx);

      // O anexo binario esta em item.json (do code node) ou em item.binary
      const binaryData = item.binary?.[binaryProp] ?? item.binary?.data ?? item.json.data;

      if (!binaryData) {
        logs.push(`googleDrive: item ${i} has no binary data for upload`);
        results.push({
          json: {
            success: false,
            error: "No binary data found in input item",
            fileName,
            index: i,
          },
        });
        continue;
      }

      const binaryObj = (binaryData as Record<string, unknown>) ?? {};
      const uploadResult = simulateUpload(binaryObj, fileName, params, ctx);

      this.uploads.push(uploadResult);
      logs.push(`googleDrive: uploaded "${uploadResult.name}" (id: ${uploadResult.id})`);

      results.push({
        json: {
          success: true,
          id: uploadResult.id,
          name: uploadResult.name,
          mimeType: uploadResult.mimeType,
          size: uploadResult.size,
          webViewLink: uploadResult.webViewLink,
          downloadLink: uploadResult.downloadLink,
          uploadIndex: i,
        },
        binary: item.binary,
      });
    }

    return { items: results, logs };
  }
}

/** Simula upload para Google Drive — gera IDs e links sem chamada de rede */
function simulateUpload(
  binaryObj: Record<string, unknown>,
  fileName: string,
  params: GoogleDriveParameters,
  ctx: NodeExecutionContext,
): GoogleDriveUploadResult {
  const mimeType = String(binaryObj.mimeType ?? "application/octet-stream");
  const data = String(binaryObj.data ?? "");
  const size = Number(binaryObj.size ?? data.length);

  // Usa o fileName do item se o template estiver vazio ou for uma expressao
  const name = fileName || String(binaryObj.fileName ?? "uploaded_file");

  return {
    id: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    name,
    mimeType,
    size,
    webViewLink: `https://drive.google.com/file/d/sim_view/${params.driveId?.cachedResultName ?? "unknown"}/view`,
    downloadLink: `https://drive.google.com/uc?id=sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}&export=download`,
  };
}

/** Normaliza entrada para array de items */
function normalizeInputItems(input: unknown): Array<{ json: Record<string, unknown>; binary?: Record<string, unknown> }> {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((item) => normalizeItem(item));
  return [normalizeItem(input)];
}

function normalizeItem(item: unknown): { json: Record<string, unknown>; binary?: Record<string, unknown> } {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const obj = item as Record<string, unknown>;
    return {
      json: (obj.json ?? obj) as Record<string, unknown>,
      binary: obj.binary as Record<string, unknown> | undefined,
    };
  }
  return { json: { value: item } };
}

/** Resolve expressao n8n simples (={{ $json.field }}) */
function resolveExpression(template: string, jsonData: Record<string, unknown>, ctx: NodeExecutionContext): string {
  if (!template) return "";

  // Strip n8n expression prefix: ={{ expr }} -> {{ expr }}
  let expr = template;
  if (expr.startsWith("=")) {
    expr = expr.slice(1);
  }

  // Resolve {{ $json.field }}
  return expr.replace(/\{\{\s*\$json\.(\w+)\s*\}\}/g, (_, field) => {
    return String(jsonData[field] ?? "");
  });
}
