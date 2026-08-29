# n8n → AgentFlow Workflow Converter

Standalone TypeScript utility to parse n8n workflow JSON exports and emit normalized JSON/CSV mapped to AgentFlow data models (Prisma/Postgres).

**No network, no credentials, no commits** — pure local transformation.

---

## Installation & Requirements

```bash
# Requires Node.js 18+ and tsx (TypeScript executor)
npx tsx --version  # Should work if Node.js is installed
```

No `npm install` needed — uses only Node.js built-in modules (`fs`, `path`, `url`).

---

## Usage

```bash
# Basic usage (outputs JSON to ./convertido/)
npx tsx convert.ts <input-file.json>

# Verbose logging
npx tsx convert.ts workflow.json -v

# Custom output directory
npx tsx convert.ts workflow.json -o ./my-output

# Output both JSON and CSV
npx tsx convert.ts workflow.json -f both

# Dry run (parse only, don't write files)
npx tsx convert.ts workflow.json --dry-run

# Process multiple files (glob pattern)
npx tsx convert.ts "./exemplo/*.json" -f json
```

### Options

| Flag | Alias | Description | Default |
|------|-------|-------------|---------|
| `--output` | `-o` | Output directory | `./convertido` |
| `--format` | `-f` | Output format: `json`, `csv`, `both` | `json` |
| `--verbose` | `-v` | Verbose logging | `false` |
| `--dry-run` | | Parse only, don't write | `false` |
| `--help` | `-h` | Show help | — |

---

## Output Structure

### JSON Output (`<name>.converted.json`)

```typescript
interface ConversionResult {
  workflow: AgentFlowWorkflow;      // Complete workflow object
  nodes: AgentFlowNode[];           // All nodes with mapped types
  edges: AgentFlowEdge[];           // All connections as edges
  triggers: AgentFlowTrigger[];     // Webhook, cron, form triggers
  schedules: AgentFlowSchedule[];   // Cron schedules
  webhooks: AgentFlowWebhook[];     // Webhook endpoints
  credentialsUsed: AgentFlowCredentialRef[]; // Credential references
  warnings: string[];               // Non-fatal conversion warnings
  errors: string[];                 // Fatal conversion errors
  stats: {                          // Conversion statistics
    totalNodes: number;
    totalEdges: number;
    totalTriggers: number;
    totalCredentials: number;
    totalWebhooks: number;
  };
}
```

### CSV Output (5 files)

| File | Columns | Description |
|------|---------|-------------|
| `.nodes.csv` | `id,type,label,category,x,y,typeVersion,disabled,originalN8nType` | One row per node |
| `.edges.csv` | `id,sourceNodeId,targetNodeId,sourceHandle,targetHandle,label` | One row per connection |
| `.triggers.csv` | `nodeId,type,config` | Trigger configurations (JSON in config) |
| `.credentials.csv` | `nodeId,credentialType,credentialName` | Credential references per node |
| `.webhooks.csv` | `nodeId,path,method,responseMode,responseCode` | Webhook endpoint configs |

---

## Field Mapping: n8n → AgentFlow

### Workflow Level

| n8n Field | AgentFlow Field | Transform |
|-----------|-----------------|-----------|
| `name` | `Workflow.name` | Direct |
| `active` | `Workflow.status` | `true → ACTIVE`, `false → DRAFT` |
| `settings` | `Workflow.config` | Merged with defaults |
| `meta` | `Workflow.meta` | Preserved as-is |
| `tags` | `Workflow.tags` | Direct (or empty array) |
| `nodes[]` | `Workflow.nodes[]` | See Node mapping below |
| `connections` | `Workflow.edges[]` | See Connection mapping below |

### Node Level

