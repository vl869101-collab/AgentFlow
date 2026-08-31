# AgentFlow — Brand Voice, Microcopy & Content Style Guidelines

> **Documento:** `BRAND_VOICE_GUIDELINES.md`  
> **Versão:** 2.1.0 (Production Release / Gate H1)  
> **Classificação:** Diretriz Oficial de Design System & Engenharia de Produto  
> **Estética Visual:** Linear / Raycast Dark Zinc (`#09090b` / `#18181b`) + Violet (`#8b5cf6` / `#7c3aed`)  
> **Público-alvo:** Engenheiros de Software, Construtores de Automação (Builders), Engenheiros de IA, Arquitetos de Soluções e Especialistas DevOps.

---

## 1. Posicionamento, Tom de Voz & Personalidade (Developer-First)

O **AgentFlow** é a plataforma de missão crítica para orquestração de fluxos autônomos, grafos de execução com agentes de IA, nós de integração e automação distribuída. A linguagem de todo o produto, telemetria, documentação e microcopy reflete **precisão de engenharia, concisão, previsibilidade técnica, transparência operacional e profundo respeito à atenção do desenvolvedor**.

### 1.1 Pilares Fundamentais do Tom de Voz

| Pilar | Como se manifesta na interface | O que NUNCA fazer (Banned Patterns) |
| :--- | :--- | :--- |
| **Técnico & Preciso** | Uso rigoroso da terminologia de computação, protocolos e sistemas distribuídos (`payload`, `endpoint`, `runtime`, `TTL`, `backoff exponencial`, `idempotência`, `latência`, `DAG`, `MCP`). | Metáforas infantis, jargões vagos ou termos mágicos ("mágica da IA", "robô inteligente trabalhando", "automatize tudo num clique"). |
| **Conciso & Cirúrgico** | Frases diretas, sintaxe enxuta, alta densidade de sinal por caractere. Foco imediato na consequência computacional da ação. | Textos prolixos, enrolação corporativa ou parágrafos de marketing vazios ("potencialize sua sinergia", "otimize seus resultados"). |
| **Orientado à Ação (Builder-First)** | Verbos claros no infinitivo especificando o objeto e a ação (`Publicar Workflow`, `Testar Conexão`, `Executar Nó`). | Rótulos genéricos, indecisos ou passivos como `Clique aqui`, `Mais informações`, `Ok`, `Continuar`, `Enviar`. |
| **Resiliente & Construtivo** | Em falhas: informar o estado real do sistema, o código/causa técnica raiz e o caminho acionável de correção imediata. | Culpar o usuário ("Você digitou errado"), mensagens opacas ("Ocorreu um erro") ou humor inadequado ("Ops! Deu ruim 😢"). |
| **Factual & Zero Hype** | Comunicação estritamente baseada em métricas observáveis, status de execução e comportamento real de APIs e modelos. | Adjetivos superlativos ou promessas irreais ("a ferramenta mais revolucionária do mundo", "infalível", "100% automático"). |

### 1.2 Matriz de Exemplos (Do's and Don'ts)

```markdown
[PROIBIDO / EVITAR]                           [PADRÃO OFICIAL AGENTFLOW]
"Ops! Algo deu errado ao rodar o nó."         "Falha na execução do nó: Timeout HTTP 504 após 30000ms."
"Salvar"                                      "Salvar Alterações" ou "Salvar Credencial"
"Conecte suas coisas com IA"                  "Integre LLMs, ferramentas MCP e APIs REST em um grafo de execução"
"Seu robô está pensando..."                   "Agente autônomo executando raciocínio multi-passo (Turno 2/5)..."
"Chave inválida!"                             "Chave de API rejeitada pelo provedor OpenAI (HTTP 401 Unauthorized)."
"Novo"                                        "Criar Workflow" ou "Adicionar Nó"
"Excluir"                                     "Excluir Workflow" ou "Revogar Credencial"
"Tudo pronto!"                                "Versão v1.4.0 publicada e ativa no runtime."
```

---

## 2. Nomenclatura Oficial do Workflow Canvas & Grafo

