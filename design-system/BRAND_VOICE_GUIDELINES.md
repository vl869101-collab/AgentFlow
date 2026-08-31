# AgentFlow — Brand Voice & Microcopy Guidelines

> **Versão:** 2.0.0 (Gate H1)  
> **Estética Visual:** Linear / Raycast Dark Zinc & Violet (`#7C3AED` / `#8B5CF6`)  
> **Público-alvo:** Desenvolvedores, Engenheiros de IA, Arquitetos de Software, Construtores de Automação (Builders)

---

## 1. Posicionamento, Tom de Voz & Personalidade

O **AgentFlow** é a infraestrutura de missão crítica para orquestração de fluxos autônomos, grafos de execução com agentes de IA, nós de integração e automação distribuída. A linguagem da interface deve refletir **precisão de engenharia, velocidade, previsibilidade técnica e respeito ao tempo do desenvolvedor**.

### 1.1 Pilares do Tom de Voz

| Pilar | Como se manifesta na interface | O que NUNCA fazer |
| :--- | :--- | :--- |
| **Técnico & Preciso** | Usar terminologia padrão da indústria de software e sistemas distribuídos (`payload`, `endpoint`, `runtime`, `TTL`, `backoff exponencial`, `idempotência`, `latência`). | Simplificar com metáforas infantis ou termos mágicos ("mágica da IA", "robô inteligente trabalhando"). |
| **Conciso & Cirúrgico** | Textos objetivos, sintaxe enxuta, alta densidade de informação por caractere. Foco imediato na consequência computacional. | Frases prolixas, rodeios explicativos ou parágrafos corporativos vazios ("potencialize sua sinergia"). |
| **Orientado à Ação (Builder-First)** | Verbos claros no infinitivo especificando o objeto e a ação (`Publicar Workflow`, `Testar Conexão`, `Executar Nó`). | Rótulos genéricos e vagos como `Clique aqui`, `Mais informações`, `Ok`, `Continuar`. |
| **Resiliente & Construtivo** | Em falhas: informar o estado real do sistema, a causa técnica raiz e o caminho acionável de correção imediata. | Culpar o usuário ("Você digitou errado"), mensagens genéricas ("Ocorreu um erro") ou humor fora de hora ("Ops! Deu ruim 😢"). |
| **Zero Hype / Factual** | Prometer apenas o que o código, a API e os modelos de IA entregam com base em dados observáveis. | Adjetivos exagerados ("a ferramenta mais revolucionária do mundo", "infalível", "ultrarrápido"). |

### 1.2 Matriz de Exemplos (Do's and Don'ts)

```markdown
[EVITAR]                                 [USAR NO AGENTFLOW]
"Ops! Algo deu errado ao rodar o nó."    "Falha na execução do nó: Timeout HTTP 504 após 30000ms."
"Salvar"                                 "Salvar Alterações" ou "Salvar Credencial"
"Conecte suas coisas com IA"             "Integre LLMs, ferramentas MCP e APIs REST em um grafo de execução"
"Seu robô está pensando..."              "Agente autônomo executando raciocínio multi-passo (Turno 2/5)..."
"Chave inválida!"                        "Chave de API rejeitada pelo provedor OpenAI (HTTP 401 Unauthorized)."
"Novo"                                   "Criar Workflow" ou "Adicionar Nó"
```

---

## 2. Nomenclatura Oficial do Workflow Canvas & Grafo

A consistência conceitual em toda a interface do editor visual, na telemetria e na documentação é fundamental para evitar sobrecarga cognitiva.

### 2.1 Tipologia Oficial de Nós (Nodes)

| Tipo de Nó (EN) | Nome da Interface (PT-BR) | Categoria | Descrição Técnica & Escopo |
| :--- | :--- | :--- | :--- |
| **Trigger Node** | **Gatilho** | `trigger` | Ponto de entrada do grafo. Disparado por Webhook (HTTP POST), Agendamento Cron, Evento Externo (App Trigger) ou Invocação Manual. |
| **Action Node** | **Ação** | `action` | Execução atômica e determinística em serviço externo ou interno (ex: Enviar E-mail, Inserir Registro no Postgres, Requisição HTTP REST). |
| **Logic Node** | **Lógica Condicional** | `logic` | Roteamento condicional (If/Else, Switch), filtros de dados, transformações (Code/JavaScript) e loops iterativos (For-Each/Split in Batches). |
| **AI Agent Node** | **Agente Autônomo** | `ai_agent` | Nó cognitivo com LLM, orquestração de ferramentas via MCP (Model Context Protocol), memória vetorial/conversacional e raciocínio multi-passo. |
| **Sub-Workflow Node**| **Sub-Fluxo** | `subworkflow`| Execução aninhada de outro workflow com isolamento de contexto e passagem de parâmetros estruturados. |

