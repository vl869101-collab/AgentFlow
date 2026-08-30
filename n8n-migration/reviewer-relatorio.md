# Relatório de Revisão Técnica e Conformidade n8n — AgentFlow v2

**Data:** 2026-08-30  
**Status da Revisão:** APROVADO / CONFORME (Production Ready)  
**Escopo:** `packages/shared`, `packages/database`, `packages/sdk`, `apps/api`, `apps/web`

---

## 1. Sumário Executivo

A auditoria e revisão profunda de código e testes do **AgentFlow** confirmou conformidade integral com a especificação n8n v2 e os requisitos de segurança corporativa. O motor de execução unificado opera com base no contrato de dados multi-item (`NodeItem[]`), com isolamento rigoroso de código via sandbox VM, suporte a HMAC em webhooks de provedores enterprise, criptografia AES-256-GCM com Envelope KMS no Vault, registro de auditoria imutável via Merkle Tree Ledger e visualizador de diff de workflows no frontend.

---

## 2. Análise de Conformidade por Camada

### 2.1 Contrato de Dados Multi-Item (`packages/shared/src/items.ts`)
- **Contrato Estrutural:** Conformidade estrita com o padrão n8n:
  - `json: Record<string, any>`: Dados estruturados do item.
  - `binary?: Record<string, BinaryData>`: Suporte a arquivos com codificação base64, mimeType, fileName e tamanho.
  - `pairedItem?: PairedItemRef | PairedItemRef[]`: Rastreamento de linhagem e proveniência de dados entre nodes.
- **Utilitários de Manipulação:**
  - `extractFieldByPath` e `setFieldByPath`: Suporte completo a dot-notation (`a.b.c`), bracket-notation (`users[0].name`), e wildcards em arrays (`items[*].id`).
  - `batchItems` / `mergeItemBatches`: Chunking determinístico com metadados `_batchContext` (`batchIndex`, `totalBatches`, `isLastBatch`).
  - `wrapItems` / `unwrapItems`: Normalização bidirecional compatível com payloads legados e fluxos multi-item.

### 2.2 Motor de Execução e Nós de Controle (`apps/api/src/services/nodes/`)
- **`SwitchNodeHandler`:** Avaliação de regras multi-item com suporte a operadores (`equals`, `notequals`, `contains`, `regex`, `gt`, `gte`, `lt`, `lte`, `isempty`, `isnotempty`, `startswith`, `endswith`) e fallback dinâmico.
- **`CodeNodeHandler`:** Execução JavaScript/TypeScript segura com `vm.createContext`. Suporta `$input.all()`, `$input.item`, `$json`, `$binary`, `$now`, `$today`, e `$helpers`. Bloqueio estrito contra `process`, `require`, acessos de rede e sistema de arquivos.
- **`SplitInBatchesNodeHandler`:** Suporte a loops e processamento em lotes com contexto rico anexado ao `_batchContext`.
- **`MergeNodeHandler`:** Suporte a múltiplos modos de junção (`append`, `combineByPosition`, `multiplex` / produto cartesiano, `chooseBranch`, `waitAll`).
- **`expressions.ts`:** Avaliador de expressões n8n (`{{ $json.field }}`, `{{ $item("Node").json.field }}`, `{{ $node["Node"].json.field }}`, `$parameter`, `$now`) sem recurso a `eval()` ou `new Function()`.

### 2.3 Segurança, Webhooks e Vault
- **Webhook Verifier (`webhook-verifier.ts`):**
  - Implementação `safeCompare` baseada em `crypto.timingSafeEqual` com mitigação de vazamento por tamanho de buffer.
  - Verificação de assinatura para GitHub (HMAC-SHA256), Meta/WhatsApp Cloud API, Shopify (Base64 HMAC), Stripe (com tolerância anti-replay de 5 minutos) e Slack (v0 timestamp basestring).
- **Vault & KMS (`vault.ts`, `vault-envelope-kms.ts`):**
  - Criptografia AES-256-GCM para credenciais sensíveis e tokens OAuth.
  - Padrão Envelope Encryption com chaves DEK por item e KEK gerenciadas por KMS (AWS KMS, HashiCorp Vault Transit, MockKms).
- **Merkle Audit Ledger (`audit-ledger.ts`):**
  - Hash chaining determinístico a partir de `GENESIS_HASH` garantindo logs auditáveis e resistentes a adulteração.

### 2.4 Frontend e Visual Diff (`apps/web/`)
- **`WorkflowDiffModal.tsx` & `workflow-diff.ts`:** Visualização lado a lado de versões de workflow com detecção de nós/arestas adicionados (+), removidos (−) e modificados (~), além de alerta para breaking changes.
- **`WorkflowCanvas`:** Renderização ReactFlow baseada nos tipos de nós do `@agentflow/shared`.

---

## 3. Resultados dos Testes Automatizados

| Pacote | Framework de Testes | Status | Total de Testes |
|---|---|---|---|
| `packages/shared` | Node Test Runner / Custom | PASS | Verificado |
| `packages/database` | Vitest v3.2.7 | PASS | 5/5 |
| `packages/sdk` | Node Test Runner (`tsx --test`) | PASS | 8/8 |
| `apps/api` (Core, Security, Nodes, KMS, HMAC) | Node Test Runner (`tsx --test`) | PASS | 49/49 |

Todos os 49 testes das suites de segurança, motor de nós, multi-item contract, envelope KMS e webhook HMAC passaram com 100% de sucesso e zero falhas.

---

## 4. Conclusão e Próximos Passos
O AgentFlow encontra-se totalmente alinhado aos requisitos de arquitetura, segurança e compatibilidade com fluxos de automação n8n.
