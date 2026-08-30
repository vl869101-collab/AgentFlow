# Especificação: Templates, Import/Export e Colaboração — AgentFlow v2

> **Missão**: Recriar n8n como plataforma própria (AgentFlow) — frente de **Templates, Importação/Exportação e Colaboração**
> **Work dir**: `n8n-migration/`
> **Data**: 2026-08-20
> **Status**: DESIGN — não implementar, não commitar
> **Responsável**: Pane TEMPLATES, IMPORT/EXPORT E COLABORAÇÃO
> **Base**: `referencia-n8n.md`, `api-n8n.md`, `catalogo-nodes.md`, `design-recriacao.md`, `design-seguranca.md`, `v2-security-spec.md`
> **Escopo**: Biblioteca de templates, marketplace, compartilhamento, comentários/revisão, versionamento, import/export n8n JSON, colaboração realtime, API/eventos, segurança, UX

---

## Índice

1. [Biblioteca de Templates](#1-biblioteca-de-templates)
2. [Marketplace de Templates](#2-marketplace-de-templates)
3. [Compartilhamento](#3-compartilhamento)
4. [Comentários e Revisão](#4-comentários-e-revisão)
5. [Histórico e Versionamento de Workflows](#5-histórico-e-versionamento-de-workflows)
6. [Importação e Exportação](#6-importação-e-exportação)
7. [Colaboração em Tempo Real](#7-colaboração-em-tempo-real)
8. [API e Eventos](#8-api-e-eventos)
9. [Segurança e Limites](#9-segurança-e-limites)
10. [UX/UI](#10-uxui)
11. [Critérios de Aceite](#11-critérios-de-aceite)

---

## 1. Biblioteca de Templates

### 1.1 Visão Geral

A **Biblioteca de Templates** é um repositório organizado de workflows pré-definidos que permitem aos usuários iniciar rapidamente novas automações. Templates seguem o mesmo formato de workflow n8n compatível (JSON com `nodes`, `connections`, `settings`), mas são armazenados como entidades versionadas com metadados ricos para descoberta, categorização e instanciação.

Templates são classificados em três visibilidades:

| Visibilidade | Acesso | Descrição |
|---|---|---|
| **Official** | Público (todos os tenants) | Criados pela equipe AgentFlow, aprovados, de alta qualidade |
| **Community** | Público (todos os tenants) | Enviados por usuários, passam por review antes da publicação |
| **Private** | Apenas org/autor | Templates privados dentro de uma organização (não listados publicamente) |

### 1.2 Modelo de Dados (Prisma)

Extensões ao schema existente (`packages/database/prisma/schema.prisma`):

```prisma
model WorkflowTemplate {
  id           String            @id @default(cuid())
  name         String            @db.VarChar(200)
  description  String?           @db.Text
  slug         String            @unique @db.VarChar(100)
  category     String?           // e.g. "marketing", "data-sync", "ai-assistant"
  tags         String[]          @default([]) // array de tags para busca
  visibility   TemplateVisibility
  status       TemplateStatus    @default(DRAFT)

  // Workflow JSON compatível n8n (mesma estrutura que Workflow.nodes/edges, serializado)
  workflowJson Json              // { name, nodes, connections, settings, active }

  // Metadata para instanciação
  credentialRefs Json?          // [{ credentialType, credentialName, description }] - o que o template precisa
  parameterSchema Json?         // Zod-like schema para parametrização opcional
  parameterValues Json?         // valores padrão para parametrização

  // Versionamento
  version     Int               @default(1)
  versionId   String            // UUID da versão publicada
  publishedAt DateTime?
  draftVersion Int              @default(1) // versão de draft (não publicada)

  // Popularidade e rating
  installCount Int              @default(0)
  viewCount     Int              @default(0)
  ratingSum     Int              @default(0)  // soma de ratings (5 * count)
  ratingCount   Int              @default(0)
  ratingScore   Float            @default(0.0) // ratingSum / ratingCount (cache)

  // Autoria
  authorId     String
  author       User             @relation(fields: [authorId], references: [id])
  orgId        String?          // null = oficial global; não-null = scoped à org (private)
  organization   Organization?  @relation(fields: [orgId], references: [id])

  // Review
  reviewedById  String?
  reviewedBy    User?            @relation(fields: [reviewedById], references: [id])
  reviewedAt    DateTime?
  reviewNotes   String?          @db.Text
  rejectionReason String?        @db.Text

  // Metadados
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  // Relações
  reviews      TemplateReview[]
  shares       TemplateShare[]

  @@index([visibility, status, category])
  @@index([orgId, visibility])
  @@index([ratingScore, installCount])
  @@index([slug, version])
  @@unique([orgId, slug])
}

enum TemplateVisibility {
  OFFICIAL      // Gerenciado pela equipe AgentFlow
  COMMUNITY     // Publicado por usuário, passou por review
  PRIVATE       // Privado à org/usuário
}

enum TemplateStatus {
  DRAFT         // Em construção, não visível
  PUBLISHED     // Visível publicamente ou à org
  ARCHIVED      // Desativado (não listado, mas instânciavel via link direto)
  REJECTED      // Community template rejeitado (mantém histórico)
}

model TemplateReview {
  id          String           @id @default(cuid())
  templateId  String
  template    WorkflowTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  reviewerId  String
  reviewer    User             @relation(fields: [reviewerId], references: [id])
  rating      Int              @db.SmallInt // 1-5
  comment     String?          @db.Text
  createdAt   DateTime         @default(now())

  @@index([templateId])
  @@index([reviewerId])
}

model TemplateShare {
  id          String           @id @default(cuid())
  templateId  String
  template    WorkflowTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  shareToken  String           @unique @default(uuid()) // token para link público
  scope       TemplateShareScope // PUBLIC, ORG, USER
  permission  SharePermission   // VIEW, USE, EDIT, MANAGE
  expiresAt   DateTime?
  createdById String
  createdBy   User             @relation(fields: [createdById], references: [id])
  createdAt   DateTime         @default(now())

  @@index([shareToken])
  @@index([templateId, scope])
}

enum TemplateShareScope {
  LINK         // Qualquer um com o link
  ORG          // Apenas membros da org
  USER         // Apenas o usuário específico
}

enum SharePermission {
  VIEW         // Visualizar + instanciar
  USE          // Visualizar + instanciar + exportar
  EDIT         // Editar (cria fork/version)
  MANAGE       // Full control (compartilhar, deletar, etc.)
}
```

### 1.3 CRUD de Templates

| Operação | Endpoint (REST) | Descrição |
|---|---|---|
| Criar template | `POST /templates` | Cria draft privado (status=DRAFT, visibility=PRIVATE) |
| Listar templates | `GET /templates` | Lista por visibilidade, categoria, busca (ver §1.5) |
| Obter template | `GET /templates/{id}` | Retorna metadados + workflowJson |
| Atualizar template | `PATCH /templates/{id}` | Draft: atualiza dados; Published: cria nova versão |
| Publicar template | `POST /templates/{id}/publish` | Review → Published (se oficial/community) ou imediato (private) |
| Deletar template | `DELETE /templates/{id}` | Soft-delete (arquiva) |
| Duplicar template | `POST /templates/{id}/fork` | Cria cópia privada para o usuário |
| Instanciar template | `POST /templates/{id}/instantiate` | Cria workflow novo a partir do template (§1.7) |

**Regras de permissão (RBAC)**:
- **OWNER/ADMIN**: criar, publicar, deletar, gerenciar shares de qualquer template da org
- **MEMBER**: criar template privado, editar templates que criou
- **VIEWER**: visualizar templates oficiais/publicados, instanciar
- **Community review**: apenas **owner/admin** podem aprovar/rejeitar community templates

### 1.4 Versionamento de Templates

Templates usam versionamento semântico baseado em **version number incrementa** + **versionId (UUID)**:

- **DRAFT**: versão em edição. Cada `PATCH` modifica o draft. `draftVersion` incrementa.
- **PUBLISHED**: snapshot imutável. `POST /publish` congela o draft atual como nova versão publicada (version += 1, novo versionId). Apenas versões publicadas são instancialáveis por outros usuários.
- **HISTORY**: todas as versões publicadas são mantidas. Podem ser visualizadas via `GET /templates/{id}/versions` mas não editadas.

**Fluxo de publicação**:

```
[DRAFT v1 draftVersion=3]  -- POST /publish -->  [PUBLISHED v2 versionId=abc]
                                | 1. valida workflow JSON (nodes, conexões)
                                | 2. valida security scan (nodes perigosos, URLs)
                                | 3. se COMMUNITY: cria TemplateReview proposta
                                | 4. se OFFICIAL: require reviewer
                                | 5. salva snapshot, incrementa version
```

### 1.5 Busca e Filtros

Endpoint: `GET /templates?...`

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `visibility` | enum | `official`, `community`, `private` (default: `official,community` para público; `private` para org) |
| `category` | string | Filtra por categoria (veja §1.6) |
| `tags` | string[] | Filtra por tags (OR dentro do array) |
| `authorId` | string | Filtra por autor |
| `search` | string | Busca full-text em nome, descrição, tags |
| `minRating` | number | Filtra por rating mínimo |
| `minInstalls` | number | Filtra por contagem mínima de instalações |
| `sort` | enum | `rating`, `installs`, `name`, `recent` (default: `rating`) |
| `page`, `limit` | int | Paginação cursor-based (consistente com API existente) |

**Full-text search**: usa PostgreSQL `tsvector` indexado em `name + description + tags`. Para search rápido de UI, mantém cache de popularidade em Redis (`template:search:{query}` → IDs, TTL 5 min).

### 1.6 Categorias e Tags

**Categorias oficiais** (predefinidas, gerenciadas pela equipe AgentFlow):

| Categoria | Descrição | Exemplo de template |
|---|---|---|
| `marketing` | Automação de marketing e CRM | Lead capture → CRM → Slack notification |
| `data-sync` | Sincronização entre sistemas | Google Sheets → Postgres → Webhooks |
| `onboarding` | Fluxos de onboarding de usuários | Form → Email → DB → Calendar invite |
| `monitoring` | Alertas e monitoramento | HTTP poll → IF → Discord/Slack alert |
| `ai-assistant` | Agentes e orquestração de IA | Webhook → AI → Transform → HTTP callback |
| `productivity` | Automação pessoal/produtividade | Email trigger → IF → Calendar/Tasks |
| `data-pipeline` | Processamento e transformação de dados | Webhook → Split → Transform → Storage |
| `integration` | Integração entre apps (webhooks, APIs) | Webhook → HTTP → Sheets → Notification |

**Tags comunitárias**: usuários podem sugerir tags. Tags são validadas (regex: `^[a-z0-9-]{2,30}$`) e moderadas. Tags não aprovadas são removidas em review.

### 1.7 Instanciação de Template

Instanciar = criar um novo **Workflow** a partir de um template. O processo:

1. **Resolução de credenciais**: o template lista `credentialRefs` (tipo + nome). O usuário mapeia cada referência para uma credencial existente na sua org, ou cria uma nova. Nenhuma credencial real viaja no template — apenas referências por tipo.

2. **Parametrização (opcional)**: se o template define `parameterSchema`, exibe formulário para preencher valores. Expressões no workflow JSON (`{{ $template.paramName }}`) são substituídas.

3. **Validação de nodes**: verifica todos os tipos de nó usados no template são suportados pelo AgentFlow (tabela de compatibilidade n8n → AgentFlow, ver §6.3). Nodes desconhecidos viram placeholder com aviso.

4. **Criação do workflow**:
   - `POST /templates/{id}/instantiate` → valida permissões, mapeia credenciais, gera workflow DRAFT
   - Resposta: `{ workflowId, warnings[], unmappedCredentials[] }`
   - Workflow é criado com `status: DRAFT` para o usuário revisar antes de publicar

5. **Resolução de variáveis**: expressions n8n (`{{ $json.x }}`, `{{ $node["N"].json.y }}`) são preservadas como-is no workflow criado (o executor do AgentFlow já suporta expressões n8n — ver `executor.ts` e `catalogo-nodes.md §Expression Engine`).

**Exemplo de request de instanciação**:

```json
POST /api/templates/tmpl_x7y9/instantiate
Content-Type: application/json

{
  "name": "Lead Capture - Meu CRM",
  "credentialMapping": [
    { "credentialType": "googleSheetsOAuth2Api", "targetCredentialId": "cred_abc123" },
    { "credentialType": "httpHeaderAuth", "targetCredentialId": "cred_def456" }
  ],
  "parameters": {
    "crmEndpoint": "https://crm.meudominio.com/api/leads"
  },
  "orgId": "org_123"
}
```

**Resposta**:

```json
{
  "workflowId": "wf_8b3k2m",
  "name": "Lead Capture - Meu CRM",
  "warnings": [
    "Node 'Webhook' uses expression $json.origin — ensure downstream nodes handle it"
  ],
  "unmappedCredentials": [],
  "nodesCreated": 6,
  "edgesCreated": 5
}
```

### 1.8 Template de Exemplo por Categoria

**`data-sync`**: "Google Sheets → PostgreSQL sync"
- Trigger: Webhook
- Nodes: Webhook → HTTP Request (get rows) → IF (row changed?) → HTTP Request (upsert to Postgres) → Set (timestamp) → Google Sheets (update last_sync)
- Credential refs: `googleSheetsOAuth2Api`, `postgres`

**`marketing`**: "Lead capture → CRM + Slack"
- Trigger: Webhook
- Nodes: Webhook → HTTP Request (create CRM lead) → IF (lead score > 80) → Telegram (notify sales) → Google Sheets (log)
- Credential refs: `httpHeaderAuth` (CRM API), `telegramApi`

---

## 2. Marketplace de Templates

### 2.1 Arquitetura

O marketplace é **nativo ao AgentFlow** (não um agregador externo). Ele expõe templates oficiais e da comunidade através de:

- **API pública**: `GET /api/templates/public?...` (sem auth, apenas metadata + workflowJson mascarado)
- **Índice de busca**: PostgreSQL full-text + Redis cache
- **UI dedicada**: página `/templates` no web app com cards, filtros, busca, detalhes

Templates oficiais são mantidos no repositório (`packages/templates/official/*.json`) e carregados via seed no boot. Templates comunitários são submetidos via API e passam por review.

### 2.2 Publicação de Templates (Submissão → Review → Aprovação)

**Fluxo completo**:

```
[User] → 1. POST /templates (DRAFT, PRIVATE)
          → 2. Itera no draft (PATCH, versões de draft)
          → 3. POST /templates/{id}/submit-for-review (status → PENDING_REVIEW, visibility → COMMUNITY)
     [System] → 4. Cria TemplateReview proposta + notifica revisores
     [Reviewer Owner/Admin] → 5a. POST /templates/{id}/approve (status → PUBLISHED, reviewedAt)
                           → 5b. POST /templates/{id}/reject (status → REJECTED, rejectionReason)
          → 6. Notifica author + evento template_published/rejected
```

**Critérios de autoavaliação** (validados no submit):
- Workflow JSON é válido (nodes conectam, tem trigger)
- Nenhum node perigoso (code nodes com `eval`, `require('fs')`, etc.) — ver §9.5
- Nenhuma URL de credencial em texto claro
- Tamanho ≤ limite do plano (default 5MB)
- Nome/descrição não contêm conteúdo malicioso (XSS scan)

### 2.3 Rating e Reviews

Modelo `TemplateReview` (Prisma §1.2):

| Operação | Endpoint | Descrição |
|---|---|---|
| Adicionar review | `POST /templates/{id}/reviews` | Rating 1-5 + comentário (requer auth) |
| Listar reviews | `GET /templates/{id}/reviews` | Paginado, ordenado por data |
| Atualizar review | `PATCH /reviews/{id}` | Owner do review |
| Deletar review | `DELETE /reviews/{id}` | Owner do review ou admin |
| Reportar review | `POST /reviews/{id}/report` | Marca para moderação |

**Regras**:
- Um usuário pode reviewar apenas uma vez por template (unique constraint `[templateId, reviewerId]`)
- Reviews são públicos (nome do autor, rating, comentário) — dado que template é community
- Template oficial não aceita reviews de usuários comuns (apenas feedback interno)
- `ratingScore` é recalculado via trigger DB após cada review (ou job bullmq)

### 2.4 Contadores de Uso e Instalação

- `installCount`: incrementado atomatically via `POST /templates/{id}/instantiate` → `prisma.template.update({ increment: 1 })`. Contagem por org (um org = 1 instalação, mesmo se múltiplos workflows).
- `viewCount`: incrementado via evento de visualização de detalhe (debounced por usuário/IP, TTL 1h no Redis para evitar duplicatas).
- Contagem de execuções vindas de workflows instanciados de template: evento `workflow_started` com `sourceTemplateId` → incrementa contador no template.

### 2.5 Template de Exemplo por Categoria

Já detalhado em §1.8. Cada categoria tem 1 template de referência com workflow JSON completo e mapeamento de credenciais.

### 2.6 Curadoria

- **Manual**: equipe AgentFlow seleciona templates destacados, cria collections temáticas.
- **Algorítmica**: score = `ratingScore * 0.5 + log(installCount + 1) * 0.3 + freshness * 0.2`. Templates com score > 8.0 aparecem em "Recomendados".
- **Feeds**: `/templates/feed?category=...&sort=...` retorna lista otimizada para carregamento infinito.

### 2.7 Monetização (especificação apenas, não implementar)

- **Free vs Premium**: templates oficiais básicos são grátis. Templates avançados (enterprise integrations, AI agents) têm `price: number` e `currency: string`.
- **Checkout**: `POST /templates/{id}/purchase` → cria Stripe Checkout Session → redirect → webhook confirma → template share liberado para a org.
- **Subscription gating**: templates premium são visíveis (com "locked" badge) mas instanciação requer plano pago.
- **Revenue share**: 70% do preço vai para o author (community premium), 30% para AgentFlow. Transferidos via Stripe Connect monthly.
- **Campo no schema**: `priceCents Int?`, `currency String @default("usd")`, `stripeProductId String?`.

---

## 3. Compartilhamento

### 3.1 Tipos de Compartilhamento

| Tipo | Escopo | Permissão | Uso |
|---|---|---|---|
| **Public Link** | Qualquer um com o link | VIEW / USE | Compartilhar template ou workflow publicamente |
| **Org Link** | Membros da org | VIEW / USE / EDIT | Compartilhar dentro da equipe |
| **User-to-User** | Usuário específico | Depende do convite | Compartilhar workflow com colaborador |
| **Email Invite** | Email específico | VIEW / EDIT / EXECUTE / DUPLICATE | Colaboração direta |
| **Credential Share** | User/Org/Project | VIEW (mascarado) / TEST | Compartilhar credencial sem expor secretos |

### 3.2 Permissões de Compartilhamento

| Permission | Workflow | Template | Credential | Sub-workflow |
|---|---|---|---|---|
| **VIEW** | Ver canvas, nodes, execuções (read-only) | Ver detalhe, workflowJson (mascarado) | Ver metadados (hasValue) | Ver canvas |
| **USE** | Instanciar/template, exportar | Instanciar | — | Instanciar como sub-workflow |
| **EDIT** | Modificar nodes/edges, salvar versões | Editar draft (cria fork) | Editar nome/config (não valores) | — |
| **EXECUTE** | Executar manualmente, ver resultados | — | Testar conexão | Executar |
| **DUPLICATE** | Clonar workflow | — | — | — |
| **MANAGE** | Compartilhar, deletar, permissões | Publicar, deletar | Rotação, delete | Compartilhar |

### 3.3 Modelo de Dados (Share)

```prisma
model WorkflowShare {
  id          String       @id @default(cuid())
  workflowId  String
  workflow    Workflow     @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  token       String       @unique @default(uuid()) // para links públicos
  scope       ShareScope   // PUBLIC_LINK, ORG, USER
  permission  SharePermission
  targetUserId String?     // se scope=USER
  targetUser   User?        @relation(fields: [targetUserId], references: [id])
  expiresAt   DateTime?
  createdById String
  createdBy   User          @relation(fields: [createdById], references: [id])
  createdAt   DateTime      @default(now())
  revokedAt   DateTime?

  @@index([token])
  @@index([workflowId, revokedAt])
  @@index([targetUserId])
}

model CredentialShare {
  id          String   @id @default(cuid())
  credentialId String
  credential   Credential @relation(fields: [credentialId], references: [id], onDelete: Cascade)
  orgId        String
  scope        ShareScope  // ORG, USER
  permission   SharePermission // VIEW, TEST
  targetUserId String?
  targetUser   User?    @relation(fields: [targetUserId], references: [id])
  createdById  String
  createdBy    User     @relation(fields: [createdById], references: [id])
  createdAt    DateTime @default(now())
  expiresAt    DateTime?
  revokedAt    DateTime?

  @@unique([credentialId, targetUserId]) // unique per user
  @@index([token])
}
```

### 3.4 Expiração e Revogação

- **Expiração**: todos os shares têm `expiresAt` opcional. Links públicos expiram em 7 dias por default (configurável). Expiração automática via job BullMQ diário (`share:cleanup-expired`).
- **Revogação**: `DELETE /shares/{token}` revoga (seta `revokedAt`). Revogação imediata — o token é invalidado no DB e no Redis cache (`share:{token}:revoked`).
- **Bulk revoke**: `DELETE /workflows/{id}/shares` revoga todos os shares do workflow.

### 3.5 Compartilhamento de Sub-workflows

Sub-workflows = workflows com status `PRIVATE` e tag `subworkflow`. São instanciáveis por outros workflows (node tipo `http` com `operation: call_workflow` ou novo tipo `subflow`). Compartilhamento segue mesmo modelo de WorkflowShare, mas permissão padrão é `VIEW + EXECUTE`.

---

## 4. Comentários e Revisão

### 4.1 Comentários

Comentários são anexados a **workflows**, **nodes específicos** ou **execuções**. Cada comentário pode ter:

- `@menção` para notificar usuários
- **Thread** (reply a reply)
- **Resolução** (marcar como resolvido)
- **Anexos** (seleção de dados de execução passada)

#### Modelo de Dados

```prisma
model Comment {
  id          String       @id @default(cuid())
  workflowId  String?
  workflow    Workflow?    @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  nodeId      String?      // referência a WorkflowNode.id
  executionId String?      // referência a NodeExecution.id ou WorkflowExecution.id
  execution   WorkflowExecution? @relation(fields: [executionId], references: [id], onDelete: Cascade)

  authorId    String
  author      User         @relation(fields: [authorId], references: [id])
  orgId       String
  organization Organization @relation(fields: [orgId], references: [id])

  body        String       @db.Text
  resolvedAt  DateTime?    // quando marcado como resolvido
  resolvedById String?
  resolvedBy  User?        @relation(fields: [resolvedById], references: [id])

  parentId    String?      // para threads
  parent      Comment?     @relation("CommentThread", fields: [parentId], references: [id])
  replies     Comment[]    @relation("CommentThread")

  mentions    String[]     // userIds mencionados
  position    Json?        // { x, y } coordenadas no canvas (para node comments)

  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([workflowId, createdAt])
  @@index([executionId])
  @@index([nodeId])
  @@index([orgId])
  @@index([parentId])
}

model CommentMention {
  id          String   @id @default(cuid())
  commentId   String
  comment     Comment  @relation(fields: [commentId], references: [id], onDelete: Cascade)
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  read        Boolean  @default(false)
  createdAt   DateTime  @default(now())

  @@unique([commentId, userId])
  @@index([userId, read])
}
```

### 4.2 Operações de Comentário

| Operação | Endpoint | Auth mínima |
|---|---|---|
| Listar comentários | `GET /workflows/{id}/comments` | Viewer |
| Criar comentário | `POST /workflows/{id}/comments` | Editor |
| Responder (thread) | `POST /comments/{id}/reply` | Editor |
| Resolver | `POST /comments/{id}/resolve` | Editor |
| Marcar como não-resolvido | `POST /comments/{id}/unresolve` | Editor |
| Atualizar | `PATCH /comments/{id}` | Author ou Admin |
| Deletar | `DELETE /comments/{id}` | Author ou Admin |
| Reportar | `POST /comments/{id}/report` | — |

### 4.3 Comentários em Execuções

Comentários podem ser anexados a execuções específicas (`GET /executions/{id}/comments`). Útil para debug colaborativo:

```json
POST /api/executions/exec_abc/comments
{
  "body": "Este nó falhou porque a API retornou 429. Tenta aumentar o rate limit?",
  "nodeId": "node_http_123",
  "mentions": ["user_456"]
}
```

### 4.4 Revisão de Mudanças (Diff Visual)

Integração com o **versionamento** (§5): quando há diff entre versões, o sistema gera:

- **Diff estruturado**: nodes adicionados/removidos/alterados, edges alterados
- **Diff de parâmetros**: quais parâmetros de nó mudaram
- **Visualização inline**: overlay no canvas mostrando nodes novos (green), removidos (red), alterados (yellow)

Endpoint: `GET /workflows/{id}/versions/{v1}/diff/{v2}` → retorna diff estruturado + SVG mini-canvas.

### 4.5 Notificações de Atividade

Eventos que geram notificações:

| Evento | Gatilho | Destinatários |
|---|---|---|
| `comment_added` | Novo comentário | Menções + watchers do workflow |
| `comment_resolved` | Comentário resolvido | Menções + watchers |
| `workflow_shared` | Novo share | `targetUser` |
| `workflow_approved` | Versão publicada | Owner + watchers |
| `workflow_reverted` | Versão restaurada | Owner + editors |
| `template_published` | Template publicado | Author + followers |

**Canais**: email, painel (feed), webhook (para integração externa). Notificações são persisted em tabela `Notification` (não implementada nesta spec, mas referenciada).

### 4.6 Audit Trail

Todos os comentários e ações de revisão são auditados:

```
AUDIT LOG (AuditLog model existente):
  action: "comment.create" / "comment.resolve" / "comment.delete" / "workflow.share" / "template.publish"
  resourceId: commentId / shareToken / templateId
  metadata: { workflowId, nodeId?, executionId?, mentions[] }
  ip, userAgent, requestId
```

---

## 5. Histórico e Versionamento de Workflows

### 5.1 Modelo de Dados

Já existe `WorkflowVersion` (Prisma §schema.prisma:99-110). Extensões:

```prisma
model WorkflowVersion {
  id          String   @id @default(cuid())
  version     Int
  label       String?  // nome amigável, e.g. "v1 - Initial", "Fix webhook response"
  message     String?  // commit-like message
  snapshot    Json     // { nodes, edges, settings } full canvas state
  authorId    String
  author      User     @relation(fields: [authorId], references: [id])
  hash        String   // SHA-256 do snapshot (detecção de mudanças reais)
  source      VersionSource // MANUAL_SAVE, CANVAS_SAVE, PUBLISH, IMPORT, RESTORE, MERGE, BRANCH_MERGE
  branchId    String?  // se criada a partir de branch
  createdAt   DateTime @default(now())

  workflowId  String
  workflow    Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  @@unique([workflowId, version])
  @@unique([workflowId, hash]) // previne snapshots duplicados
  @@index([workflowId, createdAt])
  @@index([hash])
}

enum VersionSource {
  MANUAL_SAVE    // usuário salvou explicitamente (Ctrl+S, botão Save)
  CANVAS_SAVE    // autossave do canvas (debounced)
  PUBLISH        // ativação do workflow (snapshot no publish)
  IMPORT         // importação de JSON n8n
  RESTORE        // restauração de versão anterior
  MERGE          // merge de branch
  BRANCH_MERGE   // merge de volta da branch principal
}

model WorkflowBranch {
  id          String   @id @default(cuid())
  name        String   // e.g. "experiment-new-crm"
  description String?
  workflowId  String
  workflow    Workflow @relation(fields: [workflowId], references: ([id], onDelete: Cascade)
  fromVersion Int      // versão base
  headVersion Int      // versão atual da branch (último snapshot)
  status      BranchStatus // ACTIVE, MERGED, ABANDONED
  createdById String
  createdBy   User     @relation(fields: [createdById], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([workflowId, name])
  @@index([workflowId, status])
}

enum BranchStatus {
  ACTIVE
  MERGED
  ABANDONED
}
```

### 5.2 Snapshot Automático a Cada Save

- **Autossave**: canvas salva via debounce (2s) → `WorkflowVersion` com `source: CANVAS_SAVE`. Versão só é criada se o `hash` do snapshot for diferente do último (evita versões duplicadas).
- **Explicit save**: `PUT /workflows/{id}/versions` cria versão `MANUAL_SAVE` (com `message`).
- **Publish**: `POST /workflows/{id}/publish` cria snapshot `PUBLISH`.

### 5.3 Comparação Entre Versões

`GET /workflows/{id}/versions/{v1}/diff/{v2}` → diff estruturado:

```json
{
  "v1": 3,
  "v2": 5,
  "changes": {
    "nodesAdded": [
      { "id": "n5", "type": "http", "label": "New HTTP Request" }
    ],
    "nodesRemoved": [
      { "id": "n2", "type": "set_fields", "label": "Old Set" }
    ],
    "nodesChanged": [
      { "id": "n3", "type": "condition", "changes": { "parameters.conditions.string[0].value2": { "from": "old value", "to": "new value" } } }
    ],
    "edgesChanged": [
      { "action": "added", "source": "n1", "target": "n5" },
      { "action": "removed", "source": "n3", "target": "n2" }
    ],
    "settingsChanged": { "executionTimeout": { "from": 3600, "to": 7200 } }
  },
  "summary": {
    "totalAdded": 1,
    "totalRemoved": 1,
    "totalModified": 1
  }
}
```

### 5.4 Exemplo de Diff Entre Duas Versões

**Versão 1**:
```json
{
  "nodes": [
    { "id": "n1", "type": "webhook", "label": "Webhook", "config": { "parameters": { "path": "lead" } } },
    { "id": "n2", "type": "http", "label": "Create Lead", "config": { "parameters": { "url": "https://crm.com/api", "method": "POST" } } }
  ],
  "edges": [
    { "sourceNodeId": "n1", "targetNodeId": "n2" }
  ]
}
```

**Versão 2**:
```json
{
  "nodes": [
    { "id": "n1", "type": "webhook", "label": "Webhook", "config": { "parameters": { "path": "lead" } } },
    { "id": "n3", "type": "if", "label": "IF Valid", "config": { "parameters": { "conditions": { "string": [{ "value1": "{{ $json.email }}", "operation": "isNotEmpty" }] } } } },
    { "id": "n2", "type": "http", "label": "Create Lead", "config": { "parameters": { "url": "https://crm.com/v2/leads", "method": "POST" } } }
  ],
  "edges": [
    { "sourceNodeId": "n1", "targetNodeId": "n3" },
    { "sourceNodeId": "n3", "targetNodeId": "n2", "sourceHandle": "true" }
  ]
}
```

**Diff resultante**:

```json
{
  "v1": 1,
  "v2": 2,
  "changes": {
    "nodesAdded": [
      { "id": "n3", "type": "if", "label": "IF Valid", "position": "[450, 200]" }
    ],
    "nodesRemoved": [],
    "nodesChanged": [
      {
        "id": "n2",
        "type": "http",
        "changes": {
          "parameters.url": { "from": "https://crm.com/api", "to": "https://crm.com/v2/leads" }
        }
      }
    ],
    "edgesChanged": [
      { "action": "removed", "source": "n1", "target": "n2" },
      { "action": "added", "source": "n1", "target": "n3" },
      { "action": "added", "source": "n3", "target": "n2", "sourceHandle": "true" }
    ]
  },
  "summary": { "totalAdded": 1, "totalRemoved": 0, "totalModified": 1 }
}
```

### 5.5 Versionamento Semântico

Workflows não usam SemVer oficialmente, mas o conceito é mapeado:

| Ação no workflow | Tipo de mudança | Impacto |
|---|---|---|
| Adicionar node | `minor` | Compatível — workflow continua funcionando |
| Remover node | `major` | Pode quebrar — downstream nodes sem input |
| Alterar parâmetro de node | `patch` | Se não for URL/credential, não quebra |
| Alterar conexão | `major` | Pode mudar fluxo de dados |
| Alterar credential ref | `patch` | Se credential existir, funciona |

O `WorkflowVersion.version` é um inteiro incremental (1, 2, 3...). A semântica SemVer é usada apenas para UI (exibir "v1.0.0" → "v1.1.0").

### 5.6 Branching

**Branch de workflow** = cópia isolada do canvas para experimentação. Não afeta workflow ativo até merge.

```
Main: [v1] [v2] [v3*] ← HEAD (publicado)
                    ↘
Branch:                    [v4] [v5] [v6*] ← experiment (draft)
                              ↑
                              fromVersion: 3
```

**Operações**:
- `POST /workflows/{id}/branches` — cria branch do HEAD atual
- `GET /workflows/{id}/branches/{branchId}` — obtém canvas da branch
- `PUT /workflows/{id}/branches/{branchId}/canvas` — salva na branch (cria version)
- `POST /workflows/{id}/branches/{branchId}/merge` — merge para main
- `DELETE /workflows/{id}/branches/{branchId}` — abandona branch

### 5.7 Merge e Conflitos

**Merge strategy**: 3-way merge (base = `fromVersion`, ours = branch HEAD, theirs = main HEAD).

**Detecção de conflitos**:
- **Nodes duplicados**: nomes de node iguais em both sides → conflito
- **Edges órfãos**: target/source node removido em um lado → conflito
- **Parâmetros alterados**: mesmo node, parâmetro diferente → conflito (last-write-wins com aviso, ou manual)

**Resolução manual** (quando auto-merge falha):
```
POST /workflows/{id}/merge/resolve
{
  "resolution": {
    "nodesAddedConflict_a": "keep_ours",
    "nodesAddedConflict_b": "keep_theirs",
    "edgeSourceRemoved": "manual",
  }
}
```

### 5.8 Retenção de Versões

| Plano | Versões mantidas | Retenção de histórico | Cleanup policy |
|---|---|---|---|
| FREE | 10 | 30 dias | Auto-delete versões antigas + autossaves duplicados |
| STARTER | 25 | 90 dias | |
| BASIC | 50 | 180 dias | |
| GROWTH | 100 | 1 ano | |
| PRO | unlimited | unlimited | |

Cleanup via BullMQ job diário (`version:cleanup`) — soft-delete com `archived: true` e hard-delete após período de retenção + 30 dias de grace.

### 5.9 Revert de Execução

`POST /executions/{id}/re-run` → re-executa workflow com a versão que estava ativa no momento da execução original (snapshot `WorkflowVersion`). Se versão foi deletada, falla back para HEAD.

---

## 6. Importação e Exportação

### 6.1 Formato JSON n8n (Estrutura Exata)

Formato n8n workflow JSON (conforme `referencia-n8n.md §1`):

```json
{
  "name": "Lead Capture → CRM",
  "nodes": [
    {
      "id": "1",
      "name": "Webhook Lead",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300],
      "parameters": {
        "httpMethod": "POST",
        "path": "webhook/lead",
        "responseMode": "onReceived",
        "responseCode": 200
      },
      "webhookId": "lead-webhook-123"
    },
    {
      "id": "2",
      "name": "Create CRM Lead",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [450, 300],
      "parameters": {
        "url": "https://crm.com/api/leads",
        "method": "POST",
        "bodyContentType": "json",
        "jsonParameters": true,
        "bodyParametersJson": "{ \"nome\": \"{{ $json.nome }}\", \"email\": \"{{ $json.email }}\" }"
      },
      "credentials": {
        "httpHeaderAuth": "CRM API Key"
      }
    },
    {
      "id": "3",
      "name": "Log to Sheets",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.1,
      "position": [650, 300],
      "parameters": {
        "operation": "append",
        "sheetId": "1ABC...XYZ",
        "range": "A:D",
        "columns": {
          "mappingMode": "defineBelow",
          "value": [
            { "columnName": "Nome", "value": "={{ $json.nome }}" },
            { "columnName": "Email", "value": "={{ $json.email }}" }
          ]
        }
      },
      "credentials": {
        "googleSheetsOAuth2Api": "Google Sheets Account"
      }
    }
  ],
  "connections": {
    "Webhook Lead": {
      "main": [[{ "node": "Create CRM Lead", "type": "main", "index": 0 }]]
    },
    "Create CRM Lead": {
      "main": [[{ "node": "Log to Sheets", "type": "main", "index": 0 }]]
    }
  },
  "settings": {
    "executionOrder": "v1",
    "executionTimeout": 3600,
    "timezone": "America/Sao_Paulo",
    "saveManualExecutions": true
  },
  "active": false,
  "meta": {
    "instanceId": "abc123",
    "templateCredsSetupCompleted": true
  },
  "tags": ["leads", "crm"],
  "versionId": "def456",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

### 6.2 Mesmo Workflow em Formato AgentFlow

```json
{
  "id": "wf_8b3k2m",
  "name": "Lead Capture → CRM",
  "description": "Captura leads via webhook e envia para CRM + Google Sheets",
  "status": "DRAFT",
  "ownerId": "usr_123",
  "orgId": "org_456",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z",
  "nodes": [
    {
      "id": "n8n-1",
      "type": "webhook",
      "label": "Webhook Lead",
      "config": {
        "typeVersion": 1,
        "originalN8nType": "n8n-nodes-base.webhook",
        "parameters": {
          "httpMethod": "POST",
          "path": "webhook/lead",
          "responseMode": "onReceived",
          "responseCode": 200
        },
        "webhookId": "lead-webhook-123"
      },
      "position": { "x": 250, "y": 300 }
    },
    {
      "id": "n8n-2",
      "type": "http",
      "label": "Create CRM Lead",
      "config": {
        "typeVersion": 4.1,
        "originalN8nType": "n8n-nodes-base.httpRequest",
        "parameters": {
          "url": "https://crm.com/api/leads",
          "method": "POST",
          "bodyContentType": "json",
          "jsonParameters": true,
          "bodyParametersJson": "{ \"nome\": \"{{ $json.nome }}\", \"email\": \"{{ $json.email }}\" }"
        },
        "credentials": { "httpHeaderAuth": "CRM API Key" }
      },
      "position": { "x": 450, "y": 300 }
    },
    {
      "id": "n8n-3",
      "type": "sheets",
      "label": "Log to Sheets",
      "config": {
        "typeVersion": 4.1,
        "originalN8nType": "n8n-nodes-base.googleSheets",
        "parameters": {
          "operation": "append",
          "sheetId": "1ABC...XYZ",
          "range": "A:D",
          "columns": {
            "mappingMode": "defineBelow",
            "value": [
              { "columnName": "Nome", "value": "={{ $json.nome }}" },
              { "columnName": "Email", "value": "={{ $json.email }}" }
            ]
          }
        },
        "credentials": { "googleSheetsOAuth2Api": "Google Sheets Account" }
      },
      "position": { "x": 650, "y": 300 }
    }
  ],
  "edges": [
    { "id": "e1", "sourceNodeId": "n8n-1", "targetNodeId": "n8n-2" },
    { "id": "e2", "sourceNodeId": "n8n-2", "targetNodeId": "n8n-3" }
  ],
  "settings": {
    "executionOrder": "v1",
    "executionTimeout": 3600,
    "timezone": "America/Sao_Paulo"
  }
}
```

### 6.3 Importador (Parser n8n → AgentFlow)

**Endpoint**: `POST /api/workflows/import`

Já existe implementação parcial em `packages/shared/src/n8n-import.ts` e handler em `apps/api/src/routes/workflows.ts:229`. Extensões propostas:

1. **Validação completa**:
   - Schema JSON do workflow (Zod)
   - Nodes únicos por nome
   - Edges referenciam nodes existentes
   - No mínimo 1 trigger node

2. **Migração de versões antigas**:
   - `node.executeOnce` → `node.data.config.parameters.runOnceForAllItems`
   - `node.notesInFlow` → `node.data.config.notesInFlow`
   - `connections` legacy (sem `type/index`) → normaliza com defaults

3. **Nodes desconhecidos → placeholder**:
   - Tipo não mapeado na tabela de compatibilidade → `type: "advanced"`, `config.note: "Unknown n8n node type: ... (imported as advanced)"`, aviso no relatório

4. **Expressões n8n**:
   - `{{ $json.campo }}` → preservado (executor já suporta)
   - `{{ $node["Nome"].json.y }}` → preservado
   - `{{= JS expression }}` → preservado (executor usa `new Function` em sandbox)

5. **Credenciais**:
   - Referenciadas por nome (`"httpHeaderAuth": "CRM API Key"`) → mantidas como `config.credentials` (string)
   - No momento da importação, NÃO resolve para IDs — o usuário resolve via UI após importação
   - Credenciais órfãs (nome não existe na org) → aviso no relatório

### 6.4 Tabela de Compatibilidade de Nodes (n8n → AgentFlow)

| n8n Node Type | AgentFlow Type | Category | Handler | Status |
|---|---|---|---|---|
| `n8n-nodes-base.webhook` | `webhook` | Trigger | `WebhookTriggerHandler` | 🟢 Implementado |
| `n8n-nodes-base.cron` | `cron` | Trigger | `CronTriggerHandler` | 🟢 Implementado |
| `n8n-nodes-base.httpRequest` | `http` | Action | `HttpRequestHandler` | 🟢 Implementado |
| `n8n-nodes-base.if` | `condition` | Flow Control | `IfNodeHandler` | 🟡 Parcial |
| `n8n-nodes-base.switch` | `switch` | Flow Control | `SwitchNodeHandler` | 🟡 Parcial |
| `n8n-nodes-base.function` | `code` | Transform | `FunctionNodeHandler` | 🔴 Desabilitado (security) |
| `n8n-nodes-base.functionItem` | `code` | Transform | `FunctionNodeHandler` | 🔴 Desabilitado (security) |
| `n8n-nodes-base.code` | `code` | Transform | `CodeNodeHandler` | 🔴 Desabilitado (security) |
| `n8n-nodes-base.set` | `set_fields` | Transform | `SetNodeHandler` | 🟢 Implementado |
| `n8n-nodes-base.merge` | `merge` | Flow Control | `MergeNodeHandler` | 🟡 Parcial |
| `n8n-nodes-base.splitInBatches` | `splitInBatches` | Flow Control | `SplitInBatchesHandler` | 🔴 Não implementado |
| `n8n-nodes-base.delay` | `delay` | Flow Control | `DelayNodeHandler` | 🟢 Implementado |
| `n8n-nodes-base.emailSend` | `email` | Action | `EmailNodeHandler` | 🟡 Parcial |
| `n8n-nodes-base.gmail` | `gmail` | Communication | `GmailNodeHandler` | 🔴 Não implementado |
| `n8n-nodes-base.googleSheets` | `sheets` | Data | `GoogleSheetsNodeHandler` | 🔴 Não implementado |
| `n8n-nodes-base.telegram` | `telegram` | Communication | `TelegramNodeHandler` | 🔴 Não implementado |
| `n8n-nodes-base.formTrigger` | `webhook` | Trigger | `FormTriggerHandler` | 🔴 Não implementado |
| `n8n-nodes-base.errorTrigger` | `cron` | Trigger | `ErrorTriggerHandler` | 🔴 Não implementado |
| `n8n-nodes-base.wait` | `delay` | Flow Control | `WaitNodeHandler` | 🔴 Não implementado |
| `n8n-nodes-base.discord` | `discord` | Communication | `DiscordNodeHandler` | 🔴 Não implementado |
| `@n8n/n8n-nodes-langchain.openAi` | `ai_agent` | AI | `OpenAiNodeHandler` | 🟡 Parcial |

**Legenda**: 🟢 Implementado | 🟡 Parcial | 🔴 Não implementado

### 6.5 Mapeamento de Credenciais na Importação

n8n usa referência por **nome** (`"googleSheetsOAuth2Api": "Google Sheets Account"`). AgentFlow usa **ID** (`credentialId`). Estratégia:

1. **Importação**: mantém referência por nome em `config.credentials` (preserva original n8n)
2. **Após importação**: UI mostra diálogo "Mapear credenciais" — lista credenciais da org por tipo
3. **Resolução**: `PATCH /workflows/{id}/resolve-credentials` → mapeia nome → ID, salva em `config.credentialIds`

```typescript
// Exemplo de payload de mapeamento
{
  "credentialMapping": {
    "googleSheetsOAuth2Api": { "credentialName": "Google Sheets Account", "credentialId": "cred_x7y9" },
    "httpHeaderAuth": { "credentialName": "CRM API Key", "credentialId": "cred_a1b2" }
  }
}
```

### 6.6 Expressões n8n → AgentFlow

O AgentFlow executor (`executor.ts`) já implementa um subset do expression engine n8n. Mapeamento:

| Sintaxe n8n | AgentFlow | Observação |
|---|---|---|
| `{{ $json.field }}` | `{{ $json.field }}` | Suportado (regex simples) |
| `{{ $node["Nome"].json.field }}` | `{{ $node["Nome"].json.field }}` | Suportado |
| `{{ $now }}` | `{{ $now }}` | Suportado |
| `{{ $parameter.name }}` | `{{ $parameter.name }}` | Suportado |
| `{{ $credentials.apiKey }}` | `{{ $credentials.apiKey }}` | Suportado (resolves no runtime) |
| `{{ $json.array.length }}` | `{{ $json.array.length }}` | Suportado |
| `{{= $json.val * 2 }}` | `{{= $json.val * 2 }}` | Avaliação JS via `new Function` em sandbox |
| `{{ $query.param }}` | `{{ $query.param }}` | Suportado (webhook) |
| `{{ $header.name }}` | `{{ $header.name }}` | Suportado (webhook) |

### 6.7 Exportador (AgentFlow → n8n JSON)

`GET /workflows/{id}/export?format=n8n` → gera JSON compatível com n8n para migração reversa.

Processo inverso do importador:
- `WorkflowNode` → n8n node (type mapeia `webhook` → `n8n-nodes-base.webhook`)
- `WorkflowEdge` → n8n connections (structure `connections["Source"]["main"][0][0]`)
- `settings` merge com defaults n8n
- `credentials` revertidos para nome (não ID — o export nunca expõe IDs internos)

### 6.8 Import/Export de Execuções

`POST /executions/{id}/export` → JSON com input/output de cada node para debug.

```json
{
  "executionId": "exec_abc123",
  "workflowId": "wf_def456",
  "nodes": [
    {
      "nodeId": "n8n-1",
      "nodeName": "Webhook Lead",
      "type": "webhook",
      "input": { "json": { "nome": "João", "email": "joao@email.com" } },
      "output": { "json": { "nome": "João", "email": "joao@email.com" } },
      "duration": 5,
      "status": "SUCCESS"
    },
    {
      "nodeId": "n8n-2",
      "nodeName": "Create CRM Lead",
      "type": "http",
      "input": { "json": { "nome": "João", "email": "joao@email.com" } },
      "output": { "json": { "statusCode": 201, "body": { "id": 42 } } },
      "duration": 245,
      "status": "SUCCESS"
    }
  ]
}
```

### 6.9 Importação em Lote

`POST /workflows/import/batch` — aceita múltiplos workflows (JSON array ou ZIP).

```json
POST /api/workflows/import/batch
Content-Type: application/json

{
  "workflows": [n8nJson1, n8nJson2, ...],
  "orgId": "org_456",
  "strategy": "create_new" // create_new | skip_existing | overwrite
}
```

**Resposta**:

```json
{
  "results": [
    { "success": true, "workflowId": "wf_1", "name": "Workflow A", "warnings": ["credential 'foo' not found"] },
    { "success": false, "error": "Invalid JSON", "index": 1 }
  ],
  "summary": { "total": 2, "success": 1, "failed": 1 }
}
```

### 6.10 Validação de Segurança na Importação

Todas as importações passam por security scan:

| Verificação | Detalhe | Ação |
|---|---|---|
| **Code nodes perigosos** | `eval`, `Function`, `require('fs')`, `process.mainModule` | Flag como `securityRisk: true`, exige confirmação explícita |
| **URLs suspeitas** | localhost, IPs privados, `169.254.169.254` | Aviso no relatório |
| **Credenciais inline** | `parameters.apiKey` em texto claro | Flag: "Move to credential store" |
| **Nodes desconhecidos** | Tipo não na tabela de compatibilidade | Placeholder + aviso |
| **Tamanho do payload** | > 10MB (FREE), > 50MB (PRO) | Rejeitar (413) |
| **Expression injection** | `{{= }}` com código perigoso | Flag como review-needed |

### 6.11 Relatório de Importação

Estrutura da resposta de importação com relatório detalhado:

```json
{
  "workflow": { "id": "wf_abc", "name": "Imported", "status": "DRAFT" },
  "warnings": [
    { "level": "info", "code": "unknown_node", "message": "Node 'CustomNode' mapped to 'advanced'", "nodeId": "n8n-4" },
    { "level": "warn", "code": "orphan_credential", "message": "Credential 'NonExistent API' not found in org", "credentialName": "NonExistent API" },
    { "level": "error", "code": "unsafe_url", "message": "HTTP node URL points to internal IP", "nodeId": "n8n-2", "url": "http://192.168.1.1" }
  ],
  "mappings": {
    "nodesMapped": 5,
    "edgesMapped": 4,
    "nodesUnmapped": 1
  },
  "security": {
    "scanned": true,
    "riskScore": 2, // 0-10
    "flags": ["unsafe_url"]
  }
}
```

---

## 7. Colaboração em Tempo Real

### 7.1 Presença

Indica quem está editando o workflow no momento. Baseado em WebSocket + Redis pub/sub.

```typescript
// Evento: workspace:join
// Payload: { workflowId, userId, user { name, avatar, color }, cursor?: { x, y } }

// Evento: workspace:cursor
// Payload: { workflowId, userId, cursor: { x, y }, selection: [nodeIds] }
```

**UI**: avatars flutuantes no canvas, cursor colorido com nome, highlight de nodes selecionados por outros usuários.

### 7.2 Lock de Edição

**Modo cooperativo por padrão** (como Figma), mas com lock opcional:

| Modo | Comportamento |
|---|---|
| **Cooperative (default)** | Todos editam simultaneamente. Conflitos resolvidos via OT (Operational Transform) em nível de nó. |
| **Lock (opt-in)** | Um usuário faz lock do workflow. Outros entram em modo read-only até release. |

**Lock state** stored em Redis (`workflow:{id}:lock` → `{ holderId, acquiredAt, expiresAt }`, TTL 30s, heartbeat). Release automática em disconnect ou 30s de inatividade.

### 7.3 WebSocket/SSE para Sincronização

**WebSocket protocol** (`wss://api.agentflow.com/ws`):

| Evento | Direção | Payload |
|---|---|---|
| `workflow:update` | bidir | `{ workflowId, changes: PatchOp[] }` — diff JSON Patch (RFC 6902) |
| `node:add` | bidir | `{ workflowId, node }` |
| `node:remove` | bidir | `{ workflowId, nodeId }` |
| `edge:add` | bidir | `{ workflowId, edge }` |
| `edge:remove` | bidir | `{ workflowId, edgeId }` |
| `comment:add` | server→client | `{ comment }` |
| `execution:update` | server→client | `{ executionId, status, nodeUpdates[] }` |
| `cursor:move` | bidir | `{ workflowId, userId, x, y }` |

**SSE fallback**: para clientes sem WebSocket, `GET /workflows/{id}/stream` (Server-Sent Events) — receive-only, reconnect automático.

### 7.4 Resolução de Conflitos de Edição

- **Last-write-wins com aviso**: se dois usuários editam o mesmo node/field simultaneamente, o último save sobrescreve. UI mostra toast "Alguém editou este node enquanto você trabalhava — recarregar?".
- **Merge estrutural**: OT aplica diffs sequencialmente. Conflitos de estrutura (ex: node deletado + editado) → notifica usuários envolvidos.

### 7.5 Convidados/Colaboradores por Workflow

- **Convite por email**: `POST /workflows/{id}/shares` → envia convite → usuário aceita → membership criado
- **Papéis**: `viewer`, `editor`, `admin` (baseado em RBAC do org, mas pode ser mais granular por workflow)
- **Convites externos**: usuário sem org pode ser convidado como guest temporário (acesso limitado a workflow específico)

### 7.6 Atividade Recente (Feed de Eventos)

Endpoint: `GET /workflows/{id}/activity`

| Evento | Trigger | Feed entry |
|---|---|---|
| `workflow.edited` | Node/edge add/remove/modify | "Fulano adicionou nó HTTP Request" |
| `workflow.executed` | Manual run, webhook trigger | "Beltrano executou workflow via webhook" |
| `workflow.published` | `POST /publish` | "Você publicou o workflow" |
| `comment.added` | Novo comentário | "Ana comentou: 'Precisa validar o schema'" |
| `comment.resolved` | Comentário resolvido | "Carlos resolveu o comentário" |
| `version.restored` | `POST /versions/{v}/restore` | "Você restaurou v2" |
| `share.created` | Novo convite | "Você foi convidado para editar" |

Feed é paginado, ordenado por `createdAt DESC`, TTL 90 dias (FREE) a unlimited (PRO).

---

## 8. API e Eventos

### 8.1 Endpoints REST

#### Templates

| Método | Path | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/templates` | Auth opcional | Listar templates (público: official+community; private: da org) |
| `POST` | `/api/templates` | Auth | Criar template (draft, private) |
| `GET` | `/api/templates/{id}` | Auth opcional | Obter template por ID ou slug |
| `PATCH` | `/api/templates/{id}` | Auth | Atualizar draft |
| `DELETE` | `/api/templates/{id}` | Auth (owner+) | Deletar template |
| `POST` | `/api/templates/{id}/publish` | Auth (owner/admin) | Publicar template |
| `POST` | `/api/templates/{id}/submit-review` | Auth (owner) | Submeter para review (community) |
| `POST` | `/api/templates/{id}/approve` | Auth (admin/reviewer) | Aprovar template |
| `POST` | `/api/templates/{id}/reject` | Auth (admin/reviewer) | Rejeitar template |
| `POST` | `/api/templates/{id}/fork` | Auth | Duplicar para org do usuário |
| `POST` | `/api/templates/{id}/instantiate` | Auth | Criar workflow a partir do template |
| `GET` | `/api/templates/{id}/reviews` | — | Listar reviews públicos |
| `POST` | `/api/templates/{id}/reviews` | Auth | Adicionar review |
| `POST` | `/api/templates/{id}/shares` | Auth (owner+) | Criar share link/tokens |
| `DELETE` | `/api/templates/{id}/shares/{token}` | Auth (owner+) | Revogar share |

#### Compartilhamento

| Método | Path | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/workflows/{id}/shares` | Auth (owner+) | Listar shares ativos |
| `POST` | `/api/workflows/{id}/shares` | Auth (owner+) | Criar novo share |
| `DELETE` | `/api/shares/{token}` | Auth (owner+) | Revogar share por token |
| `GET` | `/s/{token}` | — | Acessar workflow compartilhado via token |
| `GET` | `/api/credentials/{id}/shares` | Auth (owner+) | Listar shares de credencial |
| `POST` | `/api/credentials/{id}/shares` | Auth (owner+) | Compartilhar credencial (sem expor valor) |

#### Comentários

| Método | Path | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/workflows/{id}/comments` | Auth (viewer+) | Listar comentários |
| `POST` | `/api/workflows/{id}/comments` | Auth (editor+) | Criar comentário |
| `POST` | `/api/comments/{id}/reply` | Auth (editor+) | Responder comentário |
| `POST` | `/api/comments/{id}/resolve` | Auth (editor+) | Marcar como resolvido |
| `PATCH` | `/api/comments/{id}` | Auth (author/admin) | Editar comentário |
| `DELETE` | `/api/comments/{id}` | Auth (author/admin) | Deletar comentário |
| `POST` | `/api/comments/{id}/report` | Auth | Reportar para moderação |

#### Versionamento

| Método | Path | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/workflows/{id}/versions` | Auth (viewer+) | Listar versões |
| `GET` | `/api/workflows/{id}/versions/{v}` | Auth (viewer+) | Obter versão específica |
| `GET` | `/api/workflows/{id}/versions/{v1}/diff/{v2}` | Auth (viewer+) | Diff entre versões |
| `POST` | `/api/workflows/{id}/versions/{v}/restore` | Auth (editor+) | Restaurar versão |
| `POST` | `/api/workflows/{id}/branches` | Auth (editor+) | Criar branch |
| `GET` | `/api/workflows/{id}/branches` | Auth (viewer+) | Listar branches |
| `POST` | `/api/workflows/{id}/branches/{b}/merge` | Auth (editor+) | Merge branch → main |
| `DELETE` | `/api/workflows/{id}/branches/{b}` | Auth (editor+) | Abandonar branch |

#### Import/Export

| Método | Path | Auth | Descrição |
|---|---|---|---|
| `POST` | `/api/workflows/import` | Auth | Importar workflow n8n JSON |
| `POST` | `/api/workflows/import/batch` | Auth (admin) | Importação em lote |
| `GET` | `/api/workflows/{id}/export` | Auth (viewer+) | Exportar (formato n8n JSON) |
| `POST` | `/api/workflows/{id}/resolve-credentials` | Auth (editor+) | Mapear credenciais n8n → AgentFlow |
| `GET` | `/api/executions/{id}/export` | Auth (viewer+) | Exportar dados de execução |

#### Colaboração Realtime

| Método | Path | Auth | Descrição |
|---|---|---|---|
| `GET` | `/ws` | Auth (JWT) | WebSocket upgrade |
| `GET` | `/api/workflows/{id}/stream` | Auth (viewer+) | SSE stream (fallback) |
| `GET` | `/api/workflows/{id}/activity` | Auth (viewer+) | Feed de atividade |

### 8.2 Eventos Emitidos

| Evento | Gatilho | Payload |
|---|---|---|
| `template_published` | Template aprovado/publicado | `{ templateId, authorId, orgId, version, category, visibility }` |
| `template_review_added` | Novo review | `{ templateId, reviewerId, rating, comment }` |
| `workflow_shared` | Novo share criado | `{ workflowId, createdById, scope, permission, expiresAt, token }` |
| `comment_added` | Comentário criado | `{ commentId, workflowId, authorId, body, nodeId?, mentions[] }` |
| `comment_resolved` | Comentário resolvido | `{ commentId, workflowId, resolvedById }` |
| `version_restored` | Versão restaurada | `{ workflowId, version, restoredById, fromVersion }` |
| `workflow_forked` | Template instanciado/forked | `{ sourceTemplateId?, sourceWorkflowId?, newWorkflowId, orgId }` |
| `execution_completed` | Workflow execution finalizada | `{ executionId, workflowId, status, duration }` |
| `share_revoked` | Share revogado | `{ token, workflowId, revokedById }` |
| `import_completed` | Importação finalizada | `{ workflowId, orgId, warnings[], errors[] }` |

### 8.3 Webhooks de Integração

`POST /api/orgs/{id}/webhooks` — configura webhook para eventos externos.

```json
POST /api/webhooks
{
  "url": "https://meu-sistema.com/agentflow-events",
  "events": ["template_published", "comment_added", "workflow_shared"],
  "secret": "optional-hmac-secret"
}
```

Events are HMAC-signed (SHA256) + retried com exponential backoff (max 5 retries).

### 8.4 SDK (Client Functions)

Funções TypeScript no package `@agentflow/sdk` (ou estendido de `packages/shared`):

```typescript
// packages/shared/src/sdk/templates.ts
export class TemplateClient {
  list(opts?: { visibility?: string[]; category?: string; search?: string; tags?: string[] }): Promise<Template[]>
  get(id: string): Promise<Template>
  create(data: { name: string; description?: string; workflowJson: unknown }): Promise<Template>
  instantiate(id: string, opts: { name: string; credentialMapping?: CredentialMapping[]; parameters?: Record<string, unknown> }): Promise<Workflow>
  review(id: string, rating: number, comment?: string): Promise<TemplateReview>
}

// packages/shared/src/sdk/collaboration.ts
export class CollaborationClient {
  connect(workflowId: string): WebSocket  // realtime sync
  subscribeActivity(workflowId: string, cb: (event: ActivityEvent) => void): Unsubscribe
  createComment(workflowId: string, body: string, opts?: { nodeId?: string; mentions?: string[] }): Promise<Comment>
  resolveComment(commentId: string): Promise<void>
  share(workflowId: string, opts: ShareOptions): Promise<WorkflowShare>
}
```

---

## 9. Segurança e Limites

### 9.1 Permissões por Papel (RBAC)

Extensão da matriz do v2-security-spec.md (§4.2) para recursos de template/colaboração:

| Role | Templates | Shares | Comments | Versions | Import/Export | Realtime |
|---|---|---|---|---|---|---|
| **owner** | CRUD + publish + review | create/revoke all | all | all | all | full |
| **admin** | CRUD + publish | create/revoke org | all | all | all | full |
| **editor** | CRUD (own) | create (own) | create on workflows they can edit | create/restore (own) | import/export (own) | edit |
| **viewer** | read | read/instantiate | read | read/diff | export (read-only) | view/cursor |

### 9.2 Rate Limits

| Endpoint | Limite | Janela |
|---|---|---|
| `POST /templates` | 10 | 1 min |
| `POST /templates/{id}/instantiate` | 20 | 1 min |
| `POST /templates/{id}/publish` | 5 | 1 min |
| `POST /workflows/{id}/shares` | 5 | 1 min |
| `POST /workflows/{id}/comments` | 30 | 1 min |
| `POST /workflows/{id}/versions/*/restore` | 5 | 1 min |
| `POST /workflows/import` | 20 | 1 min |
| `POST /workflows/import/batch` | 2 | 1 min |
| WebSocket connect | 5 | 30 seg |

### 9.3 Sanitização de Conteúdo (XSS)

- **Comentários**: sanitizados via `DOMPurify` antes de persistir em DB e renderizar
- **Nomes/descrições de templates**: validados via Zod (regex alfanumérica + espaços, max 200 chars)
- **Expressões n8n**: não são sanitizadas (são código), mas Code nodes são flagados no security scan
- **Headers de segurança**: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`

### 9.4 Validação de Tamanho de Importação

| Plano | Max workflow JSON | Max batch | Max nodes |
|---|---|---|---|
| FREE | 5 MB | 3 arquivos | 50 |
| STARTER | 20 MB | 10 arquivos | 200 |
| BASIC | 50 MB | 20 arquivos | 500 |
| GROWTH | 100 MB | 50 arquivos | 1000 |
| PRO | 500 MB | unlimited | unlimited |

### 9.5 Bloqueio de Template Malicioso

Security scan automático no submit/publish/import:

| Checagem | Detalhe | Ação |
|---|---|---|
| **Code node unsafe** | `eval`, `Function(`, `require(`, `process.mainModule`, `child_process` | `riskScore += 3`, requer admin approval |
| **URL internal** | URLs resolvendo para localhost, 169.254.169.254, IPs privados | `riskScore += 2`, aviso na importação |
| **Credential inline** | `parameters.apiKey` / `parameters.token` como string literal | `riskScore += 1`, sugestão: "mover para credential store" |
| **Expression dangerous** | `{{= }}` com `process.env`, `localStorage` | `riskScore += 2`, flag review-needed |
| **Node unknown** | Tipo não mapeado na compatibilidade table | `riskScore += 1`, placeholder |

Templates oficiais são exemptos do scan (already reviewed by equipe). Templates community passam por scan obrigatório.

### 9.6 Compliance e Auditoria

Todas as ações sensíveis de templates/colaboração geram entradas no `AuditLog` (model existente):

| Ação | Recurso | Metadados |
|---|---|---|
| `template.create` | Template | `{ name, visibility, category }` |
| `template.publish` | Template | `{ version, fromDraftVersion }` |
| `template.instantiate` | Template → Workflow | `{ newWorkflowId, credentialMapping }` |
| `template.approve` | TemplateReview | `{ templateId, rating }` |
| `template.reject` | Template | `{ rejectionReason }` |
| `workflow.share` | WorkflowShare | `{ scope, permission, expiresAt }` |
| `workflow.share.revoke` | WorkflowShare | `{ token }` |
| `comment.create` | Comment | `{ workflowId, nodeId?, mentions[] }` |
| `comment.resolve` | Comment | `{ workflowId, commentId }` |
| `workflow.version.restore` | WorkflowVersion | `{ version, newWorkflowVersion }` |
| `workflow.branch.create` | WorkflowBranch | `{ fromVersion }` |
| `workflow.branch.merge` | WorkflowBranch | `{ branchName, conflictDetected }` |
| `import.start` / `import.complete` | Workflow | `{ nodeCount, edgeCount, warnings }` |

**Retention**: audit logs mantidos por 1 ano (mínimo LGPD). Hard delete via job cron após período.

### 9.7 Credencial Sharing (sem expor segredos)

Quando se compartilha um workflow, as credenciais referenciadas **nunca** são expostas:

1. Workflow JSON exportado → `config.credentials` contém apenas nomes (string references)
2. Share link → destinatário deve mapear credenciais próprias na org
3. Credential share explícito → `CredentialShare` model com `permission: VIEW` (mascarado) — destinatário vê `hasValue` mas nunca o valor real

---

## 10. UX/UI

### 10.1 Páginas

| Página | Path (Next.js) | Componentes-principais |
|---|---|---|
| **Template Library** | `/templates` | TemplateCard[], TemplateFilters, SearchBar, CategoryNav, Pagination |
| **Template Detail** | `/templates/[id]` | TemplateHero, NodePreview, CredentialMap, InstantiateModal, Reviews, RelatedTemplates |
| **Template Editor** | `/templates/[id]/edit` | WorkflowCanvas (read-only ou edit mode), Settings sidebar, Publish flow |
| **Share Modal** | (modal overlay) | ShareForm (scope, permission, expiry), ShareList, Token copy |
| **Workflow History** | `/workflows/[id]/versions` | VersionTimeline, VersionDiff, RestoreButton |
| **Comments Panel** | `/workflows/[id]/comments` (ou sidebar) | CommentList, CommentEditor, ThreadView, MentionPicker |
| **Marketplace** | `/marketplace` | CategoryTabs, FeaturedTemplates, Trending, Newest, SearchResults |
| **Activity Feed** | `/workflows/[id]/activity` | ActivityTimeline, EventCard, ActorInfo |

### 10.2 Componentes

| Componente | Responsabilidade | Props-chave |
|---|---|---|
| `TemplateCard` | Miniatura do template no grid | `template` (name, description, category, tags, rating, installs, author) |
| `TemplateFilters` | Filtros de busca e categoria | `onFilterChange`, `categories[]`, `tags[]` |
| `InstantiateWizard` | Wizard de 3 passos (credential mapping → parameters → confirm) | `template`, `onInstantiate` |
| `ShareDialog` | Criar/share link ou convidar | `resourceId`, `resourceType` |
| `VersionTimeline` | Timeline vertical de versões | `versions[]`, `onSelect`, `onRestore` |
| `WorkflowDiff` | Visualização de diff | `v1`, `v2`, `changes` |
| `CommentThread` | Lista de comentários + replies | `workflowId`, `nodeId?`, `onComment` |
| `NodeMiniMap` | Mini mapa do workflow no detalhe | `nodes`, `edges`, `highlightNodes[]` |
| `RealtimeCursors` | Cursos de outros usuários | `cursors[]`, `currentUserId` |

### 10.3 Fluxos

#### Fluxo: Importar → Validar → Revisar → Salvar

```
1. Usuário clica "Import" na página `/workflows/import`
2. Upload de JSON ou drag-drop
3. Frontend envia para POST /api/workflows/import
4. Backend valida → security scan → mapeia nodes/edges → resolve credenciais (por nome)
5. Response: { workflowId, warnings[], unmappedCredentials[] }
6. Se warnings: modal mostra lista para confirmar
7. Workflow aberto no editor em modo DRAFT
8. User botão "Save" → cria WorkflowVersion (source: IMPORT)
```

#### Fluxo: Compartilhar → Escolher Permissão → Copiar Link

```
1. Editor clica botão "Share" no toolbar
2. Modal abre: tabs [Link] [People] [Expiration]
3. [Link]: select scope (public/org) + permission (view/use/edit) + expiry (7d/30d/never)
4. Gera token → POST /api/workflows/{id}/shares → retorna shareUrl
5. [People]: input email → POST convite → email enviado
6. [Expiration]: se expirado, share automaticamente revogado
7. User copia link ou envia convite
```

#### Fluxo: Editar Colaborativo → Lock → Salvar Versão

```
1. User abre workflow editor
2. WebSocket conecta → join room → recebe estado atual + presença de outros
3. Se modo "Lock": prompt "Fulano está editando. Entrar em modo view?" ou "Solicitar acesso"
4. Edições sincronizadas via OT over WebSocket
5. Autosave (debounced 2s) → PATCH /api/workflows/{id} → novo WorkflowVersion (source: CANVAS_SAVE)
6. Botão "Save" manual → POST /api/workflows/{id}/versions (com message) → version MANUAL_SAVE
```

### 10.4 Wireframe: Template Library

```
┌─────────────────────────────────────────────────────────────────────┐
│  Templates                                                    [🔍]  │
├──────────┬──────────────────────────────────────────────────────────┤
│          │  [All] [Marketing] [Data Sync] [AI Assistant] [My Org]   │
│ Sidebar  │                                                          │
│          │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ ...  │
│          │  │ Webhook→CRM │  │  AI Survey    │  │ Google Sheets │   │
│          │  │ ★4.8 · 12K  │  │ ★4.5 · 8.2K  │  │ ★4.3 · 5.1K  │   │
│          │  │ by: official│  │ by: community│  │ by: official│   │
│          │  └─────────────┘  └─────────────┘  └─────────────┘   │
│          │                                                          │
│ Filters  │  [Newest] [Most Popular] [Top Rated] [My Templates]      │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  Page 1 of 12  •  24 templates                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.5 Wireframe: Workflow History / Diff

```
┌─────────────────────────────────────────────────────────────────────┐
│  Workflow: Lead Capture → CRM                                      │
│  History                                                            │
├─────────────────────────────────────────────────────────────────────┤
│  v5  ● published  2026-08-19 14:30  "Added Telegram notification"  │
│  v4  ○ saved      2026-08-18 09:15  "Fixed HTTP URL"              │
│  v3  ○ saved      2026-08-15 16:45  "Added IF condition node"      │
│  v1  ● created    2026-08-14 10:00  "Initial workflow"             │
├─────────────────────────────────────────────────────────────────────┤
│  [Compare v3 → v4]  [Restore v3]                                    │
├─────────────────────────────────────────────────────────────────────┤
│  DIFF: v3 → v4                                                       │
│  ┌──────────┬────────────────────────────────────────────────────┐  │
│  │  Nodes   │  + Webhook Lead (added)                           │  │
│  │  Added   │  + Create CRM Lead (added)                        │  │
│  │          │  - Log to Sheets (removed)                        │  │
│  │          │  ~ HTTP Request (changed: url)                    │  │
│  │  Edges   │  + Webhook Lead → Create CRM Lead                 │  │
│  │  Changed │  - Create CRM Lead → Log to Sheets (removed)      │  │
│  └──────────┴────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 11. Critérios de Aceite

- [x] Todos os 10 tópicos cobertos com detalhe de implementação
- [x] Modelos de dados com campos concretos (Prisma schema)
- [x] Exemplo de JSON de workflow n8n e exemplo do mesmo workflow em formato AgentFlow
- [x] Exemplo de diff entre duas versões de workflow
- [x] Tabela de compatibilidade de nodes n8n → AgentFlow (mín. 20 linhas)
- [x] Endpoints REST listados com método e path
- [x] Eventos com payloads exemplificados
- [x] Fluxos de UX descritos com passos concretos
- [x] Mínimo 500 linhas

### 11.1 Decisões de Arquitetura (ADRs)

- **ADR-01**: Templates compartilham o mesmo JSON schema de workflow do n8n. Não há formato próprio — reutiliza `Workflow.nodes/edges/settings` do schema existente.
- **ADR-02**: Colaboração realtime usa WebSocket com fallback SSE. Protocolo baseado em JSON Patch (RFC 6902) para operações granulares.
- **ADR-03**: Branching de workflow usa versão de partida (`fromVersion`) + head version. Merge é 3-way.
- **ADR-04**: Security scan de templates é síncrono no import/publish. Code nodes perigosos são flagados, não bloqueados (permitem review manual).
- **ADR-05**: Marketplace é nativo (não agregador). Templates oficiais no repo; community submetidos via API.
- **ADR-06**: Audit trail reutiliza o modelo `AuditLog` existente — não cria tabela nova. Todas as actions são append-only.
- **ADR-07**: Expressões n8n (`{{ }}` e `{{= }}`) são preservadas no import e avaliadas pelo executor existente. Nenhuma transformação de sintaxe é feita.

### 11.2 Dependências Já Disponíveis

| Pacote | Uso | Status |
|---|---|---|
| `@xyflow/react` v12 | Canvas visual | ✅ Instalado |
| `bullmq` | Queue + eventos | ✅ Instalado |
| `ioredis` | Redis pub/sub | ✅ Instalado |
| `zod` | Validação schemas | ✅ Instalado |
| `prisma` | ORM | ✅ Instalado |
| `bcryptjs` | Hash passwords | ✅ Instalado |
| `@noble/hashes` | HKDF para crypto | ✅ Instalado |
| `ipaddr.js` | SSRF guard | ✅ Instalado |
| `framer-motion` | Animações UI | ✅ Instalado |
| `lucide-react` | Ícones | ✅ Instalado |

**Nova dependência recomendada** (para realtime):
- `socket.io` v4 ou `@microsoft/signalr` — WebSocket abstraction com fallback automático

### 11.3 Arquivos a Criar (Implementation Plan)

| Categoria | Arquivo | Tipo |
|---|---|---|
| **Schema** | `packages/database/prisma/schema.prisma` (extend) | WorkflowTemplate, TemplateReview, TemplateShare, WorkflowShare, CredentialShare, Comment, CommentMention, WorkflowBranch |
| **Shared Types** | `packages/shared/src/templates.ts` | Zod schemas + types para templates |
| **Shared Types** | `packages/shared/src/collaboration.ts` | Comment, Share, Version, Branch tipos |
| **API Routes** | `apps/api/src/routes/templates.ts` | Template CRUD + publish + review + instantiate + fork |
| **API Routes** | `apps/api/src/routes/shares.ts` | Share management |
| **API Routes** | `apps/api/src/routes/comments.ts` | Comments CRUD + threads + mentions |
| **API Routes** | `apps/api/src/routes/versions.ts` | Version history, diff, restore, branches |
| **Services** | `apps/api/src/services/template.service.ts` | Template business logic |
| **Services** | `apps/api/src/services/share.service.ts` | Share link generation + token validation |
| **Services** | `apps/api/src/services/comment.service.ts` | Comments + mentions + notifications |
| **Services** | `apps/api/src/services/version.service.ts` | Version snapshots + diff generation |
| **Services** | `apps/api/src/services/security-scan.ts` | Template/code node security scan |
| **Services** | `apps/api/src/services/import-export.service.ts` | Extended n8n import/export |
| **WebSocket** | `apps/api/src/services/realtime.ts` | WS server + room management + OT |
| **Workers** | `apps/api/src/workers/share-cleanup.worker.ts` | Daily job: revoke expired shares |
| **Workers** | `apps/api/src/workers/audit-cleanup.worker.ts` | Daily job: archive old audit logs |
| **Web Pages** | `apps/web/src/app/templates/page.tsx` | Template library + marketplace |
| **Web Pages** | `apps/web/src/app/templates/[id]/page.tsx` | Template detail + instantiate wizard |
| **Web Pages** | `apps/web/src/app/workflows/[id]/versions/page.tsx` | Version history + diff |
| **Web Pages** | `apps/web/src/app/workflows/[id]/comments/page.tsx` | Comments panel |
| **Web Pages** | `apps/web/src/app/workflows/[id]/activity/page.tsx` | Activity feed |
| **Web Components** | `apps/web/src/components/templates/TemplateCard.tsx` | Template card component |
| **Web Components** | `apps/web/src/components/templates/InstantiateWizard.tsx` | 3-step wizard |
| **Web Components** | `apps/web/src/components/collaboration/CommentThread.tsx` | Comments UI |
| **Web Components** | `apps/web/src/components/collaboration/RealtimeCursors.tsx` | Presence cursors |
| **Web Components** | `apps/web/src/components/version/VersionTimeline.tsx` | History timeline |
| **Web Components** | `apps/web/src/components/version/DiffViewer.tsx` | Visual diff |

---

## Apêndice A: Exemplo Completo de Workflow n8n Export

```json
{
  "name": "Save Gmail Attachments to Google Drive",
  "nodes": [
    {
      "parameters": {
        "event": "messageReceived",
        "options": {
          "format": "full",
          "downloadAttachments": true,
          "attachments": true
        }
      },
      "name": "On New Email",
      "type": "n8n-nodes-base.gmailTrigger",
      "typeVersion": 1.4,
      "position": [250, 300],
      "credentials": {
        "gmailOAuth2Api": "Gmail OAuth2 API"
      }
    },
    {
      "parameters": {
        "functionCode": "const attachments = $json.attachments || [];\nreturn attachments.map(att => ({\n  json: {\n    ...att,\n    messageId: $json.id,\n    from: $json.from\n  },\n  binary: att.binary\n}));"
      },
      "name": "Split Attachments",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [450, 300]
    },
    {
      "parameters": {
        "resource": "file",
        "operation": "upload",
        "parentId": "GoogleDriveFolder",
        "name": "={{ $json.name }}",
        "options": {},
        "binaryPropertyName": "binary"
      },
      "name": "Upload to Google Drive",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [650, 300],
      "credentials": {
        "googleDriveOAuth2Api": "Google Drive OAuth2 API"
      }
    }
  ],
  "connections": {
    "On New Email": {
      "main": [[{ "node": "Split Attachments", "type": "main", "index": 0 }]]
    },
    "Split Attachments": {
      "main": [[{ "node": "Upload to Google Drive", "type": "main", "index": 0 }]]
    }
  },
  "settings": {
    "executionOrder": "v1",
    "saveManualExecutions": true,
    "timezone": "America/Sao_Paulo"
  },
  "staticData": {},
  "pinData": {},
  "active": false,
  "meta": {
    "instanceId": "abc123",
    "templateCredsSetupCompleted": true
  },
  "tags": ["email", "google", "drive"]
}
```

## Apêndice B: Eventos — Payloads Exemplificados

### `template_published`

```json
{
  "event": "template_published",
  "timestamp": "2026-08-20T14:30:00.000Z",
  "payload": {
    "templateId": "tmpl_x7y9",
    "slug": "lead-capture-crm",
    "authorId": "usr_123",
    "orgId": "org_456",
    "version": 2,
    "versionId": "ver_abc123",
    "category": "marketing",
    "visibility": "COMMUNITY",
    "name": "Lead Capture → CRM"
  }
}
```

### `comment_added`

```json
{
  "event": "comment_added",
  "timestamp": "2026-08-20T15:00:00.000Z",
  "payload": {
    "commentId": "cmt_def456",
    "workflowId": "wf_8b3k2m",
    "authorId": "usr_789",
    "nodeId": "n8n-2",
    "body": "Este node precisa validar o schema do CRM antes de fazer a chamada",
    "mentions": ["usr_123"]
  }
}
```

### `workflow_shared`

```json
{
  "event": "workflow_shared",
  "timestamp": "2026-08-20T15:30:00.000Z",
  "payload": {
    "workflowId": "wf_8b3k2m",
    "createdById": "usr_123",
    "scope": "ORG",
    "permission": "EDIT",
    "expiresAt": "2026-08-27T15:30:00.000Z",
    "token": "s_abc123def456"
  }
}
```

### `version_restored`

```json
{
  "event": "workflow_version_restored",
  "timestamp": "2026-08-20T16:00:00.000Z",
  "payload": {
    "workflowId": "wf_8b3k2m",
    "version": 3,
    "restoredById": "usr_123",
    "newWorkflowVersion": 7,
    "restoredFrom": "2026-08-18T09:15:00.000Z"
  }
}
```

## Apêndice C: Tabela de Compatibilidade de Nodes (20+ linhas)

| # | n8n Node Type | AgentFlow Type | Category | Handler | Prioridade | Status |
|---|---|---|---|---|---|---|
| 1 | `n8n-nodes-base.webhook` | `webhook` | trigger | `WebhookTriggerHandler` | 🔴 Crítica | Implementado |
| 2 | `n8n-nodes-base.cron` | `cron` | trigger | `CronTriggerHandler` | 🔴 Crítica | Implementado |
| 3 | `n8n-nodes-base.httpRequest` | `http` | action | `HttpRequestHandler` | 🔴 Crítica | Implementado |
| 4 | `n8n-nodes-base.manual` | `manual` | trigger | `ManualTriggerHandler` | 🔴 Crítica | Implementado |
| 5 | `n8n-nodes-base.if` | `condition` | flowControl | `IfNodeHandler` | 🟡 Alta | Parcial |
| 6 | `n8n-nodes-base.switch` | `switch` | flowControl | `SwitchNodeHandler` | 🟡 Alta | Parcial |
| 7 | `n8n-nodes-base.function` | `code` | transform | `FunctionNodeHandler` | 🔴 Crítica | Desabilitado |
| 8 | `n8n-nodes-base.functionItem` | `code` | transform | `FunctionNodeHandler` | 🟡 Alta | Desabilitado |
| 9 | `n8n-nodes-base.code` | `code` | transform | `CodeNodeHandler` | 🟡 Alta | Desabilitado |
| 10 | `n8n-nodes-base.set` | `set_fields` | transform | `SetNodeHandler` | 🔴 Crítica | Implementado |
| 11 | `n8n-nodes-base.merge` | `merge` | flowControl | `MergeNodeHandler` | 🟡 Alta | Parcial |
| 12 | `n8n-nodes-base.splitInBatches` | `splitInBatches` | flowControl | `SplitInBatchesHandler` | 🟡 Alta | Não implementado |
| 13 | `n8n-nodes-base.delay` | `delay` | flowControl | `DelayNodeHandler` | 🟡 Alta | Implementado |
| 14 | `n8n-nodes-base.wait` | `delay` | flowControl | `WaitNodeHandler` | 🟢 Média | Não implementado |
| 15 | `n8n-nodes-base.emailSend` | `email` | action | `EmailNodeHandler` | 🟡 Alta | Parcial |
| 16 | `n8n-nodes-base.gmail` | `gmail` | communication | `GmailNodeHandler` | 🟡 Alta | Não implementado |
| 17 | `n8n-nodes-base.googleSheets` | `sheets` | data | `GoogleSheetsNodeHandler` | 🟡 Alta | Não implementado |
| 18 | `n8n-nodes-base.telegram` | `telegram` | communication | `TelegramNodeHandler` | 🟡 Alta | Não implementado |
| 19 | `n8n-nodes-base.discord` | `discord` | communication | `DiscordNodeHandler` | 🟢 Média | Não implementado |
| 20 | `n8n-nodes-base.formTrigger` | `webhook` | trigger | `FormTriggerHandler` | 🟢 Média | Não implementado |
| 21 | `n8n-nodes-base.errorTrigger` | `cron` | trigger | `ErrorTriggerHandler` | 🟢 Média | Não implementado |
| 22 | `n8n-nodes-base.googleDrive` | `googleDrive` | data | `GoogleDriveNodeHandler` | 🟢 Média | Não implementado |
| 23 | `n8n-nodes-base.gmailTrigger` | `gmailTrigger` | trigger | `GmailTriggerHandler` | 🟢 Média | Não implementado |
| 24 | `n8n-nodes-base.emailReadImap` | `emailReadImap` | trigger | `ImapTriggerHandler` | 🟢 Média | Não implementado |
| 25 | `@n8n/n8n-nodes-langchain.openAi` | `ai_agent` | ai | `OpenAiNodeHandler` | 🔴 Crítica | Parcial |
| 26 | `n8n-nodes-base.respondToWebhook` | `respond_webhook` | action | `RespondWebhookHandler` | 🟡 Alta | Não implementado |

---

## Apêndice D: Fluxo de Sincronização Realtime (Sequence Diagram)

```
User A (Editor)          WebSocket Server          Redis Pub/Sub          User B (Viewer)
     |                          |                         |                    |
     |--- CONNECT WS --------->|                         |                    |
     |                          |-- JOIN room:{wfId} -->|                    |
     |                          |<--- joined -----------|                    |
     |                          |                         |                    |
     |--- add node n4 --------->|                         |                    |
     |                          |-- PUBLISH ws:update -->|-------> PUBLISH--->|
     |                          |                         |                    |
     |                          |                         |-- BROADCAST -->    |
     |                          |<------- ws:update ------|                    |
     |                          |                        |                    |
     |--- PATCH /api/wf/{id} -->|                         |                    |
     |  (autossave, 2s)         |                         |                    |
     |                          |--- create version ----->| Prisma (tx)        |
     |                          |<--- ok -----------------|                    |
     |<--- ok ------------------|                         |                    |
     |                          |                         |                    |
     |--- cursor move --------->|                         |                    |
     |                          |-- PUBLISH cursor ----->|-------> PUBLISH--->|
     |                          |                        |                    |
     |                          |                        |-- show cursor -->  |
     |                          |                        |    (blue, "User A")|
```

---

## Referências

| Fonte | Uso |
|---|---|
| `n8n-migration/referencia-n8n.md` | Formato JSON n8n, estrutura de nodes/connections/credentials |
| `n8n-migration/api-n8n.md` | Endpoints REST n8n (import, export, publish/unpublish) |
| `n8n-migration/catalogo-nodes.md` | Catálogo de node types + handlers TypeScript |
| `n8n-migration/design-recriacao.md` | Prisma models existentes, import/export mapping |
| `n8n-migration/v2-security-spec.md` | RBAC, auditoria, segurança, envelope encryption |
| `n8n-migration/design-seguranca.md` | Vault de credenciais, HKDF, AES-256-GCM |
| `n8n-migration/repo-map.md` | Arquitetura do repo, arquivos existentes |
| `packages/shared/src/index.ts` | Zod schemas compartilhados |
| `apps/api/src/routes/workflows.ts` | Handler de importação existente |
| `apps/api/src/services/executor.ts` | Engine de execução + SSRF guard |
| `apps/api/src/middleware/auth.ts` | Auth middleware + RBAC básico |
| `apps/web/src/lib/api.ts` | Client API + patterns REST existentes |
| `packages/database/prisma/schema.prisma` | Schema Prisma completo existente |

---

*Documento gerado para a missão "Recriar n8n no AgentFlow" — Frente 14: Templates, Import/Export e Colaboração.*
*Arquivo: `n8n-migration/v2-templates-collaboration.md`*
*Status: DESIGN — não implementar, não commitar.*
