# TASK-02: Handlers Assíncronos & HITL — Wait, Form (Aprovação Humana) & Chat Trigger com Streaming SSE

- **Prioridade:** P0 (Core Engine / Bloqueador)
- **Domínio:** Async Execution / Human-in-the-Loop / Chat Streaming
- **Alvo:** `apps/api/src/services/nodes/`, `apps/api/src/routes/approvals.ts`, `apps/api/src/routes/chat.ts` & `apps/api/src/services/executor.ts`

## 1. Contexto & Problema
Workflows complexos exigem pausas no tempo (Wait), intervenção humana para aprovações com formulários (Form/HITL) e interações conversacionais em tempo real com streaming de tokens (Chat Trigger com Server-Sent Events).

## 2. Objetivos & Especificação
1. **Nó Wait:**
   - Modo temporal: pausa por duração (`duration` ex: 10m, 1h) ou data fixa (`fixedDate`) via BullMQ delayed jobs.
   - Modo callback: suspensão com registro de webhook token de retração externa.
2. **Nó Form (Human-in-the-Loop):**
   - Geração dinâmica de schema de campos Zod.
   - Emissão de link assinado com token JWT efêmero para formulário de aprovação/rejeição.
   - Estado de execução persistido como `WAITING_APPROVAL` sem prender recursos de memória.
   - Endpoint de submissão `POST /api/approvals/:token/submit` que valida payload e retoma o workflow.
3. **Chat Trigger com Streaming SSE (Server-Sent Events):**
   - Nó gatilho `chatTrigger` especializado para assistentes conversacionais e interfaces de chat.
   - Endpoint `POST /api/chat/stream` e `GET /api/workflows/:id/chat/stream` com protocolo `text/event-stream`.
   - Streaming em tempo real de: tokens da LLM (`event: token`), status de nós intermediários (`event: node_status`), logs e conclusão (`event: done`).
   - Persistência e injeção do histórico de mensagens da sessão/thread no contexto de itens do workflow.

## 3. Critérios de Aceite
- [ ] Execuções com nó `wait` entram em estado suspenso e retomam pontualmente via timer BullMQ.
- [ ] Formulários HITL geram URL segura, aceitam preenchimento com validação Zod e retomam o fluxo downstream.
- [ ] Nó `chatTrigger` transmite eventos e tokens via SSE para o cliente sem bufferização indevida.
- [ ] Clientes desconectados durante o SSE têm cancelamento gracioso da subscrição de eventos.
- [ ] Testes unitários e de integração validando suspensão/retomada e streaming SSE.
