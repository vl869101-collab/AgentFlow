# AgentFlow → n8n Recreation: Dependency & Library Analysis

> **Missão**: Recriar n8n no AgentFlow
> **Work dir**: `n8n-migration/`
> **Data**: 2025-08-19

---

## 1. Estado Atual do Monorepo AgentFlow

### Estrutura de Pacotes
| Pacote | Tipo | Principais Dependencies |
|--------|------|------------------------|
| `@agentflow/api` | Fastify API (Node/ESM) | `fastify`, `bullmq`, `ioredis`, `zod`, `@prisma/client`, `@asteasolutions/zod-to-openapi` |
| `@agentflow/web` | Next.js 15 + React 19 | `next`, `react`, `@xyflow/react`, `framer-motion`, `lucide-react` |
| `@agentflow/shared` | Types/Schemas compartilhados | `zod` |
| `@agentflow/database` | Prisma ORM | `@prisma/client`, `dotenv` |

### Versões Fixadas (pnpm-lock.yaml)
| Lib | Versão no Lockfile | Onde Usada |
|-----|-------------------|------------|
| `typescript` | 5.9.3 | Root, todos os packages |
| `zod` | 3.25.76 | `api`, `shared` |
| `@xyflow/react` | 12.11.2 | `web` |
| `bullmq` | 5.81.3 | `api` |
| `ioredis` | 5.11.1 | `api` |
| `next` | 15.5.23 | `web` |
| `react` / `react-dom` | 19.2.8 | `web` |
| `framer-motion` | 12.43.0 | `web` |
| `@prisma/client` | 6.19.3 | `api`, `database` |
| `@asteasolutions/zod-to-openapi` | 7.3.4 | `api` |

### Toolchain
- **Package Manager**: pnpm 9.15.0
- **Build**: Turbo 2.10.9
- **TS Config**: Base `tsconfig.base.json` + extends por package (bundler para web, NodeNext para api/shared)

---

## 2. Avaliação: Editor Visual de Workflow

### 2.1 @xyflow/react (React Flow v12) — **JÁ INSTALADO ✅**

| Critério | Avaliação |
|----------|-----------|
| **Versão Atual** | 12.11.2 (latest v12) |
| **Viabilidade** | ✅ **ALTA** — já no `apps/web/package.json`, compatível com React 19 + Next 15 |
| **Tamanho** | ~450 kB gzipped (core) + ~150 kB (utils) |
| **Recursos nativos** | Nodes/edges customizados, handles, viewport, minimap, background, selection, keyboard nav, snap-to-grid |
| **Exemplos n8n-like** | Oficial: "Flow Builder", "Chatbot Builder", "Mindmap" — cobrem 80% do needed |
| **Licença** | MIT (comercial OK) |
| **TypeScript** | First-class types incluídos |

**Prós**
- Já instalado, zero custo de adoção
- API madura (v12 = stable), documentação extensa
- Extensível: custom nodes/edges para cada tipo de nó n8n
- Integração natural com `framer-motion` (já no repo) para animações
- Suporta `React 19` + `Next 15 App Router` (bundler moduleResolution)

**Contras**
- Não é "n8n ready" — precisa construir: node registry, parameter panels, execution highlighting, undo/redo, multi-select, copy/paste
- Bundle size significativo se importar tudo (tree-shaking ajuda)
- Edge routing complexo (orthogonal, smoothstep) requer config manual

**Alternativas Avaliadas**
| Lib | Versão | Status | Por que NÃO |
|-----|--------|--------|-------------|
| `@xyflow/system` (headless) | 0.0.x | Muito imaturo | Alpha, sem docs, sem componentes React prontos |
| `rete.js` + `rete-react-plugin` | 2.x | Funcional | API mais verbosa, menos exemplos, community menor |
| `flowy` / `vflow` | - | Abandonados | Sem manutenção ativa, TS types fracos |
| **Custom SVG/Canvas** | - | Overkill | Meses de trabalho para features básicas (pan, zoom, selection) |

**Recomendação**: **SIM — USAR @xyflow/react v12 (já instalado)**
> Estender com custom nodes para cada categoria n8n (trigger, action, transform, flow control), painel lateral de propriedades via `zod` + `zod-to-openapi`, e execução visual via highlights animados com `framer-motion`.

---

## 3. Avaliação: Fila / Execução de Workflows

