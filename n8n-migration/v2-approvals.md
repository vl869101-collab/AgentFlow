# Especificação: Aprovação Humana e Human-in-the-Loop v2
> **Missão**: Recriar n8n no AgentFlow — sistema de intervenção humana em workflows
> **Work dir**: `n8n-migration/`
> **Data**: 2026-08-20
> **Status**: DESIGN — não implementar, não commitar
> **Base**: `design-runner.md` (executor/wait/resume), `design-seguranca.md` (cripto/auditoria), `v2-security-spec.md` (RBAC, auditoria, HMAC), `briefs/prompt-comunicacao.md` (canais), `briefs/prompt-engine-spec.md` (DAG/execução), schema Prisma existente (`Approval`, `ExecutionStatus.WAITING_APPROVAL`)

---

## 0. Resumo Executivo

O **Approval Node** é o mecanismo de *human-in-the-loop* do AgentFlow: um nó no grafo do workflow que **pausa a execução** e aguarda uma decisão humana (aprovação, rejeição ou comentário) antes de retomar. O sistema suporta modos simples (um aprovador) e avançados (N aprovadores, quorum, cadeia de escalonamento, deadline com ação padrão, múltiplos itens). As decisões podem chegar via **link seguro por e-mail**, **botões em chat (Telegram/Slack/Discord/WhatsApp)**, **painel web** ou **API programática**.

**Princípios centrais:**

| Princípio | Aplicação |
|-----------|-----------|
| Persistência | Estado de aprovação e execução são persistidos no PostgreSQL (nunca em memória apenas) — sobrevive a reinícios de servidor |
| Segurança de token | Token único de 256 bits, armazenado como SHA-256, HMAC, TTL, uso único, escopo mínimo (apenas aquele approval) |
| Audit-first | Toda ação gera entrada imutável no `ApprovalAuditLog` com quem, quando, IP, user agent |
| Least privilege | Apenas membros da org com role `OWNER`/`ADMIN` (ou delegado) podem decidir; links externos são de uso único |
| Defense in depth | Link seguro: token hash + HMAC + escopo + expiração + uso único + rate limit; banco: constraint único; engine: re-valida antes de retomar |
| Fail secure | Timeout → ação padrão configurada (não bloqueia a execução indefinidamente) |

---

## 1. Visão geral da Arquitetura

### 1.1 Componentes

```
┌─────────────────────────────────────────────────────────────────────┐
│                          API (Fastify)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Approval     │  │ ApprovalToken│  │ ApprovalPolicy│              │
│  │ Service      │  │ Service      │  │ Service      │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                │                 │                       │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐              │
│  │ Notification │  │ Audit Logger │  │ Reminder Job │             │
│  │ Service      │  │              │  │ (BullMQ)     │              │
│  └──────┬───────┘  └──────────────┘  └──────────────┘              │
└─────────┼──────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│         Data Layer (Prisma + PostgreSQL)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │ Approval     │  │ ApprovalToken│  │ ApprovalPolicy│  │ AuditLog│ │
│  │ ApprovalApprover│ ApprovalComment│ ApprovalRemind.│  │         │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────┘ │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Channels de Notificação                                            │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐         │
│  │Email │  │Telegram│Slack│Discord│WhatsApp│ Web │API │         │
│  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘         │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Executor (worker BullMQ)                                           │
│  - pausa execução (status=WAITING_APPROVAL)                         │
│  - retoma quando approval.status=APPROVED                          │
│  - timeout → ação padrão                                            │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Conceitos Fundamentais

- **Approval Request**: instância de uma aprovação criada quando o executor encontra um nó `approval` no grafo. Vinculada a uma `WorkflowExecution` e a um `WorkflowNode`.
- **Approval Policy**: configuração declarada no próprio nó `approval` (modo, quorum, deadline, ação padrão, escalonamento, canais, condição). Determina o comportamento do request.
- **Approver**: usuário (ou grupo de usuários) que deve decidir. Pode ser: explícito (lista de userIds), herdado (owner/admin da org), ou dinâmico (resolução por expressão do workflow).
- **Token de Aprovação**: string URL-safe de 256 bits, gerada por `crypto.randomBytes(32)`, armazenada como `sha256(token)` no banco, usado uma única vez, com expiração e HMAC.
- **Channel**: meio pelo qual o aprovador é notificado e pode decidir (email, chat, painel, API).

---

## 2. Modelo de dados (tabelas/entidades)

> Harmoniza com o modelo existente (`Approval`, `ApprovalStatus`, `ExecutionStatus.WAITING_APPROVAL`) estendendo-o para os modos avançados. Todas as novas tabelas carregam `orgId` para tenant isolation (conforme v2-security-spec §10).

### 2.1 Schema Prisma estendido

```prisma
/// Approval estendido — 1 request pode ter N approvers
model Approval {
  id          String          @id @default(cuid())
  status      ApprovalStatus  @default(PENDING)
  message     String?         /// Título/motivo exibido ao aprovador
  context     Json?           /// Dados de entrada do node para contexto
  decision    ApprovalDecision? /// APROVED | REJECTED | ABSTAINED
  comment     String?         /// Comentário do decisor
  decidedAt   DateTime?
  createdAt   DateTime        @default(now())

  /// Configuração declarada no node — snapshotado no momento da criação
  mode        ApprovalMode    @default(SINGLE)     // SINGLE, COLLECTIVE, QUORUM, CHAIN, CONDITIONAL
  quorumValue Int?            /// Se QUORUM: número absoluto ou % (0-100)
  deadlineAt  DateTime?       /// TTL absoluto (null = sem deadline)
  defaultAction ApprovalAction? /// APROVE | REJECT | ESCALATE — aplicada no timeout

  /// Relacionamentos
  executionId String
  execution   WorkflowExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)
  nodeId      String            /// qual nó approval no workflow
  node        WorkflowNode      @relation(fields: [nodeId], references: [id], onDelete: Cascade)

  orgId       String
  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  /// Quem criou (triggerou) a aprovação — para auditoria
  requestedById String?
  requestedBy   User?   @relation("ApprovalRequester", fields: [requestedById], references: [id])

  /// Múltiplos aprovadores por request
  approvers   ApprovalApprover[]

  /// Token de link seguro (1:1 com o request, mas pode regenerar)
  tokens      ApprovalToken[]

  comments    ApprovalComment[]

  /// Escalonamento
  escalateFromId String?               /// approval pai (se escalonado)
  escalateFrom   Approval?  @relation("EscalationChain", fields: [escalateFromId], references: [id])
  escalatedTo   Approval[]   @relation("EscalationChain") /// aprovations que escalonaram desta

  @@index([executionId, status])
  @@index([orgId, status, createdAt])
  @@index([deadlineAt])
  @@index([nodeId])
}

model ApprovalApprover {
  id         String   @id @default(cuid())
  approvalId String
  approval   Approval @relation(fields: [approvalId], references: [id], onDelete: Cascade)

  userId     String?           /// usuário direto (null se grupo)
  user       User?    @relation(fields: [userId], references: [id], onDelete: Cascade)

  groupId    String?           /// team/department (futuro)
  status     ApproverStatus   @default(PENDING)    // PENDING, APPROVED, REJECTED, DELEGATED, SKIPPED
  delegatedToId String?
  delegatedTo   ApprovalApprover? @relation("Delegation", fields: [delegatedToId], references: [id])
  delegatedBy   ApprovalApprover? @relation("Delegation", references: [delegatedToId])
  decisionAt DateTime?
  comment    String?

  @@index([approvalId])
  @@index([userId, status])
}

/// Token de link seguro — sempre hash, nunca plaintext
model ApprovalToken {
  id            String    @id @default(cuid())
  approvalId    String
  approval      Approval  @relation(fields: [approvalId], references: [id], onDelete: Cascade)

  tokenHash     String    @unique    /// sha256(token)
  signature     String    /// HMAC-SHA256 da payload {approvalId, orgId, exp} — anti-tamper
  expiresAt     DateTime
  consumedAt    DateTime?              /// null = ativo; preenchido no uso
  consumedById  String?
  consumedBy    User?   @relation("TokenConsumer", fields: [consumedById], references: [id])
  consumedIp    String?
  consumedUa    String?
  revokedAt     DateTime?
  revokedById   String?

  @@index([approvalId])
  @@index([expiresAt])
}

model ApprovalComment {
  id         String   @id @default(cuid())
  approvalId String
  approval   Approval @relation(fields: [approvalId], references: [id], onDelete: Cascade)

  userId     String?
  user       User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
  system     Boolean @default(false)  /// true se de sistema (ex: "timeout expired")

  comment    String
  createdAt  DateTime @default(now())

  @@index([approvalId, createdAt])
}

/// Agendamento de lembretes/retry de notificação
model ApprovalReminder {
  id         String   @id @default(cuid())
  approvalId String
  approval   Approval @relation(fields: [approvalId], references: [id], onDelete: Cascade)

  scheduledAt DateTime           /// quando disparar
  channel     ApprovalChannel    /// EMAIL, TELEGRAM, SLACK, DISCORD, WHATSAPP
  sentAt      DateTime?           /// quando realmente enviado
  status      ReminderStatus     @default(PENDING)  // PENDING, SENT, FAILED

  @@index([approvalId])
  @@index([scheduledAt, status])
}

