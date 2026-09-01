# Copywriting & Arquitetura de Conversão — AgentFlow Autonomous Browser Bot

> **Documento:** Especificação e Matriz de Copy Completa (PT-BR)  
> **Destino:** `apps/web/src/app/bot/landing/copy.md`  
> **Framework:** `oc-copywriting` (Engenharia de Alta Conversão & Posicionamento Soberano)  
> **Status:** Pronto para Implementação no Frontend  

---

## 1. Calibração de Voz de Marca & Posicionamento

* **Tom de Voz:** Cirúrgico, técnico, autoritário, confiante e transparente quanto aos mecanismos de engenharia.
* **Personalidade:** O operador autônomo sênior de infraestrutura web que nunca dorme, opera em velocidade de máquina em displays virtuais isolados e devolve o controle humano em 1 clique.
* **O que Diz:** Foca em métricas reais, latência sub-segundo, isolamento Xvfb, protocolo MCP, pipelines de Playwright e orquestração de navegadores reais.
* **O que NÃO Diz:** Evita jargões vazios ("IA mágica", "revolucionário", "simples assim"), claims infundados, promessas irreais ou chamadas genéricas como "Saiba mais".

---

## 2. Estratégia de Oferta (Offer Strategy)

### Ângulos de Oferta (Angles)
1. **Ângulo da Soberania Operacional:** "Automatize qualquer fluxo web complexo sem depender de APIs públicas, com visibilidade visual total em tempo real."
2. **Ângulo da Resiliência Técnica:** "Navegação autônoma 24/7 com Playwright e Xvfb que não trava em SPAs dinâmicas e permite intervenção humana instantânea."
3. **Ângulo da Interoperabilidade (MCP-Native):** "Conecte seus LLMs diretamente ao navegador real via Model Context Protocol com sandbox isolado e zero vazamento de credenciais."

### Oferta Dominante (Dominant Offer)
> **"Orquestre agentes de IA com visão computacional para navegar, preencher, extrair e operar qualquer aplicação web 24/7 — com streaming de baixa latência via noVNC/WebRTC e controle humano instantâneo quando você precisar."**

### Por Que Agora? (Urgency & Tension)
> Fluxos de trabalho modernos dependem de centenas de plataformas web sem API. Scripts legados de Selenium quebram a cada mudança de DOM, enquanto humanos perdem horas em tarefas repetitivas de backoffice. O AgentFlow entrega autonomia de navegador com segurança corporativa e auditoria visual contínua.

---

## 3. Matriz de Copy Seção por Seção (Deliverable Copy)

---

### SEÇÃO 1: HERO (Acima da Dobra)

* **Badge Superior / Eyebrow:**  
  `🟢 v2.4 ENGINE ATIVA · AUTONOMIA 24/7 · PROTOCOLO MCP NATIVO`

* **Headline Principal (H1):**  
  **Automação Web Autônoma 24/7 com Visão em Tempo Real e Controle Humano Instantâneo.**

* **Subheadline / Linha de Apoio:**  
  Execute agentes de IA capazes de navegar, interagir e extrair dados de qualquer interface web complexa. Alimentado por clusters Playwright em displays virtuais Xvfb, streaming de ultra-baixa latência via noVNC/WebRTC e integração nativa com servidores MCP.

* **Chamadas para Ação (CTAs do Hero):**  
  * **CTA Primário (Botão Principal):** `Iniciar Console do Bot` *(Destino: `/bot`)*  
  * **CTA Secundário (Botão de Apoio):** `Criar Conta Gratuita` *(Destino: `/register`)*  
  * **Micro-copy de Confiança:** `Sem necessidade de cartão para teste · Deploy em menos de 60s · Código aberto & auditável`

* **Métricas / Proof Badges (Abaixo do Hero):**
  * `99.98%` **Uptime em Execuções Autônomas**
  * `<120ms` **Latência de Streaming noVNC/WebRTC**
  * `100%` **Isolamento de Sandbox Xvfb / Display Virtual**
  * `12+` **Ações Nativas de Navegação via MCP**

