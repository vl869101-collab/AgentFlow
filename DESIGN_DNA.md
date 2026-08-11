# AgentFlow Visual DNA

This document is the source of truth for AgentFlow UI styling. Use the exact Tailwind classes listed here for shared components, workflow canvas elements, and node type treatments.

## 1. Color Palette

### Backgrounds

| Token | Hex | Tailwind class |
| --- | --- | --- |
| Base | `#09090b` | `bg-zinc-950` |
| Surface | `#18181b` | `bg-zinc-900` |
| Card | `#27272a` | `bg-zinc-800` |
| Elevated | `#3f3f46` | `bg-zinc-700` |

### Text

| Token | Hex | Tailwind class |
| --- | --- | --- |
| Primary | `#fafafa` | `text-zinc-50` |
| Secondary | `#a1a1aa` | `text-zinc-400` |
| Muted | `#71717a` | `text-zinc-500` |

### Primary gradient

- Gradient stops: `from-indigo-500 via-violet-500 to-fuchsia-500`
- Full background class: `bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500`

### Status colors

| Status | Hex | Base Tailwind class |
| --- | --- | --- |
| Success | `#22c55e` | `bg-green-500` |
| Warning | `#f59e0b` | `bg-amber-500` |
| Error | `#ef4444` | `bg-red-500` |
| Info | `#3b82f6` | `bg-blue-500` |

### Borders

| Token | Tailwind class |
| --- | --- |
| Subtle | `border-white/10` |
| Strong | `border-white/20` |

### Node type colors

Every entry in `NODE_TYPES` has a distinct source color. The custom Discord, Telegram, and Google Sheets colors use arbitrary-value Tailwind classes so their exact hex values remain intact.

| Type | Source hex | Tailwind color class |
| --- | --- | --- |
| `webhook` | `#6366f1` | `bg-indigo-500` |
| `cron` | `#8b5cf6` | `bg-violet-500` |
| `http` | `#06b6d4` | `bg-cyan-500` |
| `email` | `#10b981` | `bg-emerald-500` |
| `discord` | `#5865f2` | `bg-[#5865f2]` |
| `telegram` | `#229ed9` | `bg-[#229ed9]` |
| `sheets` | `#34a853` | `bg-[#34a853]` |
| `condition` | `#f59e0b` | `bg-amber-500` |
| `transform` | `#ec4899` | `bg-pink-500` |
| `delay` | `#64748b` | `bg-slate-500` |
| `ai_agent` | `#a855f7` | `bg-purple-500` |
| `approval` | `#ef4444` | `bg-red-500` |

## 2. Typography Scale

| Element | Font and Tailwind classes |
| --- | --- |
| Font | Geist Sans for headings; Geist Mono for code |
| `h1` | `text-4xl font-bold tracking-tight` |
| `h2` | `text-2xl font-semibold tracking-tight` |
| `h3` | `text-lg font-medium` |
| Body | `text-sm text-zinc-400` |
| Label | `text-xs font-medium text-zinc-500 uppercase tracking-wider` |
| Code | `font-mono text-sm` |

## 3. Spacing System

- Base unit: `4px`

| Component gap | Pixels | Tailwind class |
| --- | ---: | --- |
| `xs` | `4` | `gap-1` |
| `sm` | `8` | `gap-2` |
| `md` | `16` | `gap-4` |
| `lg` | `24` | `gap-6` |
| `xl` | `32` | `gap-8` |
| `2xl` | `48` | `gap-12` |

## 4. Component Tokens

| Component | Exact Tailwind classes |
| --- | --- |
| Card | `bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-xl p-6` |
| Button primary | `bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white font-medium rounded-lg px-4 py-2 hover:opacity-90 transition-opacity` |
| Button secondary | `bg-zinc-800 border border-white/10 text-zinc-300 rounded-lg` |
| Button ghost | `text-zinc-400 hover:text-white hover:bg-white/5` |
| Button danger | `bg-red-500/10 text-red-400 border border-red-500/20` |
| Input | `bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:ring-2 focus:ring-violet-500 focus:border-transparent` |

### Badge status colors

| Status | Exact Tailwind classes |
| --- | --- |
| Success | `bg-green-500/10 text-green-400 border border-green-500/20` |
| Warning | `bg-amber-500/10 text-amber-400 border border-amber-500/20` |
| Error | `bg-red-500/10 text-red-400 border border-red-500/20` |
| Info | `bg-blue-500/10 text-blue-400 border border-blue-500/20` |

### Modal

| Part | Exact Tailwind classes |
| --- | --- |
| Overlay | `bg-black/60 backdrop-blur-sm` |
| Content | `bg-zinc-900 border border-white/10 rounded-xl` |

## 5. React Flow Node Style

