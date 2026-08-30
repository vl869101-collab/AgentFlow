# Resumo da Exportação n8n

**Instância:** https://victor11111.app.n8n.cloud  
**Data:** 2026-08-19  
**Método:** Login com sessão (email/password) → REST API `/rest/workflows`

---

## Totais

| Métrica | Valor |
|---------|-------|
| **Workflows exportados** | 3 |
| **Workflows ativos** | 0 |
| **Workflows inativos** | 3 |
| **Workflows arquivados** | 0 |
| **Total de nodes** | 6 |
| **Tipos de node únicos** | 6 |
| **Credenciais distintas** | 3 |
| **Webhooks públicos** | 1 |

---

## Tipos de Node Mais Usados

Todos os tipos aparecem **1 vez cada** (distribuição uniforme):

1. `n8n-nodes-base.gmailTrigger` — 1
2. `n8n-nodes-base.code` — 1
3. `n8n-nodes-base.googleDrive` — 1
4. `n8n-nodes-base.evaluationTrigger` — 1
5. `n8n-nodes-base.emailReadImap` — 1
6. `n8n-nodes-base.gmail` — 1

---

## Integrações Externas (Nomes Apenas)

| Integração | Workflows |
|------------|-----------|
| **Gmail** | Save Gmail Attachments to Google Drive, My workflow 2 |
| **Google Drive** | Save Gmail Attachments to Google Drive |
| **IMAP (Email genérico)** | My workflow 2 |
| **n8n Evaluation/Testing** | My workflow |

---

## Workflows Ativos

**Nenhum workflow está ativo no momento.**

Todos os 3 workflows estão com `active: false` e `isArchived: false`.

---

## Observações

1. **Workflow mais complexo:** "Save Gmail Attachments to Google Drive" (3 nodes, 2 integrações, lógica de split de anexos via código)
2. **Workflows recentes:** "My workflow" e "My workflow 2" criados em 19/08/2026 (hoje)
3. **Webhook:** Apenas "My workflow 2" possui webhook configurado no node "Add label to message"
4. **Credenciais:** Todas referenciadas por nome; valores não exportados por segurança
5. **Estrutura:** Workflows usam `executionOrder: v1` (padrão legado)

---

## Arquivos Gerados

```
n8n-migration/
├── workflows/
│   ├── Save_Gmail_Attachments_to_Google_Drive.json
│   ├── My_workflow.json
│   └── My_workflow_2.json
├── inventario.md
└── resumo.md
```