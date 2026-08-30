# n8n Migration Fixtures

Esta pasta contém **5 fixtures JSON realistas** para testar workflows do n8n migrados para o AgentFlow. Cada fixture representa um payload típico que os nodes do n8n recebem ou enviam.

---

## 📁 Arquivos

| Arquivo | Node n8n Relacionado | Cenário |
|---------|---------------------|---------|
| `webhook-form.json` | Webhook | Formulário de lead/contato |
| `webhook-transacao.json` | Webhook | Callback de pagamento/pedido |
| `schedule-dados.json` | Schedule Trigger + HTTP Request/Set | Relatório diário agendado |
| `openai-chat.json` | OpenAI (Chat Completion) | Conversa com histórico |
| `sheets-linha.json` | Google Sheets (Read/Update/Append) | Linha(s) de planilha de vendas |

---

## 🚀 Como Usar

### Via cURL (teste rápido de webhook)

```bash
# Webhook de formulário
curl -X POST http://localhost:3000/webhook/lead \
  -H "Content-Type: application/json" \
  -d @webhook-form.json

# Webhook de transação
curl -X POST http://localhost:3000/webhook/pagamento \
  -H "Content-Type: application/json" \
  -d @webhook-transacao.json
```

### Via Insomnia / Postman

1. Crie uma nova request **POST**
2. URL: `http://localhost:3000/webhook/{endpoint}`
3. Body → **JSON** → importe o arquivo `.json` correspondente
4. Send

### Testes Automatizados (Jest/Vitest)

```typescript
import formFixture from './webhook-form.json';
import transacaoFixture from './webhook-transacao.json';

test('processa webhook de lead corretamente', async () => {
  const result = await processLeadWebhook(formFixture);
  expect(result.status).toBe('created');
  expect(result.lead.email).toBe('joao.silva@email.com');
});

test('processa transação aprovada', async () => {
  const result = await processPaymentWebhook(transacaoFixture);
  expect(result.status).toBe('confirmed');
  expect(result.valor).toBe(299.90);
});
```

### Testes de Integração n8n → AgentFlow

```typescript
// Simula execução do workflow completo
import scheduleFixture from './schedule-dados.json';

test('workflow de relatório diário executa sem erros', async () => {
  const workflow = await loadWorkflow('relatorio-diario');
  const result = await workflow.execute(scheduleFixture);
  expect(result.success).toBe(true);
  expect(result.emailEnviado).toBe(true);
});
```

---

## 📋 Campos Esperados por Fixture

### webhook-form.json
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `nome` | string | ✅ | Nome completo do lead |
| `email` | string | ✅ | Email válido |
| `telefone` | string | ❌ | Telefone com DDD |
| `mensagem` | string | ✅ | Mensagem do formulário |
| `timestamp` | string (ISO8601) | ✅ | Data/hora do envio |
| `formId` | string | ✅ | Identificador do formulário |
| `ipAddress` | string | ❌ | IP do remetente |
| `userAgent` | string | ❌ | User-Agent do navegador |

### webhook-transacao.json
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | string | ✅ | ID único da transação |
| `valor` | number | ✅ | Valor em centavos ou decimal |
| `moeda` | string | ✅ | Código ISO 4217 (ex: BRL) |
| `status` | string | ✅ | `aprovado`, `pendente`, `recusado`, `estornado` |
| `gateway` | string | ✅ | Nome do gateway (mercadopago, stripe, etc.) |
| `cliente` | object | ✅ | Objeto com nome, email, telefone, documento |
| `itens` | array | ✅ | Array de objetos com produtoId, nome, quantidade, precoUnitario |
| `dataCriacao` | string (ISO8601) | ✅ | Data de criação |
| `dataAprovacao` | string (ISO8601) | ❌ | Data de aprovação (se status=aprovado) |
| `metadados` | object | ❌ | UTMs, custom fields |

### schedule-dados.json
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `tipo` | string | ✅ | Tipo do relatório (ex: `relatorio_vendas_diario`) |
| `data` | string (YYYY-MM-DD) | ✅ | Data de referência |
| `periodo` | string | ✅ | Período coberto |
| `resumo` | object | ✅ | Totais agregados |
| `detalhes` | object | ✅ | Breakdown por produto/canal |
| `geradoEm` | string (ISO8601) | ✅ | Timestamp de geração |
| `proximoRelatorio` | string (ISO8601) | ✅ | Próxima execução agendada |

### openai-chat.json
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `model` | string | ✅ | Modelo OpenAI (ex: `gpt-4o-mini`) |
| `temperature` | number | ✅ | 0.0 a 2.0 |
| `maxTokens` | number | ✅ | Limite de tokens na resposta |
| `messages` | array | ✅ | Array de `{role, content}` (system/user/assistant) |
| `metadata` | object | ❌ | conversationId, userId, source, intent |

### sheets-linha.json
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `range` | string | ✅ | Range A1 notation (ex: `Vendas!A2:H`) |
| `majorDimension` | string | ✅ | `ROWS` ou `COLUMNS` |
| `values` | array[] | ✅ | Matriz de linhas/colunas |
| `metadados` | object | ❌ | totalLinhas, ultimaAtualizacao, planilhaId, aba |

---

## 🔄 Variações para Testes

### Webhook Form
- **Campo opcional ausente**: remova `telefone`, `ipAddress`, `userAgent`
- **Email inválido**: teste validação com `email: "invalido"`
- **Campos vazios**: `nome: ""`, `mensagem: ""`
- **Caracteres especiais**: emojis, acentos, scripts XSS na mensagem

### Webhook Transação
- **Status variados**: `pendente`, `recusado`, `estornado`
- **Múltiplos itens**: array com 3+ produtos
- **Valores edge**: `valor: 0`, `valor: 999999.99`
- **Moedas diferentes**: `USD`, `EUR`
- **Gateway alternativo**: `stripe`, `paypal`, `pagseguro`

### Schedule Dados
- **Sem vendas**: `totalVendas: 0`, `valorTotal: 0`, arrays vazios
- **Múltiplos períodos**: `relatorio_vendas_semanal`, `relatorio_vendas_mensal`
- **Dados parciais**: apenas `resumo` sem `detalhes`

### OpenAI Chat
- **Apenas system + user**: sem histórico de assistant
- **Histórico longo**: 10+ mensagens (teste token limit)
- **Temperature extremos**: `0` (determinístico), `1.5` (criativo)
- **Models diferentes**: `gpt-4o`, `gpt-3.5-turbo`
- **System prompt vazio**: teste comportamento padrão

### Sheets Linha
- **Linha única**: array `values` com 1 item
- **Muitas linhas**: 100+ linhas (teste batch)
- **Células vazias**: `""` em algumas colunas
- **Tipos mistos**: números como string, datas, booleanos
- **Range diferente**: `Leads!A2:F`, `Clientes!A2:Z`

---

## ⚠️ Observações

- **Não há dados reais de usuários** — todos os nomes, emails, telefones e IDs são fictícios
- **Timestamps** usam ISO 8601 UTC para consistência
- **IDs** seguem padrões realistas (`txn_`, `conv_`, `usr_`, `prod_`) mas são inventados
- **Valores monetários** em formato decimal (não centavos) para legibilidade
- Adapte os endpoints URLs (`/webhook/lead`, `/webhook/pagamento`) conforme sua configuração

---

## 📝 Contribuindo

Para adicionar nova fixture:
1. Crie `novo-cenario.json` com comentário no topo (cenário + node consumidor)
2. Use dados realistas mas **fictícios**
3. Atualize este README com a tabela de campos e variações
4. Teste com `curl` e testes automatizados antes de commitar