### 3.1 bullmq v5 — **JÁ INSTALADO ✅**

| Critério | Avaliação |
|----------|-----------|
| **Versão Atual** | 5.81.3 (latest v5) |
| **Dependências** | `ioredis` 5.11.1 (já instalado) |
| **Arquitetura** | Redis-based, workers independentes, priority queues, delayed jobs, rate limiting, retries com backoff |
| **Integração AgentFlow** | Native no `apps/api` (Fastify), workers podem rodar em processo separado ou same-process |

**Prós**
- **Já no repo**, zero setup adicional
- Redis já configurado (`ioredis` + `bullmq` no `api`)
- Recursos enterprise: job scheduling, repeatable jobs, parent/child jobs (workflow DAG), metrics via `bullmq:metrics`
- Workers escaláveis horizontalmente (multi-process, multi-server)
- TypeScript first-class, types incluídos
- Dashboard opcional: `bull-board` (Express/Fastify plugin)

**Contras**
- Requer Redis infraestrutura (já assumido no repo)
- Latência de rede Redis (~1-2ms local)
- Não é "serverless-native" (precisa worker persistente)

---

### 3.2 inngest

| Critério | Avaliação |
|----------|-----------|
| **Versão** | 3.x (latest) |
| **Modelo** | Serverless-first, event-driven, durable functions |
| **Infra** | Não precisa Redis próprio (usa seu managed platform ou self-hosted) |

**Prós**
- Serverless-friendly (Vercel, Netlify, AWS Lambda)
- Durable execution com retries automáticos, step functions
- Devtools locais excelentes (`inngest dev`)
- Type-safe event schemas com Zod
- Grátis até 100k execuções/mês (managed)

**Contras**
- **Nova dependência externa** (managed service ou self-host complexo)
- Vendor lock-in parcial (event format proprietário)
- Não aproveita Redis/ioredis já no repo
- Custo em escala alta (managed)
- Workers não são processos Node long-running — menos controle fino

---

### 3.3 node-cron

| Critério | Avaliação |
|----------|-----------|
| **Versão** | 3.x |
| **Modelo** | In-process scheduler (setInterval-based) |

**Prós**
- Zero dependências externas
- Simples para triggers temporais básicos (cron expressions)

**Contras**
- **Não é fila** — não suporta: retries, priority, delayed, distributed workers, persistence
- Single-process apenas — não escala
- Sem observabilidade, sem dashboard
- Inadequado para execução de workflows (DAG, paralelismo, error handling)

---

### 3.4 Runner Próprio (Simple In-Process)

| Critério | Avaliação |
|----------|-----------|
| **Modelo** | Custom executor no mesmo processo da API |

**Prós**
- Controle total, zero deps extras
- Latência zero (sem Redis roundtrip)
- Simples para MVP / dev local

**Contras**
- **Não persiste** — reinício = jobs perdidos
- **Não escala** — single thread, bloqueia event loop
- Reinventar: retries, backoff, priority, scheduling, monitoring, dead letter queue
- Técnico debt alto para produção

---

### Tabela Comparativa: Fila/Execução

| Critério | bullmq (atual) | inngest | node-cron | Custom Runner |
|----------|----------------|---------|-----------|---------------|
| **Já no repo** | ✅ | ❌ | ❌ | ❌ |
| **Persistência** | ✅ Redis | ✅ Managed | ❌ | ❌ |
| **Escala horizontal** | ✅ Workers | ✅ Serverless | ❌ | ❌ |
| **DAG/Parent-Child** | ✅ Native | ✅ Steps | ❌ | Manual |
| **Retry/Backoff** | ✅ Configurável | ✅ Auto | ❌ | Manual |
| **Rate limiting** | ✅ Native | ✅ | ❌ | Manual |
| **Observabilidade** | ✅ bull-board | ✅ Dashboard | ❌ | Manual |
| **Serverless-ready** | Parcial | ✅ Nativo | ❌ | ❌ |
| **Custo infra** | Redis próprio | Managed (free tier) | Zero | Zero |
| **Lock-in** | Baixo (Redis) | Médio (event format) | Zero | Zero |

---

