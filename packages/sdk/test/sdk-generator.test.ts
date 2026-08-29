import assert from "node:assert/strict";
import test from "node:test";
import {
  extractOperations,
  generateTypeScriptSource,
  generatePythonModels,
  generatePythonClient,
  schemaTypeToTs,
  schemaTypeToPython,
  toPythonIdentifier,
  operationId,
  type OpenApiDocument,
} from "../src/index.js";

const mockDoc: OpenApiDocument = {
  openapi: "3.1.0",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/api/items": {
      get: {
        operationId: "getItems",
        summary: "List all items",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer" }, required: false },
          { name: "search", in: "query", schema: { type: "string" }, required: false },
        ],
        responses: {
          "200": {
            description: "A list of items",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Item" },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: "createItem",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateItemInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Item" },
              },
            },
          },
        },
      },
    },
    "/api/items/{id}": {
      get: {
        operationId: "getItemById",
        parameters: [
          { name: "id", in: "path", schema: { type: "string" }, required: true },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Item" },
              },
            },
          },
        },
      },
      delete: {
        operationId: "deleteItemById",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", schema: { type: "string" }, required: true },
        ],
        responses: {
          "204": {
            description: "No content",
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Item: {
        type: "object",
        required: ["id", "name", "price"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          price: { type: "number" },
          tags: { type: "array", items: { type: "string" } },
          status: { type: "string", enum: ["active", "inactive"] },
          metadata: { type: "object", additionalProperties: true },
        },
      },
      CreateItemInput: {
        type: "object",
        required: ["name", "price"],
        properties: {
          name: { type: "string" },
          price: { type: "number" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

test("generator: toPythonIdentifier maps keywords and camelCase cleanly", () => {
  assert.equal(toPythonIdentifier("id"), "id_");
  assert.equal(toPythonIdentifier("type"), "type_");
  assert.equal(toPythonIdentifier("workflowId"), "workflow_id");
  assert.equal(toPythonIdentifier("getApiAuthLogin"), "get_api_auth_login");
  assert.equal(toPythonIdentifier("123abc"), "_123abc");
});

test("generator: schemaTypeToTs and schemaTypeToPython convert primitives and refs", () => {
  assert.equal(schemaTypeToTs({ type: "string" }), "string");
  assert.equal(schemaTypeToTs({ type: "integer" }), "number");
  assert.equal(schemaTypeToTs({ $ref: "#/components/schemas/Item" }), 'components["schemas"]["Item"]');
  assert.equal(schemaTypeToTs({ type: "array", items: { type: "string" } }), "Array<string>");

  assert.equal(schemaTypeToPython({ type: "string" }), "str");
  assert.equal(schemaTypeToPython({ type: "integer" }), "int");
  assert.equal(schemaTypeToPython({ type: "number" }), "float");
  assert.equal(schemaTypeToPython({ type: "boolean" }), "bool");
  assert.equal(schemaTypeToPython({ $ref: "#/components/schemas/Item" }), "Item");
  assert.equal(schemaTypeToPython({ type: "array", items: { type: "string" } }), "List[str]");
  assert.equal(schemaTypeToPython({ type: "string", enum: ["a", "b"] }), 'Literal["a", "b"]');
});

test("generator: extractOperations discovers path items and auth flags", () => {
  const ops = extractOperations(mockDoc);
  assert.equal(ops.length, 4);

  const getItems = ops.find((o) => o.id === "getItems");
  assert.ok(getItems);
  assert.equal(getItems.method, "GET");
  assert.equal(getItems.requiresAuth, false);

  const createItem = ops.find((o) => o.id === "createItem");
  assert.ok(createItem);
  assert.equal(createItem.method, "POST");
  assert.equal(createItem.requiresAuth, true);
});

test("generator: generateTypeScriptSource outputs valid TS code with operation schemas", () => {
  const tsCode = generateTypeScriptSource(mockDoc);
  assert.ok(tsCode.includes('export interface components'));
  assert.ok(tsCode.includes('"Item": { "id": string; "name": string; "price": number;'));
  assert.ok(tsCode.includes('export const operationManifest = {'));
  assert.ok(tsCode.includes('"createItem": { method: "POST", path: "/api/items", requiresAuth: true }'));
  assert.ok(tsCode.includes('export const operationSchemas'));
});

test("generator: generatePythonModels produces Pydantic BaseModel classes", () => {
  const pyModels = generatePythonModels(mockDoc);
  assert.ok(pyModels.includes("class Item(BaseModel):"));
  assert.ok(pyModels.includes('id_: str = Field(..., alias="id")'));
  assert.ok(pyModels.includes("name: str = Field(...)"));
  assert.ok(pyModels.includes("price: float = Field(...)"));
  assert.ok(pyModels.includes("class CreateItemInput(BaseModel):"));
});

test("generator: generatePythonClient produces client with typed endpoint methods", () => {
  const pyClient = generatePythonClient(mockDoc);
  assert.ok(pyClient.includes("class AgentFlowClient:"));
  assert.ok(pyClient.includes("def get_items(self, limit: Optional[int] = None, search: Optional[str] = None) -> List[Item]:"));
  assert.ok(pyClient.includes("def create_item(self, body: Optional[Union[CreateItemInput, Dict[str, Any]]] = None) -> Item:"));
  assert.ok(pyClient.includes("def get_item_by_id(self, id_: str) -> Item:"));
  assert.ok(pyClient.includes("def delete_item_by_id(self, id_: str) -> Any:"));
});