| n8n Field | AgentFlow Field | Transform |
|-----------|-----------------|-----------|
| `id` | `WorkflowNode.id` | Used if present, else generated (cuid-like) |
| `name` | `WorkflowNode.label` | Direct |
| `type` | `WorkflowNode.type` | Mapped via type registry (see table below) |
| `typeVersion` | `WorkflowNode.config.typeVersion` | Direct |
| `position[0]` | `WorkflowNode.position.x` | Direct |
| `position[1]` | `WorkflowNode.position.y` | Direct |
| `parameters` | `WorkflowNode.config.parameters` | Direct (JSON object) |
| `credentials` | `WorkflowNode.config.credentials` | Direct (name references) |
| `disabled` | `WorkflowNode.config.disabled` | Direct (default: false) |
| `notes` | `WorkflowNode.config.notes` | Direct |
| `notesInFlow` | `WorkflowNode.config.notesInFlow` | Direct |
| `retryOnFail` | `WorkflowNode.config.retryOnFail` | Direct |
| `maxTries` | `WorkflowNode.config.maxTries` | Direct (default: 3) |
| `waitBetweenTries` | `WorkflowNode.config.waitBetweenTries` | Direct (default: 1000) |
| `continueOnFail` | `WorkflowNode.config.continueOnFail` | Direct |
| `runOnceForAllItems` | `WorkflowNode.config.runOnceForAllItems` | Direct |
| `webhookId` | `WorkflowNode.config.webhookId` | Direct (for webhook nodes) |
| — | `WorkflowNode.config.originalN8nType` | **Added**: preserves original n8n type string |
| — | `WorkflowNode.config.originalN8nId` | **Added**: preserves original n8n id if present |

### Connection/Edge Level

n8n connections use a nested structure:
```json
{
  "SourceNode": {
    "main": [
      [{ "node": "TargetNode", "type": "main", "index": 0 }]
    ]
  }
}
```

Maps to AgentFlow edges:

| n8n Structure | AgentFlow Field | Transform |
|---------------|-----------------|-----------|
| Source node name | `sourceNodeId` | Resolved via node name → ID map |
| Target node name | `targetNodeId` | Resolved via node name → ID map |
| Output array index (0,1,2...) | `sourceHandle` | `undefined` if "main", else output name |
| `conn.type` | `targetHandle` | `undefined` if "main", else input name |
| `conn.index` | `label` | Stringified index (for IF true/false, Switch cases) |

**Special handling:**
- **IF node**: Output index 0 = `true` branch, index 1 = `false` branch → `label: "0"` or `"1"`
- **Switch node**: Output index = rule order, last = `defaultOutput` → `label: "0"`, `"1"`, etc.
- **Merge node**: Input index 0 = first connection, 1 = second → `targetHandle: "0"`, `"1"`

### Trigger Extraction

| n8n Node Type | AgentFlow Trigger | Config Extracted |
|---------------|-------------------|------------------|
| `n8n-nodes-base.webhook` | `webhook` | `httpMethod`, `path`, `responseMode`, `responseCode`, `options` |
| `n8n-nodes-base.formTrigger` | `form` | `httpMethod`, `path`, `responseMode`, `responseCode`, `options`, `fields` |
| `n8n-nodes-base.cron` | `cron` | `cronExpression`, `timezone` (from triggerTimes.item[]) |
| `n8n-nodes-base.errorTrigger` | `errorTrigger` | `workflowIds`, `include` |

### Credential References

| n8n Credential Type | AgentFlow Type | Notes |
|---------------------|----------------|-------|
| `httpBasicAuth` | `basic` | Username/password |
| `headerAuth` | `apiKey` | API key in header |
| `oAuth2Api` / `googleOAuth2Api` / `githubOAuth2Api` | `oauth2` | OAuth2 flow |
| `telegramApi` | `apiKey` | Bot token |
| `openAiApi` | `apiKey` | OpenAI API key |
| `gmailOAuth2Api` | `oauth2` | Gmail OAuth |
| `googleSheetsOAuth2Api` | `oauth2` | Sheets OAuth |
| `slackOAuth2Api` | `oauth2` | Slack OAuth |
| `airtableApi` | `apiKey` | Airtable API key |
| `postgres` / `mysql` / `mongodb` / `redis` | `database` | Connection strings |

**Important**: Only credential **references by name** are exported. Actual secrets stay encrypted in n8n and must be re-created in AgentFlow.

---

## Node Type Mapping Table

