# Editor Visual — AgentFlow

> **Missão**: Recriar n8n no AgentFlow
> **Work dir**: `n8n-migration/`
> **Data**: 2026-08-20
> **Status**: DESIGN — não implementar, não commitar
> **Responsável**: Pane ESPECIFICAÇÃO DO EDITOR VISUAL
> **Base**: `design-recriacao.md` (§2 UI Proposta), `prompt-editor-spec.md` (frente 5/16), `deps-e-libs.md`, `referencia-n8n.md`, código frontend existente (`apps/web/src/`)
> **Escopo**: Especificação completa do editor visual de workflows — canvas, nodes, conexões, palette, painel de configuração, expressões, dados, execução ao vivo, testes, undo/redo, atalhos, copiar/colar, colaboração, responsividade, acessibilidade, performance, onboarding.

---

## Índice

1. [Visão geral e stack recomendada (ADR-1)](#1-visão-geral-e-stack-recomendada-adr-1)
2. [Layout da interface (ASCII)](#2-layout-da-interface-ascii)
3. [Canvas](#3-canvas)
4. [Nodes no canvas](#4-nodes-no-canvas)
5. [Conexões](#5-conexões)
6. [Node palette](#6-node-palette)
7. [Painel de configuração](#7-painel-de-configuração)
8. [Expressões](#8-expressões)
9. [Visualização de dados](#9-visualização-de-dados)
10. [Execução ao vivo](#10-execução-ao-vivo)
11. [Testes e pin/unpin](#11-testes-e-pinunpin)
12. [Undo/redo e atalhos](#12-undoredo-e-atalhos)
13. [Copiar/colar](#13-copiarcolar)
14. [Colaboração](#14-colaboração)
15. [Acessibilidade e temas](#15-acessibilidade-e-temas)
16. [Integração backend](#16-integração-backend)
17. [Performance](#17-performance)
18. [Onboarding](#18-onboarding)
19. [Estados de UI](#19-estados-de-ui)
20. [Componentes (árvore)](#20-componentes-árvore)
21. [Eventos (contrato)](#21-eventos-contrato)
22. [Contratos API](#22-contratos-api)
23. [Fluxos de usuário](#23-fluxos-de-usuário)
24. [Critérios desktop/mobile](#24-critérios-desktopmobile)
25. [Critérios de aceite](#25-critérios-de-aceite)

---

## 1. Visão geral e stack recomendada (ADR-1)

### 1.1 Contexto

O editor visual é a interface principal do AgentFlow. O usuário constrói workflows arrastando nós para um canvas, conectando-os, configurando parâmetros, escrevendo expressões, testando execuções e observando resultados em tempo real. A experiência precisa ser fluida, responsiva e compatível com n8n (import/export).

### 1.2 Estado atual do repositório

| Componente | Status | Localização |
|---|---|---|
| React Flow (`@xyflow/react`) | ✅ v12.11.2 instalado | `apps/web/package.json` |
| React 19 + Next.js 15 | ✅ No repo | `apps/web/` |
| Tailwind CSS | ✅ v4 (dark theme) | `apps/web/styles/globals.css` |
| UI kit (Button, Card, Badge, Modal, Select, Tabs, Input) | ✅ Implementado | `apps/web/src/components/ui/` |
| WorkflowCanvas (base) | ✅ Implementado | `components/workflow/WorkflowCanvas.tsx` |
| NodePalette (base) | ✅ Implementado | `components/workflow/NodePalette.tsx` |
| NodeConfigPanel (genérico) | ⚠️ Parcial | `components/workflow/NodeConfigPanel.tsx` |
| Node components (5 tipos) | ⚠️ Parcial | `components/workflow/nodes/` |
| State management | ❌ Ausente | Nenhum (usa useState local) |
| TypeScript types | ✅ Parcial | `packages/shared/src/index.ts`, `lib/workflow.ts` |

### 1.3 ADR-1: Stack recomendada — **React 19 + Zustand + @xyflow/react v12**

#### Decisão

Adotar **React 19 + Zustand + @xyflow/react v12** como stack do editor visual, complementada por **React Hook Form + Zod** para forms dinâmicos, **CodeMirror 6** para edição de expressões/código, e **Yjs + Socket.IO** para colaboração em tempo real.

#### Justificativa

| Critério | React + Zustand + @xyflow/react | Vue 3 + Pinia + Vue Flow | Conclusão |
|---|---|---|---|
| **Compatibilidade com repo existente** | ✅ 100% — já usa React 19 + Next.js 15 | ❌ Rewrite completo de toda a UI | **Decisivo** |
| **Dependência já instalada** | ✅ `@xyflow/react` v12.11.2 no lockfile | ❌ `vue-flow` não instalado | Zero custo de adoção |
| **Ecosistema de forms** | ✅ `react-hook-form` + `@hookform/resolvers/zod` (zod já no repo) | Similar via `vee-validate` | Par |
| **Tree-shaking / bundle** | ✅ BOM — React Flow tree-shakeable, Zustand ~5 kB | ⚠️ Vue Flow menor, mas Vue runtime +100 kB | Par |
| **Performance canvas 200+ nodes** | ✅ Bom com otimizações (@xyflow/react usa virtualização parcial) | ✅ Similar | Par |
| **TypeScript first-class** | ✅ Tipos inclusos em tudo | ⚠️ Vue Flow types menos maduras | ✅ React |
| **Equipe já familiarizada** | ✅ Código existente todo em React | ❌ Curva de aprendizado | ✅ React |
| **Code editor (expressions)** | ✅ Monaco/CodeMirror integrados facilmente | ⚠️ Editor precisa de wrapper Vue | ✅ React |
| **Real-time collaboration** | ✅ Yjs + Socket.IO com providers React | Similar | Par |

**Decisão final**: React 19 + Zustand + @xyflow/react v12. Não há benefício em migrar para Vue — o custo de rewrite supera qualquer ganho. O foco é **estender** o que já existe.

#### ADR-1-02: Zustand para state management

| Alternativa | Tamanho | Curva | Integração com React Flow |
|---|---|---|---|
| **Zustand** | ~5 kB gz | Baixa | Hook-based, perfect match |
| Redux Toolkit | ~20 kB gz + boilerplate | Média | Mais verboso |
| Context API | Built-in | Baixa | Performance issues com re-renders em canvas grande |
| Jotai | ~5 kB gz | Baixa | Similar, mas Zustand mais maduro |

**Decisão**: Zustand. Cria slices separados para: `canvas` (nodes/edges/viewport), `editor` (selectedNode, mode), `execution` (liveRun, nodeStates), `history` (undo/redo), `collab` (presence, cursors).

#### ADR-1-03: CodeMirror 6 para editor de expressões

| Alternativa | Tamanho | Feature coverage | SSR |
|---|---|---|---|
| **CodeMirror 6** | ~800 kB gz (modular) | ✅ Autocomplete, lint, syntax highlight, folding | ✅ SSR-safe |
| Monaco Editor | ~15 MB (full) | ✅ Mais completo, mas pesado | ❌ Problemas com SSR no Next.js |
| Monaco (SSR fix) | ~12 MB | ✅ Mas requer `dynamic` import | ⚠️ Complexo |
| React Simple Code Editor | ~50 kB | ❌ Sem autocomplete, lint | ✅ |

**Decisão**: CodeMirror 6 com `@codemirror/lang-javascript`, `@codemirror/lint`, `@codemirror/autocomplete`. Carregado via `next/dynamic` para evitar impacto no bundle inicial. Monaco apenas se for editor HTML/CSS avançado (decisão de roadmap P3).

#### ADR-1-04: Yjs para colaboração em tempo real

| Alternativa | CRDT | Provider | Tamanho |
|---|---|---|---|
| **Yjs** | ✅ CRDT nativo | `y-websocket` ou Socket.IO custom | ~150 kB |
| Socket.IO rooms (custom OT) | ❌ Manual | Socket.IO | ~50 kB |
| ShareJS | ⚠️ Legacy, OT apenas | — | ~100 kB |

**Decisão**: Yjs como source of truth compartilhado. React Flow lê de Zustand que é alimentado por Yjs. Socket.IO apenas para presence/cursors. Quando Yjs não disponível (modo single-user), Zustand atua como store local.

---

## 2. Layout da interface (ASCII)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HEADER (fixed, h-16) — AppLayout/Header.tsx                                │
│  [≡ menu] Workspace / Editor • [Search ⌘K] [🔔] [👤 User ▼]                │
├────┬────────────────────────────────┬───────────────────────────────────┬──┤
│    │ NODE PALETTE (w-72)            │         TOOLBAR (h-14)             │  │
│    │ ┌─────────────────────┐       │  [Undo] [Redo] [Zoom] [Save] [▶]  │  │
│    │ │ Search nodes        │       │  [Auto-save dot] Last saved: 12s  │  │
│    │ ├─────────────────────┤       ├───────────────────────────────────┤  │
│    │ │ 🗂 Triggers        │       │                                   │  │
│    │ │ 🗂 Actions         │       │    WORKFLOW CANVAS (flex-1)       │  │
│    │ │ 🗂 Logic           │       │                                   │  │
│    │ │ 🗂 AI              │       │    ┌──────────────────────┐      │  │
│    │ │ 🗂 Communication   │       │    │  ReactFlow Canvas     │      │  │
│    │ └─────────────────────┘       │    │  - Zoom/Pan           │      │  │
│    │ Recent: 3 nodes              │    │  - Grid               │      │  │
│    │ Favorites: ★                 │    │  - Minimap (corner)   │      │  │
│    │ Loading more…                │    │  - Selection box      │      │  │
│    └───────────────────────────────┘    │  - Execution overlay  │      │  │
│                                       │  │  [node] [node]        │      │  │
│    STATUS BAR (h-8, bottom)          │  │  [node]    [edge]      │      │  │
│    [10% zoom] [4 nodes] [3 edges]   │  └──────────────────────┘      │  │
│    [Grid: ON] [Snap: ON]            │                                   │  │
│    [Mode: Edit/Select]              │                                   │  │
├────┼────────────────────────────────┼───────────────────────────────────┤  │
│    │ NODE CONFIG PANEL (w-96)       │  PRESENCE INDICATORS              │  │
│    │ ┌──────────────────────┐      │  [👤 Victor (2 cursors)]          │  │
│    │ │ [● TriggerNode]      │      │                                   │  │
│    │ │ ┌─ Parameters ───────┐ │      │                                   │  │
│    │ │ │ Method: [POST▼]   │ │      │                                   │  │
│    │ │ │ Path: /leads      │ │      │                                   │  │
│    │ │ │ Response: [200▼]  │ │      │                                   │  │
│    │ │ └───────────────────┘ │      │                                   │  │
│    │ │ ┌─ Data ────────────┐ │      │                                   │  │
│    │ │ │ Pin: [📌 OFF]     │ │      │                                   │  │
│    │ │ │ Input preview     │ │      │                                   │  │
│    │ │ │ Output preview    │ │      │                                   │  │
│    │ │ └───────────────────┘ │      │                                   │  │
│    │ │ ┌─ Notes ──────────┐ │      │                                   │  │
│    │ │ │ [text area]      │ │      │                                   │  │
│    │ │ └───────────────────┘ │      │                                   │  │
│    │ └──────────────────────┘      │                                   │  │
│    └────────────────────────────────┘                                   │  │
└────┴────────────────────────────────┴───────────────────────────────────┴──┘

MOBILE (< 768px):
┌────────────────────────────┐
│ Header                     │
├────────────────────────────┤
│ Canvas (full screen)       │
│ [palette float btn]        │
│ [config float btn]         │
└────────────────────────────┘
→ Palette & Config abrem como modal/bottom sheet
```

### 2.1 Proporções de painéis (desktop)

| Painel | Width / Height | Redimensionável | Condição |
|---|---|---|---|
| Node Palette | 288px (w-72) | Sim (drag resize) | Sempre visível desktop |
| Canvas | flex-1 | Sim | Ocupa espaço restante |
| Config Panel | 384px (w-96) | Sim (drag resize) | Visível quando node selecionado |

### 2.2 Breakpoints

| Breakpoint | Width | Layout |
|---|---|---|
| `sm` | ≥640px | Canvas scrolls horizontalmente se painéis laterais fechos |
| `md` | ≥768px | Painéis laterais como sidebars fixos (desktop clássico) |
| `lg` | ≥1024px | Todos os 3 painéis visíveis simultaneamente |
| `xl` | ≥1280px | Layout completo com status bar detalhada |

---

## 3. Canvas

### 3.1 Arquitetura

O canvas é implementado via `@xyflow/react` v12 (React Flow). O componente `WorkflowCanvas` (existe em `components/workflow/WorkflowCanvas.tsx`) envolve `ReactFlowProvider` + `ReactFlow` com os seguintes sub-componentes internos:

```tsx
// apps/web/src/components/workflow/WorkflowCanvas.tsx (extensão proposta)
<ReactFlowProvider>
  <ReactFlow
    nodes={store.nodes}
    edges={store.edges}
    nodeTypes={nodeTypes}           // trigger, action, logic, advanced
    edgeTypes={edgeTypes}           // default, conditional, animated
    onNodesChange={store.onNodesChange}
    onEdgesChange={store.onEdgesChange}
    onConnect={store.onConnect}
    onSelectionChange={store.onSelectionChange}
    // Viewport
    minZoom={0.2}
    maxZoom={2.0}
    fitView
    fitViewOptions={{ padding: 0.15 }}
    // Grid & snapping
    snapToGrid={store.snapToGrid}
    snapGrid={[16, 16]}            // 16px grid
    // Interaction
    multiEngine={true}             // Shift+drag = marquee
    multiselectOnKeyUp={true}
    connectOnClick={true}
    // Pro
    proOptions={{ hideAttribution: true }}
    // Performance
    nodeOrigin={[0, 0]}
    // Accessibility
    aria-label="Workflow canvas"
  >
    <Background
      variant={BackgroundVariant.Dots}
      gap={24}
      size={1}
      color={theme === 'dark' ? '#3f3f46' : '#e5e7eb'}
    />
    <Controls
      showZoom
      showPan
      showInteractive={false}
      position="bottom-left"
    />
    <MiniMap
      nodeColor={getNodeColor}
      maskColor={theme === 'dark' ? 'rgb(9 9 11 / 0.75)' : 'rgb(226 232 240 / 0.7)'}
      position="bottom-right"
    />
    <Panel position="top-left">
      <CanvasStatusBar />
    </Panel>
  </ReactFlow>
</ReactFlowProvider>
```

### 3.2 Zoom e Pan

| Ação | Input | Comportamento |
|---|---|---|
| Zoom in | `Ctrl` + `+`, `⌘`+`/` (mac), ou scroll up | Incremento de 0.1 no zoom |
| Zoom out | `Ctrl` + `-`, `⌘`+`-`, ou scroll down | Incremento de -0.1 no zoom |
| Reset zoom | `Ctrl` + `0`, `⌘`+`0` | Volta para zoom 1.0 (100%) |
| Fit to screen | `Ctrl`+`Shift`+`0` | Ajusta viewport para mostrar todos os nós |
| Pan | Middle mouse drag, `Space`+drag, `Shift`+drag (quando pan ativado) | Move o canvas |
| Pan rápido | Barra de espaço + drag | Cursor muda para grab |

**Limites de zoom**: minZoom=0.2 (20%), maxZoom=2.0 (200%).

### 3.3 Grid snap

| Configuração | Valor |
|---|---|
| Grid size | 16×16 pixels |
| Snap ativo | Default: ON (toggle via status bar ou `G`) |
| Snapping | Nós alinham ao grid mais próximo durante drag |
| Visualização grid | Dots (24px gap) ou Lines (16px gap), toggle via status bar |

### 3.4 Minimap

| Feature | Detalhe |
|---|---|
| Posição | Bottom-right (toggle via status bar) |
| Cor de nós | Baseado em categoria (`getNodeMeta(type).color`) |
| Mask color | Semi-transparente (dark: rgba(9,9,11,0.75), light: rgba(226,232,240,0.7)) |
| Interativo | Click no minimap repositiona o viewport |
| Toggle | `Ctrl`+`Shift`+`M` ou botão no status bar |

### 3.5 Controle de visualização (viewport)

| Estado | Persistência |
|---|---|
| Zoom level | Local no browser (localStorage: `editor:viewport`) |
| Canvas position (pan) | Local no browser |
| Ao recarregar | Restaura última viewport; se workflow muda, fitView |

### 3.6 Selection box (marquee)

- Shift + drag no canvas vazio → selection box
- Seleciona todos os nós dentro da área
- `Delete` remove todos os selecionados
- `Ctrl`+`C`/`Ctrl`+`V` copia/cola seleção

---

## 4. Nodes no canvas

### 4.1 Arquitetura de componentes de nó

```
BaseNode (wrapper comum)
├── TriggerNode    (webhook, cron)
├── ActionNode     (http, email, discord, telegram, sheets, gmail, googleDrive, respond_webhook)
├── LogicNode      (condition, transform, delay, merge, filter, set_fields, splitInBatches, code)
└── AdvancedNode   (ai_agent, approval, gmailTrigger, evaluationTrigger, emailReadImap)
```

Cada nó é um React component customizado do React Flow, registrado no `nodeTypes` map:

```typescript
// apps/web/src/lib/workflow.ts
import type { NodeTypes } from '@xyflow/react';

export const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  logic: LogicNode,
  advanced: AdvancedNode,
};
```

### 4.2 Estado de nó (tabela completa)

| Estado | Cor | Ícone | Badge | Animação | Descrição |
|---|---|---|---|---|---|
| `IDLE` (default) | Border cinza `#52525b` | Nenhum | Nenhum | Nenhuma | Nó esperando execução |
| `RUNNING` | Border âmbar `#f59e0b`, pulse | `●` | `RUNNING` | `animate-pulse` + glow | Nó em execução ativa |
| `SUCCESS` | Border verde `#10b981` | `✓` | `DONE` | Breve fade-in | Execução bem-sucedida |
| `ERROR` | Border vermelho `#ef4444` | `✗` | `FAILED` | Shake + glow vermelho | Erro durante execução |
| `WAITING_APPROVAL` | Border violeta `#8b5cf6` | `⧖` | `WAITING` | Piscar suave | Aguardando aprovação humana |
| `CANCELLED` | Border cinza `#64748b` | `⊘` | `CANCELLED` | Opacidade 50% | Execução cancelada |
| `PAUSED` | Border cinza `#64748b`, slash | `//` | `PAUSED` | Nenhuma | Nó desabilitado pelo usuário |
| `WARNING` | Border amarelo `#eab308` | `!` | `WARN` | Piscar | Execução com avisos não-fatal |

### 4.3 Visual de nó

```
┌──────────────────────────────────────┐
│ ┌────┐ Webhook            [●] IDLE  │  ← Header: icon + label + status badge
│ │ ↗  │ Receive HTTP events           │  ← Body: description (line-clamp-2)
│ └────┘                                │  ← Footer: primeiro config key:pair
│   path: /orders                        │  ← Border-left colored por categoria
└──────────────────────────────────────┘
  [↖ Handle]                     [→ Handle]  ← Handles de conexão
```

Componentes visuais:
- **Header**: Ícone (lucide), label do nó, badge de categoria (ex: "Webhook", "Action")
- **Status dot**: Círculo no canto superior direito do header, cor conforme estado (tabela 4.2)
- **Body**: Descrição curta (2 lines max), primeiro parâmetro de config em `font-mono`
- **Border-left**: 2px, cor da categoria (ver `nodeStyles` em `workflow.ts`)
- **Handles**: 
  - Source handle: `Position.Right` (center)
  - Target handle: `Position.Left` (center) — não renderizado em triggers
  - Branch handles (apenas para `condition`): `Position.Right` com `id="true"` (top, 35%) e `id="false"` (bottom, 70%)

### 4.4 Handles

| Tipo | Position | id | Condição | Cor |
|---|---|---|---|---|
| Target | Left | default | `kind !== "trigger"` | `#52525b` (cinza) |
| Source | Right | default | Sempre | `#8b5cf6` (violeta) |
| Source (true) | Right | "true" | `type === "condition"` | `#f59e0b` (âmbar) |
| Source (false) | Right | "false" | `type === "condition"` | `#64748b` (cinza) |

### 4.5 Badge de dados

- Cada nó que já executou mostra um **data badge** no canto inferior direito
- Badge mostra: tipo do dado (`JSON`/`Object`) + tamanho (ex: `12 fields` ou `245 B`)
- Tooltip no hover mostra preview do JSON (primeiro nível)
- Clique no badge abre o painel de dados (seção 9)

### 4.6 Conexões animadas durante execução

Durante execução ao vivo:
- Edges que carregam dados em trânsito ficam **animados** (stroke-dasharray pulsando)
- Cor do edge muda conforme status:
  - `RUNNING`: `#8b5cf6` (violeta brilhante)
  - `SUCCESS`: `#10b981` (verde)
  - `ERROR`: `#ef4444` (vermelho)
  - Condicional `true`: `#f59e0b` (âmbar)
  - Condicional `false`: `#64748b` (cinza)

---

## 5. Conexões

### 5.1 Operações

| Ação | Gesto | Handler React Flow |
|---|---|---|
| Criar conexão | Drag de um handle → outro handle | `onConnect` |
| Remover conexão | Clique no edge → "Delete" (suporte) ou Delete key | `onEdgesChange` (remove) |
| Reconnectar | Drag do handle de origem/destino de um edge existente | `onConnectStart` + `onConnect` |
| Editar label | Clique duplo no edge → abre editor de label | Custom |

### 5.2 Validação de tipos (input/output)

Cada nó define handles tipados:

```typescript
// apps/web/src/lib/nodes/handle-schema.ts
export const NodeHandleSchema = {
  webhook:       { outputs: [{ id: 'main', type: 'json' }] },
  cron:          { outputs: [{ id: 'main', type: 'json' }] },
  http:          { inputs: ['main'], outputs: [{ id: 'main', type: 'json' }] },
  condition:     { inputs: ['main'], outputs: [
    { id: 'true', type: 'boolean' },
    { id: 'false', type: 'boolean' }
  ]},
  merge:         { inputs: ['main', 'secondary'], outputs: [{ id: 'main', type: 'json' }] },
  set_fields:    { inputs: ['main'], outputs: [{ id: 'main', type: 'json' }] },
  ai_agent:      { inputs: ['main'], outputs: [{ id: 'main', type: 'json' }] },
  // Trigger nodes have NO input handle
};
```

**Regras de validação:**
1. Trigger nodes (webhook, cron) não podem receber conexões (target handle removido)
2. Conexões só são permitidas se os tipos forem compatíveis (json → json, boolean → boolean)
3. Conexões múltiplas para o mesmo target são permitidas (config `multipleConnections: true`)
4. Auto-conexão (source === target) é bloqueada
5. Criação de ciclo é bloqueada (React Flow previne, mas validação adicional via DAG check)

### 5.3 Conexões múltiplas

- Um node pode ter múltiplas saídas (ex: condition → true + false)
- Um node pode receber de múltiplas fontes (ex: merge ← input0, input1)
- React Flow permite `multipleConnections: true` no edge type
- O label do edge indica qual branch/output (ex: "true", "false", "0", "1")

### 5.4 Reagendamento (requeueing)

- Quando um node falha, o usuário pode clicar no edge de erro no canvas e escolher "Re-execute a partir daqui"
- Isso cria uma nova execution a partir do nó selecionado, usando o input pinado (se disponível) ou re-executando upstream
- API: `POST /executions/:executionId/retry` com `fromNodeId`

### 5.5 Edge types customizados

| Tipo | Visual | Uso |
|---|---|---|
| `default` | Linha reta | Conexão normal |
| `step` | Linha com passo (orthogonal) | Estrutura de controle (if/switch) |
| `smoothstep` | Curva suave | Animação durante execução |
| `animated` | Curva animada com dash | Dados em trânsito |

---

## 6. Node palette

### 6.1 Estrutura

O `NodePalette` (`components/workflow/NodePalette.tsx`) é a sidebar esquerda. É alimentado dinamicamente pelo endpoint `GET /node-types` (contrato na seção 22).

### 6.2 Grupos/categorias

| Categoria | Node types | Ícone |
|---|---|---|
| Triggers | webhook, cron | `Webhook` (↗) |
| Actions | http, email, discord, telegram, sheets, gmail, googleDrive, respond_webhook | Vários |
| Logic | condition, transform, delay, merge, filter, set_fields, splitInBatches, code | `GitBranch` (⑂) |
| AI | ai_agent, approval | `Brain` (✦) |
| Integration | (expandível — novos providers) | `Puzzle` |

### 6.3 Busca (fuzzy search)

- Input de busca no topo da palette
- Busca fuzzy em: nome do nó, label, categoria, descrição, keywords
- Usa `@cmdk/list` ou implementação própria com `fuse.js` (~3 kB)
- Results update em tempo real (debounced 150ms)
- Mostra "No nodes found" com sugestão de limpar filtro

### 6.4 Favoritos

- Cada nó tem ícone de estrela (`★`) no hover
- Favoritos são persistidos em `localStorage` (`editor:favorites`) sincronizados com backend
- Seção "Favorites" fixa no topo da palette
- `Ctrl`+`Shift`+`F` foca na busca e filtra favoritos

### 6.5 Nós recentes

- Últimos 5 nós adicionados ao canvas aparecem em "Recent" (abaixo de Favorites)
- Persistido em `localStorage` (`editor:recent`, max 10 itens)
- Click ou drag para adicionar

### 6.6 Drag para canvas

```typescript
// Implementado em NodePalette.tsx (já existe)
function handleDragStart(event, type) {
  event.dataTransfer.setData("application/reactflow", type);
  event.dataTransfer.effectAllowed = "move";
}
// Canvas recebe via onDrop
function onDrop(event) {
  const type = event.dataTransfer.getData("application/reactflow");
  onCreateNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
}
```

### 6.7 Empty state da palette

Se nenhum nó corresponde à busca:
```
┌─────────────────────────────┐
│ No nodes found for "xyz"    │
│ Try adjusting your search   │
│ [Clear search]              │
└─────────────────────────────┘
```

---

## 7. Painel de configuração

### 7.1 Arquitetura

O `NodeConfigPanel` (`components/workflow/NodeConfigPanel.tsx`) é a sidebar direita. Atualmente implementado como formulário genérico — a spec propõe migrá-lo para **forms dinâmicos baseados em Zod schema**.

```
NodeConfigPanel
├── Tabs: [Parameters] [Data] [Notes] [History]
├── Parameters tab
│   ├── Dynamic form (from Zod schema)
│   │   - StringInput (com expressão toggle)
│   │   - NumberInput (com step)
│   │   - BooleanToggle
│   │   - Select (com options)
│   │   - MultiSelect
│   │   - JSONEditor (CodeMirror)
│   │   - CredentialSelect (dropdown de credenciais)
│   │   - ArrayField (lista editável)
│   │   - ObjectField (nested)
│   ├── Validation errors (inline)
│   └── AI assist button
├── Data tab
│   ├── Pin/Unpin toggle
│   ├── Input preview (tree/table/code)
│   └── Output preview (tree/table/code)
├── Notes tab
│   ├── Textarea (markdown support)
│   └── Notes in flow (checkbox)
└── History tab
    ├── Version timeline
    └── [Restore] button
```

### 7.2 Formulário dinâmico (Zod → UI)

```typescript
// packages/shared/src/nodes/schemas.ts (proposto)
import { z } from 'zod';

export const NodeParamsSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  authentication: z.enum(['none', 'basicAuth', 'headerAuth', 'oAuth2Api']).default('none'),
  headers: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })).default([]),
  body: z.record(z.unknown()).optional(),
  options: z.object({
    timeout: z.number().int().positive().default(30),
    followRedirect: z.boolean().default(true),
    retryOnFail: z.boolean().default(false),
    maxTries: z.number().int().positive().default(3),
  }).default({}),
});

export type NodeParams = z.infer<typeof NodeParamsSchema>;
```

O formulário é gerado dinamicamente:

```typescript
// apps/web/src/components/workflow/ParameterForm.tsx (proposto)
function renderField(schema: ZodTypeAny, path: string[], value: unknown, onChange: (path, value) => void) {
  if (schema instanceof ZodString) return <StringInput ... />;
  if (schema instanceof ZodNumber) return <NumberInput ... />;
  if (schema instanceof ZodBoolean) return <BooleanToggle ... />;
  if (schema instanceof ZodEnum) return <Select options={schema.options} ... />;
  if (schema instanceof ZodObject) return <ObjectField ... />;
  if (schema instanceof ZodArray) return <ArrayField ... />;
  // ...
}
```

### 7.3 Validação em tempo real

- Validação no `onChange` com debounce de 300ms
- Erros exibidos inline (under the field, red border + icon)
- Campos obrigatórios marcados com `*`
- Botão "Save" do node fica desabilitado até validação passar
- Tooltip explica o erro no hover

### 7.4 Expressões (toggle fixed/expression)

Cada campo de texto possui:
- Toggle entre **valor fixo** e **expressão** (`{{ }}`)
- No modo expressão, o input mostra botão "✏️ Edit expression" que abre o ExpressionEditor (seção 8)
- Visual indicator: ícone `ƒx` quando em modo expressão

### 7.5 Preview de dados

- No tab **Data**, mostra input e output do nó (se execução foi feita)
- Preview em tree/table/code (ver seção 9)
- Se pinado: mostra dados fixados

---

## 8. Expressões

### 8.1 Expression Editor

Editor integrado (CodeMirror 6) para escrever expressões n8n-style: `{{ $json.field }}`, `{{= $json.price * 2 }}`, etc.

### 8.2 Autocomplete

| Trigger | Sugerido | Contexto |
|---|---|---|
| `{{` | Template variables | `$json`, `$parameter`, `$node`, `$now`, `$credentials`, `$workflow`, `$helpers`, `$item`, `$input`, `$run` |
| `{{$` | Variable root | `.json`, `.parameter`, `.node`, `.now`, `.credentials`, `.workflow`, `.helpers`, `.item`, `$input`, `$run` |
| `{{ $json.` | Fields from current item | Lista de chaves do JSON (do item atual ou pinado) |
| `{{ $node.` | Other node outputs | Lista de nomes de nós upstream |
| `={{` | JavaScript expression | Autocompleta JS nativo + variáveis n8n |

### 8.3 Syntax highlighting

- CodeMirror 6 com `@codemirror/lang-javascript`
- Tema dark/light sincronizado com app theme
- `{{ }}` template expressions destacadas em cor diferente (violeta)
- JavaScript dentro de `{{= }}` destacado como código
- Erros de sintaxe sublinhados em vermelho

### 8.4 Preview ao vivo

- Ao lado do editor, painel "Preview" mostra:
  - **Expression**: o texto digitado
  - **Resolved**: o valor que seria resolvido (usando dados do item atual ou pinado)
  - **Type**: tipo do valor resultante (string, number, boolean, object)
- Updates em tempo real (debounce 200ms)

```typescript
// Exemplo de preview
// Expression: {{ $json.total > 500 ? "high" : "low" }}
// Resolved:   "high"
// Type:       string
```

### 8.5 Expression resolver

O resolver é implementado tanto no frontend (para preview) quanto no backend (para execução). Compartilhado via `packages/shared/src/expression.ts`:

```typescript
// packages/shared/src/expression.ts (proposto)
export interface ExpressionContext {
  $json: Record<string, unknown>;
  $parameter: Record<string, unknown>;
  $node: Record<string, { output: unknown }>;
  $now: Date;
  $credentials: Record<string, unknown>;
  $workflow: { id: string; name: string };
  $helpers: Record<string, unknown>;
  $item?: { json: Record<string, unknown>; binary: Record<string, unknown> };
  $input?: { all: () => unknown[]; first: () => unknown; item: (i: number) => unknown };
  $run?: { index: number; total: number };
}

export function evaluateExpression(expr: string, ctx: ExpressionContext): unknown {
  // Handle {{ ... }} template substitution
  // Handle {{= ... }} JavaScript evaluation
}
```

**Segurança**: O JavaScript dentro de `{{= }}` é avaliado com `new Function` limitado — apenas no frontend para preview. No backend, usa `isolated-vm` (sandbox).

---

## 9. Visualização de dados

### 9.1 Painel INPUT/OUTPUT

Abaixo do painel de configuração, quando um nó está selecionado:

```
┌────────────────────────────────────┐
│ Data                                │
├────────────────────────────────────┤
│ INPUT                                │
│  {                                    │
│    "json": {                          │
│      "total": 650.00,                 │
│      "email": "user@acme.test"        │
│    }                                  │
│  }                                    │
│                                      │
│ OUTPUT                               │
│  {                                    │
│    "status": 201,                     │
│    "headers": {...},                  │
│    "body": {...}                      │
│  }                                    │
└────────────────────────────────────┘
```

### 9.2 Formatos de visualização

| Formato | Component | Uso |
|---|---|---|
| Tree view | `@tanstack/react-json-tree` (~20 kB) | Visualização hierárquica interativa |
| Table view | Custom component | Array de itens como tabela |
| Code view | CodeMirror 6 | JSON pretty-printado |
| Raw view | `<pre>` | Texto puro |

### 9.3 Dados binários

- Campos `binary` mostrados como badges: `📎 file.pdf (1.2 MB)`
- Click abre modal com preview (imagem, PDF, texto) ou download
- Upload de binário via drag-drop na config do nó

### 9.4 Paginação

- Para arrays grandes (>50 itens): paginação com 50 itens por página
- Controls: `[1] [2] [3] ... Next >`
- Tamanho configurável: 10, 25, 50, 100

### 9.5 Busca em dados

- Search box no topo do painel de dados
- Busca profunda (recursiva) pelas chaves e valores
- Highlight de matches em amarelo
- Case-insensitive por default

### 9.6 Download

- Botão "Download JSON" exporta os dados como arquivo `.json`
- Botão "Copy to clipboard" copia o JSON formatado

---

## 10. Execução ao vivo

### 10.1 Modos

| Modo | Descrição |
|---|---|
| **Live (canvas)** | Execução diretamente no canvas — nós ficam com highlight animado |
| **Panel (side)** | Execução no painel de execuções (timeline + detalhes) |
| **Test (mock)** | Execução com dados de teste fixos (seção 11) |

### 10.2 Highlight do nó em execução

- Nó em execução: border violeta animada + `●` pulsando + `RUNNING` badge
- Nó bem-sucedido: border verde + `✓` + `DONE` badge (fade-in)
- Nó com erro: border vermelho + `✗` + `FAILED` badge (shake animation)
- Edge entre nós em execução: animado, cor violeta

### 10.3 Progresso

- Barra de progresso no topo do canvas: `[██████░░░░] 60%`
- Status text: `Executing node: HTTP Request (3/5)`
- Timer: `00:03.452` (elapsed desde início)

### 10.4 Streaming de dados

- Server-Sent Events (SSE) do backend:
  - `execution.started` → `{"executionId": "xxx", "startedAt": "..."}`
  - `node.started` → `{"nodeId": "yyy", "startedAt": "..."}`
  - `node.completed` → `{"nodeId": "yyy", "status": "SUCCESS", "output": {...}}`
  - `node.failed` → `{"nodeId": "yyy", "error": "..."}`
  - `execution.completed` → `{"executionId": "xxx", "status": "SUCCESS", "output": {...}}`

Frontend escuta via:
```typescript
// apps/web/src/hooks/useExecutionStream.ts
const eventSource = new EventSource(`/api/executions/${executionId}/logs`);
eventSource.addEventListener('node.completed', (e) => {
  const data = JSON.parse(e.data);
  store.updateNodeState(data.nodeId, 'SUCCESS', data.output);
});
```

### 10.5 Interromper execução

- Botão "Stop" na toolbar durante execução
- Confirmação: "Interromper execução em andamento?"
- API: `POST /executions/:executionId/cancel`
- Status no canvas muda para `CANCELLED`

---

## 11. Testes e pin/unpin

### 11.1 Execute workflow

- Botão "▶ Execute" na toolbar
- Modal de confirmação com opções:
  - **Input data**: JSON editor (para teste manual de input)
  - **Run mode**: `Full workflow` | `From selected node` | `Individual node`
  - **Environment**: `Production` | `Test` (usa webhooks de teste)

### 11.2 Dados de teste

- Mock de credenciais: durante teste, credenciais podem ser mockadas (não enviam dados reais)
- Input custom: usuário fornece JSON de entrada
- **Pin data**: dados fixados em nós para teste (ver abaixo)

### 11.3 Pin/unpin data

| Ação | Gesto | Efeito |
|---|---|---|
| Pin | Botão 📌 no painel de dados de um nó | Salva a saída atual como "pinned" |
| Unpin | Botão 📌 (ativo) no painel de dados | Remove o pin |
| Visual | 🔵 azul quando pinned | Indicador visual no nó |

**Comportamento:**
- Quando um nó é pinned, sua saída é usada em vez de executar o nó
- Nós downstream recebem o pinned data como input
- Útil para testar partes do workflow sem re-executar tudo
- Pin data persiste no `WorkflowVersion` (snapshot JSON)

### 11.4 Teste de nó individual

- Clique no menu de um nó (⋯) → "Test node"
- Executa apenas esse nó com o input do nó anterior (ou input custom)
- Mostra output no painel de dados
- Não afeta a execução do workflow completo

---

## 12. Undo/redo e atalhos

### 12.1 Undo/redo

Implementado via Zustand history store:

```typescript
// apps/web/src/stores/historyStore.ts (proposto)
interface HistoryState {
  past: HistoryEntry[];    // max 100 entries
  present: HistoryEntry;    // estado atual
  future: HistoryEntry[];   // estados futuros (após undo)
}

interface HistoryEntry {
  nodes: WorkflowCanvasNode[];
  edges: Edge[];
  timestamp: number;
}

// Actions
undo: () => void;
redo: () => void;
pushEntry: (entry: HistoryEntry) => void;  // debounced 500ms
clearFuture: () => void;  // called after any new action
```

**Debouncing:**
- Ações de movimento de nó: debounce 500ms (não cria entry a cada pixel)
- Ações de config: debounce 300ms (não duplica digitação)
- Ações de adicionar/remover conexão: entry imediato
- Ações de delete: entry imediato

**Capacidade**: 100 entries de histórico. Após 100, o mais antigo é descartado (FIFO).

### 12.2 Atalhos completos

| Atalho | Ação | Plataforma |
|---|---|---|
| `Ctrl`+`Z` / `⌘`+`Z` | Undo | Global |
| `Ctrl`+`Y` / `⌘`+`⇧`+`Z` | Redo | Global |
| `Ctrl`+`S` / `⌘`+`S` | Save workflow | Global |
| `Delete` | Delete selected nodes/edges | Canvas focused |
| `Backspace` | Delete selected (alternativa) | Canvas focused |
| `Ctrl`+`A` / `⌘`+`A` | Select all nodes | Canvas focused |
| `Ctrl`+`D` / `⌘`+`D` | Duplicate selection | Canvas focused |
| `Ctrl`+`C` / `⌘`+`C` | Copy selection | Global |
| `Ctrl`+`V` / `⌘`+`V` | Paste | Global |
| `Ctrl`+`Shift`+`V` / `⌘`+`⇧`+`V` | Paste without credentials | Global |
| `Alt`+`Drag` | Clone node while dragging | Canvas focused |
| `Space`+`Drag` | Pan canvas | Canvas focused |
| `Ctrl`+`0` / `⌘`+`0` | Reset zoom | Canvas focused |
| `Ctrl`+`Shift`+`0` | Fit to screen | Canvas focused |
| `Ctrl`+`+` / `⌘`+`+` | Zoom in | Canvas focused |
| `Ctrl`+`-` / `⌘`+`-` | Zoom out | Canvas focused |
| `G` | Toggle grid snap | Canvas focused |
| `M` | Toggle minimap | Canvas focused |
| `Ctrl`+`K` / `⌘`+`K` | Command palette | Global |
| `Tab` | Connect mode (drag from selected node) | Canvas focused |
| `Shift`+`Drag` | Marquee selection | Canvas focused |
| `Ctrl`+Click | Multi-select toggle | Canvas focused |
| `Escape` | Clear selection / exit connecting | Canvas focused |
| `F2` | Rename selected node | Canvas focused |
| `Ctrl`+`/` / `⌘`+`/` | Show keyboard shortcut help | Global |

### 12.3 Visualizar atalhos

- `Ctrl`+`/` abre overlay de atalhos (modal)
- Lista em tabela: atalho, ação, descrição

---

## 13. Copiar/colar

### 13.1 Dentro do canvas

| Ação | Gesto | Comportamento |
|---|---|---|
| Copiar nós | `Ctrl`+`C` | Copia nós + edges selecionados para clipboard (JSON serializado) |
| Recortar | `Ctrl`+`X` | Copia e remove do canvas |
| Colar | `Ctrl`+`V` | Cola no cursor (offset +50px do center) |
| Colar sem credenciais | `Ctrl`+`Shift`+`V` | Cola mas remove credenciais |

**Formato do clipboard:**

```json
{
  "nodes": [
    { "id": "n1", "type": "http", "label": "HTTP", "config": {...}, "position": { "x": 100, "y": 100 } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "sourceHandle": null, "targetHandle": null }
  ],
  "includeCredentials": true
}
```

### 13.2 Entre workflows

- Copiar em um workflow → abrir outro workflow → Colar
- Nodes são re-mapeados com IDs únicos (UUID nova)
- Edges mantêm source/target relativo (reattachados pelos nomes temporários)
- Posição ajustada para centro do canvas de destino

### 13.3 Com / sem credenciais

| Opção | Comportamento |
|---|---|
| Com credenciais | Nó mantém `credentialId` (requer permissão `credential:read` no org destino) |
| Sem credenciais | `credentialId` removido; nó aparece como "configure credentials" |

---

## 14. Colaboração

### 14.1 Modelo de colaboração

| Característica | Implementação |
|---|---|
| **Conflito-free** | Yjs CRDT (não precisa de servidor de conflitos) |
| **Presence** | Cursor de cada usuário (cor + nome) |
| **Seleção remota** | Highlight de nó selecionado por outro usuário |
| **Comentários** | Thread por nó (anexo a nodeId) |
| **Modo edit** | Optimistic updates; conflict resolvido automaticamente |

### 14.2 Cursor de presença

```typescript
// apps/web/src/stores/collabStore.ts (proposto)
interface Presence {
  userId: string;
  name: string;
  color: string;          // cor única por usuário
  cursor: { x: number; y: number } | null;
  selectedNode: string | null;
  selection: string[];    // nós selecionados
}
```

- Cursor visível como pequeno círculo colorido + label do nome
- Quando usuário está em um nó: highlight leve no nó (outline animado)
- Desaparece após 5s de inatividade

### 14.3 Comentários

- Clique com botão direito em um nó → "Add comment"
- Comentário aparece como thread no painel de configuração (aba "Comments")
- Menção: `@username` notifica via email + in-app
- Status: `Open` | `Resolved` | `Archived`

### 14.4 Conflitos e merge

- Yjs resolve conflitos de texto (expressions, config)
- Para nós/edges: CRDT baseado em IDs
- Conflitos de layout (posição): último a mover "ganha" (timestamp-based)
- Notificação de conflito: "User X moved this node while you were editing"

### 14.5 Offline mode

- Edições offline são salvas localmente (localStorage + IndexedDB)
- Reconexão: sync automático quando online
- Indicador de sync: 🟢 online / 🟡 sincronizando / 🔴 offline

---

## 15. Acessibilidade e temas

### 15.1 Dark / Light theme

| Tema | Background | Canvas | Node | Border | Text |
|---|---|---|---|---|---|
| Dark (default) | `zinc-950` | `zinc-950` | `zinc-900/80` | `white/10` | `zinc-100/500` |
| Light | `zinc-50` | `zinc-50` | `white` | `zinc-300` | `zinc-900/600` |

- Toggle no header (🌙/☀️)
- Persistido em `localStorage` (`theme`)
- Sistema: default do sistema (`prefers-color-scheme`)

### 15.2 Acessibilidade (WCAG 2.1 AA)

#### Teclado

| Elemento | Navegação | Ação |
|---|---|---|
| Canvas | `Tab` para entrar, `Arrow` para mover nó selecionado | `Enter` para selecionar, `Space` para pan |
| Nodes | `Tab` navega, `Arrow` move 16px (grid) | `Enter` abre config |
| Handles | `Tab` circular | `Enter` cria conexão |
| Palette | `Tab` lista de nós | `Enter` adiciona nó |
| Config panel | `Tab` navega field a field | `Enter` confirma |
| Toolbar | `Tab` botões | `Enter` ativa |

#### ARIA

```html
<!-- Cada nó tem: -->
<div role="node" aria-label="Webhook node: Order received"
     aria-describedby="node-desc-1"
     tabindex="0"
     data-status="IDLE">
  <div id="node-desc-1" class="sr-only">
    Receives HTTP events on path /orders. Status: idle.
  </div>
</div>

<!-- Canvas container: -->
<div role="region" aria-label="Workflow canvas" tabindex="0">
  <!-- ... -->
</div>

<!-- MiniMap: -->
<div role="img" aria-label="Workflow minimap showing 5 nodes"></div>
```

#### Contraste

- Todos os textos ≥ 4.5:1 (AA)
- Focus rings visíveis: `ring-2 ring-violet-400`
- Status colors: verified ≥ 3:1 contrast em background escuro

#### Screen reader

- Live regions para status de execução: `aria-live="polite"`
- Anúncio de mudanças: `"Node HTTP Request completed with status SUCCESS"`
- Comandos de teclado documentados via `aria-keyshortcuts`

### 15.3 Internacionalização (i18n)

- Português do Brasil (default) + English
- Biblioteca: `next-intl` (integrado com Next.js App Router)
- Traduções no editor: todos os labels, tooltips, placeholders

---

## 16. Integração backend

### 16.1 Salvar workflow (debounced)

```typescript
// apps/web/src/hooks/useAutoSave.ts (proposto)
// Debounce: 2000ms após última mudança
// Lock: não salva se houver mudança de outro usuário (Yjs conflict)
// API: PUT /api/workflows/:id (substitui nodes + edges)
// Resposta: 200 + { ok: true, nodes: [...], edges: [...] }
// On 409 Conflict: mostra "User X edited this workflow. Reload?"

const debouncedSave = useMemo(() => debounce(() => {
  api.put(`/workflows/${workflowId}`, { nodes, edges });
}, 2000), [workflowId]);
```

### 16.2 Autosave

| Condição | Ação |
|---|---|
| Mudança em canvas (add/remove/move node/edge) | Debounce 2s → PUT /workflows/:id |
| Mudança em config de nó | Debounce 2s → PUT /workflows/:id |
| Sem mudanças há 30s | Nada |
| Window blur (tab switch) | Save imediato (flush) |
| Before unload | Save imediato (flush + confirm) |

### 16.3 Confiltos (conflict resolution)

```typescript
// apps/web/src/hooks/useWorkflowSync.ts (proposto)
interface SyncConflict {
  type: 'version_conflict' | 'concurrent_edit';
  serverVersion: number;
  localVersion: number;
  changes: string[];     // descrição das mudanças do servidor
}

// Quando conflito detectado:
// 1. Para autosave
// 2. Mostra modal: "[User] edited this workflow"
// 3. Opções: [Reload server version] [Keep my changes] [Merge side by side]
```

### 16.4 Versionamento

- Cada save cria um `WorkflowVersion` (auto-incrementado)
- Endpoint: `GET /api/workflows/:id/versions` — lista versões
- `POST /api/workflows/:id/versions/:version/restore` — restaura
- Diff visual entre versões (no futuro)

### 16.5 Import/Export JSON

| Operação | API | Formato |
|---|---|---|
| Export | `GET /api/workflows/:id/export` | JSON compatível n8n |
| Import | `POST /api/workflows/import` | JSON n8n → cria workflow DRAFT |

---

## 17. Performance

### 17.1 200+ nodes benchmark

| Métrica | Target | Estratégia |
|---|---|---|
| Canvas render | < 16ms frame | Virtualização de nodes (React Flow ViewportIntersectionObserver) |
| Node drag | 60fps | Transform em CSS (translate), não reflow |
| Edge render | < 1ms por edge | SVG path memoizado |
| Connection update | < 50ms | Throttled via requestAnimationFrame |
| Memory usage | < 200MB | Cleanup de eventos, memo de componentes |

### 17.2 Virtualização

- React Flow tem virtualização parcial (viewport culling) — nós fora da viewport não são renderizados
- Para 200+ nodes: ativar `nodeRenderer` customizado com `react-window` (viewport windowing)
- Edges também são virtualizados (apenas edges visíveis)

### 17.3 Lazy load de painéis

- `NodeConfigPanel`, `DataPanel`, `ExpressionEditor` carregados via `next/dynamic`
- CodeMirror só carregado quando editor de expressão/código aberto
- React Flow component library lazy-loaded em tabs não ativas

### 17.4 Memoização

```typescript
// Todos os nós customizados usam memo
export const TriggerNode = memo(TriggerNodeBase);
export const ActionNode = memo(ActionNodeBase);
// ...
// Edges memoizados
export const AnimatedEdge = memo(AnimatedEdgeBase);
```

### 17.5 Web Workers

- Expression evaluation para preview ao vivo: off-main-thread via Web Worker
- JSON tree view rendering: virtualizado
- Auto-save: não trava UI (debounced, background)

### 17.6 Memory profiling

- React DevTools → Profiler: target < 5ms por render de nó
- Chrome DevTools → Memory: heap snapshot antes/depois de carregar workflow large
- Cleanup: `useEffect` cleanup, `removeEventListener`, cancel timers

---

## 18. Onboarding

### 18.1 Template inicial

Quando usuário cria um workflow novo:
- Modal: "Start from scratch" | "Use a template"
- Templates disponíveis:
  - **Webhook → HTTP → Sheets** (lead capture)
  - **Cron → AI → Email** (weekly digest)
  - **Webhook → IF → Discord/Telegram** (notification router)
  - **Import from n8n** (upload JSON)

### 18.2 Tour guiado (guided tour)

Step-by-step overlay (driver.js ou implementação custom):

1. **"Este é seu canvas"** — destaca canvas, explica zoom/pan
2. **"Estes são seus nós"** — destaca palette, explica drag
3. **"Conecte os nós"** — demonstra drag de handle
4. **"Configure aqui"** — abre painel de configuração
5. **"Execute e veja"** — botão Execute
6. **"Pronto!"** — finish

- Skip: canto superior direito
- Progress dots: bottom-center
- Não aparece se `localStorage.tourDone` estiver setado

### 18.3 Empty state

```
┌─────────────────────────────────────>
│                                     │
│  (ilustração de nodes)              │
│                                     │
│  Build your first workflow          │
│  Drag nodes from the left panel     │
│  and connect them to create flows.  │
│                                     │
│  [ Choose template ]  [ Import n8n JSON ]
│                                     │
└─────────────────────────────────────>
```

---

## 19. Estados de UI

### 19.1 Estados globais do editor

| Estado | Trigger | UI |
|---|---|---|
| `LOADING` | Abrir workflow | Spinner overlay no canvas, skeleton do config panel |
| `READY` (edit) | Dados carregados | Canvas interativo, palette ativa, config panel pronta |
| `SAVING` | Mudança detectada | Dot verde animado no toolbar "Saving…", botão Save desabilitado |
| `SAVED` | Save concluído | Dot verde sólido, "All changes saved" por 3s |
| `ERROR` (save) | 409/500 | Banner vermelho "Failed to save. Retry" + botão |
| `EXECUTION_RUNNING` | Click em "Execute" | Canvas em modo view-only, overlay de progresso, toolbar muda |
| `EXECUTION_SUCCESS` | Execution terminada | Nodes destacados em verde, botão "Stop" → "View results" |
| `EXECUTION_FAILED` | Node com erro | Nodes de erro em vermelho, traceback no painel |
| `CONFLICT` | 409 no save | Modal "Someone edited this workflow" |
| `OFFLINE` | Network offline | Badge vermelho "Offline — changes saved locally" |

### 19.2 Estados de nó (frontend)

```typescript
// apps/web/src/types/editor.ts (proposto)
export type NodeEditorState =
  | 'IDLE'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'WAITING_APPROVAL'
  | 'CANCELLED'
  | 'PAUSED'
  | 'WARNING';

export interface NodeUIState {
  nodeId: string;
  state: NodeEditorState;
  progress?: number;        // 0-100
  duration?: number;        // ms
  outputPreview?: unknown;   // snapshot para badge
  error?: string;
  logs?: string[];
}
```

### 19.3 Estados de edge

| Estado | Visual |
|---|---|
| `IDLE` | Linha cinza, estática |
| `ACTIVE` (durante execução) | Linha violeta animada (dash offset) |
| `SUCCESS` | Linha verde, checkmark no final |
| `ERROR` | Linha vermelha, X no final, trace do erro no tooltip |

---

## 20. Componentes (árvore)

```
apps/web/src/
├── app/
│   └── workflows/[id]/editor/
│       └── page.tsx          ← EditorPage (orquestrador)
├── components/
│   ├── workflow/
│   │   ├── WorkflowCanvas.tsx        ← Canvas container (existe)
│   │   ├── NodePalette.tsx          ← Sidebar esquerda (existe, a estender)
│   │   ├── NodeConfigPanel.tsx      ← Sidebar direita (existe, reescrever)
│   │   ├── ExpressionEditor.tsx     ← [NOVO] CodeMirror wrapper
│   │   ├── ExecutionOverlay.tsx     ← [NOVO] highlight de execução
│   │   ├── Toolbar.tsx              ← [NOVO] undo/redo, zoom, save, execute
│   │   ├── StatusBar.tsx            ← [NOVO] zoom, counts, status
│   │   ├── CanvasStatusBar.tsx      ← [NOVO] overlay de status no canvas
│   │   ├── DataPanel.tsx            ← [NOVO] INPUT/OUTPUT viewer
│   │   ├── NodePreview.tsx          ← [NOVO] preview do output no nó
│   │   ├── CommentThread.tsx        ← [NOVO] comentários por nó
│   │   ├── PresenceCursors.tsx      ← [NOVO] cursors de outros usuários
│   │   └── nodes/
│   │       ├── BaseNode.tsx         ← Wrapper comum (existe)
│   │       ├── TriggerNode.tsx      ← (existe)
│   │       ├── ActionNode.tsx       ← (existe)
│   │       ├── LogicNode.tsx        ← (existe)
│   │       └── AdvancedNode.tsx     ← (existe, estender)
│   │   └── edges/
│   │       ├── DefaultEdge.tsx      ← [NOVO]
│   │       ├── AnimatedEdge.tsx     ← [NOVO]
│   │       └── ConditionalEdge.tsx  ← [NOVO]
│   ├── ui/
│   │   ├── Button.tsx       ✓
│   │   ├── Card.tsx         ✓
│   │   ├── Badge.tsx        ✓
│   │   ├── Input.tsx        ✓
│   │   ├── Select.tsx       ✓
│   │   ├── Modal.tsx        ✓
│   │   ├── Tabs.tsx         ✓
│   │   ├── LoadingSpinner.tsx   ✓
│   │   └── EmptyState.tsx   ✓
│   └── layout/
│       ├── AppLayout.tsx   ✓
│       ├── Header.tsx      ✓
│       └── Sidebar.tsx     ✓
├── lib/
│   ├── workflow.ts       ✅ (existe)
│   ├── api.ts            ✅ (existe)
│   ├── mock-data.ts      ✅ (existe)
│   ├── utils.ts          ✅ (existe)
│   └── expression.ts     [NOVO] Expression resolver compartilhado
├── stores/
│   ├── canvasStore.ts    [NOVO] Zustand: nodes, edges, viewport
│   ├── editorStore.ts    [NOVO] Zustand: selectedNode, mode, tabs
│   ├── executionStore.ts [NOVO] Zustand: live execution state
│   ├── historyStore.ts   [NOVO] Zustand: undo/redo
│   ├── collabStore.ts    [NOVO] Zustand: presence, cursors
│   └── uiStore.ts        [NOVO] Zustand: theme, sidebar states
├── hooks/
│   ├── useAutoSave.ts       [NOVO]
│   ├── useExecutionStream.ts [NOVO]
│   ├── useExpressionPreview.ts [NOVO]
│   ├── useKeyboard.ts       [NOVO]
│   ├── useResponsive.ts     [NOVO]
│   └── useTour.ts           [NOVO]
└── styles/
    └── globals.css        ✅ (existe)
```

---

## 21. Eventos (contrato)

### 21.1 Eventos de Canvas

| Evento | Origem | Payload | Handler |
|---|---|---|---|
| `onNodesChange` | React Flow | `Node[]`, `NodeChange[]` | `canvasStore.applyChanges` |
| `onEdgesChange` | React Flow | `Edge[]`, `EdgeChange[]` | `canvasStore.applyChanges` |
| `onConnect` | React Flow | `{ source, target, sourceHandle?, targetHandle? }` | `canvasStore.addEdge` |
| `onNodeClick` | React Flow | `(event, node)` | `editorStore.selectNode(node.id)` |
| `onPaneClick` | React Flow | `(event)` | `editorStore.selectNode(undefined)` |
| `onSelectionChange` | React Flow | `{ nodes: Node[], edges: Edge[] }` | `editorStore.setSelection` |
| `onConnectStart` | React Flow | `(event, params)` | `canvasStore.startConnect(params)` |
| `onConnectEnd` | React Flow | `(event)` | `canvasStore.endConnect` |
| `onDrop` | HTML DnD | `DragEvent` | `canvasStore.createNodeFromDrop` |
| `onNodeDrag` | React Flow | `(event, node)` | `canvasStore.onNodeDrag` |
| `onNodeDragStop` | React Flow | `(event, node)` | `canvasStore.onNodeDragStop` (push history) |
| `onZoomChange` | React Flow | `zoom` | `uiStore.setZoom(zoom)` |
| `onTranslate` | React Flow | `{ x, y }` | `uiStore.setViewport({ x, y })` |

### 21.2 Eventos de Editor

| Evento | Origem | Payload | Handler |
|---|---|---|---|
| `node:update` | Config panel | `{ nodeId, data: Partial<WorkflowNodeData> }` | `canvasStore.updateNode` |
| `node:delete` | Toolbar / Keyboard | `nodeId` | `canvasStore.deleteNode` |
| `node:duplicate` | Toolbar / Keyboard | `nodeId` | `canvasStore.duplicateNode` |
| `node:test` | Config panel | `nodeId` | `executionStore.testNode` |
| `node:pin` | Data panel | `nodeId` | `executionStore.pinNodeData` |
| `node:unpin` | Data panel | `nodeId` | `executionStore.unpinNodeData` |
| `workflow:save` | Toolbar / Auto | — | `api.saveWorkflow` |
| `workflow:execute` | Toolbar | `{ input?, fromNode? }` | `executionStore.startExecution` |
| `workflow:stop` | Toolbar (running) | — | `executionStore.stopExecution` |
| `expression:evaluate` | Expression editor | `{ expr, context }` | `expression.evaluate` (debounced) |
| `palette:search` | Node palette | `query` | `palette.filterNodes(query)` |

### 21.3 Eventos de Execução (SSE)

| Evento | Payload | Ação frontend |
|---|---|---|
| `execution.started` | `{ executionId, startedAt }` | `executionStore.setRunning(true)` |
| `node.started` | `{ nodeId, startedAt }` | `canvasStore.setNodeState(nodeId, 'RUNNING')` |
| `node.progress` | `{ nodeId, progress }` | `canvasStore.setNodeProgress(nodeId, progress)` |
| `node.completed` | `{ nodeId, status, output, duration }` | `canvasStore.setNodeState(nodeId, status)`, update data panel |
| `node.failed` | `{ nodeId, error, logs }` | `canvasStore.setNodeState(nodeId, 'FAILED')`, show error in panel |
| `execution.completed` | `{ executionId, status, output, finishedAt, duration }` | `executionStore.setRunning(false)`, `executionStore.setCompleted(true)` |

---

## 22. Contratos API

### 22.1 Workflows

```http
GET    /api/workflows                         → Workflow[] (list, paginado)
POST   /api/workflows                         → Workflow (create)
GET    /api/workflows/:id                     → Workflow (com nodes, edges, versions)
PUT    /api/workflows/:id                     → Workflow (update metadados + canvas)
PATCH  /api/workflows/:id                     → Workflow (update parcial)
DELETE /api/workflows/:id                     → { ok: true } (archive)
PUT    /api/workflows/:id/canvas              → { ok: true, nodes, edges } (save canvas)
POST   /api/workflows/:id/run                 → Execution (trigger manual)
POST   /api/workflows/import                  → { workflow, warnings } (import n8n JSON)
GET    /api/workflows/:id/export              → n8n JSON compatível
```

### 22.2 Node Types

```http
GET    /api/node-types                        → NodeType[] (categorizados)
GET    /api/node-types/:key                   → NodeType (com schema Zod → JSON)
```

**Response `GET /node-types`:**

```json
[
  {
    "key": "httpRequest",
    "displayName": "HTTP Request",
    "category": "action",
    "description": "Call an external API endpoint",
    "icon": "Globe",
    "color": "#06b6d4",
    "isTrigger": false,
    "parametersSchema": { "type": "object", "properties": { ... } }
  }
]
```

### 22.3 Executions

```http
GET    /api/executions?workflowId=:id         → Execution[] (list)
GET    /api/executions/:id                    → Execution (com nodes, approvals)
POST   /api/executions/:id/cancel             → { ok: true }
POST   /api/executions/:id/retry              → Execution (re-executa a partir de nó)
GET    /api/executions/:id/logs               → SSE stream
GET    /api/executions/:id/nodes              → NodeExecution[] (detail)
POST   /api/executions/:id/test               → { output, status } (test individual node)
```

### 22.4 Credentials

```http
GET    /api/credentials                       → Credential[] (sem valor)
POST   /api/credentials                       → Credential
GET    /api/credentials/:id                   → Credential (sem valor, apenas hasValue)
GET    /api/credentials/:id/test              → { ok, latencyMs, errorClass } (test conexão)
POST   /api/credentials/:id/test              → { ok, latencyMs, errorClass }
GET    /api/credentials/providers             → Provider[] (campos obrigatórios)
```

### 22.5 Webhook test

```http
POST   /api/webhooks/:id/test                 → { ok, response } (envia payload de teste)
```

### 22.6 Compartilhamento (colaboração)

```http
WebSocket /api/ws/workflow/:id                → Yjs updates + presence
```

### 22.7 Tipos compartilhados

```typescript
// packages/shared/src/index.ts (estende)
export interface WorkflowCanvasNode {
  id: string;
  type: CanvasNodeKind;         // "trigger" | "action" | "logic" | "advanced"
  position: { x: number; y: number };
  data: WorkflowNodeData;
  width?: number;
  height?: number;
  selected?: boolean;
}

export interface WorkflowNodeData {
  type: NodeTypeKey;
  label: string;
  description: string;
  status?: ExecutionStatus;      // IDLE | RUNNING | SUCCESS | FAILED | ...
  config: Record<string, unknown>;
  pinnedData?: unknown;          // dados fixados (pin/unpin)
  credentialId?: string;         // referência à credencial
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  condition?: Record<string, unknown>;
  animated?: boolean;
  style?: Record<string, unknown>;
}
```

### 22.8 Error responses

```typescript
// Todos os erros seguem este formato:
interface ApiError {
  error: string;           // mensagem human-readable
  code: string;            // código machine-readable
  details?: Record<string, string[]>;  // erros de validação por campo
}
```

| Código | HTTP | Descrição |
|---|---|---|
| `NOT_FOUND` | 404 | Workflow/exec/node não existe |
| `VALIDATION_ERROR` | 400 | Payload inválido |
| `CONFLICT` | 409 | Versão desatualizada (conflito de edição) |
| `QUOTA_EXCEEDED` | 403 | Limite do plano atingido |
| `UNAUTHORIZED` | 401 | Não autenticado |
| `FORBIDDEN` | 403 | Sem permissão |
| `INTERNAL_ERROR` | 500 | Erro inesperado |

---

## 23. Fluxos de usuário

### 23.1 Fluxo: Criar workflow do zero

```
1. Usuário clica "New workflow" (na lista ou via template)
   ↓
2. Modal: nome + descrição + template (ou blank)
   ↓
3. Editor abre com canvas vazio + template (se selecionado)
   ↓
4. Usuário arrasta nó da palette → canvas
   ↓
5. Usuário conecta handles
   ↓
6. Usuário configura parâmetros no painel direito
   ↓
7. Auto-save: salva a cada 2s de inatividade
   ↓
8. Usuário clica "Execute" → workflow roda
```

### 23.2 Fluxo: Importar workflow n8n

```
1. Na lista de workflows: "Import from n8n"
   ↓
2. Upload de arquivo .json ou paste JSON
   ↓
3. Preview: mapeamento de nodes (ver tabela de compatibilidade)
   ↓
4. Warnings: nodes não suportados listados
   ↓
5. Cria workflow DRAFT com nodes mapeados
   ↓
6. Abre no editor para ajustes
```

### 23.3 Fluxo: Executar workflow (teste)

```
1. Usuário clica "▶ Execute" na toolbar
   ↓
2. Modal: Input JSON (opcional) + modo (full/from node)
   ↓
3. Usuário confirma
   ↓
4. API: POST /api/workflows/:id/run
   ↓
5. SSE: execution.started
   Nós ficam RUNNING em ordem (topological)
   SSE: node.started para cada
   SSE: node.completed com output
   SSE: execution.completed
   ↓
6. Canvas mostra estados de cada nó
   Painel de dados mostra input/output
```

### 23.4 Fluxo: Debugar com pin/unpin

```
1. Usuário executa workflow
   ↓
2. Um nó falha (FAILED)
   ↓
3. Usuário clica no nó → painel mostra input/output/error
   ↓
4. Usuário clica "📌 Pin output" → dados fixados
   ↓
5. Usuário corrige nó downstream
   ↓
6. Usuário re-executa apenas os nós downstream (usam pinned data)
```

### 23.5 Fluxo: Colaboração em tempo real

```
1. User A abre workflow
   ↓
2. User B abre mesmo workflow
   ↓
3. SSE/WebSocket: User B join
   Cursor de User B aparece no canvas (cor azul)
   Name badge: "Victor (2 cursors)"
   ↓
4. User A move um nó
   ↓
5. Yjs: mudança propagada instantaneamente
   User B vê movimento em tempo real
   ↓
6. User A edita config
   ↓
7. Yjs: texto compartilhado (cursor de outro usuário visível)
   ↓
8. User A sai
   Cursor desaparece
   Última edição salva
```

### 23.6 Fluxo: Copiar/colar entre workflows

```
1. User A em workflow-1: seleciona nós, Ctrl+C
   ↓
2. Clipboard: JSON serializado (nodes + edges + includeCredentials flag)
   ↓
3. User A abre workflow-2
   ↓
4. Ctrl+V → nós colados no centro do canvas
   IDs regenerados (UUID)
   Edges reattachados
   Credenciais: se mesmo org → mantém; se org diferente → limpa
```

---

## 24. Critérios desktop/mobile

### 24.1 Desktop (≥ 1024px)

| Característica | Implementação |
|---|---|
| Layout | 3 painéis fixos (palette | canvas | config) |
| Toolbar | Sempre visível no topo |
| Keyboard shortcuts | Funcionais |
| Right-click | Context menu no nó/edge |
| Drag drop | Native HTML DnD |
| Hover tooltips | Visíveis |
| Minimapa | Bottom-right fixo |
| Node resize | Não (tamanho fixo por tipo) |

### 24.2 Tablet (768px – 1024px)

| Característica | Implementação |
|---|---|
| Layout | Canvas expandido, painéis colapsáveis |
| Toolbar | Ícones apenas (sem texto) |
| Palette | Colapsível (ícone de hamburger) |
| Config panel | Drawer (slide from right) |
| Keyboard shortcuts | Mensagem "Use desktop for full shortcuts" |
| Hover tooltips | Toque longo para tooltip |
| MiniMap | Toggle via botão |

### 24.3 Mobile (< 768px)

| Característica | Implementação |
|---|---|
| Layout | Canvas full-screen, painéis como bottom sheets |
| Palette | FAB (Floating Action Button) → modal bottom sheet |
| Config panel | Bottom sheet (slide up) |
| Toolbar | Toolbar compacta fixa no bottom |
| Keyboard shortcuts | Banner "Connect to keyboard for shortcuts" |
| Context menu | Long-press |
| Minimap | Hidden (toggle) |
| Node creation | Tap + hold na palette → drag para canvas |
| Zoom | Pinch-to-zoom (via `@panzoom/react` wrapper) |
| Pan | One-finger drag (quando não em modo connect) |

### 24.4 Touch gestures

| Gesto | Ação |
|---|---|
| Tap node | Select |
| Double tap | Open config panel |
| Pinch | Zoom in/out |
| One-finger drag (empty area) | Pan |
| One-finger drag (node) | Move node (snap to grid) |
| Two-finger tap | Reset zoom |
| Long press node | Context menu / clone |
| Tap handle → drag | Create connection |

---

## 25. Critérios de aceite

### 25.1 Critérios gerais

- [ ] Todas as 18 seções do briefing cobertas (Visão geral, Layout, Canvas, Nodes, Conexões, Palette, Config, Expressões, Dados, Execução, Testes, Undo/redo, Atalhos, Copiar/colar, Colaboração, Acessibilidade, Backend, Performance, Onboarding)
- [ ] Mínimo 600 linhas
- [ ] Layout ASCII da tela (desktop + mobile)
- [ ] Decisão de stack com justificativa (ADR-1)
- [ ] Lista completa de atalhos de teclado (seção 12.2)
- [ ] Tabela de estados de node com visual (seção 4.2)
- [ ] UI states documentados (seção 19)
- [ ] Component tree completa (seção 20)
- [ ] Event contract (seção 21)
- [ ] API contracts (seção 22)
- [ ] User flows (seção 23)
- [ ] Critérios desktop/mobile (seção 24)

### 25.2 Critérios de stack

- [ ] ADR-1: React 19 + Zustand + @xyflow/react v12 (justificativa completa)
- [ ] ADR-1-02: Zustand para state management (alternativas comparadas)
- [ ] ADR-1-03: CodeMirror 6 para editor de expressões (vs Monaco)
- [ ] ADR-1-04: Yjs para colaboração (vs Socket.IO only)

### 25.3 Critérios de canvas

- [ ] Zoom: 20% a 200%, com atalhos `Ctrl`+`/` e `Ctrl`+`-`
- [ ] Pan: middle-drag, space+drag
- [ ] Grid snap: 16px, toggle via `G`
- [ ] Minimap: bottom-right, colors by category, toggle via `M`
- [ ] Selection box: shift+drag
- [ ] Multi-select: ctrl+click
- [ ] Fit to screen: `Ctrl`+`Shift`+`0`

### 25.4 Critérios de nodes

- [ ] 8 estados visuais definidos (tabela 4.2)
- [ ] Handles tipados por categoria
- [ ] Branch handles para condition node
- [ ] Status badge animado
- [ ] Data badge (tipo + tamanho)
- [ ] Animated connections durante execução

### 25.5 Critérios de conexões

- [ ] Create via drag handle
- [ ] Remove via delete key ou botão
- [ ] Validação de tipos (input/output)
- [ ] Conexões múltiplas suportadas
- [ ] Edge types: default, step, smoothstep, animated

### 25.6 Critérios de palette

- [ ] Busca fuzzy (debounce 150ms)
- [ ] Categorias: Triggers, Actions, Logic, AI
- [ ] Favoritos (★) persistidos
- [ ] Nós recentes (últimos 5)
- [ ] Drag para canvas

### 25.7 Critérios de configuração

- [ ] Forms dinâmicos via Zod schema
- [ ] Validação em tempo real (debounce 300ms)
- [ ] Expressão toggle per field
- [ ] Preview de dados no tab Data
- [ ] Tabs: Parameters, Data, Notes, History

### 25.8 Critérios de expressões

- [ ] Autocomplete: `{{ $json.`, `{{ $node.`, `{{= `
- [ ] Syntax highlighting (CodeMirror)
- [ ] Preview ao vivo (debounce 200ms)
- [ ] Context: $json, $parameter, $node, $now, $credentials, $workflow, $helpers

### 25.9 Critérios de dados

- [ ] INPUT/OUTPUT panel
- [ ] View modes: tree, table, code
- [ ] Binary data support
- [ ] Pagination (>50 items)
- [ ] Search in data
- [ ] Download JSON

### 25.10 Critérios de execução

- [ ] Live highlight (running/success/error)
- [ ] Progress bar
- [ ] SSE streaming de eventos
- [ ] Stop button
- [ ] Retry from failed node

### 25.11 Critérios de testes

- [ ] Execute workflow com input custom
- [ ] Mock de credenciais
- [ ] Test individual node
- [ ] Pin/unpin data (persistido no version snapshot)

### 25.12 Critérios de undo/redo

- [ ] 100 entries de histórico (FIFO)
- [ ] Debounce: 500ms movimento, 300ms config
- [ ] Atalhos: Ctrl+Z / Ctrl+Y
- [ ] Entry imediato para add/remove/connect/delete

### 25.13 Critérios de atalhos

- [ ] Lista completa (20+ atalhos)
- [ ] Help overlay via `Ctrl`+`/`
- [ ] Platform-aware (Ctrl vs ⌘)

### 25.14 Critérios de copiar/colar

- [ ] Dentro do canvas (nodes + edges)
- [ ] Entre workflows (UUID regenerado)
- [ ] Com/sem credenciais (`Ctrl+V` vs `Ctrl+Shift+V`)

### 25.15 Critérios de colaboração

- [ ] Presence cursors (cor + nome)
- [ ] Selection remoto (highlight)
- [ ] Comentários por nó (thread)
- [ ] Yjs CRDT para conflito-free
- [ ] Offline mode (localStorage + IndexedDB)

### 25.16 Critérios de acessibilidade

- [ ] WCAG 2.1 AA (contrast ≥ 4.5:1)
- [ ] Keyboard navigation (tab, arrow, enter, space)
- [ ] ARIA labels (`role="node"`, `aria-label`, `aria-describedby`)
- [ ] Screen reader announcements (aria-live)
- [ ] Focus visible (ring-2 ring-violet-400)
- [ ] Dark/light theme toggle

### 25.17 Critérios de backend

- [ ] Auto-save debounce 2s
- [ ] Conflict detection (409 → modal)
- [ ] Version history (create on save, restore)
- [ ] Import/Export n8n JSON
- [ ] SSE para execução streaming

### 25.18 Critérios de performance

- [ ] 200+ nodes: < 16ms frame
- [ ] Virtualização de viewport
- [ ] Lazy load de painéis (CodeMirror, DataPanel)
- [ ] Web Worker para expression evaluation
- [ ] Memoização (React.memo em todos os nós)
- [ ] Memory < 200MB

### 25.19 Critérios de onboarding

- [ ] Template inicial (4 templates)
- [ ] Guided tour (6 steps, skip, persist)
- [ ] Empty state (ilustração + CTA)

---

## Apêndice A: Tabela de estados de node

| Icon | State | Cor | CSS class | Animação |
|---|---|---|---|---|
| ⬤ | `IDLE` | `#52525b` (cinza) | `bg-zinc-500` | Nenhuma |
| ⬤ | `RUNNING` | `#f59e0b` (âmbar) | `bg-amber-500 animate-pulse` | Pulse + glow |
| ✓ | `SUCCESS` | `#10b981` (verde) | `bg-green-500` | Fade-in suave |
| ✗ | `ERROR` | `#ef4444` (vermelho) | `bg-red-500` | Shake x2 |
| ⧖ | `WAITING_APPROVAL` | `#8b5cf6` (violeta) | `bg-violet-500` | Piscar 1s |
| ⊘ | `CANCELLED` | `#64748b` (cinza escuro) | `bg-zinc-500/50` | Opacidade 50% |
| // | `PAUSED` | `#64748b` (cinza) | `bg-zinc-500/50` | Nenhuma |
| ! | `WARNING` | `#eab308` (amarelo) | `bg-amber-400` | Piscar 2s |

## Apêndice B: Tabela de cores por categoria de nó

| Categoria | Cor primária | Border-left | Badge |
|---|---|---|---|
| Trigger | `indigo-400` | `border-l-indigo-500` | `bg-indigo-500/10` |
| Action | `cyan-400` | `border-l-cyan-400` | `bg-cyan-500/10` |
| Logic | `amber-400` | `border-l-amber-400` | `bg-amber-500/10` |
| AI | `purple-400` | `border-l-purple-400` | `bg-purple-500/10` |

## Apêndice C: Expressões suportadas (v1)

| Expressão | Tipo | Descrição |
|---|---|---|
| `{{ $json }}` | template | JSON completo do item atual |
| `{{ $json.field }}` | template | Campo específico |
| `{{ $json.path.to.field }}` | template | Navegação profunda (dot notation) |
| `{{= $json.field * 2 }}` | JS | Avalia JavaScript com acesso a $json |
| `{{ $now }}` | global | Data/hora atual (ISO) |
| `{{ $parameter.field }}` | global | Parâmetro do nó atual |
| `{{ $node["Node Name"].output }}` | global | Saída de outro nó |
| `{{ $node["Node Name"].json.field }}` | global | Campo no output de outro nó |
| `{{ $credentials.apiKey }}` | global | Credencial resolvida |
| `{{ $workflow.name }}` | global | Nome do workflow |
| `{{ $helpers.function() }}` | global | Helpers (request, returnJsonArray) |
| `{{ $input.all() }}` | global | Todos os itens de input |
| `{{ $input.first() }}` | global | Primeiro item |
| `{{ $input.item(2) }}` | global | Item por índice |
| `{{ $run.index }}` | global | Índice da iteração atual (loops) |
| `{{ $run.total }}` | global | Total de iterações |

## Apêndice D: Node types registry (mapeia n8n → AgentFlow)

| n8n type | AgentFlow type | Category | Handler |
|---|---|---|---|
| `n8n-nodes-base.webhook` | `webhook` | trigger | WebhookTriggerHandler |
| `n8n-nodes-base.cron` | `cron` | trigger | CronTriggerHandler |
| `n8n-nodes-base.httpRequest` | `http` | action | HttpRequestHandler |
| `n8n-nodes-base.if` | `condition` | logic | IfNodeHandler |
| `n8n-nodes-base.set` | `set_fields` | logic | SetNodeHandler |
| `n8n-nodes-base.code` | `code` | logic | FunctionNodeHandler |
| `n8n-nodes-base.function` | `code` | logic | FunctionNodeHandler |
| `n8n-nodes-base.merge` | `merge` | logic | MergeNodeHandler |
| `n8n-nodes-base.splitInBatches` | `splitInBatches` | logic | SplitInBatchesHandler |
| `n8n-nodes-base.delay` | `delay` | logic | DelayNodeHandler |
| `n8n-nodes-base.filter` | `filter` | logic | FilterNodeHandler |
| `n8n-nodes-base.wait` | `delay` | logic | WaitNodeHandler |
| `n8n-nodes-base.switch` | `condition` | logic | SwitchNodeHandler |
| `n8n-nodes-base.emailSend` | `email` | action | EmailNodeHandler |
| `n8n-nodes-base.telegram` | `telegram` | action | TelegramNodeHandler |
| `n8n-nodes-base.googleSheets` | `sheets` | action | GoogleSheetsNodeHandler |
| `n8n-nodes-base.gmail` | `gmail` | action | GmailNodeHandler |
| `@n8n/n8n-nodes-langchain.openAi` | `ai_agent` | ai | OpenAiNodeHandler |
| `n8n-nodes-base.formTrigger` | `webhook` | trigger | FormTriggerHandler |
| `n8n-nodes-base.errorTrigger` | `cron` | trigger | ErrorTriggerHandler |
| `n8n-nodes-base.webhookResponse` | `respond_webhook` | action | WebhookResponseHandler |

## Apêndice E: Keyboard shortcut reference (compact)

```
Editor shortcuts (Ctrl = Cmd on macOS)
┌─────────────────┬────────────────────────────────────┐
│ Ctrl + Z        │ Undo                                │
│ Ctrl + Y        │ Redo                                │
│ Ctrl + S        │ Save workflow                       │
│ Delete          │ Delete selected                     │
│ Ctrl + A        │ Select all                          │
│ Ctrl + D        │ Duplicate selection                 │
│ Ctrl + C / V    │ Copy / Paste                        │
│ Ctrl + Shift + V│ Paste without credentials           │
│ Alt + Drag      │ Clone node while dragging           │
│ Space + Drag    │ Pan canvas                          │
│ Ctrl + 0        │ Reset zoom                          │
│ Ctrl + Shift + 0│ Fit to screen                       │
│ Ctrl + +/-      │ Zoom in / out                       │
│ G               │ Toggle grid snap                    │
│ M               │ Toggle minimap                      │
│ Ctrl + K        │ Command palette                     │
│ Tab             │ Connect mode (from selected node)   │
│ F2              │ Rename selected node                │
│ Ctrl + /        │ Show this help                      │
└─────────────────┴────────────────────────────────────┘
```

---

> **Arquivo**: `n8n-migration/v2-editor-spec.md`
> **Próximo passo**: Handoff para implementação (fase P1 — Editor Funcional). A stack recomendada (React 19 + Zustand + @xyflow/react v12) já tem a maior parte das dependências instaladas. O foco de implementação deve ser: dynamic form generation (Zod → UI), undo/redo store, execution overlay, expression editor (CodeMirror 6), e SSE streaming para live execution.