A uniformidade taxonômica entre o editor visual (`Workflow Canvas`), a telemetria em tempo real, os logs de execução e os modelos de dados é obrigatória.

```
+----------------------------------------------------------------------------------------------------+
|                                    WORKFLOW CANVAS (Grafo DAG)                                     |
|                                                                                                    |
|  [TRIGGER NODE] --------------> [LOGIC NODE] ---------------------> [AI AGENT NODE]                |
|  (Gatilho Webhook)  Edge/Conexão (Filtro Condicional)  Edge/Conexão  (Agente com Tools MCP)        |
|                                        |                                  |                        |
|                                        v                                  v                        |
|                                  [ACTION NODE]                     [ACTION NODE]                   |
|                                  (Insert Postgres)                 (Post Slack Notification)       |
+----------------------------------------------------------------------------------------------------+
```

### 2.1 Tipologia Oficial de Nós (Node Kinds)

| Tipo de Nó (ID / EN) | Nome Oficial (PT-BR) | Categoria | Escopo & Descrição Técnica |
| :--- | :--- | :--- | :--- |
| **Trigger Node** (`trigger`) | **Gatilho** | `Triggers` | Ponto de entrada do grafo. Disparado por Webhook (HTTP POST/GET), Agendamento Cron, Invocação Manual ou Evento de App. |
| **Action Node** (`action`) | **Ação** | `Actions` / `Integrations` | Execução atômica e determinística em serviço externo ou interno (ex: Requisição HTTP REST, Envio de E-mail, Inserção SQL, Google Drive). |
| **Logic Node** (`logic`) | **Lógica Condicional** | `Logic` | Roteamento condicional (`If/Else`, `Switch`), filtros de dados (`Filter`), mescla de branches (`Merge`), transformações (`Transform`/JS Code) e delays (`Delay`). |
| **AI Agent Node** (`ai_agent`) | **Agente de IA** | `Advanced` / `AI` | Nó cognitivo baseado em LLMs com orquestração de ferramentas via MCP (*Model Context Protocol*), raciocínio multi-passo e memória vetorial. |
| **Sub-Workflow Node** (`subworkflow`) | **Sub-Fluxo** | `Advanced` | Execução aninhada de outro workflow com isolamento de contexto e passagem de parâmetros estruturados. |

### 2.2 Estrutura & Componentes do Canvas

- **Workflow Canvas (`Canvas de Edição`):** A superfície interativa baseada em grafo direcionado acíclico (DAG) para montagem e inspeção visual.
- **Node (`Nó`):** Cada bloco computacional atômico posicionado no grafo.
- **Port / Handle (`Porta de Conexão`):** Ponto de entrada (`Porta de Entrada` / `Input Handle`) ou saída (`Porta de Saída` / `Output Handle`) de dados no nó.
- **Edge (`Conexão de Fluxo`):** Conector vetorial animado que transporta payloads JSON entre nós compatíveis.
- **Node Palette (`Paleta de Nós`):** Painel lateral esquerdo com catálogo categorizado de nós disponíveis para arrastar ou inserir via tecla `Espaço`.
- **Configuration Drawer (`Painel de Configurações do Nó`):** Gaveta lateral direita para parametrização de nós, mapeamento de variáveis (`{{trigger.payload}}`) e vinculação de credenciais.
- **Runs Inspector (`Histórico & Telemetria`):** Painel inferior para depuração passo a passo de execuções com timeline de latência, status de rede e payloads JSON.
- **Workflow Version Panel (`Histórico de Versões`):** Painel de controle de versão (commits, tags semânticas e rollbacks) do workflow.
- **Diff Inspector (`Comparador de Versões`):** Modal de comparação visual e estrutural entre duas versões de um mesmo workflow.

### 2.3 Ciclo de Vida & Estados de Execução (Run & Node Lifecycle)

