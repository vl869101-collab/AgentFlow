# Brief WF1 — Save Gmail Attachments to Google Drive

Missão: EfqC5HPgSwto · Propósito: TESTE de paridade n8n → AgentFlow (entender a mecânica). YOLO autorizado pelo usuário — execute direto, sem pedir aprovação. NÃO faça commit.

## Escopo (SOMENTE isto)
Recriar do zero, no FORMATO NATIVO do AgentFlow, o workflow **"Save Gmail Attachments to Google Drive"** (n8n id 7JJEwYx7pRTWLvSo). Proibido usar `n8n-migration/converter/convert.ts`.

Estrutura original (ver `n8n-migration/inventario.md` §1):
1. **On New Email** — `n8n-nodes-base.gmailTrigger` v1.4 (polling, Gmail nova mensagem com anexo)
2. **Split Attachments** — `n8n-nodes-base.code` v2 (jsCode que separa anexos em itens) — ATENÇÃO: hoje o executor retorna `CodeExecutionDisabledError` por padrão (ver `reviewer-relatorio.md` §6); habilite/implemente execução de code node com sandbox seguro para este caso
3. **Upload to Google Drive** — `n8n-nodes-base.googleDrive` v3 (upload)
Conexão 1→2→3. Credenciais: Gmail OAuth2 + Google Drive OAuth2.

## Leia antes de codar
- `n8n-migration/inventario.md`, `mcp-sdk-reference.md`, `design-recriacao.md`, `design-testes.md`, `catalogo-nodes.md`, `repo-map.md`, `builder-relatorio.md`
- Código atual: `apps/api` (executor, crypto.ts AES-256-GCM p/ credenciais) e `apps/web`

## Regras anti-colisão (outros panes trabalham em paralelo neste repo)
- Crie seus handler files em arquivos NOVOS seus (um por tipo de node: gmailTrigger, code, googleDrive).
- NÃO edite o registro/registry compartilhado de handlers. APPEND sua seção em `n8n-migration/recriacao/registracoes-pendentes.md` com as linhas de registro exatas.
- Não toque em handlers de outros workflows (emailReadImap, gmail, evaluationTrigger).

## Aceite
- Workflow persistido no schema nativo equivalente ao original
- Teste local: disparo manual simulado com payload de email c/ anexos, validando split → upload (mock/fake creds, sem OAuth real)
- Credenciais via mecanismo encriptado existente
- Cobertura ≥80% nos módulos novos

## Entrega
Escreva `n8n-migration/recriacao/wf1-resultado.md`: implementação, arquivos, testes rodados + resultado, cobertura, pendências (incl. entradas em registracoes-pendentes.md).