### 2.2 Estrutura & Componentes do Canvas

- **Workflow Canvas (`Canvas de Edição`):** A área de montagem visual baseada em grafo direcionado acíclico (DAG).
- **Node (`Nó`):** Cada bloco funcional individual inserido no fluxo.
- **Port / Handle (`Porta de Conexão`):** Ponto de entrada (`Input Handle`) ou saída (`Output Handle`) de dados no nó.
- **Edge (`Conexão de Fluxo`):** Linha conectora vetorial animada que transporta o payload entre portas compatíveis.
- **Node Palette (`Paleta de Nós`):** Barra lateral esquerda ou menu rápido (tecla `Espaço`) para adicionar novos nós categorizados.
- **Configuration Drawer (`Painel de Configurações`):** Gaveta lateral direita aberta ao selecionar um nó para ajustar parâmetros, variáveis e credenciais.
- **Runs Inspector (`Histórico & Telemetria`):** Painel inferior para depuração step-by-step de execuções com timeline de latência e payloads JSON.
- **Version History (`Histórico de Versões`):** Painel de controle de versão (commits e releases) do workflow com tags semânticas.
- **Diff Inspector (`Comparador de Versões`):** Modal de comparação visual e estrutural entre duas versões de um workflow.

### 2.3 Estados de Execução (Node & Run Lifecycle)

| Estado | Rótulo da UI (PT-BR) | Indicador Visual | Definição Operacional |
| :--- | :--- | :--- | :--- |
| **Idle** | `Inativo` / `Pronto` | Ponto cinza (`zinc-500`) | Nó posicionado no canvas aguardando disparo ou sem execução associada. |
| **Queued** | `Na Fila` | Ponto azul (`sky-400`) | Tarefa enfileirada no worker Redis BullMQ aguardando capacidade de processamento. |
| **Running** | `Executando` | Spinner pulsante violeta (`violet-500`) | Processamento computacional ou chamada de rede em andamento no runtime. |
| **Succeeded** | `Sucesso` | Ícone check verde (`emerald-400`) | Execução concluída sem exceções (código de saída 0 ou HTTP 2xx). |
| **Failed** | `Falhou` | Ícone alerta vermelho (`rose-500`) | Interrupção por erro de validação, falha de runtime, exceção não tratada ou timeout. |
| **Paused** | `Pausado (Aguardando)` | Ícone pause âmbar (`amber-400`) | Fluxo suspenso aguardando aprovação humana (Human-in-the-Loop) ou retentativa agendada. |
| **Timed Out** | `Tempo Excedido` | Ícone relógio laranja (`orange-400`) | Interrompido por atingir o limite máximo de tempo de execução configurado. |

---

## 3. Padrões de Microcopy para Componentes UI & Ações

### 3.1 Botões e Ações Principais (CTAs)

Fórmula mandatória: **[Verbo no Infinitivo] + [Substantivo Específico]** (máximo 2 a 3 palavras).

```
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
Revogar Chave                          Excluir
```

#### Hierarquia & Variantes de Botões:
- **Primário (`variant="primary"`):** Ação principal da tela (`Criar Workflow`, `Publicar Versão`, `Salvar Credencial`).
- **Secundário (`variant="secondary"` / `outline`):** Ações de apoio (`Exportar JSON`, `Visualizar Grafo`, `Descartar`).
- **Destrutivo (`variant="danger"`):** Ações irreversíveis (`Excluir Workflow`, `Deletar Nó`, `Revogar Conexão`).
- **Em Processamento (Loading State):** Verbo no gerúndio + reticências (`Salvando...`, `Executando...`, `Validando conexão...`, `Clonando template...`).

---

