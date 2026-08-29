# AgentFlow — Plano de Melhorias & Auditoria P2 / P3 (Missão 37 & 46)

- **Data:** 2026-08-29
- **Autor / Executor:** Builder (Iteração 1 da Missão 46)
- **Status Geral:** Aprovado em Produção / Backlog Estruturado

---

## 1. Auditoria de Gaps Técnicos & Veredicto de Revisão

### 1.1 Registro Formal de Revisão do Banco de Dados
- **Status do `database-reviewer`:** **NÃO EXECUTADO (NO IMPLICIT PASS)**.
- **Justificativa / Constatação:** As migrações existentes (`20260811_backend_hardening` e `202608160001_refresh_tokens`) estão operacionais e validadas em produção no PostgreSQL da Render via `/health` (`checks.postgres = "ok"`). No entanto, não houve execução formal do agente/revisor dedicado `database-reviewer`. Portanto, **não há aprovação implícita** de arquitetura de banco avançada (índices parciais, particionamento de logs de auditoria, e análise de lock de DDL em alto throughput).

### 1.2 Status e Revisão dos Itens P2 (TASK-15 a TASK-20)
| Item | Descrição | Status Atual | Próximos Passos Recomendados |
| :--- | :--- | :---: | :--- |
| **TASK-15** | Workflow Semantic Diff & Versioning Visual | Implementado / Parcial UI | Adicionar visualizador gráfico side-by-side de nós e edges modificados no editor web. |
| **TASK-16** | Comms Nodes (Teams & WhatsApp Cloud API) | Implementado no core | Implementar webhooks de status de entrega (DLR) para mensagens do WhatsApp Business. |
| **TASK-17** | Google Workspace Nodes (Drive, Docs, Sheets, Calendar) | Implementado no core | Adicionar batching de operações de Google Sheets para evitar quota de API do Google. |
| **TASK-18** | OpenAPI Client SDK Auto-generation | Implementado (`@agentflow/sdk`) | Adicionar geração contínua de SDK Python e Go no pipeline de CI/CD. |
| **TASK-19** | Secrets Dynamic KMS Rotation | Implementado (AES-256-GCM + versioning) | Integrar provedores KMS externos (AWS KMS, HashiCorp Vault) em adição ao local master key. |
| **TASK-20** | Tamper-Proof Audit Trail Ledger | Implementado (`AuditLog` model) | Implementar hash chaining (Merkle Tree) para integridade criptográfica imutável dos logs de auditoria. |

---

## 2. Plano de Melhorias Estruturado

### Fase 1: Estabilidade de Produção e Observabilidade (P0/P1)
1. **Database Deep Review:**
   - Agendar e executar sessão formal com `database-reviewer` para auditar planos de execução, índices compostos e concorrência no PostgreSQL Render.
   - Implementar pooler de conexões (PgBouncer) caso a concorrência exceda o tier Starter do Render.
2. **Healthchecks Avançados & Dead Man's Switch:**
   - Adicionar checagem de latência de Redis e workers BullMQ no endpoint `/health`.
   - Implementar alertas no Discord/Slack para falhas recorrentes no worker DLQ.

### Fase 2: Otimização Frontend & DX (P1/P2)
1. **Next.js Standalone Build & Cache Tuning:**
   - Ajustar configuração de standalone e headers de cache no Vercel para páginas estáticas de documentação e workflows públicos.
   - Expandir a integração `NEXT_PUBLIC_API_URL` com interceptor global para renovação transparente de refresh tokens via `rawRequest`.
2. **Workflow Visual Diff Engine (TASK-15 Enhanced):**
   - Criar componente de overlay no React Flow destacando nós inseridos (verde), alterados (amarelo) e removidos (vermelho).

### Fase 3: Segurança e Conformidade Enterprise (P2/P3)
1. **Merkle Audit Ledger (TASK-20 Enhanced):**
   - Calcular `sha256(previousHash + action + timestamp + metadata)` em cada linha de `AuditLog`.
2. **KMS Provider Pluggability (TASK-19 Enhanced):**
   - Abstrair interface `KmsKeyProvider` com suporte a AWS KMS, Google Cloud KMS e Azure Key Vault.