| Estado (EN) | Rótulo da UI (PT-BR) | Indicador Visual | Definição Operacional |
| :--- | :--- | :--- | :--- |
| **Idle** | `Inativo` / `Pronto` | Ponto cinza (`zinc-500`) | Nó posicionado no canvas aguardando disparo inicial. |
| **Queued** | `Na Fila` | Ponto azul (`sky-400`) | Tarefa enfileirada no worker Redis BullMQ aguardando capacidade computacional. |
| **Running** | `Executando` | Spinner pulsante violeta (`violet-500`) | Processamento computacional ou chamada de rede em andamento no runtime. |
| **Succeeded** | `Sucesso` | Ícone check verde (`emerald-400`) | Execução concluída sem exceções (código de saída 0 ou HTTP 2xx). |
| **Failed** | `Falhou` | Ícone alerta vermelho (`rose-500`) | Interrupção por erro de validação, falha de runtime, exceção não tratada ou timeout. |
| **Paused** | `Pausado (Aguardando)` | Ícone pause âmbar (`amber-400`) | Fluxo suspenso aguardando aprovação humana (*Human-in-the-Loop*) ou retentativa agendada. |
| **Timed Out** | `Tempo Excedido` | Ícone relógio laranja (`orange-400`) | Interrompido por atingir o limite máximo de tempo de execução configurado. |

---

## 3. Padrões de Microcopy para Componentes UI & Rótulos de Ação

### 3.1 Botões e Ações Principais (CTAs)

Fórmula mandatória: **[Verbo no Infinitivo] + [Substantivo Específico]** (máximo 2 a 3 palavras).

```markdown
[PADRÃO CORRETO]                      [EVITAR]
Criar Workflow                         Novo Workflow
Salvar Alterações                      Salvar
Publicar Versão                        Publicar
Executar Teste                         Testar
Adicionar Credencial                   Nova Credencial
Conectar Nós                           Ligar
Exportar JSON                          Download
Importar de n8n                        Importar
Duplicar Nó                            Copiar
Revogar Credencial                     Excluir
Testar Conexão                         Testar
Limpar Filtros                         Limpar
```

### 3.2 Hierarquia & Variantes de Botões

- **Primário (`variant="primary"`):** Ação principal de conversão ou avanço da tela (`Criar Workflow`, `Publicar Versão`, `Salvar Credencial`).
- **Secundário (`variant="secondary"` / `outline`):** Ações de apoio ou rotas alternativas (`Exportar JSON`, `Visualizar Grafo`, `Descartar`, `Cancelar`).
- **Destrutivo (`variant="danger"`):** Ações irreversíveis que eliminam dados ou conexões (`Excluir Workflow`, `Deletar Nó`, `Revogar Credencial`).
- **Estado de Carregamento (`isLoading`):** Verbo no gerúndio + reticências (`Salvando...`, `Executando...`, `Validando conexão...`, `Clonando template...`).

---

## 4. Matriz Completa de Estados de Interface

### 4.1 Estados Vazios (Empty States)

Todo estado vazio deve implementar a **Tríade Estruturada**:
1. **Título:** Diagnóstico direto do que não está presente.
2. **Descrição:** Explicação de 1 a 2 linhas sobre a utilidade daquela seção ou motivo de estar vazia.
3. **Ação Desbloqueadora:** Botão primário para criar ou resolver o estado.

#### Exemplos Padronizados:

```markdown
### A. Canvas Vazio (Sem Nós)
- **Título:** Comece com um Gatilho
- **Descrição:** Adicione um nó de Webhook, Cron ou evento de aplicação para iniciar seu fluxo de automação.
- **CTA:** Abrir Paleta de Nós (Pressione Espaço)

### B. Histórico de Execuções Vazio
- **Título:** Nenhuma execução registrada
- **Descrição:** Dispare um teste manual ou publique o workflow para visualizar a telemetria, logs e latência em tempo real.
- **CTA:** Executar Teste Manual

### C. Cofre de Credenciais Vazio
- **Título:** Nenhuma credencial configurada
- **Descrição:** Armazene chaves de API e tokens OAuth com segurança criptografada no Vault para autenticar suas integrações.
- **CTA:** Adicionar Credencial

### D. Busca no Marketplace Sem Resultados
- **Título:** Nenhum template encontrado
- **Descrição:** Não encontramos templates para os filtros selecionados. Tente termos como "Webhook", "PostgreSQL", "Slack" ou limpe a busca.
- **CTA:** Limpar Filtros de Busca
```

