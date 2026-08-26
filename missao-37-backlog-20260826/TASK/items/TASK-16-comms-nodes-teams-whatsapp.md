# TASK-16: Nós Corporativos de Comunicação — Microsoft Teams & WhatsApp Cloud API

- **Prioridade:** P2 (Nós & Integrações Corporativas)
- **Domínio:** Integrations / Communications / Enterprise
- **Alvo:** `apps/api/src/services/nodes/teams.ts` & `apps/api/src/services/nodes/whatsapp.ts`

## 1. Contexto & Problema
Empresas utilizam Microsoft Teams e WhatsApp como canais centrais de mensageria corporativa e engajamento de clientes. O AgentFlow necessita de nós nativos completos para essas plataformas.

## 2. Objetivos & Especificação
1. **Nó Microsoft Teams:**
   - Envio de mensagens de texto, menções e cartões interativos ricos (**Adaptive Cards 1.5**).
   - Suporte a envio via Incoming Webhook ou Graph API OAuth2.
2. **Nó WhatsApp Cloud API (Meta):**
   - Envio de mensagens de texto, botões de ação rápida, mídia (imagens, PDFs, áudio) e templates pré-aprovados.
   - Suporte a autenticação via System User Token do Meta Business Manager.

## 3. Critérios de Aceite
- [ ] Nó Teams constrói e despacha Adaptive Cards estruturados com sucesso.
- [ ] Nó WhatsApp envia mensagens de template e mídia respeitando a API da Meta.
- [ ] Cobertura de testes unitários com mocks de payloads para ambas as plataformas.