**Recomendação**: **SIM — USAR bullmq v5 (já instalado) + workers dedicados**
> Para "recriar n8n", bullmq é o match natural: já no repo, suporta DAG via parent/child jobs, workers independentes escaláveis, e integra com Redis/ioredis existente. Adicionar `bull-board` para dashboard de monitoramento.
>
> **Opcional**: `inngest` como **alternativa futura** se migrarem para serverless (Vercel/Edge) — pode coexistir via adapter pattern.

---

## 4. Avaliação: n8n-core / n8n-nodes-base como Dependência Embutida

### 4.1 O que são
| Pacote | Descrição | Tamanho (approx) |
|--------|-----------|------------------|
| `n8n-core` | Core engine: workflow executor, expression engine, credentials system, node runner | ~15 MB (node_modules) |
| `n8n-nodes-base` | 400+ nodes built-in (HTTP, Slack, Google Sheets, DBs, etc.) | ~80-120 MB |

### 4.2 Análise de Viabilidade

| Aspecto | Avaliação |
|---------|-----------|
| **Licença** | **Sustainable Use License (SUL)** — **NÃO é open source padrão**<br>• Proíbe uso comercial competitivo (oferecer "n8n as a service")<br>• Permite uso interno, self-hosted, embedding em produto próprio **se não competir**<br>• Ver: <https://github.com/n8n-io/n8n/blob/master/LICENSE.md> |
| **Peso Bundle** | **MUITO ALTO** — ~100-150 MB node_modules, ~500+ deps transitivas |
| **Coupling** | Forte — n8n-core assume arquitetura específica (expressões `{{ $json }}`, credential system próprio, node lifecycle hooks) |
| **TypeScript** | Types incluídos, mas API interna não estável (mudam entre minor versions) |
| **Manutenção** | Precisa acompanhar upstream n8n (releases frequentes, breaking changes) |

### 4.3 Prós
- **400+ nodes prontos** — economiza meses de desenvolvimento de integrações
- **Expression engine** maduro (`{{ $json.field }}`, `{{ $item }}`, functions)
- **Credential system** criptografado, testado em produção
- **Workflow executor** completo (error handling, continue on fail, pin data)

### 4.4 Contras
| Contras | Impacto |
|---------|---------|
| **Licença SUL** | Risco jurídico se AgentFlow for oferecido como serviço concorrente ao n8n.cloud |
| **Bundle size** | +100 MB node_modules, build lento, cold start pesado |
| **Vendor lock-in** | Preso à arquitetura n8n (expressions, node interface, credential format) |
| **Upgrade burden** | n8n muda API interna sem semver — quebrar builds frequente |
| **Tree-shaking difícil** | Muitos nodes = dead code, a menos que use dynamic imports complexos |
| **Custom nodes** | Precisa seguir interface n8n (não standard React/TypeScript) |

### 4.5 Alternativa: Reimplementar Seletivamente
| Componente n8n | Reimplementar no AgentFlow? | Esforço |
|----------------|----------------------------|---------|
| Expression engine (`{{ }}`) | **SIM** — usar `jmespath` ou custom parser leve | Médio |
| Credential system | **SIM** — adaptar ao `@agentflow/shared` + `zod` + crypto nativo | Baixo-Médio |
| Node runner (DAG) | **SIM** — bullmq parent/child jobs já faz isso | Baixo (já tem base) |
| 400+ nodes | **NÃO** — construir só os essenciais (HTTP, Webhook, DB, Transform, Flow Control) + plugin system | Alto (mas controlado) |

---

**Recomendação**: **NÃO — Não embutir n8n-core/n8n-nodes-base**
> **Motivos principais**: (1) Licença SUL impede uso comercial competitivo; (2) Peso massivo (+100 MB, 500+ deps); (3) Coupling forte à arquitetura n8n; (4) Maintenance burden alto.
>
> **Estratégia alternativa**: Reimplementar **core engine leve** (expression parser, credential vault, DAG executor via bullmq) + **sistema de plugins** para nodes. Priorizar 20-30 nodes essenciais (HTTP Request, Webhook, IF, Switch, Merge, Set, Function, Database, Email, Slack, Google Sheets) e abrir para community nodes via registry.

---

## 5. Avaliação: zod para Validação de Node Params

### 5.1 Estado Atual
| Pacote | Versão | Uso Atual |
|--------|--------|-----------|
| `zod` | 3.25.76 | `@agentflow/shared`, `@agentflow/api` |
| `@asteasolutions/zod-to-openapi` | 7.3.4 | `@agentflow/api` (OpenAPI generation) |