| n8n Type | AgentFlow Type | Category | Is Trigger |
|----------|----------------|----------|------------|
| `n8n-nodes-base.webhook` | `webhook` | trigger | ✅ |
| `n8n-nodes-base.cron` | `cron` | trigger | ✅ |
| `n8n-nodes-base.formTrigger` | `form` | trigger | ✅ |
| `n8n-nodes-base.errorTrigger` | `errorTrigger` | trigger | ✅ |
| `n8n-nodes-base.httpRequest` | `httpRequest` | action | ❌ |
| `n8n-nodes-base.emailSend` | `emailSend` | action | ❌ |
| `n8n-nodes-base.telegram` | `telegram` | action | ❌ |
| `n8n-nodes-base.gmail` | `gmail` | action | ❌ |
| `n8n-nodes-base.slack` | `slack` | action | ❌ |
| `n8n-nodes-base.discord` | `discord` | action | ❌ |
| `n8n-nodes-base.whatsapp` | `whatsapp` | action | ❌ |
| `n8n-nodes-base.googleSheets` | `googleSheets` | data | ❌ |
| `n8n-nodes-base.airtable` | `airtable` | data | ❌ |
| `n8n-nodes-base.postgres` | `postgres` | data | ❌ |
| `n8n-nodes-base.mysql` | `mysql` | data | ❌ |
| `n8n-nodes-base.mongodb` | `mongodb` | data | ❌ |
| `n8n-nodes-base.redis` | `redis` | data | ❌ |
| `n8n-nodes-base.if` | `if` | logic | ❌ |
| `n8n-nodes-base.switch` | `switch` | logic | ❌ |
| `n8n-nodes-base.merge` | `merge` | logic | ❌ |
| `n8n-nodes-base.splitInBatches` | `splitInBatches` | logic | ❌ |
| `n8n-nodes-base.wait` | `wait` | logic | ❌ |
| `n8n-nodes-base.delay` | `delay` | logic | ❌ |
| `n8n-nodes-base.set` | `set` | transform | ❌ |
| `n8n-nodes-base.code` / `function` / `functionItem` | `code` | transform | ❌ |
| `n8n-nodes-base.itemLists` | `itemLists` | transform | ❌ |
| `@n8n/n8n-nodes-langchain.openAi` | `aiAgent` | ai | ❌ |
| `@n8n/n8n-nodes-langchain.agent` | `aiAgent` | ai | ❌ |
| `@n8n/n8n-nodes-langchain.chain` | `aiChain` | ai | ❌ |
| `@n8n/n8n-nodes-langchain.embeddings` | `embeddings` | ai | ❌ |
| `@n8n/n8n-nodes-langchain.vectorStore` | `vectorStore` | ai | ❌ |
| `n8n-nodes-base.webhookResponse` | `webhookResponse` | trigger | ❌ |

**Unknown types** → mapped to `custom` category with original type preserved in `originalN8nType`.

---

## Limitations & Known Gaps

### 1. Expression Engine (`{{ $json.path }}`)
- n8n expressions are **preserved as strings** in parameters
- AgentFlow needs its own expression evaluator (not implemented in converter)
- **Human decision required**: Map to AgentFlow expression syntax or keep as-is for runtime evaluation

### 2. Credential Values
- Only **references by name** are exported
- Actual secrets (API keys, tokens) remain encrypted in n8n
- **Manual step**: Re-create credentials in AgentFlow with same names

### 3. Cron Schedule Modes
- `cron` expressions: **fully supported**
- `everyX` (interval): **warning emitted**, manual conversion needed
- `atSpecificTime`: **warning emitted**, manual conversion needed

### 4. Binary Data Handling
- n8n `binary` field in pinData/nodes not mapped
- AgentFlow binary handling TBD

### 5. Webhook Response Node
- `n8n-nodes-base.webhookResponse` mapped but behavior depends on `responseMode`
- Requires AgentFlow webhook handler implementation

### 6. Error Workflow
- `settings.errorWorkflow` preserved in config
- AgentFlow needs error workflow linking logic

### 7. Pin Data / Static Data
- `pinData` and `staticData` preserved in `meta` but not actively used
- AgentFlow test fixtures system TBD

### 8. Version History
- n8n `versionId`, `createdAt`, `updatedAt` preserved in meta
- AgentFlow uses `WorkflowVersion` snapshots (separate table)

### 9. Node Positioning
- Canvas positions preserved exactly
- AgentFlow React Flow uses same coordinate system

### 10. Disabled Nodes
- `disabled: true` preserved in config
- AgentFlow executor must respect this flag

---

## Human Decisions Required

