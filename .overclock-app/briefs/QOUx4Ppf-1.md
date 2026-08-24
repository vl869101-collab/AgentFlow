---
id: QOUx4Ppf-1
missionId: QOUx4PpfWo2J
titulo: TAREFA P7y4T8Tl-1 — Missão P7y4T8TltPAy
status: aberto
---

TAREFA P7y4T8Tl-1 — Missão P7y4T8TltPAy

Execute o briefing completo em n8n-migration/briefs/prompt-comunicacao.md: produza a especificação das integrações de comunicação (email, WhatsApp, Telegram, Discord, Slack, Teams, SMS, voz, webchat, Messenger/Instagram DM, push) em n8n-migration/v2-communication-integrations.md, seguindo TODOS os critérios de aceite do briefing. Finalize com handoff_submit.

Worker contract:
1. pwd — confirm repo C:\Users\VICTOR\Downloads\Claude Code\AgentFlow
2. Read n8n-migration/briefs/prompt-comunicacao.md + parent
3. Execute strictly within item file scope (v2-communication-integrations.md)
4. Write result back into item + commit pathspec citing item ID (PRE-AUTHORIZED)
5. handoff_submit({ briefId: "P7y4T8Tl-1", summary, status }) as last action


---
Worker contract (mandatory, in order):
1. pwd — confirm the repo.
2. Read the pointed item (+ parent item if a slice, for context).
3. Execute strictly within the item's file scope.
4. Write the result back into the item (Correção/notas + session id).
5. Commit with pathspec citing the item ID — this commit is PRE-AUTHORIZED by this contract; do not ask permission, do not wait to be asked.
6. handoff_submit as your last action.

## Resultado

A especificação arquitetural completa das integrações de comunicação e colaboração para o AgentFlow foi produzida e refinada em `n8n-migration/v2-communication-integrations.md` (1.974 linhas), atendendo com rigor a todos os critérios de aceite estabelecidos no briefing.

### Resumo das Entregas:
1. **Visão Geral e Princípios Transversais**: Padrões assíncronos de triggers (webhook HMAC, polling com watermark/ETag, long-polling, SSE/WebSocket), pipeline de normalização com *Unified Event Schema*, arquitetura de Credential Vault compartilhado com refresh OAuth2 transparente, e matriz de segurança de inbound/outbound.
2. **Arquitetura de Gateway de Comunicação**: Diagrama ASCII completo do `COMMUNICATION GATEWAY`, definição do contrato `TransportAdapter` (`InboundDriver`, `OutboundDriver`, `WebhookController`), plano de credenciais criptografadas e integração com BullMQ/Redis.
3. **Especificação Completa por Integração**:
   - **E-mail**: SMTP, IMAP (IDLE/polling), POP3, Gmail API v1 (Push/PubSub, OAuth2) e Microsoft Graph Mail API (subscrições push). Decisão técnica fundamentada: drivers nativos otimizados + REST wrappers leves. (P0)
   - **WhatsApp**: Meta Cloud API (v18.0+) e BSPs (Twilio/360dialog), regras de janela de 24h e templates aprovados. (P0)
   - **Telegram**: Bot API com polling (`getUpdates`) e webhook (`setWebhook`), inline keyboards e callbacks. (P1)
   - **Discord**: Driver híbrido com REST Wrapper para actions e Gateway WebSocket dedicado para eventos com privileged intents. (P1)
   - **Slack**: Events API, Socket Mode, Block Kit, OAuth2 granular. (P0)
   - **Microsoft Teams**: Graph API, Bot Framework webhooks, Adaptive Cards. (P0)
   - **SMS**: Twilio, Vonage e MessageBird com tratamento de idempotência e números E.164. (P0)
   - **Voz**: Twilio Voice com geração declarativa de TwiML (`<Say>`, `<Gather>`, `<Dial>`, `<Record>`). Decisão estratégica fundamentada para diferenciar o AgentFlow do n8n. (P2)
   - **Webchat**: Widget embeddable nativo fullstack com suporte a streaming de IA (SSE) e sessões persistentes. (P1)
   - **Outros Canais**: Signal, iMessage (análise de inviabilidade nativa), Google Chat, Facebook Messenger, Instagram DM, TikTok DM, Inbound SMTP MX Parser (Postfix/SendGrid/Mailgun), Push Notifications (FCM v1, APNs, OneSignal, Expo) e Agregadores Globais de SMS.
4. **Matrizes & Tabelas Comparativas**: Capability Matrix consolidada, tabela de limites/quotas por serviço, e matriz de tratamento de erros com políticas de backoff exponencial e Dead Letter Queue.
5. **Roteiro de Implementação**: Roadmap em fases (P0/P1/P2) com cronograma visual em Mermaid Gantt e mapeamento de dependências cruzadas com o codebase existente (`apps/api`, `packages/shared`, `packages/database`).
6. **Riscos, Limitações e Glossário**: Mapeamento de riscos de plataforma, restrições cross-provider e glossário técnico detalhado.

**Sessão**: `00692d11-3497-4c3d-81f4-51631b3508e2`  
**Item**: `QOUx4Ppf-1`

