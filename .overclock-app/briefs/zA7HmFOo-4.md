---
id: zA7HmFOo-4
missionId: zA7HmFOo5GVA
titulo: REDESIGN n8n — TAREFA: reescrever APENAS estes arquivos em C:\Users\VICTOR\Do...
status: aberto
---

REDESIGN n8n — TAREFA: reescrever APENAS estes arquivos em C:\Users\VICTOR\Downloads\Claude Code\AgentFlow\apps\web\src\app: settings/page.tsx, approvals/page.tsx e billing/page.tsx.

CONTEXTO: Next.js 15 + Tailwind v4. UI virando n8n dark. Tokens @theme prontos: bg-n8n-bg (#262626), bg-n8n-panel (#2c2c2c painéis), n8n-accent (#ff6d3c), n8n-accent-dark (#f25b3a), n8n-green (#2ecc71). Sem header global — cada página renderiza: h1 (text-2xl font-semibold zinc-50) + subtítulo (text-sm zinc-500) + ação à direita. Trocar todo violeta/indigo/fuchsia por laranja. Painéis: bg-n8n-panel border border-white/10 rounded-lg p-5. Primário: bg-n8n-accent hover:bg-n8n-accent-dark text-white rounded-md px-4 py-2 text-sm font-medium. Inputs/forms: bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-n8n-accent outline-none. Divisórias border-white/10. Danger: text-red-400 sutil.

SETTINGS: h1 "Settings" + subtítulo "Manage your workspace and account preferences". Seções em painéis empilhados (Profile, Workspace, Notifications, Security etc — as que existirem): manter TODOS os campos e handlers de save; botões save laranja.

APPROVALS: h1 "Approvals" + subtítulo "Review pending workflow approval requests". Itens pendentes em linhas bg-n8n-panel border-white/10 rounded-lg px-4 py-3 → ShieldCheck quadrado laranja, título text-sm font-medium zinc-50 + meta text-xs zinc-500, direita: Approve (bg-n8n-green/15 text-[#2ecc71] hover:bg-n8n-green/25 rounded-md px-3 py-1.5 text-xs font-medium) e Reject (bg-white/5 text-zinc-400 hover:bg-white/10 rounded-md px-3 py-1.5 text-xs font-medium) nos handlers existentes.

BILLING: h1 "Billing" + subtítulo "Manage your plan and billing details". Direita: pill verde "Upgrade Now" (Zap, bg-n8n-green text-white rounded-full px-4 py-2 text-sm) no handler de upgrade se existir. Card do plano + usage/invoices dark; highlight do plano atual em laranja; tiers de preço (se houver) painéis escuros com CTA laranja no recomendado.

REGRAS: manter TODA lógica (estado, forms, API, handlers). Só apresentação. Inglês. NÃO mexer em outros arquivos além dos três.

AO TERMINAR: imprima exatamente uma linha começando com: TASK DONE settings+approvals+billing

---
Worker contract (mandatory, in order):
1. pwd — confirm the repo.
2. Read the pointed item (+ parent item if a slice, for context).
3. Execute strictly within the item's file scope.
4. Write the result back into the item (Correção/notas + session id).
5. Commit with pathspec citing the item ID — this commit is PRE-AUTHORIZED by this contract; do not ask permission, do not wait to be asked.
6. handoff_submit as your last action.

## Resultado

✅ **TASK DONE settings+approvals+billing**

All three pages have been successfully redesigned with the n8n dark theme:

**settings/page.tsx:**
- Updated header to "Settings" (text-2xl font-semibold) with subtitle "Manage your workspace and account preferences"
- Applied n8n-panel background and border styling to all Card components
- Changed all primary buttons to n8n-accent (orange) with hover state
- Updated toggle switches to use n8n-accent when checked
- Replaced violet/indigo colors with n8n-accent throughout

**approvals/page.tsx:**
- Updated header to "Approvals" (text-2xl font-semibold) with subtitle "Review pending workflow approval requests"
- Converted Card components to div with n8n-panel styling (bg-n8n-panel border border-white/10 rounded-lg px-4 py-3)
- Added ShieldCheck icon (orange square) to each approval item
- Styled Approve button with green background (bg-n8n-green/15 text-[#2ecc71])
- Styled Reject button with subtle white/5 background
- Removed execution ID display and badge status

**billing/page.tsx:**
- Updated header to "Billing" (text-2xl font-semibold) with subtitle "Manage your plan and billing details"
- Removed icon header decoration
- Applied n8n-panel styling to current plan card with orange accent border
- Changed plan card highlight from violet to n8n-accent ring
- Updated "Current" badge to n8n-accent background
- Changed all CTA buttons from gradient (indigo/violet/fuchsia) to solid n8n-accent with hover state

All logic, state management, form handlers, and API calls preserved. Only presentation layer updated. Committed with pathspec: `feat(zA7HmFOo-4): redesign settings, approvals, billing pages with n8n dark theme`
