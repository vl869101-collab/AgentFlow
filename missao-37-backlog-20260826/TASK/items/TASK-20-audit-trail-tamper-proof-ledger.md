# TASK-20: Trilha de Auditoria Criptográfica Imutável com Hash Chain (SHA-256)

- **Prioridade:** P2 (Compliance & Auditoria de Segurança)
- **Domínio:** Security / Compliance / Cryptographic Ledger
- **Alvo:** `apps/api/src/services/audit-ledger.ts` & `apps/api/src/routes/audit.ts`

## 1. Contexto & Problema
Para auditoria de segurança rigorosa e conformidade regulatória, registros de eventos sensíveis (login, criação de credenciais, revelação de senhas, execução de código dinâmico) devem ser à prova de adulteração.

## 2. Objetivos & Especificação
1. **Hash Chain Criptográfica SHA-256:**
   - Cada registro de auditoria armazena o hash do registro anterior: `currentHash = SHA256(previousHash + eventPayload + timestamp + orgId)`.
   - Qualquer alteração manual ou exclusão quebra a cadeia de hashes detectável na validação.
2. **Validador de Integridade do Ledger:**
   - Função de verificação contínua `verifyAuditLedgerIntegrity(orgId)` que percorre a sequência de blocos garantindo validade de ponta a ponta.
3. **Exportação Assinada de Relatórios:**
   - Endpoint para exportar trilha de auditoria assinada para auditorias externas de conformidade.

## 3. Critérios de Aceite
- [ ] Todo evento sensível é gravado com cálculo de encadeamento criptográfico SHA-256.
- [ ] Tentativa de adulteração em registro histórico é imediatamente detectada pela verificação de integridade.
- [ ] Testes unitários validando cadeia de blocos, integridade e detecção de fraude.