---

### SEÇÃO 2: RECURSOS TÉCNICOS FUNDAMENTAIS (Deep Mechanics)

* **Eyebrow:** `ENGENHARIA DE EXECUÇÃO ROBUSTA`
* **Título da Seção:** **Construído para rodar em produção, não em demonstrações frágeis.**
* **Subtítulo:** Conheça a pilha técnica real que sustenta a operação autônoma sem falhas de renderização ou bloqueios.

#### Cards de Recursos Técnicos:

1. **Orquestração Playwright Híbrida (Headless & Headed)**
   * *Headline:* Execução precisa no DOM com renderização completa de Chromium, Firefox e WebKit.
   * *Descrição:* Suporte total a SPAs modernas, Shadow DOM, Canvas e páginas com renderização dinâmica pesada em JavaScript. Alterne entre modo headless para alto throughput ou headed para inspeção detalhada.
   * *Tag Técnica:* `CDP (Chrome DevTools Protocol) + Playwright Cluster`

2. **Displays Virtuais Isolados com Xvfb**
   * *Headline:* Sandboxing gráfico independente para cada sessão de execução.
   * *Descrição:* Cada agente roda em seu próprio framebuffer virtual (`Xvfb`), garantindo isolamento total de processos, renderização 1080p determinística e eliminação de conflitos de sessão ou vazamento de cookies.
   * *Tag Técnica:* `Xvfb Virtual Display (1920x1080 @ 60fps)`

3. **Human Takeover Instantâneo (1-Click)**
   * *Headline:* Assuma o controle do mouse e teclado no meio da execução sem perder o estado.
   * *Descrição:* Se um desafio visual, CAPTCHA complexo ou 2FA corporativo surgir, o operador pode assumir o controle manual em tempo real via streaming e devolver o fluxo ao agente imediatamente com um único clique.
   * *Tag Técnica:* `Bi-directional Input Sync & State Preservation`

4. **Streaming de Ultra-Baixa Latência (noVNC & WebRTC)**
   * *Headline:* Monitore a tela do navegador remoto a 60 FPS com latência sub-segundo.
   * *Descrição:* Transmissão direta do framebuffer via WebSocket (noVNC) e pipeline otimizado WebRTC. Acompanhe cliques, preenchimentos de formulários e decisões visuais do bot em tempo real pelo navegador.
   * *Tag Técnica:* `WebSocket noVNC / WebRTC H.264 Video Bridge`

5. **Integração Nativa com Model Context Protocol (MCP)**
   * *Headline:* Ferramentas de navegação expostas de forma padronizada para qualquer LLM.
   * *Descrição:* Exporte o controle do navegador como ferramentas MCP nativas (`navigate`, `click`, `type`, `extract`, `evaluate`). Permita que agentes Claude, Grok ou GPT invoquem ações determinísticas com tipagem estrita via Zod.
   * *Tag Técnica:* `Model Context Protocol (MCP) v1.0`

6. **Cofre de Credenciais Zero-Trust**
   * *Headline:* Autenticação segura em sistemas legados sem expor senhas em texto puro.
   * *Descrição:* Injeção segura de tokens e segredos diretamente no contexto de execução do navegador. As credenciais nunca são impressas em prompts ou logs de raciocínio da IA.
   * *Tag Técnica:* `AES-256 GCM Secret Injection + Token Vault`

---

### SEÇÃO 3: CASOS DE USO REAIS (Enterprise Workflows)

* **Eyebrow:** `APLICAÇÕES EM PRODUÇÃO`
* **Título da Seção:** **Automatize o que antes dependia exclusivamente de mãos humanas.**
* **Subtítulo:** De operações financeiras a backoffice de e-commerce: veja onde o AgentFlow elimina gargalos manuais.

1. **Operações de Backoffice & SaaS Legados sem API**
   * *Problema:* ERPs e sistemas governamentais antigos que não oferecem endpoints REST/GraphQL.
   * *Solução AgentFlow:* O bot realiza login seguro, navega nos menus complexos, preenche formulários densos e extrai comprovantes em PDF automaticamente.
   * *Resultado:* Economia de mais de 35 horas semanais por equipe operacional.