## 4. Matriz de Estados de Interface

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
- **Título:** Nenhum template ou conector encontrado
- **Descrição:** Não encontramos resultados para os filtros selecionados. Tente buscar por termos como "Webhook", "PostgreSQL" ou "Slack".
- **CTA:** Limpar Filtros de Busca
```

### 4.2 Estados de Carregamento (Loading & Skeletons)

- **Carregamento Inicial de Tela:** `Carregando configurações do workspace...`
- **Sincronização de nós MCP:** `Sincronizando ferramentas do servidor MCP (3/8 concluídos)...`
- **Execução em Streaming de IA:** `Agente de IA gerando resposta via Claude 3.5 Sonnet...`
- **Exportação de Artefato:** `Gerando pacote de exportação JSON...`

### 4.3 Notificações de Sucesso (Toasts & Feedback Afirmativo)

Mensagens de sucesso devem ser curtas, afirmativas e carregar dados contextuais quando aplicável:
- `Workflow salvo com sucesso.`
- `Versão v1.4.0 publicada e ativa no runtime.`
- `Credencial "Stripe Production" validada com sucesso.`
- `Template clonado para seu workspace com 6 nós e 5 conexões.`
- `Payload JSON copiado para a área de transferência.`

### 4.4 Mensagens de Erro Acionáveis

Toda mensagem de erro DEVE fornecer a causa técnica e o próximo passo recomendado:

| Código / Cenário | Microcopy Recomendada |
| :--- | :--- |
| **Token OAuth Expirado** | `Token OAuth2 expirado para a conexão Google Workspace. Reautentique a credencial no Cofre para restabelecer o acesso.` |
| **Timeout de Requisição HTTP** | `Tempo limite excedido (30000ms) ao comunicar com a API de destino. Verifique a disponibilidade do endpoint ou aumente o timeout nas propriedades do nó.` |
| **Sintaxe JSON Inválida** | `Sintaxe JSON malformada na linha 12, coluna 4. Corrija o fechamento de aspas ou chaves antes de continuar.` |
| **Incompatibilidade de Portas** | `Não foi possível conectar: a porta de saída entrega o tipo "Object", mas a porta de entrada requer "Array". Utilize um nó de Lógica para transformar o dado.` |
| **Rate Limit Excedido** | `Limite de requisições excedido junto ao provedor Anthropic (HTTP 429). Ative a política de Retry com Backoff no nó para retentar automaticamente.` |
| **Variável Não Resolvida** | `A variável {{trigger.payload.userId}} não foi encontrada no contexto de entrada desta execução.` |

---

## 5. Modal de Credenciais & Segurança (Vault UI Microcopy)

O cofre de credenciais lida com dados sensíveis e requer comunicação que transmita **segurança de nível bancário e clareza operacional**.

### 5.1 Anatomia e Textos do Modal de Credenciais

```markdown
### Cabeçalho do Modal
- **Título:** Adicionar Credencial
- **Subtítulo / Selo de Segurança:** "Armazenamento protegido com criptografia AES-256-GCM no Vault isolado."

### Seleção de Provedor
- **Label:** Provedor ou Serviço
- **Placeholder:** "Selecione ou busque um conector (ex: OpenAI, Stripe, PostgreSQL)..."
- **Dica de Ajuda:** "Suporte a mais de 120 integrações nativas e conexões customizadas via REST e MCP."

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
- **Excluir / Revogar:** `Revogar Credencial`

### Feedback do Teste de Conexão
- **Em Execução:** "Validando autenticação junto ao endpoint do provedor..."
- **Sucesso (200 OK):** "Conexão estabelecida com sucesso. Latência: 142ms."
- **Falha de Autenticação:** "Falha na validação: Chave inválida ou permissões insuficientes para a organização."
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

## 7. Tooltips, Help Text & Dicas Contextuais

### 7.1 Diretrizes de Redação para Tooltips
- **Extensão:** Máximo de 120 caracteres por tooltip.
- **Propósito:** Esclarecer parâmetros técnicos, valores padrão, unidades de medida e impactos no runtime.

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

## 8. Acessibilidade Textual (A11y, ARIA & Validação de Formulários)

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

Erros de validação e textos de apoio devem estar programaticamente conectados ao campo de formulário:

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
| `Shift + 1` | Enquadra todo o fluxo no canvas (Fit View) | `Enquadrar grafo (Shift+1)` |

---

## 9. Glossário Bilíngue Padronizado

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

---

## 10. Checklist de Consistência e Homologação (Quality Gate H1)

Antes de aprovar novos componentes, telas ou mensagens no AgentFlow, execute esta validação:

- [ ] **Tom Técnico e Respeitoso:** O texto evita metáforas infantis, gírias e falsas promessas de marketing?
- [ ] **Verbos no Infinitivo em Ações:** Todos os botões e CTAs seguem o formato [Verbo no Infinitivo] + [Substantivo]?
- [ ] **Nomenclatura do Canvas Uniforme:** Nós, portas, estados (`Inativo`, `Executando`, `Sucesso`, `Falhou`) e painéis usam a nomenclatura oficial?
- [ ] **Erros Acionáveis:** As mensagens de erro expõem a causa técnica e o próximo passo de resolução sem culpar o usuário?
- [ ] **Empty States Estruturados:** Os estados vazios possuem título claro, explicação concisa e CTA de desbloqueio?
- [ ] **Acessibilidade Completa:**
  - Todos os botões de ícone possuem `aria-label`?
  - Todos os inputs com erro ou dica estão ligados via `aria-describedby` e `aria-invalid`?
  - Atualizações dinâmicas e logs utilizam `aria-live`?
- [ ] **Tooltips Concisas:** Todas as tooltips possuem menos de 120 caracteres e foco no impacto operacional?
- [ ] **Glossário Respeitado:** Os termos em inglês e português estão alinhados rigorosamente à tabela da seção 9?

---

*Documento mantido e auditado pelo Squad de Design System & Engenharia de Produto do AgentFlow.*