enum ApprovalMode {
  SINGLE       /// Um aprovador qualquer basta (modo atual)
  COLLECTIVE   /// Todos os aprovadores devem aprovar
  QUORUM       /// N aprovadores (ou N%) basta
  CHAIN        /// Cadeia de escalonamento (aprovador 1 → 2 → 3...)
  CONDITIONAL  /// Aprovação condicional (condição JS expressa no node)
}

enum ApprovalDecision {
  APROVED
  REJECTED
  ABSTAINED
}

enum ApproverStatus {
  PENDING
  APPROVED
  REJECTED
  DELEGATED
  SKIPPED
}

enum ApprovalChannel {
  EMAIL
  TELEGRAM
  SLACK
  DISCORD
  WHATSAPP
  PANEL
  API
}

enum ReminderStatus {
  PENDING
  SENT
  FAILED
}

/// Extensão do enum existente
enum ApprovalAction {
  APROVE     /// ação padrão no timeout: aprovar
  REJECT     /// ação padrão no timeout: rejeitar
  ESCALATE   /// ação padrão no timeout: escalar para próximo nível
}
```

### 2.2 Interfaces TypeScript (`packages/shared/src/approvals.ts`)

```typescript
import { z } from "zod";

/// Modos de aprovação
export const ApprovalModeSchema = z.enum([
  "SINGLE", "COLLECTIVE", "QUORUM", "CHAIN", "CONDITIONAL",
]);
export type ApprovalMode = z.infer<typeof ApprovalModeSchema>;

/// Ação padrão no timeout
export const TimeoutActionSchema = z.enum(["APPROVE", "REJECT", "ESCALATE"]);
export type TimeoutAction = z.infer<typeof TimeoutActionSchema>;

/// Canais de notificação
export const ApprovalChannelSchema = z.enum([
  "EMAIL", "TELEGRAM", "SLACK", "DISCORD", "WHATSAPP", "PANEL", "API",
]);
export type ApprovalChannel = z.infer<typeof ApprovalChannelSchema>;

/// Condição (para modo CONDITIONAL) — expressão n8n avaliada pelo executor
export const ApprovalConditionSchema = z.object({
  expression: z.string(),           /// ex: "{{ $json.value > 1000 }}"
  approvers: z.array(z.string()),   /// userIds se a condição for verdadeira
  fallbackApprovers: z.array(z.string()).optional(), /// userIds se falsa
});

/// Política declarada no node `approval`
export const ApprovalPolicySchema = z.object({
  mode: ApprovalModeSchema.default("SINGLE"),
  message: z.string().max(500).optional(),
  approvers: z.array(z.string()).min(1).optional(),
  groups: z.array(z.string()).optional(),     /// team/department IDs (futuro)
  escalateRoles: z.array(z.string()).optional(), /// roles que recebem escalonamento (ex: ["OWNER","ADMIN"])
  escalationDelayHours: z.number().positive().default(24),
  quorumValue: z.number().positive().optional(), /// absoluto (se <=20) ou percentual (se 0-100)
  useQuorumPercentage: z.boolean().default(false),
  deadlineHours: z.number().positive().max(168).default(72), /// 3 dias default, max 7 dias
  reminderHours: z.array(z.number().positive()).default([24, 48]), /// lembretes em 24h, 48h
  defaultAction: TimeoutActionSchema.default("ESCALATE"),
  channels: z.array(ApprovalChannelSchema).default(["PANEL", "EMAIL"]),
  condition: ApprovalConditionSchema.optional(),
  requireComment: z.boolean().default(false),     /// força comentário na decisão
  allowDelegation: z.boolean().default(true),
  contextFields: z.array(z.string()).optional(),    /// campos do input a expor ao aprovador
});
export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>;

/// Request de aprovação — payload interno criado pelo executor
export const ApprovalRequestSchema = z.object({
  id: z.string(),
  executionId: z.string(),
  nodeId: z.string(),
  orgId: z.string(),
  policy: ApprovalPolicySchema,
  input: z.record(z.unknown()).optional(),         /// dados de entrada do node
  requestedById: z.string().optional(),
  deadlineAt: z.date(),
  approvers: z.array(z.string()),                   /// userIds resolvidos
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "EXPIRED"]).default("PENDING"),
});
export type IApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

/// Token de link seguro
export interface IApprovalToken {
  token: string;           /// plaintext (apenas uma vez, no momento do envio)
  approvalId: string;
  orgId: string;
  expiresAt: Date;
  signature: string;       /// HMAC-SHA256
}

/// Payload decodificado do token (para validação)
export interface IApprovalTokenPayload {
  approvalId: string;
  orgId: string;
  exp: number;             /// epoch seconds
  nonce: string;           /// 16 bytes aleatórios, incluídos na assinatura
}

/// Decisão do aprovador
export const ApprovalDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "ABSTAINED"]),
  comment: z.string().max(2000).optional(),
  approverId: z.string(),
});
export type IApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
```

---

## 3. Modos de aprovação e políticas

> Implementados no `ApprovalPolicy` (configurado pelo usuário no nó `approval` do editor visual, validado pelo Zod schema acima).

### 3.1 SINGLE (modo atual + v2)

Um único aprovador — **qualquer** um dos `approvers` pode decidir. Primeira decisão conta. Se rejeitado, execução falha. Se aprovado, retoma.

```
Approval (SINGLE)
  ├── approvers: [userA, userB, userC]
  └── Primeira decisão vence → status=APPROVED|REJECTED
```

### 3.2 COLLECTIVE

**Todos** os aprovadores devem aprovar. Uma rejeição qualquer falha a execução imediatamente.

```
Approval (COLLECTIVE)
  ├── approvers: [userA, userB, userC]
  ├── userA → APPROVED   (continua aguardando)
  ├── userB → APPROVED   (continua aguardando)
  └── userC → REJECTED  → Execution FAILED
```

### 3.3 QUORUM

**N** aprovadores (número absoluto ou N%) bastam. Rejeições não cancelam; vence a maioria até o quorum.

```
Approval (QUORUM, quorumValue=2, total=4)
  ├── userA → APPROVED   (1/2)
  ├── userB → APPROVED   (2/2) → quorum atingido → Execution RUNNING
  ├── userC → (não vota — já decidido)
  └── userD → (não vota — já decidido)
```

| Config | quorumValue | Interpretação |
|--------|------------|---------------|
| `quorumValue=2, useQuorumPercentage=false` | 2 | 2 aprovadores absolutos |
| `quorumValue=50, useQuorumPercentage=true` | 50% | Metade do total arredondada para cima |

### 3.4 CHAIN (escalonamento)

Cadeia de escalonamento: nível 1 → nível 2 → nível 3. Cada nível tem `escalationDelayHours`. Se o nível atual não decide dentro do prazo, **automaticamente escalona** para o próximo nível e notifica.

```
Approval (CHAIN)
  ├── Level 1: [userA]   — 24h para decidir
  ├── Level 2: [userB, userC] — se timeout → escalona + notifica
  └── Level 3: [owner]   — se timeout → escalona + notifica
```

Na escalonamento, cria-se um **novo Approval** (filho) linkado via `escalateFromId`, e o Approval pai recebe `status=EXPIRED` + `defaultAction=ESCALATE`.

### 3.5 CONDITIONAL

A condição (expressão n8n `{{ $json.value > 1000 }}`) é avaliada pelo **executor** antes de criar o Approval. Se verdadeira, usa `approvers`; se falsa, usa `fallbackApprovers`. O Approval resultante ainda obedece ao `mode` configurado (SINGLE, COLLECTIVE, etc.).

### 3.6 Deadline e ação padrão

| Campo | Default | Descrição |
|-------|---------|-----------|
| `deadlineHours` | 72 (3 dias) | TTL absoluto do Approval. Máximo 168 (7 dias). |
| `defaultAction` | `ESCALATE` | O que acontece no timeout: `APPROVE`, `REJECT`, ou `ESCALATE` (para CHAIN). |
| `reminderHours` | `[24, 48]` | Horas para disparar lembretes antes do deadline. |

### 3.7 Múltiplos itens (item a item)

O nó `approval` pode processar um **array de itens** (ex: 100 pedidos). O executor cria um Approval por item, mas todos compartilham a mesma política. A decisão é por item:

```
Workflow: "Aprovar 100 pedidos"
  ├── Item[0] → Approval #1 (userA ou userB aprova)
  ├── Item[1] → Approval #2 (userA ou userB aprova)
  └── Item[99] → Approval #100 (userC rejeita → só o item 99 falha)
```

Configuração no node: `approveMode: "ITEM_BY_ITEM"` (default) ou `"BATCH"` (um approval para todo lote).

---

## 4. Canais (email, chat, painel, API) com fluxos por canal

> Harmoniza com `briefs/prompt-comunicacao.md` — os mesmos provedores (SMTP, Telegram Bot API, Slack, Discord, WhatsApp) são reutilizados.

### 4.1 Email

**Fluxo:**

```
Executor → cria Approval → ApprovalService
  → gera ApprovalToken → NotificationService
  → envia email com link: https://app.agentflow.com/approve/{token}
  → aprovação via web (token validado server-side)
```

**Template de e-mail:**

| Campo | Conteúdo |
|-------|----------|
| Subject | `[AgentFlow] Aprovação necessária: {workflowName}` |
| Título | `{message || "Aprovação humana requerida"}` |
| Contexto | Tabela com campos de entrada (apenas `contextFields` liberados pela política) |
| Link | `https://app.agentflow.com/approve/{token}` (token nunca exposto em logs) |
| TTL | `Válido por {deadlineHours}h` |
| Rodapé | `Org: {orgName} · Não compartilhe este link` |