### 5.2 Adequação para Node Params (n8n-style)

| Requisito n8n | zod Support |
|---------------|-------------|
| Schema por node type | ✅ `z.object({})` por node |
| Tipos primitivos + complexos | ✅ string, number, boolean, array, object, enum, union, discriminated union |
| Validação condicional | ✅ `.refine()`, `.superRefine()` |
| Defaults | ✅ `.default()` |
| Transform/Coerce | ✅ `.transform()`, `.pipe()` |
| Error messages customizados | ✅ `.meta({ description })`, `.catch()` |
| Inferência TypeScript | ✅ `z.infer<typeof schema>` — **end-to-end type safety** |
| OpenAPI generation | ✅ Via `zod-to-openapi` (já no repo) |
| UI forms dinâmicos | ✅ JSON Schema output → react-hook-form / zod-to-json-schema |

### 5.3 Prós
- **Já instalado** em `shared` + `api` — zero custo
- **Type-safe end-to-end**: node schema → TS types → API validation → OpenAPI docs → UI forms
- **Composável**: `NodeBaseSchema.extend({ ... })` para herança
- **Performance**: Validação rápida, sem reflection runtime pesado
- **Ecosystem**: `zod-to-json-schema`, `zod-to-openapi`, `@hookform/resolvers/zod`

### 5.4 Contras
- Bundle size ~15 kB (aceitável)
- Learning curve para schemas complexos (discriminated unions, recursive types)
- Não é "schema registry" — precisa construir camada de registro/descoberta de node schemas

### 5.5 Padrão Recomendado para Node Schemas
```typescript
// packages/shared/src/nodes/base.ts
import { z } from 'zod';

export const NodeParameterSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'select', 'multiselect', 'json', 'credentials']),
  displayName: z.string(),
  description: z.string().optional(),
  default: z.unknown().optional(),
  required: z.boolean().default(false),
  options: z.array(z.object({ name: z.string(), value: z.unknown() })).optional(),
  typeOptions: z.record(z.unknown()).optional(),
  displayOptions: z.record(z.unknown()).optional(),
});

export const NodeSchema = z.object({
  type: z.string(),           // 'n8n-nodes-base.httpRequest'
  displayName: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  group: z.array(z.string()).default(['transform']),
  version: z.number().default(1),
  defaults: z.record(z.unknown()).optional(),
  inputs: z.array(z.string()).default(['main']),
  outputs: z.array(z.string()).default(['main']),
  parameters: z.array(NodeParameterSchema).default([]),
  credentials: z.array(z.string()).optional(),
  codex: z.record(z.unknown()).optional(),  // extensível
});

// Exemplo: HTTP Request Node
export const HttpRequestNodeSchema = NodeSchema.extend({
  type: z.literal('n8n-nodes-base.httpRequest'),
  parameters: z.array(NodeParameterSchema).default([
    { name: 'url', type: 'string', displayName: 'URL', required: true, default: '' },
    { name: 'method', type: 'select', displayName: 'Method', options: [...], default: 'GET' },
    { name: 'headers', type: 'json', displayName: 'Headers', default: {} },
    { name: 'body', type: 'json', displayName: 'Body', default: {} },
  ]),
});
```

---

**Recomendação**: **SIM — USAR zod (já instalado) como foundation**
> Estender com `NodeSchema` + `NodeParameterSchema` no `@agentflow/shared`. Gerar JSON Schema para UI forms dinâmicos. Usar `zod-to-openapi` para documentação automática da API de execução.

---

## 6. Resumo Consolidado: Tabela de Decisão

