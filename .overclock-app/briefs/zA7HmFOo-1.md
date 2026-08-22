---
id: zA7HmFOo-1
missionId: zA7HmFOo5GVA
titulo: REDESIGN n8n — TAREFA: reescrever APENAS o arquivo C:\Users\VICTOR\Downloads\...
status: aberto
---

REDESIGN n8n — TAREFA: reescrever APENAS o arquivo C:\Users\VICTOR\Downloads\Claude Code\AgentFlow\apps\web\src\app\dashboard\page.tsx como a página "Overview" do n8n.

CONTEXTO: App Next.js 15 + Tailwind v4 + React. Convertendo toda a UI para ficar igual ao n8n dark. Sidebar/AppLayout já feitos. globals.css já tem tokens @theme: bg-n8n-bg (#262626), bg-n8n-panel (#2c2c2c cards), n8n-accent (#ff6d3c laranja), n8n-accent-dark (#f25b3a hover), n8n-green (#2ecc71). NÃO existe header global mais — cada página renderiza o próprio header. Substituir TODO violeta/indigo/fuchsia por laranja n8n. Botão primário: bg-n8n-accent hover:bg-n8n-accent-dark text-white rounded-md px-4 py-2 text-sm font-medium. Secundário: text-zinc-400 hover:bg-white/5.

ESTRUTURA DA PÁGINA:
1. Header: h1 "Overview" (text-2xl font-semibold text-zinc-50) + subtítulo "All the workflows, credentials and data tables you have access to" (text-sm text-zinc-500). Direita: pill verde "Upgrade Now" com ícone Zap (bg-n8n-green text-white rounded-full px-4 py-2) linkando /billing; botão laranja "Create workflow" com ChevronDown abrindo a modal existente (AIGeneratorModal se houver).
2. 5 cards de métrica (grid-cols-2 md:grid-cols-3 xl:grid-cols-5): labels exatos "Prod. executions", "Failed prod. executions", "Failure rate", "Time saved", "Run time avg." — valores dos dados já buscados quando possível; senão 0 / 0% / — / 0s. Card: bg-n8n-panel border border-white/10 rounded-lg p-4; label text-xs zinc-500 em cima, valor text-xl font-semibold branco embaixo.
3. Abas: "Workflows" ativa (text-n8n-accent + border-b-2 border-n8n-accent), "Credentials" (/credentials), "Executions" (/executions) como Links, "Variables" e "Data tables" spans não-clicáveis. Inativas text-zinc-400 hover:text-zinc-200.
4. Toolbar direita abaixo das abas: input busca (ícone Search + placeholder "Search", bg-white/5 border-white/10 rounded-md), select estático "Sort by last updated", botão ícone funil.
5. Lista de workflows em LINHAS empilhadas (NÃO grid de cards): cada linha = bg-n8n-panel border-white/10 rounded-lg px-4 py-3 flex items-center gap-3, hover:border-white/20 → quadrado pequeno com ícone Workflow em tom laranja; nome (text-sm font-medium zinc-50) + metadados (text-xs zinc-500, "Last updated X ago · Created {date}"); direita badge "Personal" (UserRound icon h-3 w-3, bg-white/5 text-zinc-300 rounded-full px-2 py-0.5 text-xs) + kebab (MoreVertical). Clique na linha navega como antes.
6. Rodapé: "Total {N} workflows" (text-xs zinc-600).

REGRAS: manter TODA a lógica existente (redirect auth para /login, chamadas workflowsApi/executionsApi, estado, handlers, modal IA ligada ao Create workflow). Remover seções antigas "Recent executions" e "Quick start". Só mudar apresentação. Labels em inglês. NÃO mexer em nenhum outro arquivo.

AO TERMINAR: imprima exatamente uma linha começando com: TASK DONE dashboard

---
Worker contract (mandatory, in order):
1. pwd — confirm the repo.
2. Read the pointed item (+ parent item if a slice, for context).
3. Execute strictly within the item's file scope.
4. Write the result back into the item (Correção/notas + session id).
5. Commit with pathspec citing the item ID — this commit is PRE-AUTHORIZED by this contract; do not ask permission, do not wait to be asked.
6. handoff_submit as your last action.

## Resultado

Feito direto no orchestrator (pane-850) pois dashboard ficou órfão após premium-limit do pane-882. Arquivo já estava convertido para n8n Overview (5 métricas, tabs, toolbar, linhas Personal, Upgrade Now, Create workflow). Typecheck web pass. Commit 6098e48 com dashboard+workflows (zA7HmFOo-1, zA7HmFOo-2). Session pane-850.

TASK DONE dashboard