2. **Monitoramento e Inteligência de Preços em E-Commerce**
   * *Problema:* Portais com proteções anti-bot agressivas e carregamento dinâmico de preços.
   * *Solução AgentFlow:* Navegação com pegada humana, rolagem inteligente, extração estruturada de catálogos e alertas em tempo real de variação de estoque e preço.
   * *Resultado:* Dados de concorrentes atualizados a cada 15 minutos sem bloqueios de IP.

3. **Testes Sintéticos de Jornada do Usuário & UI Health**
   * *Problema:* Testes automatizados convencionais não conseguem avaliar visualmente anomalias de layout.
   * *Solução AgentFlow:* Agentes executam jornadas completas de ponta a ponta (login -> carrinho -> checkout), validando o estado visual através de VLM e reportando falhas com gravação em vídeo.
   * *Resultado:* Detecção de quebras de checkout antes que afetem clientes reais.

4. **Extração & Enriquecimento Multimodal de Leads**
   * *Problema:* Informações fragmentadas entre redes profissionais, diretórios públicos e bases cadastrais.
   * *Solução AgentFlow:* O agente pesquisa empresas, valida dados de contato em múltiplos diretórios e injeta os leads higienizados diretamente no seu banco de dados.
   * *Resultado:* Aumento de 4x no volume de leads qualificados sem intervenção humana.

---

### SEÇÃO 4: ARQUITETURA TÉCNICA (How It Works)

* **Eyebrow:** `VISÃO DE ARQUITETURA`
* **Título da Seção:** **Do raciocínio da IA à execução no framebuffer: uma linha contínua.**
* **Subtítulo:** Entenda o fluxo de dados bidirecional entre o modelo de linguagem, o motor de execução e a interface do operador.

```
┌─────────────────┐      ┌─────────────────────────┐      ┌───────────────────────┐
│ LLM / Reasoning │ ───> │   MCP Tool Gateway      │ ───> │ Playwright Controller │
│ (Grok / Claude) │ <─── │ (Schema Zod Validation) │ <─── │   (Headless/Headed)   │
└─────────────────┘      └─────────────────────────┘      └──────────┬────────────┘
                                                                     │
                                                                     ▼
┌─────────────────┐      ┌─────────────────────────┐      ┌───────────────────────┐
│ Web Console UI  │ <─── │ noVNC / WebRTC Bridge   │ <─── │ Xvfb Virtual Display  │
│ (Live Stream)   │ ───> │ (Low-Latency Stream)    │      │  (1920x1080 Sandbox)  │
└─────────────────┘      └─────────────────────────┘      └───────────────────────┘
```

#### Fases do Ciclo de Execução:
1. **Intenção & Planejamento:** O usuário define o objetivo em linguagem natural; o orquestrador gera o plano de subtarefas e valida os parâmetros de ferramentas via MCP.
2. **Execução no DOM:** O controlador Playwright interage com a página através de seletores robustos, coordenadas visuais ou eventos de teclado/mouse no display virtual `Xvfb`.
3. **Stream & Feedback Visual:** O estado da tela é capturado em alta definição e transmitido via noVNC/WebRTC para o Live Monitor do console web.
4. **Resolução de Exceções:** Em caso de ambiguidade ou necessidade de intervenção, o modo Human Takeover permite controle manual direto com sincronização imediata de volta ao agente.

---

### SEÇÃO 5: COMPARAÇÃO DIRETA (Por Que o AgentFlow?)

