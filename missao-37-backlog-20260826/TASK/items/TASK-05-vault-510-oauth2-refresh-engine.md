# TASK-05: Vault 510 Providers — Motor Autônomo de Refresh de Tokens OAuth2

- **Prioridade:** P0 (Vault / Credenciais / Confiabilidade)
- **Domínio:** Security / Vault / OAuth2 Engine
- **Alvo:** `apps/api/src/services/vault/oauth-refresh.ts`, `apps/api/src/services/vault/crypto.ts` & `apps/api/src/worker.ts`

## 1. Contexto & Problema
O AgentFlow possui catálogo de 510 provedores. Credenciais OAuth2 expiram frequentemente (ex: 1h). Sem renovação automática preditiva e on-demand, os nós falham com `401 Unauthorized`.

## 2. Objetivos & Especificação
1. **On-Demand Token Refresh (Interception):**
   - Validador síncrono antes da execução de qualquer nó com credencial OAuth2.
   - Se `expiresAt - now() < 5min`, aciona refresh imediato via endpoint OAuth2 do provider e atualiza o banco de dados com AES-256-GCM.
2. **Background Scheduled Refresh Worker:**
   - Job agendado no BullMQ a cada 10 minutos para escanear credenciais ativas expirando em menos de 30 minutos e renovar proativamente.
3. **Tratamento de Rotação de Refresh Tokens:**
   - Suporte a provedores que invalidam o `refreshToken` antigo e fornecem um novo par no corpo da resposta.
   - Marcação de credencial como `EXPIRED` ou `REVOKED` caso o refresh falhe, notificando administradores da organização.

## 3. Critérios de Aceite
- [ ] Execução com token expirado renova com sucesso sem repassar erro 401 para o nó.
- [ ] Worker periódico renova credenciais prestes a expirar.
- [ ] Credenciais atualizadas são re-encriptadas com chave e tag de autenticação válidas no Vault.
- [ ] Cobertura de testes unitários com mocks de provedores OAuth2 (Google, Microsoft, Slack, GitHub, Salesforce).