**Implementação** (`apps/api/src/services/notification.ts`):
- Usa `nodemailer` (já no stack) para SMTP ou provedor (SendGrid/Resend).
- `Content-Type: text/html` e `text/plain` (multipart).
- Cabeçalho `List-Unsubscribe` para compliance.
- Rate limit por org: 500 e-mails/hora (config `APPROVAL_EMAIL_RATE_LIMIT`).

### 4.2 Telegram

**Fluxo:**

```
Executor → Approval → TelegramBotService
  → envia mensagem com InlineKeyboardMarkup:
    [✓ Aprovar] [✗ Rejeitar] [💬 Comentar]
  → callback_query → valida ApprovalToken → decide
```

**Message payload:**

```json
{
  "chat_id": "123456789",
  "text": "📋 *{message}*\nWorkflow: {workflowName}\nExecução: {executionId}",
  "reply_markup": {
    "inline_keyboard": [
      [{"text": "✓ Aprovar", "callback_data": "approve:{tokenId}"}, {"text": "✗ Rejeitar", "callback_data": "reject:{tokenId}"}],
      [{"text": "💬 Comentar", "callback_data": "comment:{tokenId}"}]
    ]
  }
}
```

**Security:**
- `callback_data` contém apenas `tokenId` (nunca o token completo — o servidor resolve `tokenId` → valida hash → verifica escopo).
- Bot token armazenado como `Credential` (tipo `telegram`, provider `telegram`), descriptografado pelo NotificationService no momento do envio.
- Bot nunca envia para chats não autorizados (allowlist configurável por org).

### 4.3 Slack

**Fluxo:**

```
Executor → Approval → SlackBotService (Socket Mode ou Incoming Webhooks)
  → postMessage com blocos interativos:
    [Approve] [Reject] [Request Changes]
  → interação → Slack verifica assinatura (signing secret) → proxy para ApprovalService
```

**Block Kit payload:**

```json
{
  "text": "Approval needed: {message}",
  "blocks": [
    {"type": "section", "text": {"type": "mrkdwn", "text": "*{message}*"}},
    {"type": "actions", "elements": [
      {"type": "button", "text": {"type": "plain_text", "text": "Approve"}, "action_id": "approve", "value": "{tokenId}"},
      {"type": "button", "text": {"type": "plain_text", "text": "Reject"}, "action_id": "reject", "value": "{tokenId}"}
    ]}
  ]
}
```

**Security:**
- Slack verifica assinatura do request interativo usando `signing_secret` (HMAC-SHA256 + timestamp + nonce).
- `value` contém apenas `tokenId`, nunca o token plaintext.
- Bot só responde a interações dentro do canal/thread da notificação original.

### 4.4 Discord

- Webhook de bot (`Bot Token` como Credential).
- Mensagem com `components` (botões): `✅ Aprovar`, `❌ Rejeitar`.
- `custom_id` contém `tokenId` (não o token completo).
- Discord verifica assinatura do interaction via `application_id` + `public_key` (Ed25519).

### 4.5 WhatsApp (Meta Cloud API)

- Mensagem template aprovada (`APPROVAL_REQUEST`) com `buttons` interativos.
- Template deve passar pelo review da Meta.
- Webhook de resposta do WhatsApp → valida HMAC → resolve `tokenId` → decide.
- Limitação: templates precisam de aprovação prévia; botões limitados a 3 opções.

### 4.6 Painel (Web)

**Fluxo:**

```
Web (Next.js) → GET /api/approvals (auth JWT) → lista pendedentes
  → clique → página /approvals/{id} → mostra contexto + comentários
  → botão Aprovar/Rejeitar → POST /api/approvals/{id}/decide
```

**UI da página de aprovação:**

```
┌─────────────────────────────────────────────────────────┐
│  Título: "{message}"                                     │
│  Status: ⏳ PENDING  |  Workflow: "{workflowName}"       │
│  Criado: 2026-08-20 14:30  |  Deadline: 2026-08-23 14:30 │
├─────────────────────────────────────────────────────────┤
│  Contexto do item:                                      │
│  ┌─────────────────────────────────────────────────────┐│
│  │ { JSON formatado dos campos liberados }             ││
│  └─────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│  Comentários:                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │ [system] Lembrete enviado às 14:30                  ││
│  │ [userB] Aprovado em 15:02                           ││
│  └─────────────────────────────────────────────────────┘│
│  Digite seu comentário... [_____________] [Enviar]     │
├─────────────────────────────────────────────────────────┤
│  [✓ Aprovar]  [✗ Rejeitar]  [⟳ Reenviar notificação]   │
└─────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- Lista com filtros: por workflow, por status, por org, por data.
- Badge indicando deadline próximo (≤ 24h → vermelho).
- Botão "Reenviar notificação" (apenas para aprovadores com permissão).
- Botão "Escalar" (para CHAIN mode, se o usuário atual é do level).
- Botão "Cancelar" (cancela a aprovação → execution CANCELLED).

### 4.7 API programática

```
POST /api/approvals/{id}/decide
Headers: Authorization: Bearer {token}
Body: { decision: "APPROVED" | "REJECTED", comment?: string }

GET  /api/approvals/{id}/tokens       — lista tokens ativos (admin)
POST /api/approvals/{id}/tokens/revoke — revoga token(s)
POST /api/approvals/{id}/escalate     — escalona manualmente (CHAIN)
POST /api/approvals/{id}/cancel        — cancela a aprovação
GET  /api/approvals/{id}/audit        — histórico de auditoria
```

---

## 5. Segurança de tokens e links

> Baseado em padrões do v2-security-spec §5 (envelope encryption), §6 (OAuth broker — PKCE, nonce), guia-webhooks.md (HMAC), e design-seguranca.md (rate limit, audit).

### 5.1 Geração do token

```
1. approvalId = cuid()
2. token = crypto.randomBytes(32).toString("base64url")   // 256 bits de entropia
3. nonce = crypto.randomBytes(16).toString("hex")
4. payload = { approvalId, orgId, exp: Date.now() + TTL, nonce }
5. signature = HMAC-SHA256(APPROVAL_TOKEN_SIGNING_KEY, JSON.stringify(payload))
6. tokenHash = sha256(token)   // armazenado no banco
7. URL: https://app.agentflow.com/approve/{token}
```

### 5.2 Validação do token (no momento do clique)

```
1. Receber {token} da URL
2. SELECT * FROM ApprovalToken WHERE tokenHash = sha256(token)
3. Se não existe → 404 (não revela existência)
4. Verificar signature:
   a. Recalcular HMAC sobre {approvalId, orgId, exp, nonce}
   b. timingSafeEqual — se mismatch → 403
5. Verificar exp > now() — se expirado → 410 Gone
6. Verificar consumedAt IS NULL — se usado → 410 Gone (replay prevention)
7. Verificar revokedAt IS NULL — se revogado → 410 Gone
8. Verificar orgId do token = orgId do usuário autenticado
9. Verificar aproval.status = PENDING
10. Verificar usuário é um approver válido (ou membro da org)
11. Marcar consumedAt = now(), consumedBy = userId, consumedIp, consumedUa
12. Registrar audit log
```

### 5.3 Escopo mínimo (princípio do menor privilégio)

- O token é válido **apenas** para aquele `approvalId` específico.
- Não concede acesso ao workflow, execução, ou outros approvals.
- Usuário autenticado via JWT no painel web; para links de e-mail, o token funciona como bearer (sem login prévio) — mas **apenas** para decidir aquele approval.
- Para chat (Telegram/Slack), o `callback_data`/`value` contém apenas `tokenId`, nunca o token. O servidor resolve internamente.

### 5.4 Replay prevention

- Token é **single-use**: `consumedAt` preenchido na primeira decisão; segunda tentativa → 410.
- Constraint `@unique` em `tokenHash` impede duplicatas.
- Para aprovações com múltiplos aprovadores, **cada approver recebe seu próprio token** (um para cada `ApprovalApprover`). O token é vinculado ao `approverId`, não apenas ao `approvalId`.

### 5.5 Revogação

- **Revogação individual**: `DELETE /api/approvals/{approvalId}/tokens/{tokenId}` — marca `revokedAt`.
- **Revogação em massa** (token vazado): `POST /api/approvals/{approvalId}/tokens/revoke-all` — revoga todos os tokens do approval. Log de auditoria.
- **Revogação de usuário demitido**: job batch (`approvals:reassign-on-user-delete`) — re-atribui approvals pendentes para o owner da org ou escalona.

### 5.6 HMAC e signing

| Criptografia | Chave | Uso |
|-------------|-------|-----|
| `tokenHash` | sha256 | Hash do token plaintext antes de armazenar (nunca grava plaintext) |
| `signature` | HMAC-SHA256 com `APPROVAL_TOKEN_SIGNING_KEY` | Anti-tamper na payload do token |
| `secret` (webhook) | sha256 (como no `Webhook.secret` existente) | Validação de origem em callbacks de chat |

`APPROVAL_TOKEN_SIGNING_KEY` = env var de 64 hex chars (32 bytes), gerada uma vez, rotacionável (versionamento via `kv` no token payload).

### 5.7 Rate limiting

| Endpoint | Limite | Window |
|----------|--------|--------|
| `POST /api/approvals/{id}/decide` | 10 req | 60s por usuário |
| `GET /api/approvals` | 100 req | 60s por usuário |
| Link de e-mail (GET /approve/{token}) | 5 req | 60s por IP |
| Reenvio de notificação | 3 req | 1h por usuário |
| Criação de token | 10 req | 60s por approval |

---

## 6. Integração com a engine (wait/resume, timeout, cancelamento)

> Harmoniza com `design-runner.md` (executor BullMQ, timeout, retry) e `catalogo-nodes.md` §16 (Wait node pattern: `paused: true`, `resumeToken`).

### 6.1 Ciclo de vida da execução com approval

```
                    ┌─────────────┐
                    │  PENDING    │  (na fila BullMQ)
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │  RUNNING    │  (worker pega job)
                    └──────┬──────┘
                           │ processa nodes em ordem topológica
                           ▼
              ┌─────────────────────────┐
              │  Nó "approval" encontrado │
              └────────────┬────────────┘
                           │ cria Approval no DB
                           ▼
              ┌─────────────────────────┐
              │  Cria Approval +         │
              │  gera ApprovalToken      │
              │  envia notificações      │
              │  agenda reminders         │
              └────────────┬────────────┘
                           │ salva execution state (checkpoint)
                           ▼
              ┌─────────────────────────┐
              │  WAITING_APPROVAL        │  (execution pausada)
              │  worker job fica WAITING │  (sem BullMQ lock)
              │  no BullMQ → não consome │
              │  worker slot            │
              └────────────┬────────────┘
                           │ approver decide
                           │ (via e-mail/chat/painel/API)
                           ▼
              ┌─────────────────────────┐
              │  APROVED                 │
              │  → execution.status =   │
              │    RUNNING               │
              │  → worker reprocessa    │
              │    do nó approval       │
              └────────────┬────────────┘
                           ▼
                    ┌─────────────┐
                    │  RUNNING →  │  (continua do próximo nó)
                    │  SUCCESS    │
                    └─────────────┘