### 4.2 Estados de Carregamento (Loading & Skeletons)

Sempre indicar o processo exato que está ocorrendo em segundo plano:
- **Carregamento de Tela:** `Carregando configurações do workspace...`
- **Sincronização MCP:** `Sincronizando ferramentas do servidor MCP (3/8 concluídos)...`
- **Execução em Streaming de IA:** `Agente de IA gerando resposta via Claude 3.5 Sonnet...`
- **Exportação de Artefato:** `Gerando pacote de exportação JSON...`
- **Validação de Credencial:** `Validando autenticação junto ao endpoint do provedor...`

### 4.3 Notificações de Sucesso (Toasts & Feedback Afirmativo)

Mensagens de sucesso devem ser curtas, afirmativas e carregar dados contextuais:
- `Workflow salvo com sucesso.`
- `Versão v1.4.0 publicada e ativa no runtime.`
- `Credencial "Stripe Production" validada com sucesso.`
- `Template clonado para seu workspace com 6 nós e 5 conexões.`
- `Payload JSON copiado para a área de transferência.`

### 4.4 Alertas Preventivos e Avisos (Warning States)

Avisos devem antecipar impactos operacionais ou custos antes da execução:
- `Atenção: Este nó processará 1.500 registros em lote. O tempo estimado de execução é de ~45 segundos.`
- `Aviso de Custo: O modelo selecionado (Claude 3 Opus) possui tarifação superior. Deseja manter para este nó?`
- `Credencial Próxima da Expiração: O token OAuth do Google Workspace expira em 48 horas. Renove para evitar interrupções.`

### 4.5 Mensagens de Erro Acionáveis (Error States)

Toda mensagem de erro DEVE fornecer a causa técnica clara e o próximo passo recomendado de resolução:

| Código / Cenário | Microcopy Recomendada |
| :--- | :--- |
| **Token OAuth Expirado** | `Token OAuth2 expirado para a conexão Google Workspace. Reautentique a credencial no Cofre para restabelecer o acesso.` |
| **Timeout de Requisição HTTP** | `Tempo limite excedido (30000ms) ao comunicar com a API de destino. Verifique a disponibilidade do endpoint ou aumente o timeout nas propriedades do nó.` |
| **Sintaxe JSON Inválida** | `Sintaxe JSON malformada na linha 12, coluna 4. Corrija o fechamento de aspas ou chaves antes de continuar.` |
| **Incompatibilidade de Portas** | `Não foi possível conectar: a porta de saída entrega o tipo "Object", mas a porta de entrada requer "Array". Utilize um nó de Lógica para transformar o dado.` |
| **Rate Limit Excedido** | `Limite de requisições excedido junto ao provedor Anthropic (HTTP 429). Ative a política de Retry com Backoff no nó para retentar automaticamente.` |
| **Variável Não Resolvida** | `A variável {{trigger.payload.userId}} não foi encontrada no contexto de entrada desta execução.` |

### 4.6 Ações Destrutivas & Modais de Confirmação (Destructive States)

Ações irreversíveis exigem confirmação explícita indicando o impacto exato:
- **Título do Modal:** `Excluir Workflow "[Nome do Workflow]"`
- **Corpo:** `Esta ação removerá permanentemente o grafo, o histórico de execuções associado e revogará os webhooks ativos. Esta operação não pode ser desfeita.`
- **Botão de Confirmação:** `Excluir Permanentemente` (variante `danger`)
- **Botão de Cancelamento:** `Cancelar`

---

## 5. Modal de Credenciais & Segurança (Vault UI Microcopy)

O cofre de credenciais (*Vault*) manipula chaves de API, tokens OAuth2 e certificados de integração, exigindo comunicação que transmita **segurança de nível bancário e clareza operacional**.

### 5.1 Anatomia e Microcopy do Modal de Credenciais