| Element | Exact Tailwind classes or behavior |
| --- | --- |
| Node container | `bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-xl min-w-[200px]` |
| Node header | `flex items-center gap-2 p-3 border-b border-white/10` |
| Node icon | `w-8 h-8 rounded-lg flex items-center justify-center` |
| Node label | `text-sm font-medium text-white` |
| Node body | `p-3 text-xs text-zinc-400` |
| Node status dot | `w-2 h-2 rounded-full` (colored by status) |
| MiniMap | `bg-zinc-900/50 border border-white/10 rounded-lg` |

### Node status dot colors

| Status | Tailwind class |
| --- | --- |
| Pending | `bg-blue-500` |
| Running | `bg-amber-500 animate-pulse` |
| Success | `bg-green-500` |
| Failed | `bg-red-500` |
| Cancelled | `bg-zinc-500` |
| Waiting approval | `bg-violet-500` |

### Edge style

- Default edge stroke: gradient stroke using `stroke="url(#edge-gradient)"`.
- Pending edge: animated dashed stroke using React Flow `animated` and `strokeDasharray="5 5"`.
- Keep the edge gradient aligned with the primary gradient stops: `from-indigo-500 via-violet-500 to-fuchsia-500`.

## 6. Animation Tokens

| Interaction or state | Exact Tailwind class or behavior |
| --- | --- |
| Hover transition | `transition-all duration-200` |
| Scale on hover | `hover:scale-[1.02]` |
| Opacity hover | `hover:opacity-80` |
| Loading pulse | `animate-pulse` |
| Status pulse | `animate-pulse` for running status |
| Page transition | Fade-in animation: `animate-in fade-in duration-300` |

## 7. Layout Tokens

| Layout element | Exact Tailwind classes |
| --- | --- |
| Sidebar expanded | `w-64` |
| Sidebar collapsed | `w-16` |
| Header height | `h-16` |
| Content area | `p-6 max-w-7xl mx-auto` |
| Card gap | `gap-6` |
| Grid | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` |

## 8. Node Type Color Map

This map mirrors every entry in `NODE_TYPES` from `packages/shared/src/index.ts`. Each node type has a unique source color. `borderColor` is the left-border class applied to the node container; `badgeColor` is the badge background class.

| Type | Label | Source hex | `iconBg` | `iconColor` | `borderColor` | `badgeColor` |
| --- | --- | --- | --- | --- | --- | --- |
| `webhook` | Webhook | `#6366f1` | `bg-indigo-500/10` | `text-indigo-400` | `border-l-indigo-500` | `bg-indigo-500/10` |
| `cron` | Schedule | `#8b5cf6` | `bg-violet-500/10` | `text-violet-400` | `border-l-violet-500` | `bg-violet-500/10` |
| `http` | HTTP Request | `#06b6d4` | `bg-cyan-500/10` | `text-cyan-400` | `border-l-cyan-500` | `bg-cyan-500/10` |
| `email` | Send Email | `#10b981` | `bg-emerald-500/10` | `text-emerald-400` | `border-l-emerald-500` | `bg-emerald-500/10` |
| `discord` | Discord | `#5865f2` | `bg-[#5865f2]/10` | `text-[#5865f2]` | `border-l-[#5865f2]` | `bg-[#5865f2]/10` |
| `telegram` | Telegram | `#229ed9` | `bg-[#229ed9]/10` | `text-[#229ed9]` | `border-l-[#229ed9]` | `bg-[#229ed9]/10` |
| `sheets` | Google Sheets | `#34a853` | `bg-[#34a853]/10` | `text-[#34a853]` | `border-l-[#34a853]` | `bg-[#34a853]/10` |
| `condition` | Condition | `#f59e0b` | `bg-amber-500/10` | `text-amber-400` | `border-l-amber-500` | `bg-amber-500/10` |
| `transform` | Transform | `#ec4899` | `bg-pink-500/10` | `text-pink-400` | `border-l-pink-500` | `bg-pink-500/10` |
| `delay` | Delay | `#64748b` | `bg-slate-500/10` | `text-slate-400` | `border-l-slate-500` | `bg-slate-500/10` |
| `ai_agent` | AI Agent | `#a855f7` | `bg-purple-500/10` | `text-purple-400` | `border-l-purple-500` | `bg-purple-500/10` |
| `approval` | Approval | `#ef4444` | `bg-red-500/10` | `text-red-400` | `border-l-red-500` | `bg-red-500/10` |

### Node type implementation contract

Apply the shared node container token from section 5 and add the mapped `borderColor` class to the left edge. Apply `iconBg` and `iconColor` to the icon wrapper and icon, respectively. Apply `badgeColor` to the node type badge; pair it with the mapped `iconColor` when text contrast is needed.