```

### 6.2 Pausing persistente

**No executor** (`executor.ts` — `executeNode`, novo case):

```typescript
case "approval": {
  // 1. Cria Approval no DB (snapshot do policy do node)
  const approval = await prisma.approval.create({
    data: {
      executionId: execution.id,
      nodeId: node.id,
      orgId: orgId,
      status: "PENDING",
      mode: policy.mode,
      quorumValue: policy.quorumValue,
      deadlineAt: new Date(Date.now() + policy.deadlineHours * 3600_000),
      defaultAction: policy.defaultAction,
      context: input,
      message: policy.message,
      requestedById: userId,
    },
  });

  // 2. Cria approvers
  await prisma.approvalApprover.createMany({
    data: policy.approvers.map((uid) => ({
      approvalId: approval.id,
      userId: uid,
      status: "PENDING",
    })),
  });

  // 3. Notifica e agenda reminders
  await notificationService.send(approval, policy.channels);
  await reminderService.schedule(approval, policy.reminderHours);

  // 4. Salva checkpoint do execution state
  // (executionState já é persistido em NodeExecution por nó — estendido)
  await prisma.nodeExecution.update({
    where: { id: nodeExecution.id },
    data: {
      status: "WAITING",          // status novo ou reutilizar PENDING
      output: { approvalId: approval.id, paused: true },
      paused: true,
      pausedAt: new Date(),
    },
  });

  // 5. Pára a execução — retorna sinal de pausa
  // O engine loop verifica: se output.paused → break and return
  return { paused: true, approvalId: approval.id };
}
```

**No engine loop** (`executeGraph`):

```typescript
// Após executeNode, se o nó retornou { paused: true, approvalId }
if (output?.paused) {
  await prisma.workflowExecution.update({
    where: { id: execution.id },
    status: "WAITING_APPROVAL",
  });
  // NÃO faz mais nada — worker job termina "limpamente"
  // BullMQ job fica em WAITING até ser re-enfileirado
  return execution; // retorna com status WAITING_APPROVAL
}
```

**Reativando a execução:**

Quando um approver decide (via qualquer canal):

```typescript
// ApprovalService.decide()
await prisma.approval.update({
  where: { id: approvalId },
  data: { status: "APPROVED", decidedAt: new Date(), ... },
});

// Re-enfileira o execution no BullMQ
await workflowQueue.add("resume", {
  executionId: approval.executionId,
  resumeNodeId: approval.nodeId,     // retoma DO nó approval
}, { jobId: `resume-${approval.executionId}`, removeOnComplete: true });
```

O worker pega o job `resume`, carrega o execution, e **reexecuta a partir do nó approval** (pulando nós já executados, usando checkpoint). O nó approval é reexecutado — mas como já tem `status=APPROVED`, ele retorna o input original sem pausar (idempotência).

### 6.3 Timeout

**Job BullMQ `approval:timeout-check`** (executado a cada minuto):

```typescript
// Busca approvals expirados
const expired = await prisma.approval.findMany({
  where: {
    status: "PENDING",
    deadlineAt: { lte: new Date() },
  },
});

for (const approval of expired) {
  const action = approval.defaultAction;
  if (action === "APPROVE") {
    await decide(approval.id, "APPROVED", { system: true, comment: "Auto-approved on timeout" });
  } else if (action === "REJECT") {
    await decide(approval.id, "REJECTED", { system: true, comment: "Auto-rejected on timeout" });
  } else if (action === "ESCALATE") {
    await escalate(approval.id);  // cria novo Approval filho no próximo nível
  }
}
```

### 6.4 Cancelamento

```
POST /api/executions/{id}/cancel
  → se status = WAITING_APPROVAL:
     1. todos os approvals pendentes → status = EXPIRED, defaultAction = none
     2. execution.status = CANCELLED
     3. NodeExecution atual → status = CANCELLED
     4. audit log: "execution.cancelled"
```

### 6.5 Retomada após reinício do servidor

- **Fonte de verdade**: PostgreSQL. O estado de `Approval` e `WorkflowExecution` é sempre lido do DB.
- **Worker BullMQ**: no startup, o worker BullMQ reprocessa jobs que estavam em `WAITING`/`DELAYED`. O job `resume` foi enfileirado quando o approval foi decidido.
- **Recuperação de pending**: um job de *reconciliation* (`approval:reconcile`) roda a cada boot e no startup do worker, verificando:
  - Executions com `status = WAITING_APPROVAL` mas todos os approvals já decididos → re-enfileira como `resume`.
  - Executions com `status = WAITING_APPROVAL` e approval expirado → aplica `defaultAction`.
  - Approvals sem job BullMQ associado (job foi perdido) → re-enfileira.
- **Idempotência**: o executor verifica se o nó approval já foi resolvido antes de pausar novamente.

### 6.6 Retries e lembretes

- **Retry de notificação**: se o envio de e-mail/chat falhar, o `NotificationService` usa BullMQ retry (exponential backoff, max 3 attempts).
- **Lembretes**: `reminderHours` agenda jobs BullMQ que reenviam a notificação (e-mail + chat) para aprovadores que não decidiram.
- **Escalonamento automático**: no `escalationDelayHours`, se o level atual não decidiu, sistema escalona para o próximo.

### 6.7 Múltiplos approvals simultâneos

- Um workflow pode ter múltiplos nós `approval`. Cada um cria seu próprio `Approval` record, com `status` independente.
- O engine pausa no **primeiro** nó approval encontrado na ordem topológica. Os outros nós só são processados após a retomada.
- Aprovadores podem ter pendências de múltiplos workflows/executions simultaneamente — o painel web mostra todas.

---

## 7. UI (painel, página de aprovação, histórico)

### 7.1 Painel de pendências (`/approvals`)

**Extensão da página existente** (`apps/web/src/app/approvals/page.tsx`):

```
Filtros: [All Orgs ▼] [Workflow ▼] [Status: PENDING] [Date range ▼]
Ordenação: Deadline (urgentes primeiro)

┌─────────────────────────────────────────────────────────┐
│ {message}                    [PENDING] [3h left]          │
│ Workflow: "Onboarding" · #exec_abc123 · Created Aug 20  │
│ Context: {amount: $1,200, client: "Acme Corp"}            │
│ [Approve] [Reject] [Comment]                            │
└─────────────────────────────────────────────────────────┘
```

| Coluna | Dados |
|--------|-------|
| Título | `message` (ou "Approval request") |
| Workflow | `workflow.name` |
| Execution | `executionId` (truncado) |
| Created | `createdAt` |
| Deadline | `deadlineAt` (badge vermelho se ≤ 24h) |
| Mode | `mode` (SINGLE, COLLECTIVE, QUORUM, CHAIN) |
| Actions | Approve / Reject / Comment / Reenviar |

### 7.2 Página de aprovação (`/approve/{token}`)

**Acesso por token (sem login prévio)** — valida token, mostra contexto, coleta decisão.

```
┌─────────────────────────────────────────────────────────┐
│  🟡 Pending approval                                     │
│  "{message}"                                            │
│                                                         │
│  Workflow: Onboarding Client                            │
│  Organization: Acme Corp                               │
│  Deadline: Aug 23, 14:30 UTC (2h remaining)             │
├─────────────────────────────────────────────────────────┤
│  Context:                                               │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Amount: $1,200                                      ││
│  │ Client: Acme Corp                                   ││
│  │ Request type: New account                           ││
│  └─────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│  Comment (optional):                                    │
│  [_____________________________________________________] │
│  [Approve] [Reject]                                     │
└─────────────────────────────────────────────────────────┘
```

### 7.3 Histórico de aprovações (`/approvals/history` ou `/workflows/{id}/approvals`)

```
Tabela: Approval ID | Workflow | Status | Mode | Decided by | Decision | When | Comment
```

Filtros: por data, por workflow, por status, por approver.

### 7.4 API do frontend (`apps/web/src/lib/api.ts`)

```typescript
export interface ApprovalDetails extends Approval {
  policy: ApprovalPolicy;
  approvers: Array<{
    id: string;
    userId: string;
    user?: { name: string; email: string };
    status: ApproverStatus;
    delegatedToId?: string;
    decisionAt?: string;
    comment?: string;
  }>;
  comments: Array<{
    id: string;
    userId?: string;
    user?: { name: string };
    system: boolean;
    comment: string;
    createdAt: string;
  }>;
  tokens: Array<{ id: string; used: boolean; expiresAt: string }>;
  deadlineAt: string | null;
  defaultAction: TimeoutAction | null;
  escalateFromId?: string;
}