```markdown
### Cabeçalho do Modal
- **Título:** Adicionar Credencial
- **Subtítulo / Selo de Segurança:** "Armazenamento protegido com criptografia AES-256-GCM no Vault isolado."

### Seleção de Provedor
- **Label:** Provedor ou Serviço
- **Placeholder:** "Selecione ou busque um conector (ex: OpenAI, Stripe, PostgreSQL, Anthropic)..."
- **Dica de Ajuda (Hint):** "Suporte a mais de 120 integrações nativas e conexões customizadas via REST e MCP."

### Campos de Autenticação
- **Chave de API (API Key):**
  * Label: "Chave de API (API Key)"
  * Placeholder: "sk-proj-..."
  * Hint: "Sua chave nunca é exibida em texto plano após o salvamento."
- **Autenticação OAuth2:**
  * Botão de Conexão: "Conectar via OAuth2 com [Provedor]"
  * Status da Sessão: "Redirecionando para o servidor seguro de autorização..."

### Ações do Rodapé
- **Testar Conexão:** `Testar Conexão`
- **Salvar Credencial:** `Salvar Credencial`
- **Cancelar:** `Cancelar`
- **Revogar / Excluir:** `Revogar Credencial`

### Feedback do Teste de Conexão
- **Em Execução:** "Validando autenticação junto ao endpoint do provedor..."
- **Sucesso (200 OK):** "Conexão estabelecida com sucesso. Latência: 142ms."
- **Falha de Autenticação:** "Falha na validação: Chave de API inválida ou permissões insuficientes para a organização."
```

---

## 6. Marketplace de Templates & Conectores Comunitários

Os templates reduzem a barreira de entrada para builders. O texto deve enfatizar o **resultado computacional e a economia de tempo**.

### 6.1 Estrutura do Card de Template

- **Título do Template:** Direto, orientado à solução (máximo 35 caracteres).
- **Descrição de Benefício:** 1 frase concisa com verbos de ação e tecnologias (máximo 90 caracteres).
- **Tags de Categoria:** Em caixa alta sutil (`AI AGENTS`, `DEVOPS`, `FINTECH`, `ETL`, `MCP`).
- **Métricas Visíveis:** Número de nós, integrações envolvidas e tempo médio de execução.
- **Botão de Ação Primária:** `Usar Template` ou `Ver Detalhes`.

### 6.2 Exemplos Práticos de Cards de Template

```markdown
### Template 1: Triagem de Incidentes
- **Título:** Triagem Automática de Issues no GitHub
- **Descrição:** Classifica severidade de bugs via Claude 3.5 Sonnet, aplica labels e notifica canal no Slack.
- **Tags:** [AI AGENTS] [GITHUB] [SLACK]
- **Métricas:** 5 nós · Latência ~1.8s
- **CTA:** Usar Template

### Template 2: Sync de Pagamentos
- **Título:** Sincronização Stripe → HubSpot CRM
- **Descrição:** Captura eventos de checkout concluído e atualiza o estágio do negócio em tempo real.
- **Tags:** [FINTECH] [CRM] [WEBHOOK]
- **Métricas:** 4 nós · Execução determinística
- **CTA:** Usar Template

### Template 3: Pipeline de RAG
- **Título:** Ingestão de Documentos no Pinecone
- **Descrição:** Extrai texto de PDFs enviados ao S3, calcula embeddings e indexa no banco vetorial.
- **Tags:** [ETL] [EMBEDDINGS] [AWS S3]
- **Métricas:** 6 nós · Processamento em lote
- **CTA:** Usar Template
```

---

## 7. Tooltips, Dicas de Ajuda & Textos Contextuais

### 7.1 Diretrizes de Redação para Tooltips
- **Extensão:** Máximo de 120 caracteres por tooltip.
- **Propósito:** Esclarecer parâmetros técnicos, valores padrão, unidades de medida e impactos no runtime.
- **Pontuação:** Frases completas com ponto final quando houver mais de uma oração; sem ponto em termos nominais simples.

### 7.2 Biblioteca de Tooltips Padrão

