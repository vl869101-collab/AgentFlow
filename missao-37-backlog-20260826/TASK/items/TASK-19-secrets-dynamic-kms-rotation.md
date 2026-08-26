# TASK-19: Rotação Dinâmica de Master Keys AES-256-GCM / KMS sem Downtime

- **Prioridade:** P2 (Segurança & Criptografia Avançada)
- **Domínio:** Security / KMS / Vault Key Management
- **Alvo:** `apps/api/src/services/vault/crypto.ts`, `apps/api/src/services/vault/kms.ts` & scripts de migração

## 1. Contexto & Problema
Segredos corporativos exigem rotação periódica de chaves de criptografia (master keys) para conformidade com normas SOC2/ISO 27001. A troca de chave deve ocorrer sem indisponibilidade e re-encriptando segredos em background.

## 2. Objetivos & Especificação
1. **Versionamento de Chaves de Criptografia:**
   - Armazenamento de metadados de versão da chave em cada registro (`keyVersion`, `algorithm`, `iv`, `tag`).
   - Suporte a múltiplas chaves ativas para descriptografia (chave corrente + chaves anteriores arquivadas).
2. **Motor de Re-encriptação em Lote:**
   - Script/worker que varre todas as credenciais do Vault encriptadas com versões legadas e as re-encripta utilizando a chave mais recente.
3. **Integração com Provedores KMS:**
   - Suporte a chaves locais (env) e provedores KMS em nuvem (AWS KMS, Google Cloud KMS, HashiCorp Vault).

## 3. Critérios de Aceite
- [ ] O Vault consegue descriptografar dados cifrados com chaves antigas válidas.
- [ ] Processo de rotação re-encripta registros para a nova chave sem falhas em execuções ativas.
- [ ] Testes unitários com rotação de chaves e validação de integridade dos dados re-encriptados.