export const approvals = {
  list: (filters?: { status?: string; workflowId?: string }) =>
    api<ApprovalDetails[]>("/api/approvals", { method: "GET" }),
  get: (id: string) =>
    api<ApprovalDetails>(`/api/approvals/${id}`),
  decide: (id: string, decision: "APPROVED" | "REJECTED", comment?: string) =>
    api(`/api/approvals/${id}/decide`, { method: "POST", body: { decision, comment } }),
  addComment: (id: string, comment: string) =>
    api(`/api/approvals/${id}/comments`, { method: "POST", body: { comment } }),
  resend: (id: string) =>
    api(`/api/approvals/${id}/resend`, { method: "POST" }),
  escalate: (id: string) =>
    api(`/api/approvals/${id}/escalate`, { method: "POST" }),
  cancel: (id: string) =>
    api(`/api/approvals/${id}/cancel`, { method: "POST" }),
};
```

### 7.5 Notificação push (Web)

- SSE (`/api/approvals/stream`) ou WebSocket para notificar o painel em tempo real quando um novo approval é criado ou quando o status muda.

---

## 8. Edge cases

| # | Cenário | Comportamento esperado |
|---|---------|----------------------|
| 1 | **Usuário demitido com pendências** | Job batch `approvals:reassign-on-user-delete`: re-atribui para `owner` da org ou escalona (CHAIN). Notifica novo responsável. |
| 2 | **Workflow deletado com pendências** | `onDelete: Cascade` — todos os approvals do workflow são EXPIRED + execution CANCELLED. Notifica aprovadores. |
| 3 | **Token vazado** | `POST /api/approvals/{id}/tokens/revoke-all` revoga todos os tokens. Novo token emitido. Audit log registrado. |
| 4 | **Execução expirada** (deadline do approval vence, defaultAction=ESCALATE, mas não há mais níveis) | Execution → FAILED com mensagem "Approval escalated but no higher level available". |
| 5 | **Aprovador sem permissão** (tenta aprovar via link sem ser approver) | Token validado, mas verificação de `approverId` falha → 403. Não consumir token. |
| 6 | **Aprovador já decidiu** (reenvia e-mail, clica de novo) | Token já consumido → 410 Gone. Não cria duplicata. |
| 7 | **Reminder enviado para usuário que já aprovou** | `ReminderService` verifica status antes de enviar → pula. |
| 8 | **Quorum impossível** (N=5 mas só 2 aprovadores existem) | Validado no `approval:validate` job → aprovação é CRIADA com `status=EXPIRED` + mensagem "Insufficient approvers". |
| 9 | **Servidor reinicia durante pausa** | DB é fonte de verdade. Worker reprocessa jobs `resume` pendentes. Reconciliation job verifica consistência. |
| 10 | **Múltiplos approvals no mesmo workflow** | Cada nó approval cria seu próprio Approval. Engine pausa no primeiro. Retoma sequencialmente. |
| 11 | **Delegation circular** (A delega para B, B delega para A) | Detectado pelo `delegatedBy`/`delegatedTo` — job de reconciliação quebra ciclos. |
| 12 | **Aprovador não tem email/telegram configurado** | Canal falha silenciosamente para aquele usuário; painel web e API sempre disponíveis. |
| 13 | **Token usado após deadline expirado** | 410 Gone — deadline vence antes de consumo. |
| 14 | **Usuário tenta comentar sem ser aprovador** | Comentários são abertos para membros da org; aprovadores têm destaque visual. |
| 15 | **Bulk cancel de execução** | Todos os approvals pendentes do execution → EXPIRED, execution → CANCELLED. |

---

## 9. Diagramas ASCII de fluxo

### 9.1 Fluxo principal: criação → notificação → decisão → retomada

```
Executor (worker BullMQ)              ApprovalService              Notification           Aprovador
       │                                  │                            Service               (web/email/chat)
       │ encontra nó "approval"           │                              │
       ├───────────────────────────────►│                              │
       │        cria Approval             │                              │
       │        cria ApprovalApprovers    │                              │
       │        gera ApprovalTokens       │                              │
       │        agenda reminders          │                              │
       │        salva checkpoint          │                              │
       │                                ├─────────────────────────────►│ envia e-mail/link
       │                                │                              │ envia mensagem no chat
       │                                │                              │ agenda lembretes BullMQ
       │        pausa execution         │                              │
       │        status=WAITING_APPROVAL │                              │
       │ <──────────────────────────────│                              │
       │  (worker job termina,         │                              │
       │   execution pausada no DB)     │                              │
       │                                  │                              │
       │                                  │             [tempo passa...]│
       │                                  │                              │ ← approver clica no link
       │                                  │                              │ ← valida token + escopo
       │                                ◄│────────────────────────────│ decide (APPROVED/REJECTED)
       │        approval.status=APPROVED │                              │
       │        audita decisão           │                              │
       │        re-enfileira job "resume" │                              │
       │ ───────────────────────────────│─────────────────────────────│
       │        worker reprocessa        │                              │
       │        do nó approval          │                              │
       │        (idempotente)            │                              │
       │        execution → RUNNING      │                              │
       │        continua workflow        │                              │
```

### 9.2 Máquina de estados do Approval

```
                    ┌─────────────┐
                    │   PENDING   │ ◄── (criado pelo executor)
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┬────────────────┐
          │                │                │                │
          ▼                ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │  APPROVED   │  │  REJECTED   │  │   EXPIRED   │  │  CANCELLED  │
   │(retoma exec)│  │(falha exec) │  │(timeout →   │  │(exec cancel)│
   └─────────────┘  └─────────────┘  │ defaultAct) │  └─────────────┘
                                      └──────┬──────┘
                                             │
                                             ▼
                                      ┌─────────────┐
                                      │ ESCALATED   │ (CHAIN mode → novo Approval filho)
                                      │(novo level) │
                                      └─────────────┘
```

**Transições:**
- `PENDING → APPROVED`: approver decide APROVED
- `PENDING → REJECTED`: approver decide REJECTED
- `PENDING → EXPIRED`: deadlineAt <= now() (via job `approval:timeout-check`)
- `PENDING → CANCELLED`: execution cancelada
- `PENDING → ESCALATED`: timeout em CHAIN mode, sem defaultAction=ESCALATE...

### 9.3 Máquina de estados do Execution (com approval)

```
┌──────────┐    enfileira     ┌──────────┐
│ PENDING  │ ───────────────► │ RUNNING  │
└──────────┘                  └────┬─────┘
                                   │ nó approval
                                   │ cria Approval
                                   ▼
                    ┌──────────────────────┐
                    │ WAITING_APPROVAL     │ ◄── (pausado, worker job done)
                    └─────────┬────────────┘
                              │ approver decide
                              ├─────────────────┬─────────────────┐
                              │ APROVED         │ REJECTED        │ EXPIRED(default REJECT)
                              ▼                 ▼                 ▼
                    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
                    │ RUNNING      │  │ FAILED       │  │ FAILED       │
                    │ (retoma)     │  │ (rejeitado)  │  │ (timeout)    │
                    └──────┬───────┘  └──────────────┘  └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ SUCCESS      │  (ou FAILED se próximos nós falharem)
                    └──────────────┘
```

### 9.4 Validação de token (GET /approve/{token})

```
Request: GET /approve/{token}
         │
         ▼
┌──────────────────────────────────┐
│ 1. tokenHash = sha256(token)      │
│ 2. SELECT * FROM ApprovalToken    │
│    WHERE tokenHash = ?            │
│ 3. Se NULL → 404 (não revela)     │
└──────────────┬───────────────────┘
               │ existe
               ▼
┌──────────────────────────────────┐
│ 4. HMAC-SHA256 verifica signature │
│    timingSafeEqual                │
│    Se falha → 403                │
└──────────────┬───────────────────┘
               │ válido
               ▼
┌──────────────────────────────────┐
│ 5. expiresAt > now()?             │
│    Se não → 410 (expirado)        │
└──────────────┬───────────────────┘
               │ ativo
               ▼
┌──────────────────────────────────┐
│ 6. consumedAt IS NULL?             │
│    Se usado → 410 (replay)       │
└──────────────┬───────────────────┘
               │ nunca usado
               ▼