```markdown
- Gatilho Webhook: "Gera uma URL HTTPS pública para receber payloads via POST com validação de assinatura HMAC opcional."
- Timeout de Execução: "Tempo máximo em milissegundos antes do nó ser interrompido com erro de timeout (Padrão: 30000ms)."
- Backoff Exponencial: "Multiplica o intervalo de espera entre retentativas consecutivas após falhas 5xx de rede."
- Temperatura do Modelo: "Valores mais baixos (0.0 - 0.2) produzem respostas determinísticas; valores altos aumentam a variabilidade."
- Taxa de Limite (Rate Limit): "Número máximo de requisições permitidas por minuto para evitar bloqueios na API de destino."
- Modo de Isolamento Sandbox: "Executa scripts de código customizado em VM isolada com restrição total de I/O de rede e disco."
- Concorrência de Nós: "Define quantas instâncias deste nó podem ser executadas em paralelo pelo cluster de workers."
```

---

## 8. Acessibilidade Textual (A11y, ARIA & Associação de Erros a Inputs)

Garantir que a experiência de navegação por teclado e leitores de tela seja idêntica em clareza à interface visual.

### 8.1 Botões de Ícone (Icon-Only Buttons)

Todo botão que renderiza apenas um ícone DEVE conter `aria-label` descritivo e atributo `title` indicando o atalho de teclado quando existente:

```html
<!-- PADRÃO OBRIGATÓRIO -->
<button aria-label="Executar fluxo de teste" title="Executar teste (Ctrl+Enter)">
  <PlayIcon aria-hidden="true" />
</button>

<button aria-label="Duplicar nó selecionado" title="Duplicar nó (Ctrl+D)">
  <CopyIcon aria-hidden="true" />
</button>

<button aria-label="Ajustar visualização do canvas" title="Enquadrar fluxo (Shift+1)">
  <FitViewIcon aria-hidden="true" />
</button>

<button aria-label="Fechar painel de configurações" title="Fechar (Esc)">
  <CloseIcon aria-hidden="true" />
</button>
```

### 8.2 Associação Obrigatória de Erros a Inputs (`aria-describedby` & `aria-invalid`)

Erros de validação e textos de apoio devem estar programaticamente conectados ao campo de formulário através do id único de auxílio:

```html
<!-- PADRÃO DE IMPLEMENTAÇÃO NO AGENTFLOW -->
<div class="space-y-2">
  <label for="endpoint-url-input" class="text-xs font-medium uppercase tracking-wider text-zinc-500">
    URL do Endpoint de Destino
  </label>
  <input
    id="endpoint-url-input"
    type="url"
    name="endpointUrl"
    aria-invalid="true"
    aria-describedby="endpoint-url-input-hint endpoint-url-input-error"
    class="w-full rounded-lg border border-red-500/50 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:ring-2 focus:ring-red-500"
    placeholder="https://api.empresa.com/v1/eventos"
  />
  <p id="endpoint-url-input-hint" class="text-xs text-zinc-500">
    Deve ser uma URL pública com protocolo HTTPS ativo.
  </p>
  <p id="endpoint-url-input-error" role="alert" class="text-xs text-red-400">
    Insira uma URL HTTPS válida e acessível.
  </p>
</div>
```

### 8.3 Live Regions para Telemetria em Tempo Real (`aria-live`)

Para streaming de logs, alterações de estado no canvas e conclusões assíncronas:

```html
<!-- Notificação de status de execução (não intrusiva) -->
<div aria-live="polite" aria-atomic="true" class="sr-only">
  Execução do nó Agente de IA concluída com sucesso em 1.2 segundos.
</div>

<!-- Alerta de falha crítica (imediato) -->
<div aria-live="assertive" role="alert" class="sr-only">
  Falha de execução no nó Webhook: Erro de autenticação 401.
</div>
```

### 8.4 Tabela de Atalhos de Teclado (Keyboard Shortcuts)