| Biblioteca | Versão Sugerida | Status Repo | Recomendação | Motivo Principal |
|------------|-----------------|-------------|--------------|------------------|
| **@xyflow/react** | 12.x (atual 12.11.2) | ✅ Instalado | **SIM** | Já no repo, React 19 compat, API madura, exemplos n8n-like |
| **bullmq** | 5.x (atual 5.81.3) | ✅ Instalado | **SIM** | Já no repo, Redis/ioredis pronto, DAG via parent/child, workers escaláveis |
| **inngest** | 3.x | ❌ Nova dep | **OPCIONAL** | Alternativa serverless futura; não precisar agora |
| **node-cron** | 3.x | ❌ Nova dep | **NÃO** | Não é fila, não escala, sem persistence/retries |
| **Custom Runner** | - | ❌ Code novo | **NÃO** | Reinventar roda; bullmq já resolve |
| **n8n-core** | latest | ❌ Nova dep | **NÃO** | Licença SUL (risco jurídico), +100 MB, coupling forte, maintenance burden |
| **n8n-nodes-base** | latest | ❌ Nova dep | **NÃO** | Mesmo acima + 400 nodes desnecessários; plugin system próprio é melhor |
| **zod** | 3.x (atual 3.25.76) | ✅ Instalado | **SIM** | Já no repo, type-safe end-to-end, OpenAPI, JSON Schema para UI forms |
| **@asteasolutions/zod-to-openapi** | 7.x (atual 7.3.4) | ✅ Instalado | **SIM** | Já no repo, gera OpenAPI 3.1 dos node schemas |

---

## 7. Plano de Ação Sugerido (Próximos Passos)

### Fase 1: Foundation (Semana 1-2)
1. **Node Schema Registry** em `@agentflow/shared`
   - `NodeSchema`, `NodeParameterSchema` com zod
   - Registry singleton: `registerNode(type, schema)`, `getNodeSchema(type)`
   - JSON Schema export para UI

2. **Core Executor** em `@agentflow/api`
   - `WorkflowExecutor` usando bullmq parent/child jobs
   - Expression parser leve (subset de n8n: `{{ $json.path }}`, `{{ $item }}`, `{{ $now }}`)
   - Credential vault (AES-GCM via Web Crypto API)

### Fase 2: Visual Editor (Semana 2-3)
3. **Custom Nodes @xyflow/react**
   - Base node component com handles tipados
   - Node categories: trigger, action, transform, flow
   - Property panel lateral (react-hook-form + zod resolver)

4. **Workflow Canvas**
   - Toolbar, minimap, snap-to-grid, keyboard shortcuts
   - Execution highlights (running/success/error) via framer-motion

### Fase 3: Essential Nodes (Semana 3-5)
5. **Nodes Prioritários** (20-30)
   - Triggers: Webhook, Cron, Manual
   - Flow: IF, Switch, Merge, SplitInBatches, Wait
   - Transform: Set, Function (JS sandbox), JSON Parse/Stringify
   - HTTP: Request, Webhook Response
   - Data: PostgreSQL, MySQL, MongoDB (via Prisma), Redis
   - Comm: Email (nodemailer), Slack, Discord, Teams

### Fase 4: Polish (Semana 5-6)
6. **Observabilidade**
   - bull-board dashboard (`/admin/queues`)
   - Execution logs, timing, retry visualization
   - Webhook para callbacks externos

7. **DX**
   - Node marketplace / registry UI
   - Import/Export workflow JSON (n8n-compat format)
   - Versionamento de workflows

---

## 8. Compatibilidade & Impacto no Repo

| Mudança | Impacto | Esforço |
|---------|---------|---------|
| Adicionar `@agentflow/workflow-engine` package | Novo package, usa `shared`, `database`, `api` | Médio |
| Estender `tsconfig.base.json` paths | Baixo (config only) | Trivial |
| Adicionar `bull-board` em `api` | Nova dep (~50 kB), route `/admin/queues` | Baixo |
| Custom nodes @xyflow/react | Novo código em `web/src/components/workflow/nodes/` | Médio |
| Node registry + schemas | Novo código em `shared/src/nodes/` | Médio |
| Expression parser | Novo módulo leve (~500 LOC) | Baixo-Médio |

**Zero breaking changes** nos packages existentes. Toda nova funcionalidade em packages novos ou estendendo `shared`.

---

## 9. Conclusão

> **Recomendação Principal**: **Usar stack já existente** — `@xyflow/react` (editor), `bullmq` + `ioredis` (fila/execução), `zod` (validação) — e **construir core engine leve próprio** em vez de embutir n8n-core. Isso evita licença SUL, bundle massivo, e coupling arquitetural, mantendo controle total e type-safety end-to-end com o stack TypeScript/Next.js/Fastify/Prisma já consolidado no AgentFlow.

---

**Arquivo**: `n8n-migration/deps-e-libs.md`  
**Recomendação principal**: SIM para @xyflow/react, bullmq, zod (já instalados); NÃO para n8n-core/n8n-nodes-base; OPCIONAL inngest para futuro serverless.