┌──────────────────────────────────┐
│ 7. revokedAt IS NULL?             │
│    Se revogado → 410             │
└──────────────┬───────────────────┘
               │ revogado
               ▼
┌──────────────────────────────────┐
│ 8. approvalId.orgId = user.orgId?│
│    Se não → 403                  │
└──────────────┬───────────────────┘
               │ autorizado
               ▼
┌──────────────────────────────────┐
│ 9. approval.status = PENDING?     │
│    Se não → exibir "já decidido" │
└──────────────┬───────────────────┘
               │ pode decidir
               ▼
┌──────────────────────────────────┐
│ 10. Renderiza página de aprovação │
│     com contexto do approval      │
└──────────────────────────────────┘
```

### 9.5 Escalonamento (modo CHAIN)

```
Level 1 (userA)                      Level 2 (userB, userC)           Level 3 (owner)
   PENDING ──24h──►                    PENDING ──24h──►                PENDING ──►
   deadline?                          deadline?                       deadline?
   não                              sim → ESCALATE                   sim → ESCALATE
     │                                │                              │
   userA decide                       │ userB/userC notificados      │ owner notificado
   APROVED → retoma                   │                              │ owner decide
                                     timeout → ESCALATE → Level 3     APROVED → retoma
                                     (novo Approval, escalateFromId)  