| Capacidade | Scripts Tradicionais (Selenium/Puppeteer) | RPA Legado Corporativo | AgentFlow Autonomous Bot |
| :--- | :--- | :--- | :--- |
| **Resiliência a Mudanças de DOM** | ❌ Quebra com alterações de CSS/ID | ⚠️ Requer manutenção manual constante | ✅ **Auto-adaptação com visão e raciocínio de IA** |
| **Visibilidade em Tempo Real** | ❌ Apenas logs de texto / prints pós-erro | ⚠️ Gravações pesadas e atrasadas | ✅ **Live stream noVNC/WebRTC a 60 FPS** |
| **Intervenção Humana (Takeover)** | ❌ Inexistente (processo aborta) | ❌ Complexo e desconectado | ✅ **1-Click Takeover imediato sem perda de sessão** |
| **Integração com IA / MCP** | ❌ Exige wrappers customizados | ❌ Fechado e proprietário | ✅ **Nativo Model Context Protocol (MCP)** |
| **Isolamento de Segurança** | ⚠️ Executa no ambiente local/host | ❌ Infraestrutura pesada e rígida | ✅ **Sandbox Xvfb efêmero com Zero-Trust Vault** |

---

### SEÇÃO 6: PERGUNTAS FREQUENTES (Technical FAQ)

* **P: Como o bot lida com sites que utilizam autenticação de dois fatores (2FA)?**  
  *R:* O AgentFlow utiliza a funcionalidade de **Human Takeover**. Quando a tela de 2FA ou biometria for identificada, o sistema notifica o operador no console para inserir o token manualmente no stream ao vivo. Assim que concluído, a autonomia da IA é retomada instantaneamente.

* **P: É possível rodar o bot totalmente em background sem abrir janelas?**  
  *R:* Sim. Todo o processamento visual ocorre no framebuffer virtual `Xvfb`. O navegador é renderizado em um servidor gráfico virtual em memória, permitindo execução 1080p completa sem ocupar a sua tela local. O streaming noVNC só é aberto sob demanda no seu painel.

* **P: O bot consome tokens da IA a cada frame de vídeo?**  
  *R:* Não. O pipeline utiliza chamadas de visão apenas para decisões de navegação e inspeção de mudanças críticas de estado. A transmissão contínua de vídeo é feita via WebRTC/noVNC direta do servidor para o seu navegador, sem custo de tokens de inferência.

* **P: O sistema suporta múltiplos navegadores concorrentes?**  
  *R:* Sim. A arquitetura suporta clusters distribuídos com instâncias simultâneas de Chromium, Firefox e WebKit, cada qual em sua porta e display Xvfb isolados.

---

### SEÇÃO 7: CTA FINAL DE DEPLOY & REGISTRO

* **Eyebrow:** `DEPLOY IMEDIATO`
* **Headline Principal:** **Pronto para colocar seus navegadores no piloto automático?**
* **Subheadline:** Acesse o console interativo agora mesmo ou crie sua conta para orquestrar frotas de agentes autônomos em infraestrutura soberana.
* **Ações de Conversão:**
  * **Botão Primário:** `Acessar Console do Bot` *(Destino: `/bot`)*
  * **Botão Secundário:** `Registrar Nova Organização` *(Destino: `/register`)*
  * **Link Técnico de Apoio:** `Ver Gerenciamento de Credenciais e Vault` *(Destino: `/credentials`)*
* **Garantia de Engenharia:** `Deploy imediato · Infraestrutura pronta para escala · Suporte total a servidores MCP`

---

## 4. Dicionário de Micro-Copy & Componentes de UI

Para manter a consistência em botões, abas, status badges e toasts do frontend:

* **Status do Bot:**
  * `ai_autonomous`: `🤖 IA Autônoma Ativa`
  * `human_takeover`: `👤 Controle Humano em Andamento`
  * `paused`: `⏸️ Execução Pausada`
  * `waiting_user_input`: `⚠️ Aguardando Entrada do Operador`
* **Protocolos de Transmissão:**
  * `webrtc`: `⚡ WebRTC (Ultra Baixa Latência)`
  * `novnc`: `🖥️ noVNC (Compatibilidade Total)`
* **Ações Rápidas do Operador:**
  * Assumir Controle: `Assumir Controle Manual (Takeover)`
  * Devolver para IA: `Devolver Controle à IA`
  * Pausar Execução: `Pausar Sessão`
  * Capturar Snapshot: `Snapshot em Alta Resolução`
