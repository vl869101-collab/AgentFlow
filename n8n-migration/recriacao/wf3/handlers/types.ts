/**
 * Tipos compartilhados para handlers do WF3.
 * Re-exporta os tipos do diretorio handlers/ compartilhado.
 */
export type {
  NodeItem,
  NodeExecutionContext,
  NodeExecutionResult,
  NodeHandler,
  GoogleDriveUploadResult,
  GmailMessageResult,
  AttachmentMetadata,
  CodeExecutionError,
} from "../../handlers/types.js";
export { createCodeExecutionError } from "../../handlers/types.js";
