import { type OpenApiDocument, type Operation, type JsonSchema, extractOperations, schemaTypeToTs, schemaTypeToPython } from "./generator.js";

export interface GeneratorOptions {
  check?: boolean;
}

export {
  extractOperations,
  schemaTypeToTs,
  schemaTypeToPython,
};
export type { OpenApiDocument, Operation, JsonSchema };
