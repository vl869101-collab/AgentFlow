# Inventário de Workflows n8n

**Instância:** https://victor11111.app.n8n.cloud  
**Data da exportação:** 2026-08-19  
**Total de workflows:** 3

---

## Tabela de Workflows

| Nome | ID | Ativo | Atualizado em | Nº Nodes |
|------|-----|-------|---------------|----------|
| Save Gmail Attachments to Google Drive | 7JJEwYx7pRTWLvSo | ❌ Não | 2026-08-16T01:36:58.812Z | 3 |
| My workflow | SkxlGdS2egKPhibM | ❌ Não | 2026-08-19T00:26:26.799Z | 1 |
| My workflow 2 | 2ZImw8KzAbLMT7ca | ❌ Não | 2026-08-19T00:29:12.823Z | 2 |

---

## Mapa de Nodes por Tipo

| Tipo de Node | Quantidade | Workflows que usam |
|--------------|------------|-------------------|
| n8n-nodes-base.gmailTrigger | 1 | Save Gmail Attachments to Google Drive |
| n8n-nodes-base.code | 1 | Save Gmail Attachments to Google Drive |
| n8n-nodes-base.googleDrive | 1 | Save Gmail Attachments to Google Drive |
| n8n-nodes-base.evaluationTrigger | 1 | My workflow |
| n8n-nodes-base.emailReadImap | 1 | My workflow 2 |
| n8n-nodes-base.gmail | 1 | My workflow 2 |

**Total de nodes:** 6  
**Tipos únicos:** 6

---

## Credenciais Utilizadas (Nomes apenas)

| Credencial | Workflows | Nodes associados |
|------------|-----------|------------------|
| Gmail OAuth2 API | Save Gmail Attachments to Google Drive, My workflow 2 | On New Email, Add label to message |
| Google Drive OAuth2 API | Save Gmail Attachments to Google Drive | Upload to Google Drive |
| IMAP Email | My workflow 2 | Email Trigger (IMAP) |

> **Nota:** Os valores das credenciais NÃO são exportados (apenas nomes para referência).

---

## Webhooks

| Workflow | Node | Path | Method |
|----------|------|------|--------|
| My workflow 2 | Add label to message | 09fc1dd4-a6dd-4e14-a817-de6d6c6503fd | POST |

---

## Detalhes por Workflow

### 1. Save Gmail Attachments to Google Drive
- **ID:** 7JJEwYx7pRTWLvSo
- **Status:** Inativo (não ativo, não arquivado)
- **Criado em:** 2026-08-16T01:36:58.726Z
- **Atualizado em:** 2026-08-16T01:36:58.812Z
- **Versão:** d1b15137-8ed9-4c21-9c89-5a0c2f75e0b3 (counter: 2)
- **Nodes (3):**
  1. **On New Email** (n8n-nodes-base.gmailTrigger v1.4) - Trigger: Gmail nova mensagem com anexo
  2. **Split Attachments** (n8n-nodes-base.code v2) - Código JS para separar anexos
  3. **Upload to Google Drive** (n8n-nodes-base.googleDrive v3) - Upload para Google Drive
- **Conexões:** On New Email → Split Attachments → Upload to Google Drive
- **Credenciais:** Gmail OAuth2, Google Drive OAuth2

### 2. My workflow
- **ID:** SkxlGdS2egKPhibM
- **Status:** Inativo (não ativo, não arquivado)
- **Criado em:** 2026-08-19T00:26:26.799Z
- **Atualizado em:** 2026-08-19T00:26:26.799Z
- **Versão:** 3f230bbf-0d0b-487d-b48a-f17e78c15cdc (counter: 1)
- **Nodes (1):**
  1. **When fetching a dataset row** (n8n-nodes-base.evaluationTrigger v4.7) - Trigger de avaliação
- **Conexões:** Nenhuma
- **Credenciais:** Nenhuma

### 3. My workflow 2
- **ID:** 2ZImw8KzAbLMT7ca
- **Status:** Inativo (não ativo, não arquivado)
- **Criado em:** 2026-08-19T00:28:33.741Z
- **Atualizado em:** 2026-08-19T00:29:12.823Z
- **Versão:** f8f45b27-05d1-4f3f-9848-2311beba6a02 (counter: 2)
- **Nodes (2):**
  1. **Email Trigger (IMAP)** (n8n-nodes-base.emailReadImap v2.2) - Trigger IMAP
  2. **Add label to message** (n8n-nodes-base.gmail v2.2) - Adiciona label no Gmail (tem webhook)
- **Conexões:** Email Trigger (IMAP) → Add label to message
- **Credenciais:** IMAP Email, Gmail OAuth2
- **Webhook:** POST em `09fc1dd4-a6dd-4e14-a817-de6d6c6503fd`