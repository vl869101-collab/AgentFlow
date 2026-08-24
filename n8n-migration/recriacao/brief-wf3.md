# Brief WF3 — My workflow 2

Missão: EfqC5HPgSwto · Propósito: TESTE de paridade n8n → AgentFlow (entender a mecânica). YOLO autorizado pelo usuário — execute direto, sem pedir aprovação. NÃO faça commit.

## Escopo (SOMENTE isto)
Recriar do zero, no FORMATO NATIVO do AgentFlow, o workflow **"My workflow 2"** (n8n id 2ZImw8KzAbLMT7ca). Proibido usar `n8n-migration/converter/convert.ts`.

Estrutura original (ver `n8n-migration/inventario.md` §3):
1. **Email Trigger (IMAP)** — `n8n-nodes-base.emailReadImap` v2.2
2. **Add label to message** — `n8n-nodes-base.gmail` v2.2 (operação add label; doc registra webhook POST path `09fc1dd4-a6dd-4e14-a817-de6d6c6503fd` associado a este node — reproduza o comportamento de webhook conforme arquitetura do AgentFlow)
Conexão 1→2. Credenciais: IMAP Email + Gmail OAuth2.

## Leia antes de codar
- `n8n-migration/inventario.md`, `mcp-sdk-reference.md`, `design-recriacao.md`, `design-testes.md`, `catalogo-nodes.md`, `repo-map.md`
- Código atual: `apps/api` (executor, webhooks c/ secret/HMAC, crypto.ts) e `apps/web`

## Regras anti-colisão (outros panes trabalham em paralelo neste repo)
- Crie seus handler files em arquivos NOVOS seus (um por tipo de node).
- NÃO edite o registro/registry compartilhado de handlers. APPEND sua seção em `n8n-migration/recriacao/registracoes-pendentes.md` com as linhas de registro exatas necessárias.
- Não toque em handlers de outros workflows (gmailTrigger, code, googleDrive, evaluationTrigger).

## Aceite
- Workflow persistido no schema nativo equivalente ao original
- Teste local: disparo manual simulado + chamada de webhook local (POST no path acima) validando fluxo até a ação do Gmail (mock/fake creds, sem OAuth real)
- Credenciais via mecanismo encriptado existente
- Cobertura ≥80% nos módulos novos

## Entrega
Escreva `n8n-migration/recriacao/wf3-resultado.md`: implementação, arquivos, testes rodados + resultado, cobertura, pendências (incl. entradas em registracoes-pendentes.md).