After conversion, **review and decide** on these items:

### 🔴 Critical (Blocker for execution)

1. **Credential Recreation**
   - For each unique `credentialName` in `.credentials.csv`, create matching credential in AgentFlow
   - Match by `credentialType` (basic, apiKey, oauth2, database)
   - Paste actual secret values (not in converted JSON)

2. **Expression Compatibility**
   - Review all `parameters` for `{{ $json... }}`, `{{ $parameter... }}`, `{{ $now }}`, etc.
   - Decide: keep n8n syntax (build compatible evaluator) OR rewrite to AgentFlow syntax

3. **Webhook URL Structure**
   - n8n: `https://domain/webhook/<path>`
   - AgentFlow: `https://domain/webhook/<orgSlug>/<path>`
   - **Decision**: Update webhook paths in converted config or configure orgSlug routing

### 🟡 High (Important for correctness)

4. **Cron Timezone**
   - n8n workflows often use `America/Sao_Paulo`
   - AgentFlow stores cron in UTC, converts at runtime
   - **Verify**: `schedules[].timezone` matches workflow `settings.timezone`

5. **IF/Switch Branch Logic**
   - Edge `label` indicates branch index (`"0"`, `"1"`)
   - AgentFlow executor must route based on condition evaluation
   - **Test**: Verify true/false branches execute correctly

6. **Merge Node Modes**
   - n8n: `wait` (all), `choose` (branch), `multiplex` (per item)
   - AgentFlow: Implement equivalent merge strategies
   - **Map**: `config.parameters.mode` → AgentFlow merge handler

7. **Code Node Sandbox**
   - n8n `functionCode` runs in vm2/isolated-vm
   - AgentFlow: Use `isolated-vm` package (security)
   - **Audit**: Review all `functionCode` for `require`, `fs`, `net`, `child_process` usage

### 🟢 Medium (Polish)

8. **Node Display Names**
   - n8n `name` → AgentFlow `label`
   - Consider shorter labels for UI (truncate >30 chars)

9. **Execution Order**
   - n8n `settings.executionOrder: "v1"` (legacy) vs `"v2"` (topological)
   - AgentFlow uses topological (DAG) — **always v2 equivalent**

10. **Error Handling Config**
    - `retryOnFail`, `maxTries`, `waitBetweenTries`, `continueOnFail`
    - Map to AgentFlow node-level retry policy

---

## Example Workflow

### Input: `exemplo/webhook-to-sheets.json`

```json
{
  "name": "Webhook → Google Sheets",
  "nodes": [
    {
      "name": "Receber Lead",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300],
      "parameters": {
        "httpMethod": "POST",
        "path": "lead/novo",
        "responseMode": "onReceived"
      },
      "webhookId": "lead-webhook-123"
    },
    {
      "name": "Salvar no Sheets",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.1,
      "position": [550, 300],
      "parameters": {
        "operation": "append",
        "sheetId": "1ABC...",
        "range": "A:E",
        "columns": {
          "mappingMode": "defineBelow",
          "value": [
            { "columnName": "Nome", "value": "={{ $json.nome }}" },
            { "columnName": "Email", "value": "={{ $json.email }}" }
          ]
        }
      },
      "credentials": { "googleSheetsOAuth2Api": "Minha Conta Google" }
    }
  ],
  "connections": {
    "Receber Lead": {
      "main": [[{ "node": "Salvar no Sheets", "type": "main", "index": 0 }]]
    }
  },
  "active": true,
  "settings": { "timezone": "America/Sao_Paulo" }
}
```

### Output: `convertido/webhook-to-sheets.converted.json` (excerpt)

