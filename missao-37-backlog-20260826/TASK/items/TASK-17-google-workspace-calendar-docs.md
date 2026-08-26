# TASK-17: Nós Google Workspace — Google Calendar & Google Docs

- **Prioridade:** P2 (Nós & Produtividade)
- **Domínio:** Integrations / Google Workspace / Productivity
- **Alvo:** `apps/api/src/services/nodes/google-calendar.ts` & `apps/api/src/services/nodes/google-docs.ts`

## 1. Contexto & Problema
Completando a suíte de produtividade (Google Sheets, Drive e Gmail já existentes), são necessários nós para gerenciar compromissos no Google Calendar e manipular documentos no Google Docs.

## 2. Objetivos & Especificação
1. **Nó Google Calendar:**
   - Operações: `createEvent`, `listEvents`, `updateEvent`, `deleteEvent`, `getEvent`.
   - Suporte a fusos horários, participantes, links de Google Meet automáticos e lembretes.
2. **Nó Google Docs:**
   - Operações: `createDocument`, `getText`, `insertText`, `replaceText`, `appendParagraph`.
   - Suporte a templates de documentos e substituição de variáveis dinâmicas.
3. **Injeção de Credenciais:**
   - Uso transparente do gerenciador OAuth2 do Google com renovação automática de tokens.

## 3. Critérios de Aceite
- [ ] Operações de CRUD de eventos no Calendar executam com formatação ISO de data correta.
- [ ] Manipulação de texto em documentos do Docs aplica modificações estruturadas.
- [ ] Testes unitários com mocks das APIs Google Calendar v3 e Google Docs v1.
