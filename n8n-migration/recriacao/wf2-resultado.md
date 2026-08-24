# Resultado WF2 — Parte 1

- **Missão**: `EfqC5HPgSwto` · **Propósito**: TESTE de paridade n8n → AgentFlow
- **Modo**: YOLO autorizado. Nenhum commit realizado.

## Parte 1 — Workflow "My workflow" (n8n id: `SkxlGdS2egKPhibM`)

Recriado **do zero no formato nativo** do AgentFlow (sem converter).

### Node original (n8n)

| # | Label | n8n type | Versão | Trigger? | Conexões | Credenciais |
|---|-------|----------|--------|----------|----------|-------------|
| 1 | When fetching a dataset row | `n8n-nodes-base.evaluationTrigger` | 4.7 | sim | nenhuma | nenhuma |

### Handler criado (arquivo novo)

**Arquivo**: `apps/api/src/services/nodes/evaluationTrigger.ts`

Exports:

| Export | Tipo |
|--------|------|
| `EvaluationTriggerOptionsSchema` | Zod object (passthrough) |
| `EvaluationTriggerParametersSchema` | Zod object (passthrough) |
| `EvaluationTriggerParamsSchema` | Zod object (default typeVersion=4.7, nativeType) |
| `EvaluationTriggerParams` | `z.infer` |
| `EvaluationTriggerConfig` | interface |
| `EvaluationTriggerResult` | interface (`items`, `_trigger`, `_config`) |
| `EVALUATION_TRIGGER_TYPE` | `"evaluationTrigger"` |
| `EVALUATION_TRIGGER_NATIVE_TYPE` | `"n8n-nodes-base.evaluationTrigger"` |
| `EVALUATION_TRIGGER_VERSION` | `4.7` |
| `buildEvaluationTriggerConfig(dataTableId, overrides)` | builder → `JsonObject` |
| `parseEvaluationTriggerConfig(config)` | valida → `EvaluationTriggerParams` |
| `isEvaluationTrigger(config)` | predicate boolean |
| `asObject(value)` | coerces unknown → `JsonObject` |
| `executeEvaluationTrigger(config, input)` | handler → `EvaluationTriggerResult` |

### Workflow nativo persistido

**Fixture**: `n8n-migration/recriacao/fixtures/wf2-native-workflow.json`

- 1 `WorkflowNode`: `type="evaluationTrigger"`, `label="When fetching a dataset row"`, `config.typeVersion=4.7`, `config.parameters.dataTableId=null`
- 0 `WorkflowEdge`
- 1 `WorkflowVersion` (snapshot `{ nodes: 1, edges: 0, trigger: "evaluationTrigger" }`)
- Persistido no store in-memory (`ALLOW_MEMORY_DB=1`) nos testes

### Teste local manual

**Arquivo**: `apps/api/tests/unit/evaluationTrigger.test.ts`

```
Test Files  1 passed (1)
Tests       42 passed (42)
Duração     ~4.5s
```

Cobertura (v8) do módulo novo `evaluationTrigger.ts`:

| Stmts | Branch | Funcs | Lines |
|------|--------|-------|-------|
| 100% | 100% | 100% | 100% |

### Registro no `registracoes-pendencias.md`

A seção **wf2** foi APPENDada em `n8n-migration/recriacao/registracoes-pendencias.md` com as pendências de registro para a Parte 2:

1. Adicionar `evaluationTrigger` à lista de triggers reconhecidos em `executeGraph` (executor.ts ~line 552).
2. Refatorar o `case "evaluationTrigger"` em `executeNode` para delegar no handler dedicado `executeEvaluationTrigger`.
3. `evaluationTrigger` já presente em `workflowNodeTypeValues` / `NODE_TYPES` do shared — nenhuma alteração no registry compartilhado.

### Observações

- O tipo `evaluationTrigger` **já** está registrado em `packages/shared/src/index.ts` (`workflowNodeTypeValues` line 66). O handler dedicado foi criado como módulo novo, mas **ainda não foi conectado** ao switch do `executor.ts` — isso faz parte da Parte 2 (integração final).
- O `executor.ts` já possui um `case "evaluationTrigger"` inline (lines ~475-482) e o `_trigger`/`_config` shape produzido pelo novo handler é compatível.