```

---

## 10. ADRs (Architectural Design Records)

### ADR-1: Token no URL vs. token no body

**Contexto:** Links de e-mail precisam funcionar com clique direto (GET). APIs de chat usam callbacks.

**Decisão:** Token é passado **na URL** para canais onde o aprovador não está autenticado (e-mail, WhatsApp). Para canais onde o aprovador está autenticado (Slack, Discord, painel web), usa-se apenas `tokenId` no `callback_data`/`value` — o servidor resolve internamente. O token plaintext **nunca** é logado.

**Alternativa considerada:** Token via cookie após login. Rejeitado — requereria login prévio, quebrando a experiência de e-mail direto.

### ADR-2: Estado de execução — persistir no DB vs. Redis-only

**Contexto:** A execução pausada deve sobreviver a reinícios de servidor.

**Decisão:** Estado de `Approval` e `WorkflowExecution` é persistido no PostgreSQL (fonte de verdade). BullMQ é usado para: (a) job `resume` para reativar a execução, (b) jobs de `approval:timeout-check` e `approval:reminder`, (c) jobs de notificação com retry. Redis não é fonte de verdade — apenas fila de jobs.

**Alternativa considerada:** Salvar todo o estado de execução no Redis. Rejeitado — Redis pode perder dados não persistidos (sem AOF) e não sobrevive a reinícios de forma confiável.

### ADR-3: Single-use tokens vs. reusable tokens

**Contexto:** Link de e-mail pode ser compartilhado ou encaminhado.

**Decisão:** Tokens são **single-use** + **single-consumer** (consumedAt preenchido na primeira decisão). Mesmo que o link seja compartilhado, apenas a primeira decisão conta. Para múltiplos aprovadores, cada um recebe seu próprio token (vinculado ao `approverId`).

**Alternativa considerada:** Token reutilizável por 24h. Rejeitado — aumenta superfície de replay e compartilhamento não autorizado.

### ADR-4: Notificação via BullMQ vs. fire-and-forget

**Contexto:** E-mails e mensagens de chat podem falhar (provedor fora, rate limit).

**Decisão:** Notificações são enviadas via **job BullMQ** (`notification:send`) com retry exponencial (max 3 attempts). Lembretes são jobs agendados (`approval:reminder`). Se falhar após 3 tentativas, `ReminderStatus=FAILED` e gera alerta para admin.

**Alternativa considerada:** Envio síncrono no momento da criação do approval. Rejeitado — pode bloquear a engine se o provedor estiver lento.

### ADR-5: Escopo do token — approval-scoped vs. workflow-scoped

**Contexto:** Token pode conceder acesso overly broad.

**Decisão:** Token é scoped a **apenas um approvalId + orgId + nonce**. Não concede acesso ao workflow, execution, ou outros recursos. Verificação de `approverId` garante que só o aprovador designado possible decidir.

**Alternativa considerada:** Token scoped ao execution inteiro. Rejeitado — aumenta blast radius se token vazado.

### ADR-6: Múltiplos aprovadores — token por approver vs. token por approval

**Contexto:** Em modos COLLECTIVE/QUORUM, múltiplos usuários precisam decidir.

**Decisão:** Cada `ApprovalApprover` recebe seu **próprio token** (vinculado ao `approverId`). Isso permite:
- Rastrear quem decidiu (audit trail granular)
- Single-use por aprovador (um aprovador não pode decidir por outro)
- Delegación (token re-emitido para o delegate)

**Alternativa considerada:** Um token compartilhado para todos os aprovadores. Rejeitado — não permite rastrear decisões individuais.

### ADR-7: Condições no executor vs. no service layer

**Contexto:** Modo CONDITIONAL avalia uma expressão para determinar approveres.

**Decisão:** A expressão é avaliada pelo **executor** (que já tem a `ExpressionEngine`) no momento da criação do approval, **antes** de persistir no DB. O `ApprovalPolicy` snapshotado no DB já contém a lista resolvida de `approvers`. Isso mantém o service layer simples e o executor como fonte de verdade para dados de workflow.

---

## 11. Roadmap MVP / P1 / P2

> Harmoniza com `design-recriacao.md` §(g) — P2 inclui "Aprovações (Human-in-the-loop)".

### MVP (P0.5 — entrega mínima viável)

| Funcionalidade | Status atual | Gap |
|----------------|-------------|-----|
| Approval node no executor | ❌ Não implementado | Adicionar `case "approval"` em `executeNode` |
| Approval model estendido | ⚠️ Básico (id, status, message, context) | Adicionar: mode, policy, deadlineAt, defaultAction, escalateFromId |
| ApprovalToken | ❌ Não existe | Novo model + service |
| Aprovação via painel web | ✅ Listagem + approve/reject | Adicionar: comentários, contexto detalhado, deadline |
| Aprovação via e-mail | ❌ Não existe | Novo channel: link seguro |
| Timeout → ação padrão | ❌ Não existe | Job BullMQ `approval:timeout-check` |
| Auditoria | ⚠️ AuditLog genérico | Extensão para approval actions |
| **Entregável MVP** | | Aprovação humana via painel + timeout básico |

### P1 (expansão de canais e modos)

| Funcionalidade | Descrição |
|---------------|-----------|
| Múltiplos modos | SINGLE, COLLECTIVE, QUORUM, CHAIN, CONDITIONAL |
| Canais de chat | Telegram bot, Slack interactive, Discord bot, WhatsApp (Meta Cloud API) |
| Comentários | Thread de comentários por approval |
| Lembretes | Reenvio automático de notificação (24h, 48h) |
| Escalonamento | Cadeia de aprovação com timeout por nível |
| Delegación | Re-atribuir approval para outro usuário |
| Revisão de usuário demitido | Batch job de re-atribuição |
| **Critério de aceite** | Todos modos + canais funcionais + auditoria completa |

### P2 (enterprise + resiliência)

| Funcionalidade | Descrição |
|---------------|-----------|
| Quorum customizável | N absoluto ou N% configurável |
| Aprovação condicional | Expressão n8n avaliada pelo executor |
| Múltiplos itens | Item-by-item ou batch |
| Revogação em massa | `revoke-all` para token vazado |
| Reconciliation job | Reativação automática pós-restart |
| Notificação push web | SSE/WebSocket para atualizações em tempo real |
| Dashboard de aprovações | Métricas: SLA, tempo médio de decisão, % escalonado |
| Import/Export workflow | Approvals como parte do JSON do workflow |
| **Critério de aceite** | Sistema completo, resiliente, enterprise-ready |

---

## 12. Glossário

| Termo | Definição |
|-------|-----------|
| **Approval** | Instância de uma decisão humana pendente em um workflow. Vinculada a um `WorkflowExecution` e a um `WorkflowNode` do tipo `approval`. |
| **ApprovalApprover** | Usuário designado para decidir em um Approval. Em modos coletivos, há múltiplos approvers por approval. |
| **ApprovalToken** | String URL-safe de 256 bits usada em links seguros. Armazenada como SHA-256, com HMAC, TTL, uso único. |
| **ApprovalPolicy** | Configuração declarada no nó `approval`: modo, quorum, deadline, ação padrão, escalonamento, canais, condição. |
| **ApprovalMode** | `SINGLE`, `COLLECTIVE`, `QUORUM`, `CHAIN`, `CONDITIONAL` — determina como os approvers decidem. |
| **ApprovalChannel** | Meio de notificação/decisão: `EMAIL`, `TELEGRAM`, `SLACK`, `DISCORD`, `WHATSAPP`, `PANEL`, `API`. |
| **TimeoutAction** | `APPROVE`, `REJECT`, `ESCALATE` — ação aplicada quando o deadline vence. |
| **Checkpoint** | Snapshot do estado de execução persistido no DB a cada nó, permitindo reprise após pausa/crash. |
| **Escalonamento (CHAIN)** | Cadeia de aprovadores onde cada nível tem um prazo; falha no nível atual escalona para o próximo. |
| **Quorum** | Número mínimo de aprovações (absoluto ou percentual) para aprovar coletivamente. |
| **Delegación** | Transferência de responsibility de aprovação de um usuário para outro (ex: em férias). |
| **Replay prevention** | Token é consumido uma única vez; segunda tentativa é rejeitada. |
| **Escopo mínimo** | Token concede acesso apenas ao approval específico, nada além. |
| **Auditoria (audit-first)** | Toda ação sensível gera entrada imutável antes de completar. |
| **WAITING_APPROVAL** | Status de `WorkflowExecution` quando a execução está pausada aguardando decisão humana. |
| **NodeExecution** | Registro do estado de execução de um nó individual dentro de um workflow execution. |
| **Human-in-the-loop (HITL)** | Padrão onde uma máquina pausa e solicita intervenção humana antes de continuar. |
| **ResumeToken** | Token usado pelo Wait/Approval node para retomar execução (padrão herdado do nó Wait). |
| **Reconciliation job** | Job BullMQ que roda no startup do worker para reativar executions pausadas consistentemente. |

---

## 13. APIs propostas (endpoint catalog)

### 13.1 Criação e consulta

| Método | Path | Propósito |
|--------|------|-----------|
| `GET` | `/api/approvals` | Lista approvals visíveis ao usuário (filtros: status, workflowId, orgId) |
| `GET` | `/api/approvals/{id}` | Detalhes completos (policy, approvers, comments, tokens, timeline) |
| `GET` | `/api/approvals/{id}/tokens` | Lista tokens do approval (admin/auditoria) |
| `GET` | `/api/approvals/{id}/audit` | Histórico de auditoria imutável |

### 13.2 Decisão

| Método | Path | Propósito |
|--------|------|-----------|
| `POST` | `/api/approvals/{id}/decide` | Aprovar ou rejeitar (body: `{decision, comment?}`) |
| `GET` | `/approve/{token}` | Página web de decisão por link seguro (sem login prévio) |
| `POST` | `/api/approvals/{id}/comments` | Adicionar comentário (para discussion) |
| `POST` | `/api/approvals/{id}/resend` | Reenviar notificação para aprovadores pendentes |

### 13.3 Administração

| Método | Path | Propósito |
|--------|------|-----------|
| `POST` | `/api/approvals/{id}/escalate` | Escalonar manualmente (CHAIN mode) |
| `POST` | `/api/approvals/{id}/cancel` | Cancelar approval (execution → CANCELLED) |
| `POST` | `/api/approvals/{id}/tokens/revoke-all` | Revogar todos os tokens (token vazado) |
| `POST` | `/api/approvals/{id}/delegate` | Delegar approval para outro usuário |
| `POST` | `/api/executions/{id}/cancel` | Cancelar execution (cancela approvals pendentes) |

### 13.4 Callbacks de chat (webhooks públicos)

| Método | Path | Propósito |
|--------|------|-----------|
| `POST` | `/api/approvals/callback/telegram` | Telegram bot callback (verifica assinatura) |
| `POST` | `/api/approvals/callback/slack` | Slack interactive payload (verifica signing secret) |
| `POST` | `/api/approvals/callback/discord` | Discord interaction (verifica assinatura Ed25519) |
| `POST` | `/api/approvals/callback/whatsapp` | WhatsApp webhook (verifica HMAC) |

---

## 14. Considerações de segurança adicionais

> Baseado em `v2-security-spec.md` §2 (STRIDE), §5 (credential vault), e `design-seguranca.md` (checklist).

### 14.1 Threat model (STRIDE por componente)

| Componente | Ameaça (STRIDE) | Controle no v2-approvals |
|------------|-----------------|--------------------------|
| ApprovalToken | **Spoofing**: token forjado | HMAC-SHA256 com `APPROVAL_TOKEN_SIGNING_KEY`; `tokenHash` como sha256 |
| ApprovalToken | **Tampering**: payload modificado | `signature` (HMAC) + `timingSafeEqual`; rejeita mismatch |
| ApprovalToken | **Information disclosure**: token vazado | Hash-only storage (sha256); single-use; revogação em massa |
| ApprovalToken | **Repetição (replay)**: reenvio de token usado | `consumedAt` constraint; `@unique` em `tokenHash` |
| ApprovalToken | **Elevação (elevation)**: usuário não-approver decide | `approverId` no token; verificado no service layer |
| Notification | **Spoofing**: e-mail falsificado | Links assinados com HMAC; e-mail só informativo |
| Notification | **DoS**: spam de notificações | Rate limit por org (500/h); BullMQ com retry controlado |
| Execution | **Elevação**: approval de outro tenant | `orgId` em toda query; RBAC check no service layer |
| Execution | **Tampering**: cancelamento forçado | Apenas OWNER/ADMIN pode cancelar; audit trail |
| Approver | **Information disclosure**: dados sensíveis expostos | `contextFields` whitelist; nada de credenciais no contexto |

### 14.2 Tenant isolation

- Toda query de `Approval` carrega `orgId` (RLS implícito no Prisma — conforme v2-security-spec §10).
- Token contém `orgId` + assinatura; validação de org antes de qualquer operação.
- Aprovadores só veem approvals da própria org.
- Escalation respeita hierarchy de membros da org (apenas OWNER/ADMIN escalonam).

### 14.3 Criptografia

- `ApprovalToken.tokenHash`: SHA-256 (hash one-way, não reversível).
- `ApprovalToken.signature`: HMAC-SHA256 com chave de aplicação (`APPROVAL_TOKEN_SIGNING_KEY`, 32 bytes hex).
- `Approval.context` (JSON com dados de workflow): **não contém credenciais**. Se o node approval referencia credenciais, elas são resolvidas apenas no executor, nunca incluídas no contexto do approval.
- Chave de assinatura rotacionável: `APPROVAL_TOKEN_SIGNING_KEY` versionada via `kv` no payload do token.

### 14.4 Rate limiting (harmonizado com v2-security-spec §7 e design-seguranca.md §4)

| Operação | Limite | Chave |
|----------|--------|-------|
| `POST /api/approvals/{id}/decide` | 10/min | `user:{userId}:approval:decide` |
| `GET /approve/{token}` | 5/min | `ip:{ip}:approval:link` |
| `POST /api/approvals/{id}/resend` | 3/h | `user:{userId}:approval:resend` |
| `POST /api/approvals/callback/*` | 100/min | `ip:{ip}:approval:callback` |
| Criação de token | 10/min | `approval:{approvalId}:token:create` |

### 14.5 Auditoria

Toda ação gera entrada em `AuditLog` (model existente) com:

| Action | resource | metadata |
|--------|----------|----------|
| `approval.created` | `approval` | `{ executionId, nodeId, mode, approverCount, deadlineHours }` |
| `approval.decided` | `approval` | `{ decision, approverId, commentLength, isViaLink }` |
| `approval.expired` | `approval` | `{ defaultAction, reason }` |
| `approval.escalated` | `approval` | `{ fromLevel, toLevel, escalatedApprovalId }` |
| `approval.token.consumed` | `approval` | `{ tokenId, ip, userAgent }` |
| `approval.token.revoked` | `approval` | `{ tokenId, reason }` |
| `approval.notification.sent` | `approval` | `{ channel, provider, success }` |
| `approval.comment.added` | `approval` | `{ userId?, system? }` |
| `approval.delegated` | `approval` | `{ fromId, toId }` |
| `approval.cancelled` | `approval` | `{ executionId, reason }` |

Retenção: mínimo 1 ano (LGPD/Compliance — conforme design-seguranca.md §6.5).

### 14.6 Log sanitization (harmonizado com design-seguranca.md §6.2)

- **NUNCA** logar `tokenHash`, `token` (plaintext), `signature`, ou valores de credenciais.
- `approverId` e `userId` em logs auditáveis (não em application logs rotineiros).
- `requestId` propagado via header `x-request-id` (conforme v2-security-spec §7.5).
- IPs e user agents sanitizados antes de log (remover caracteres de controle).

---

### 14.7 Integridade e consistência

#### 14.7.1 Transaction guarantees

Criação de approval é atômica:
```
prisma.$transaction([
  prisma.approval.create(...),                    // approval
  prisma.approvalApprover.createMany(...),       // approvers
  prisma.approvalToken.create(...),              // token
  prisma.nodeExecution.update(...),              // marca como WAITING
  prisma.workflowExecution.update(...),          // status = WAITING_APPROVAL
  auditLog.create(...),                          // approval.created
])
```

Decisão do approver é atômica:
```
prisma.$transaction([
  prisma.approval.update(...),                    // status = APPROVED/REJECTED
  prisma.approvalApprover.update(...),            // status do approver
  prisma.approvalToken.update(...),               // consumedAt
  prisma.workflowExecution.update(...),           // re-enqueue
  auditLog.create(...),                           // approval.decided
])
```

### 14.7.2 Idempotency

- Decisão do approver: `updateMany` com `where: { id, status: "PENDING" }` garante que apenas o primeiro vote conta. Se `count === 0`, o approval já foi decidido → retorna 409 Conflict.
- Token: constraint `@unique` em `tokenHash` impede duplicatas. `consumedAt` previne reuse.
- Re-enfileiramento de execução: `jobId` fixo (`resume-{executionId}`) no BullMQ impede duplicatas.

### 14.7.3 Health check

Endpoint `GET /api/approvals/health`:
- Verifica conexão com PostgreSQL (query simples).
- Verifica conexão com Redis (ping).
- Verifica se `APPROVAL_TOKEN_SIGNING_KEY` está configurada.
- Conta de approvals pendentes há mais de 7 dias (alerta de possível workflow travado).

---

## 15. Variáveis de ambiente necessárias

> Harmoniza com `apps/api/src/lib/env.ts` (Zod schema existente).

| Variável | Obrigatória | Padrão | Descrição |
|----------|-------------|--------|-----------|
| `APPROVAL_TOKEN_SIGNING_KEY` | **SIM** | — | Chave HMAC de 32 bytes (64 hex chars) |
| `APPROVAL_TOKEN_TTL_HOURS` | Não | `72` | TTL padrão de tokens (3 dias) |
| `APPROVAL_EMAIL_RATE_LIMIT` | Não | `500` | Limite de e-mails/hora por org |
| `APPROVAL_DEFAULT_DEADLINE_HOURS` | Não | `72` | Deadline padrão se não configurado no node |
| `APPROVAL_RECONCILIATION_INTERVAL_SEC` | Não | `300` | Intervalo do job de reconciliation |
| `APPROVAL_TIMEOUT_CHECK_INTERVAL_SEC` | Não | `60` | Intervalo do job de timeout-check |
| `APPROVAL_RESEND_MAX_PER_HOUR` | Não | `3` | Limite de reenvios/hora |

```bash
# Gerar chave (uma única vez)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 16. Testes

> Inspirado em `briefs/prompt-test-strategy.md` (unit, integration, e2e).

### 16.1 Unit tests (`packages/shared/src/approvals/`)

| Teste | O quê |
|-------|-------|
| `ApprovalPolicySchema` | Validação Zod: modo válido, quorum ≥ 1, deadline ≤ 168h, canais não vazios |
| `ApprovalTokenService.generate()` | Token de 256 bits, hash sha256, HMAC assinado |
| `ApprovalTokenService.validate()` | Todos os caminhos: valid, expired, consumed, revoked, tampered signature, wrong org |
| `ApprovalTokenService.consume()` | Single-use: segunda chamada retorna erro |
| `QuorumCalculator` | COLLECTIVE: todos aprovam; QUORUM: N absoluto ou N%; CHAIN: escalonamento |

### 16.2 Integration tests (`apps/api/tests/`)

| Teste | O quê |
|-------|-------|
| `POST /api/approvals/{id}/decide` | Aprovação via JWT autenticado; 403 se não approver |
| `GET /approve/{token}` | Token válido → 200; token vazado → 410; org errada → 403 |
| Timeout job | Approval expirado → `defaultAction` aplicada corretamente |
| Escalation job | CHAIN mode, timeout → novo Approval filho criado |
| Reconciliation | Execution WAITING_APPROVAL + Approval APPROVED → resume enfileirado |
| Multi-approver | COLLECTIVE: 1º aprova, 2º aprova → execution retoma; 1º rejeita → falha |
| Delegation | `delegate` → novo approver recebe token, audit trail registrado |
| User demitido | `approvals:reassign` → approvals re-atribuídos para owner |
| Webhook callback | Telegram callback com `callback_data` → valida tokenId, decide |
| Rate limit | 11º decide em 60s → 429 |
| Tenant isolation | User de org A não vê approvals de org B |

### 16.3 E2E tests (`apps/web/tests/`)

| Teste | O quê |
|-------|-------|
| Aprovação via painel | Cria workflow com approval node → dispara → painel mostra pending → aprova → exec retoma |
| Aprovação via e-mail | Clica link → página web carrega → decide → email mostra sucesso |
| Timeout | Aguarda deadline expirar → exec falha com defaultAction |
| Comentários | Adiciona comentário → aparece no timeline → audit log |
| Múltiplos approvals | Workflow com 2 approval nodes → pausa no primeiro → retoma → pausa no segundo |
| Revisão de histórico | Navega para `/approvals/history` → filtra por workflow → vê todas decisões |

### 16.4 Property-based tests (fuzzy)

| Teste | O quê |
|-------|-------|
| Token entropy | 10000 tokens gerados são únicos e têm 256 bits de entropia |
| Replay invariance | Consumir um token duas vezes falha na segunda |
| Quorum correctness | Gera combinações aleatórias de approve/reject para QUORUM(3/5) → verifica que 3 approvals retomam e 2 rejections não |
| Cycle detection | Delegation A→B→A → detectado pelo job de reconciliation |

---

## 17. Performance e dimensionamento

### 17.1 Latência alvo

| Operação | P95 |
|----------|-----|
| Criação de approval (executor pausa) | < 200ms |
| Validação de token (GET /approve/{token}) | < 50ms |
| Decisão (POST /api/approvals/{id}/decide) | < 100ms |
| Re-enfileiramento de execução (BullMQ) | < 10ms |
| Envio de e-mail (BullMQ job) | assíncrono, < 5s no job |
| Escalonamento automático (timeout job) | batch processado em < 1s por 100 approvals |

### 17.2 Escalabilidade

- **Approvals por tenant**: sem limite artificial; rate limit por org.
- **Throughput de decisões**: 1000 decisões/s (BullMQ concurrency 50 + DB connection pool).
- **Jobs de timeout/reminders**: particionados por `orgId` no Redis, processados por worker dedicado (`approval-scheduler`).
- **Worker isolation**: o `approval-scheduler` é um worker BullMQ separado do `execution-worker`, evitando que timeouts de approval afetem throughput de execução.

### 17.3 Monitoramento (métricas Prometheus)

```typescript
// apps/api/src/services/approval-metrics.ts (inspirado em v2-security-spec §8)
export const ApprovalMetrics = {
  approvals_created_total: Counter({ labels: ["mode", "orgId"] }),
  approvals_decided_total: Counter({ labels: ["decision", "mode", "channel", "orgId"] }),
  approvals_expired_total: Counter({ labels: ["defaultAction", "orgId"] }),
  approval_decision_latency_seconds: Histogram({ labels: ["mode"] }),
  approval_token_validations_total: Counter({ labels: ["result"] }),  // valid, expired, consumed, revoked, tampered, wrong_org
  approval_reminders_sent_total: Counter({ labels: ["channel", "status"] }),
  approvals_pending_gauge: Gauge({ labels: ["orgId", "mode"] }),
};
```

---

## 18. Compatibilidade n8n

> O n8n comunidade não possui um nó de aprovação nativo. A aproximação mais próxima é o nó `Wait` com `resumeOn=webhook` combinado com e-mails manuais. O AgentFlow **vai além**, oferecendo um nó `approval` dedicado com todos os modos acima.

| Recurso n8n (comunidade) | AgentFlow v2 | Gap fechado? |
|--------------------------|-------------|--------------|
| Wait node (time/webhook) | Approval node (pausa + notifica + decision) | ✅ Sim |
| Retry de execução manual | Retries de notificação + escalation | ✅ Sim |
| Email pelo SMTP | Email + Telegram + Slack + Discord + WhatsApp | ✅ Sim |
| Aprovação por e-mail manual | Link seguro com token, HMAC, single-use | ✅ Sim |
| Timeout manual | Deadline automático com ação padrão | ✅ Sim |
| Single approver | SINGLE, COLLECTIVE, QUORUM, CHAIN, CONDITIONAL | ✅ Sim |
| Sem auditoria | AuditLog imutável para todas as ações | ✅ Sim |

---

## 19. Dependências

> Reutiliza stack existente conforme `repo-map.md` e `design-recriacao.md` §(e).

| Pacote | Versão | Uso no v2-approvals |
|--------|--------|---------------------|
| `@prisma/client` | 6.19.3 | Models Approval, ApprovalToken, ApprovalApprover, etc. |
| `zod` | 3.25.76 | Schemas de validação (ApprovalPolicy, ApprovalDecision) |
| `bullmq` | 5.81.3 | Jobs: timeout-check, reminder, notification, resume, reconciliation |
| `ioredis` | 5.11.1 | Backend do BullMQ; rate limiting |
| `node:crypto` | built-in | `randomBytes`, `createHmac`, `createHash`, `timingSafeEqual` |
| `nodemailer` | (existente? verificar) | Envio de e-mails de aprovação |
| `@prisma/client` AuditLog | (existente) | Auditing universal |

> **Nota**: Se `nodemailer` não estiver no lockfile, adicionar como dependência leve. Alternativa: usar `@sendgrid/mail` ou Resend (já comum em stacks serverless).

---

## 20. Aberturas e decisões futuras

| # | Questão | Recomendação |
|---|---------|-------------|
| 1 | Aprovação via SMS (Twilio) | Adicionar channel `SMS` na P2 |
| 2 | Aprovação via app mobile (push) | FCM/APNs na P2 |
| 3 | Integração com sistemas externos (Jira, ServiceNow) | API webhook custom + OAuth na P2 |
| 4 | Aprovação por voz (IVR) | Twilio Voice na P3 (justificativa: niche, alto esforço) |
| 5 | Multi-tenant shared approvers | Grupos de usuários por org na P2 |
| 6 | UI de configuração do approval node no editor | Form dinâmico (Zod → React Hook Form) na P1 |

---

*Documento de design concluído. Estende o modelo existente (`Approval`, `ExecutionStatus.WAITING_APPROVAL`) para um sistema completo de human-in-the-loop com múltiplos modos, canais, segurança de tokens, auditoria e resiliência pós-restart. A implementação segue o roadmap MVP → P1 → P2 na seção 11.*