| Atalho | Ação Executada | Microcopy no Tooltip |
| :--- | :--- | :--- |
| `Espaço` | Abre a Paleta de Nós / Arrasta o canvas | `Adicionar nó (Espaço)` |
| `Ctrl + S` / `Cmd + S` | Salva o workflow atual | `Salvar alterações (Ctrl+S)` |
| `Ctrl + Enter` / `Cmd + Enter` | Dispara o teste manual do fluxo | `Executar teste (Ctrl+Enter)` |
| `Ctrl + D` / `Cmd + D` | Duplica o nó selecionado | `Duplicar nó (Ctrl+D)` |
| `Delete` / `Backspace` | Deleta o nó ou conexão selecionada | `Deletar seleção (Del)` |
| `Esc` | Fecha painéis laterais ou modais abertos | `Fechar painel (Esc)` |
| `Shift + 1` | Enquadra todo o fluxo no canvas (*Fit View*) | `Enquadrar grafo (Shift+1)` |

---

## 9. Glossário Bilíngue Padronizado (PT-BR & EN)

| Termo em Inglês (EN) | Tradução Oficial (PT-BR) | Regra de Aplicação na Interface |
| :--- | :--- | :--- |
| **Workflow** | **Workflow** | Manter `Workflow` em botões, rotas e cabeçalhos. |
| **Node** | **Nó** | Usar `Nó` em toda a interface visual e tooltips. |
| **Trigger** | **Gatilho** | Usar `Gatilho` na UI; manter `trigger` em referências JSON. |
| **Action** | **Ação** | Usar `Ação` na classificação de nós. |
| **Edge / Connection** | **Conexão** | Usar `Conexão` ou `Conectar nós`. |
| **Run / Execution** | **Execução** | Usar `Execução` na UI; manter `Run ID` para IDs técnicos. |
| **Payload** | **Payload** | Manter sem tradução (termo técnico universal). |
| **Webhook** | **Webhook** | Manter sem tradução (termo técnico universal). |
| **Vault** | **Cofre de Credenciais** | Usar `Cofre` ou `Credenciais`. |
| **Canvas** | **Canvas** | Usar `Canvas` para a área de edição gráfica. |
| **Branch / Fork** | **Ramificação** | Usar `Ramificação` em nós de controle de fluxo. |
| **Retry** | **Retentativa** | Usar `Retentativa` ou `Retentar execução`. |
| **Deployment / Release**| **Publicação** | Usar `Publicar Workflow` ou `Versão Publicada`. |
| **Template** | **Template** | Manter `Template` em menus e no Marketplace. |

---

## 10. Checklist de Consistência e Homologação (Quality Gate H1 Style-Lock)

Antes de aprovar novos componentes, telas ou mensagens no AgentFlow, execute esta validação de conformidade:

- [ ] **Tom Técnico e Respeitoso:** O texto evita metáforas infantis, gírias e falsas promessas de marketing?
- [ ] **Verbos no Infinitivo em Ações:** Todos os botões e CTAs seguem o formato `[Verbo no Infinitivo] + [Substantivo]`?
- [ ] **Nomenclatura do Canvas Uniforme:** Nós (`Gatilho`, `Ação`, `Lógica Condicional`, `Agente de IA`), conexões, portas e estados (`Inativo`, `Executando`, `Sucesso`, `Falhou`) usam a nomenclatura oficial?
- [ ] **Erros Acionáveis:** As mensagens de erro expõem a causa técnica clara e o próximo passo de resolução sem culpar o usuário?
- [ ] **Empty States Estruturados:** Os estados vazios possuem título claro, explicação concisa e CTA de desbloqueio?
- [ ] **Acessibilidade Completa:**
  - Todos os botões de ícone possuem `aria-label` descritivo e atalho de teclado em `title`?
  - Todos os inputs com erro ou dica estão ligados via `aria-describedby` e `aria-invalid`?
  - Atualizações dinâmicas, logs e telemetria utilizam `aria-live`?
- [ ] **Tooltips Concisas:** Todas as tooltips possuem menos de 120 caracteres e foco no impacto operacional?
- [ ] **Glossário Respeitado:** Os termos em inglês e português estão rigorosamente alinhados à tabela de taxonomia oficial?

---

*Documento mantido e auditado pelo Squad de Design System & Engenharia de Produto do AgentFlow.*
