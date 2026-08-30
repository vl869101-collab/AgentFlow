# Priorização de Implementação - Workflows n8n no AgentFlow

Este documento classifica os tipos de nós (nodes) mais comuns do n8n em níveis de prioridade (P0-P3) para orientar a recriação no AgentFlow. A classificação considera criticidade para execução de workflows, frequência de uso e complexidade de implementação.

## Legenda
- **P0 (Crítico)**: Essencial para que qualquer workflow funcione (triggers básicos, execução core).
- **P1 (Importante)**: Integrações externas comuns que cobrem a maioria dos casos de uso.
- **P2 (Desejável)**: Nós de controle de fluxo, lógica customizada e manipulação de dados avançados.
- **P3 (Nice-to-have)**: Recursos avançados ou especializados que agregam valor mas não são bloqueantes.

## Tabela de Prioridade

| Prioridade | Item (Node)            | Justificativa                                                                 | Dependências                              | Esforço Estimado | Ordem Recomendada | Critérios de Pronto                                                                 |
|------------|------------------------|-------------------------------------------------------------------------------|-------------------------------------------|------------------|-------------------|-------------------------------------------------------------------------------------|
| P0         | Webhook                | Trigger público que inicia workflows via HTTP; essencial para integrações com sistemas externos e eventos em tempo real. | Mecanismo de rotas HTTP, validação de assinatura, fila de execuções (BullMQ). | M                | 1                 | Endpoint `/webhook/:workflowId` funcional, validação de assinatura HMAC, enfileira execução correta. |
| P0         | Schedule Trigger (cron)| Trigger baseado em agendamento (cron); permite execuções periódicas sem intervenção manual. | Parser de sintaxe cron, integração com BullMQ jobs repetíveis, timezone handling. | M                | 2                 | Workflow com cron `*/5 * * * *` dispara a cada 5 minutos, respeito ao timezone, aparece na fila de jobs. |
| P1         | HTTP Request           | Nó genérico para chamar APIs REST/HTTP; usado na maioria das integrações com serviços externos. | Cliente HTTP robusto (axios/fetch), suporte a todos os métodos, autenticação básica/Bearer/OAuth2, tratamento de erros e timeouts. | L                | 3                 | Suporta GET, POST, PUT, PATCH, DELETE; cabeçalhos configuráveis; retorna status code e corpo; trata erros de rede e timeout. |
| P1         | Gmail                  | Integração muito comum para envio de notificações, leitura de caixas de entrada e criação de rascunhos. | OAuth2 flow para Google APIs, escopos Gmail adequados, tratamento de paginação e erros da API. | L                | 4                 | Pode enviar email com destinatário, assunto, corpo; pode ler mensagens recentes; trata erros de autenticação e limite de taxa. |
| P1         | Google Sheets          | Integração frequente para leitura/escrita de planilhas, relatórios e sincronização de dados. | OAuth2 flow para Google Sheets API, suporte a leitura de intervalos, atualização em lote, tratamento de erros. | L                | 5                 | Lê dados de uma planilha por range; adiciona linhas; atualiza células; trata erros de permissão e formato. |
| P1         | Telegram               | Integração comum para bots de notificação e interação via chat. | HTTP request para Bot API do Telegram, suporte a mensagens, fotos, teclados inline, webhooks opcionais. | M                | 6                 | Envia mensagem de texto para um chat ID; responde a comandos via webhook (se configurado); trata erros da API. |
| P2         | IF                     | Nó de bifurcação binária essencial para lógica condicional em workflows. | Avaliação de expressões (engine de expressões compatível com n8n), saída verdadeira/falsa. | S                | 7                 | Avalia expressão `{{ $json["status"] == "success" }}` e encaminha para ramo correto; aceita expressões complexas. |
| P2         | Switch                 | Nó de múltiplas bifurcações (case/else) para condições discretas. | Mesmo engine de expressões do IF, múltiplas saídas definidas por valores. | S                | 8                 | Suporta múltiplos casos (ex.: valor 1 → saída A, valor 2 → saída B) e caso padrão; avalia expressões ou valores estáticos. |
| P2         | Code                   | Nó para execução de JavaScript/TypeScript customizado; permite lógica complexa não coberta por outros nós. | Sandbox seguro (vm2 ou isolated-vm), timeout configurável, acesso restrito a require/fs, suporte a entrada/saída de dados. | M                | 9                 | Executa snippet seguro que modifica `$json` e retorna resultado; impede acesso a módulos perigosos; respeita timeout. |
| P2         | Merge                  | Nó para juntar ramas de fluxo após bifurcações (IF/Switch); essencial para reconcilificação de caminhos. | Lógica de espera por todas as ramas conectadas (ou por uma, dependendo da config), passagem de dados. | S                | 10                | Aguarda entrada de exatamente uma rama conectada (modo padrão) ou todas (modo espera por todos) e passa os dados adiante. |
| P2         | Set                    | Nó para definir ou modificar dados no fluxo (adicionar/atualizar campos). | Manipulação segura de objetos JSON, suporte a expressões para valores dinâmicos. | S                | 11                | Define `$json.newField = "value"`; atualiza campos existentes; funciona com expressões como `{{ $now }}`. |
| P3         | OpenAI                 | Integração com modelos de linguagem da OpenAI (GPT etc.) para geração de texto, classificação, etc.; valiosa mas não essencial para fluxos básicos. | Cliente HTTP com suporte a streaming opcional, gerenciamento de chave API via credenciais, tratamento de respostas e erros da API. | L                | 12                | Envia prompt para modelo GPT-3.5-turbo e retorna texto gerado; suporta parâmetros como temperature, max_tokens; trata erros de limite de taxa e autenticação. |

## Ordem Geral de Implementação
1. **Core Engine** (não listado acima, mas imprescindível): mecanismo de definição de workflow (JSON), fila de execuções (BullMQ), worker de processamento, tabela de execuções no Prisma.
2. **P0 Nodes** (Webhook, Schedule Trigger): habilitam disparo de workflows.
3. **P1 Nodes** (HTTP Request, Gmail, Google Sheets, Telegram): cobrem integrações externas mais comuns.
4. **P2 Nodes** (IF, Switch, Code, Merge, Set): adicionam controle de fluxo e lógica customizada.
5. **P3 Nodes** (OpenAI): recurso avançado para casos de uso com IA.

## Critérios de Pronto Geral por Item
- **Funcionalidade**: Nó implementado conforme especificação do n8n (ou subconjunto acordado).
- **Testes**: Testes unitários cobrindo casos de uso típicos e cenários de erro.
- **Integração**: Nó pode ser adicionado ao workflow editor (se existir) e executado sem erros no engine.
- **Documentação**: README curto no pacote de nós descrevendo parâmetros e exemplos de uso.

## Notas
- Esforço estimado: S (Small) = < 8h, M (Medium) = 8-16h, L (Large) > 16h (considerando desenvolvimento, testes básicos e documentação).
- As dependências assumem que o core engine (workflow definition, fila, worker) já está em progresso ou será desenvolvido paralelamente.
- Prioridades podem ser ajustadas conforme feedback do time e descoberta de requisitos específicos durante a migração.