```json
{
  "workflow": {
    "name": "Webhook → Google Sheets",
    "status": "ACTIVE",
    "config": {
      "executionOrder": "v1",
      "timezone": "America/Sao_Paulo",
      "executionTimeout": 3600
    },
    "nodes": [
      {
        "id": "a1b2c3d4",
        "type": "webhook",
        "label": "Receber Lead",
        "config": {
          "typeVersion": 1,
          "parameters": { "httpMethod": "POST", "path": "lead/novo", "responseMode": "onReceived" },
          "webhookId": "lead-webhook-123",
          "originalN8nType": "n8n-nodes-base.webhook"
        },
        "position": { "x": 250, "y": 300 }
      },
      {
        "id": "e5f6g7h8",
        "type": "googleSheets",
        "label": "Salvar no Sheets",
        "config": {
          "typeVersion": 4.1,
          "parameters": { "operation": "append", "sheetId": "1ABC...", ... },
          "credentials": { "googleSheetsOAuth2Api": "Minha Conta Google" },
          "originalN8nType": "n8n-nodes-base.googleSheets"
        },
        "position": { "x": 550, "y": 300 }
      }
    ],
    "edges": [
      {
        "id": "i9j0k1l2",
        "sourceNodeId": "a1b2c3d4",
        "targetNodeId": "e5f6g7h8",
        "label": "0"
      }
    ],
    "triggers": [
      { "type": "webhook", "config": { "httpMethod": "POST", "path": "lead/novo", ... }, "nodeId": "a1b2c3d4" }
    ],
    "webhooks": [
      { "path": "/webhook/lead/novo", "method": "POST", "responseMode": "onReceived", "responseCode": 200, "nodeId": "a1b2c3d4" }
    ],
    "credentialsUsed": ["Minha Conta Google"]
  },
  "stats": { "totalNodes": 2, "totalEdges": 1, "totalTriggers": 1, "totalCredentials": 1, "totalWebhooks": 1 }
}
```

---

## Testing with Synthetic Examples

The `exemplo/` directory contains test workflows:

```bash
# Convert all examples
npx tsx convert.ts "./exemplo/*.json" -f both -v

# Check specific example
npx tsx convert.ts "./exemplo/webhook-form.json" -v
```

Expected examples (create these in `exemplo/`):

| File | Description | Nodes | Triggers |
|------|-------------|-------|----------|
| `webhook-form.json` | Form webhook → HTTP → Slack | 3 | webhook |
| `cron-report.json` | Cron → HTTP Request → Email | 3 | cron |
| `if-branching.json` | Webhook → IF → Set (true/false) → Merge | 5 | webhook |
| `ai-agent.json` | Webhook → AI Agent → Telegram | 3 | webhook |
| `code-transform.json` | Webhook → Code (JS) → HTTP | 3 | webhook |

---

## Integrating with AgentFlow

### Import API (to be implemented in AgentFlow)

```typescript
// POST /api/v1/workflows/import
// Body: ConversionResult.workflow (or full ConversionResult)

interface ImportRequest {
  workflow: AgentFlowWorkflow;
  credentialsMap?: Record<string, string>; // n8n cred name → AgentFlow credential ID
  options?: {
    createMissingCredentials?: boolean; // Create placeholder creds
    validateExpressions?: boolean;      // Check expression syntax
  };
}
```

### Recommended Import Flow

1. Run converter → get `.converted.json`
2. Review warnings/errors
3. Create credentials in AgentFlow (matching names from `credentialsUsed`)
4. POST to `/api/v1/workflows/import` with `credentialsMap` linking names
5. Open in editor, validate, activate

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `ENOENT: no such file` | Input path wrong | Use absolute path or check cwd |
| `Invalid JSON` | File not valid JSON | Validate with `jq . file.json` |
| `Workflow missing "nodes"` | Not a workflow export | Ensure exporting from n8n Workflows page |
| `Connection target node not found` | Node name mismatch | Check n8n connection names match node names exactly |
| `everyX schedule mode not supported` | n8n interval trigger | Manually convert to cron expression |
| `Unknown node type: x.y.z` | Custom/community node | Add to `N8N_TO_AGENTFLOW_TYPE_MAP` in convert.ts |

---

## Extending the Converter

### Add New Node Type Mapping

Edit `N8N_TO_AGENTFLOW_TYPE_MAP` in `convert.ts`:

```typescript
'n8n-nodes-base.myCustomNode': { type: 'myCustom', category: 'action', isTrigger: false },
```

### Add Credential Type Mapping

Edit `N8N_CREDENTIAL_TYPE_MAP`:

```typescript
'myCustomAuth': 'apiKey',
```

### Custom Output Fields

Modify `AgentFlowNode.config` or `AgentFlowWorkflow` interfaces and the `convertWorkflow` function.

---

## License

Internal utility for AgentFlow n8n migration. Not for external distribution.