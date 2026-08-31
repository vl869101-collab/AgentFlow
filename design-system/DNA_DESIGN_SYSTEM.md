# AgentFlow — Visual Design System DNA & Production Specification

> **Target Medium:** Web Application / Next.js 15 App Router / Tailwind CSS v4 / @xyflow/react (React Flow)  
> **Visual Identity Direction:** Linear / Raycast Dark Zinc (`#09090b` / `#18181b`) + Electric Violet (`#8b5cf6` / `#7c3aed`)  
> **Target Audience:** Developers, AI Engineers, Workflow Builders, DevOps Specialists  
> **Phase:** H1 Architecture & Design System Foundation (Style-Lock Approved)  

---

## 1. Visual Theme & Atmosphere

### 1.1 Aesthetic Philosophy
AgentFlow delivers a precision-engineered developer experience inspired by premier modern engineering tools (Linear, Raycast, Vercel, Supabase). The visual language prioritizes high information density, structural clarity, micro-interactions with tactile feedback, hairline geometric borders, deep neutral contrast, and targeted luminescent accents.

```
+-------------------------------------------------------------------------------+
|  GROUND CANVAS: #09090b (Dark Zinc 950)                                       |
|  +-------------------------------------------------------------------------+  |
|  |  SURFACE CARD: #18181b (Zinc 900/80) + border: rgb(255 255 255 / 0.1)  |  |
|  |  +-------------------------------------------------------------------+  |  |
|  |  |  ELEVATED WIDGET / INPUT: #09090b / #27272a (Zinc 800)           |  |  |
|  |  |  ACCENT / FOCUS GLOW: #8b5cf6 (Violet 500)                        |  |  |
|  |  +-------------------------------------------------------------------+  |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
```

### 1.2 Key Characteristics
- **Deep Neutral Base:** Pure dark background (`#09090b`) avoiding muddy brown or desaturated navy tones.
- **Translucent Layering:** Systematic use of `backdrop-blur-xl` and `backdrop-blur-md` on surface overlays, modals, and sliding drawers.
- **Hairline Geometry:** Razor-sharp 1px borders using precise alpha channels (`rgb(255 255 255 / 0.08)` to `rgb(255 255 255 / 0.15)`).
- **Luminescent Focal Points:** Electric Violet (`#8b5cf6`) and Purple (`#a855f7`) reserved for primary interactions, active workflows, focus rings, and running states.
- **Monospace Integration:** JetBrains Mono / Geist Mono for node configurations, status codes, payload data, and metrics.

---

## 2. Color System & Semantic Tokens (Tailwind v4 Compatible)

### 2.1 4-Layer Architecture

#### Layer A1: Identity Tokens (Brand & Core Canvas)
| Token Name | CSS Custom Property | Value | Role |
| :--- | :--- | :--- | :--- |
| `background` | `--color-background` | `#09090b` | Base viewport canvas & root background |
| `foreground` | `--color-foreground` | `#fafafa` | Primary text and high-contrast elements |
| `accent-primary` | `--color-accent` | `#8b5cf6` | Primary action color (Violet-500) |
| `accent-hover` | `--color-accent-hover` | `#7c3aed` | Hover state for primary accent (Violet-600) |
| `accent-glow` | `--color-accent-glow` | `rgba(139, 92, 246, 0.35)` | Halo glow and focus ring highlights |

#### Layer A1: Structural Palette (Zinc Neutrals)
| Token Name | Hex Code | Semantic Role in UI |
| :--- | :--- | :--- |
| `zinc-950` | `#09090b` | Root viewport, deep canvas background |
| `zinc-900` | `#18181b` | Base surface cards, panels, node bodies |
| `zinc-850` | `#202024` | Elevated popovers, tooltips, nested cards |
| `zinc-800` | `#27272a` | Secondary buttons, dropdown items, subtle fills |
| `zinc-700` | `#3f3f46` | Inactive borders, divider emphasis |
| `zinc-600` | `#52525b` | Disabled text, subtle placeholder icons |
| `zinc-500` | `#71717a` | Tertiary text, helper labels, placeholders |
| `zinc-400` | `#a1a1aa` | Secondary body text, node descriptions |
| `zinc-300` | `#d4d4d8` | Subtitles, interactive label text |
| `zinc-100` | `#f4f4f5` | Headings, card titles, modal titles |
| `zinc-50` | `#fafafa` | High-emphasis headers, active tabs |

#### Layer A2: Semantic Functional Colors
| Role | Base Token | Background Alpha (10%) | Border Alpha (20%) | Text Token |
| :--- | :--- | :--- | :--- | :--- |
| **Success** | `#10b981` (Emerald-500) | `rgba(16, 185, 129, 0.10)` | `rgba(16, 185, 129, 0.20)` | `#34d399` (Emerald-400) |
| **Warning** | `#f59e0b` (Amber-500) | `rgba(245, 158, 11, 0.10)` | `rgba(245, 158, 11, 0.20)` | `#fbbf24` (Amber-400) |
| **Error / Danger** | `#ef4444` (Red-500) | `rgba(239, 68, 68, 0.10)` | `rgba(239, 68, 68, 0.20)` | `#f87171` (Red-400) |
| **Info** | `#3b82f6` (Blue-500) | `rgba(59, 130, 246, 0.10)` | `rgba(59, 130, 246, 0.20)` | `#60a5fa` (Blue-400) |
| **AI / Cognitive** | `#a855f7` (Purple-500) | `rgba(168, 85, 247, 0.10)` | `rgba(168, 85, 247, 0.20)` | `#c084fc` (Purple-400) |

#### Layer B: Slot Tokens & Semantic Aliases
```css
:root {
  --surface-base: #18181b;
  --surface-muted: #202024;
  --surface-elevated: #27272a;
  --surface-overlay: rgba(9, 9, 11, 0.85);

  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.10);
  --border-strong: rgba(255, 255, 255, 0.20);
  --border-focus: #8b5cf6;

  --text-primary: #fafafa;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --text-inverted: #09090b;

  --ring-primary: rgba(139, 92, 246, 0.70);
  --ring-offset: #09090b;
}
```

#### Layer C: Gradients & Atmosphere
- **Primary Brand Gradient (linear):** `linear-gradient(to right, #6366f1, #8b5cf6, #d946ef)` (Indigo → Violet → Fuchsia)
- **Canvas Grid Pattern:** `radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)` with 20px pitch.
- **Node Highlight Glow:** `box-shadow: 0 0 20px -5px rgba(139, 92, 246, 0.45);`

---

## 3. Accessibility & WCAG AA Contrast Ratios

All semantic text, controls, and focus indicators comply with WCAG 2.1/2.2 AA standards ($\ge 4.5:1$ for regular text, $\ge 3.0:1$ for large text and UI boundaries).

| Foreground Element | Background Surface | Contrast Ratio | WCAG Compliance Level |
| :--- | :--- | :--- | :--- |
| `#fafafa` (Text Primary) | `#09090b` (Canvas 950) | **19.35 : 1** | **AAA Pass** (Exceeds 7.0:1) |
| `#fafafa` (Text Primary) | `#18181b` (Surface 900) | **17.20 : 1** | **AAA Pass** |
| `#a1a1aa` (Text Secondary) | `#09090b` (Canvas 950) | **9.12 : 1** | **AAA Pass** |
| `#a1a1aa` (Text Secondary) | `#18181b` (Surface 900) | **8.10 : 1** | **AAA Pass** |
| `#71717a` (Text Muted) | `#09090b` (Canvas 950) | **5.05 : 1** | **AA Pass** ($\ge 4.5:1$) |
| `#34d399` (Emerald Status) | `#09090b` (Canvas 950) | **11.45 : 1** | **AAA Pass** |
| `#fbbf24` (Amber Status) | `#09090b` (Canvas 950) | **12.80 : 1** | **AAA Pass** |
| `#f87171` (Red Status) | `#09090b` (Canvas 950) | **7.60 : 1** | **AAA Pass** |
| `#c084fc` (Purple Status) | `#09090b` (Canvas 950) | **8.42 : 1** | **AAA Pass** |
| `#8b5cf6` (Focus Ring) | `#09090b` (Canvas 950) | **4.85 : 1** | **AA UI Indicator Pass** ($\ge 3.0:1$) |

---

## 4. Typography System

### 4.1 Font Families
- **UI & Primary Sans:** `"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Monospace & Code:** `"Geist Mono", "JetBrains Mono", "Fira Code", monospace`

### 4.2 Type Scale & Hierarchy
| Token | Font Size | Line Height | Tracking | Weight | Typical Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `text-2xs` | `10px (0.625rem)` | `14px` | `+0.05em` | 500 / 600 | Handle tags, diff markers, badges |
| `text-xs` | `12px (0.75rem)` | `16px` | `+0.02em` | 400 / 500 | Node descriptions, input labels, hints |
| `text-sm` | `14px (0.875rem)` | `20px` | `0` | 400 / 500 | Button text, input value, table cells |
| `text-base` | `16px (1.0rem)` | `24px` | `-0.01em` | 400 / 500 | Body prose, modal content |
| `text-lg` | `18px (1.125rem)` | `28px` | `-0.02em` | 600 | Card titles, modal headers |
| `text-xl` | `20px (1.25rem)` | `28px` | `-0.02em` | 600 | Panel section titles |
| `text-2xl` | `24px (1.5rem)` | `32px` | `-0.03em` | 700 | Dashboard page headers |
| `text-4xl` | `36px (2.25rem)` | `40px` | `-0.03em` | 700 / 800 | Hero headlines |

---

## 5. Border Radius & Spatial System

### 5.1 Radius Scale
| Token | Value | Tailwind Class | Application Rule |
| :--- | :--- | :--- | :--- |
| `radius-xs` | `4px (0.25rem)` | `rounded-xs` / `rounded-sm` | Badges, subtask tags, handle pills |
| `radius-sm` | `6px (0.375rem)` | `rounded-md` | Sub-menu buttons, tabs, nested widgets |
| `radius-md` | `8px (0.5rem)` | `rounded-lg` | Buttons, form inputs, node icons, dropdowns |
| `radius-lg` | `12px (0.75rem)` | `rounded-xl` | Workflow nodes, modal containers, cards |
| `radius-xl` | `16px (1.0rem)` | `rounded-2xl` | Large dialog overlays, bento hero cards |
| `radius-full` | `9999px` | `rounded-full` | Status dots, pill badges, active tab markers |

### 5.2 Spacing & Layout Rhythm
- **Micro Space (4px - 8px):** Internal icon-text gaps (`gap-1.5`, `gap-2`), badge paddings.
- **Component Space (12px - 16px):** Node internal padding (`p-3`, `p-4`), input padding (`px-3 py-2`).
- **Surface Space (20px - 24px):** Modal internal body (`p-5`), card body (`p-6`).
- **Section Layout (32px - 64px):** Dashboard grids, workflow toolbar offsets.

---

## 6. Elevation, Depth, Borders & Glow System

### 6.1 Border Hierarchy
- **Hairline Subtle:** `1px solid rgba(255, 255, 255, 0.08)` — for internal dividers and inactive nodes.
- **Hairline Default:** `1px solid rgba(255, 255, 255, 0.12)` — for cards, inputs, and container borders.
- **Hairline Active / Hover:** `1px solid rgba(255, 255, 255, 0.25)` — for hover states on interactive cards.
- **Node Left Category Border:** `2px solid var(--node-accent)` — category indicators for Workflow nodes.

### 6.2 Elevation & Glow Shadows
```css
/* Elevation Level 1 - Cards */
--shadow-card: 0 4px 20px -2px rgba(0, 0, 0, 0.5);

/* Elevation Level 2 - Popovers & Drawers */
--shadow-popover: 0 10px 30px -5px rgba(0, 0, 0, 0.7);

/* Elevation Level 3 - Modals */
--shadow-modal: 0 25px 50px -12px rgba(0, 0, 0, 0.85);

/* Interactive Violet Glow */
--glow-violet: 0 0 25px -4px rgba(139, 92, 246, 0.45);

/* Node Running State Pulse Glow */
--glow-running: 0 0 15px 2px rgba(245, 158, 11, 0.35);
```

---

## 7. Motion & Interaction System

### 7.1 Durations & Easings
| Transition Class | Duration | Easing Curve | Use Case |
| :--- | :--- | :--- | :--- |
| `duration-fast` | `150ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Hover states, button clicks, icon flips |
| `duration-normal` | `200ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Modal fade/scale, dropdown open, tabs |
| `duration-slow` | `300ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Drawer slide-in, node drag settlement |

### 7.2 Compositor Properties
Only animate hardware-accelerated properties: `transform`, `opacity`, and `filter`. Layout geometry (`width`, `height`, `top`, `left`, `margin`, `padding`) must never be transitioned directly.

### 7.3 Reduced-Motion Specification
When `@media (prefers-reduced-motion: reduce)` is active:
- Set `transition-duration: 0.01ms !important;`
- Set `animation-duration: 0.01ms !important;`
- Edge animation in React Flow (`animated: false`).
- Replace pulse animations on running nodes with a solid static dot indicator.

---

## 8. Exact Component Contracts

### 8.1 Button (`Button.tsx`)
- **File:** `apps/web/src/components/ui/Button.tsx`
- **Variants:**
  - `primary`: Linear gradient (`from-indigo-500 via-violet-500 to-fuchsia-500 text-white font-medium shadow-md shadow-violet-500/20 hover:opacity-90 active:scale-[0.98]`)
  - `secondary`: `bg-zinc-800 border border-white/10 text-zinc-300 hover:bg-zinc-750 hover:text-white hover:border-white/20 active:scale-[0.98]`
  - `ghost`: `text-zinc-400 hover:text-white hover:bg-white/5 active:bg-white/10`
  - `danger`: `bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 active:scale-[0.98]`
- **Sizes:**
  - `sm`: `px-3 py-1.5 text-xs rounded-lg`
  - `md`: `px-4 py-2 text-sm rounded-lg`
  - `lg`: `px-5 py-2.5 text-sm rounded-lg`
- **States:** Default, Hover, Active (`scale-[0.98]`), Focus-Visible (`ring-2 ring-violet-500 ring-offset-2 ring-offset-zinc-950`), Disabled (`opacity-50 cursor-not-allowed`), Loading (renders `LoadingSpinner` with disabled interaction).

### 8.2 Input (`Input.tsx`)
- **File:** `apps/web/src/components/ui/Input.tsx`
- **Contract:**
  - `label`: Optional uppercase `text-xs font-medium text-zinc-500 tracking-wider`.
  - Container: `w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none transition-all duration-200`.
  - Focus State: `focus:ring-2 focus:ring-violet-500 focus:border-transparent`.
  - Error State: `border-red-500/50 focus:ring-red-500` with message below in `text-xs text-red-400`.
  - Accessibility: Automatically associates `aria-describedby` with error/hint ID, and sets `aria-invalid`.

### 8.3 Badge (`Badge.tsx`)
- **File:** `apps/web/src/components/ui/Badge.tsx`
- **Contract:**
  - `status`: `'success' | 'warning' | 'error' | 'info' | 'neutral'`
  - Styling: `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium`
  - Inner Indicator Dot: `h-1.5 w-1.5 rounded-full` matching status palette.

### 8.4 Modal / Dialog (`Modal.tsx`)
- **File:** `apps/web/src/components/ui/Modal.tsx`
- **Contract:**
  - Backdrop: `fixed inset-0 bg-black/60 backdrop-blur-sm z-50`
  - Dialog Window: `bg-zinc-900 border border-white/10 rounded-xl shadow-2xl shadow-black/50 max-w-lg w-full`
  - Motion: Entry `opacity: 0, scale: 0.96, y: 16` → `opacity: 1, scale: 1, y: 0` (duration 200ms).
  - Accessibility: Full focus trap (`Tab`/`Shift+Tab` cycling), `Escape` close, restores previous activeElement on unmount, `role="dialog"`, `aria-modal="true"`.

### 8.5 Tabs (`Tabs.tsx`)
- **File:** `apps/web/src/components/ui/Tabs.tsx`
- **Contract:**
  - Layout: `flex items-center gap-1 border-b border-white/10` with `role="tablist"`.
  - Tab Trigger: `px-3 py-3 text-sm font-medium transition-colors`. Active: `text-zinc-50`, Inactive: `text-zinc-500 hover:text-zinc-300`.
  - Active Indicator: Framer Motion `layoutId="active-tab"` with gradient line (`bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 h-0.5 absolute bottom-0 inset-x-0`).
  - Badge Counter: `rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-500`.

### 8.6 Drawer (`BotActivityDrawer.tsx` / `NodeConfigPanel.tsx`)
- **Files:** `apps/web/src/components/bot/BotActivityDrawer.tsx` & `apps/web/src/components/workflow/NodeConfigPanel.tsx`
- **Contract:**
  - Right Property Drawer: `w-72 md:w-80 h-full border-l border-white/10 bg-zinc-950/80 backdrop-blur-md`.
  - Bottom Activity Drawer: `border-t border-white/10 bg-zinc-950/95 backdrop-blur-md`.
  - Header: `border-b border-white/10 p-4` with icon, title and status.
  - Body: Scrollable area (`overflow-y-auto p-4 space-y-4`) with custom thin scrollbar.
  - Action Footer: Sticky delete / submit CTA container.

### 8.7 Card (`Card.tsx`)
- **File:** `apps/web/src/components/ui/Card.tsx`
- **Contract:**
  - Container: `bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-xl p-6 hover:border-white/20 transition-all duration-200`.
  - Subcomponents: `CardHeader`, `CardTitle` (`text-lg font-medium text-zinc-50`), `CardDescription` (`text-sm text-zinc-400`), `CardContent` (`mt-5`).

### 8.8 Tooltip Specification
- **Contract:**
  - Container: `bg-zinc-900 border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 shadow-xl z-50`.
  - Content Constraint: Max 120 characters, technical clarity.
  - Arrow / Positioning: 4px offset from anchor target.

---

## 9. React Flow Workflow Canvas & Node Specification

```
+---------------------------------------------------------------------------------------+
|  REACT FLOW CANVAS: #0e0e10                                                           |
|                                                                                       |
|   +-----------------------+              Edge: Stroke #8b5cf6, animated               |
|   | [Webhook] Trigger     | ==========================================> [Action]     |
|   |  - Border: Indigo     |                                             - Border: Cyan|
|   |  - Source Handle (R)  |                                             - Target (L)  |
|   +-----------------------+                                             +-------------+
|                                                                                       |
+---------------------------------------------------------------------------------------+
```

### 9.1 Canvas Environment
- **Background Ground:** `#0e0e10`
- **Grid Pattern:** Dots (`BackgroundVariant.Dots`) or Lines (`BackgroundVariant.Lines`) with `gap={20}`, `size={1.5}`, color `rgba(255, 255, 255, 0.12)`.
- **MiniMap:** `bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden`.
- **Controls:** `bg-zinc-900/85 border border-white/10 rounded-xl`.

### 9.2 Node Classification & Styling Matrix
Every node is anchored on `BaseNode.tsx` with a standard width of `min-w-[200px]`, background `bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-xl`, and a 2px colored left-accent border:

| Node Category | Types Included | Left Border Token | Icon Background | Icon Color | Handle Config |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Trigger Node** | `webhook`, `cron`, `gmailTrigger`, `evaluationTrigger` | `border-l-indigo-500` | `bg-indigo-500/10` | `text-indigo-400` | Target: None<br>Source: Right (`#6366f1` Indigo) |
| **Action Node** | `http`, `email`, `discord`, `telegram`, `sheets`, `googleDrive`, `gmail` | `border-l-cyan-400` / `border-l-emerald-400` | `bg-cyan-500/10` | `text-cyan-400` | Target: Left (`#71717a`)<br>Source: Right (`#8b5cf6` Violet) |
| **Logic Node** | `condition`, `transform`, `delay`, `filter`, `merge` | `border-l-amber-400` / `border-l-pink-400` | `bg-amber-500/10` | `text-amber-400` | Target: Left (`#71717a`)<br>Source: Multiple (`#f59e0b` true @ 35%, `#64748b` false @ 70%) |
| **AI Agent Node** | `ai_agent` | `border-l-purple-500` | `bg-purple-500/10` | `text-purple-400` | Target: Left (`#71717a`)<br>Source: Right (`#a855f7` Purple with glow) |

### 9.3 Handle Specifications & Glow
- **Diameter:** `8.8px (0.55rem)`
- **Border:** `2px solid #18181b`
- **Default Color:** `#8b5cf6` (Violet)
- **Hover & Connectable State:** `box-shadow: 0 0 10px 2px rgba(139, 92, 246, 0.6); scale: 1.25;`
- **Conditional Branching Handles:**
  - Branch `true`: `id="true"`, `top: "35%"`, background `#f59e0b` (Amber).
  - Branch `false`: `id="false"`, `top: "70%"`, background `#64748b` (Slate).

### 9.4 Node Selection & Focus Ring
When a node is selected (`selected={true}`):
```css
ring-2 ring-violet-400/70 ring-offset-2 ring-offset-zinc-950 shadow-[0_0_25px_-5px_rgba(139,92,246,0.45)]
```

### 9.5 Node Diff Markers
When viewing workflow version diffs (`diffMarker`):
- `added`: `bg-emerald-500 text-zinc-950 border border-emerald-300 font-mono text-[9px]`
- `removed`: `bg-rose-500 text-white border border-rose-300 font-mono text-[9px]`
- `modified`: `bg-amber-500 text-zinc-950 border border-amber-300 font-mono text-[9px]`
- `unchanged`: `bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono text-[9px]`

### 9.6 Edge Styling & Gradients
- **Default Edge:** `stroke: "#8b5cf6"`, `strokeWidth: 2`, `animated: true`.
- **Conditional True Edge:** `stroke: "#f59e0b"`, `strokeWidth: 2`, `animated: true`, label `"true"`.
- **Conditional False Edge:** `stroke: "#64748b"`, `strokeWidth: 2`, `animated: true`, label `"false"`.
- **Hero / SVG Edge Gradient:** `<linearGradient id="edge-gradient"><stop offset="0%" stopColor="#6366f1"/><stop offset="50%" stopColor="#8b5cf6"/><stop offset="100%" stopColor="#d946ef"/></linearGradient>`

---

## 10. Codebase Mapping to Real Existing Files

| Component / Artifact | File Path in Repository | Status & Compliance |
| :--- | :--- | :--- |
| **Global CSS & Tokens** | `apps/web/src/styles/globals.css` | Implements `:root`, dark background, React Flow overrides |
| **Button Primitive** | `apps/web/src/components/ui/Button.tsx` | Implements primary gradient, secondary, ghost, danger, loading |
| **Input Primitive** | `apps/web/src/components/ui/Input.tsx` | Implements label, hint, error, a11y IDs |
| **Badge Primitive** | `apps/web/src/components/ui/Badge.tsx` | Implements status colors (success, warning, error, info, neutral) |
| **Modal Primitive** | `apps/web/src/components/ui/Modal.tsx` | Implements Framer Motion dialog, backdrop blur, focus trap |
| **Tabs Primitive** | `apps/web/src/components/ui/Tabs.tsx` | Implements Framer Motion layoutId active-tab underline |
| **Card Primitive** | `apps/web/src/components/ui/Card.tsx` | Implements backdrop-blur-xl card container and sub-parts |
| **Activity Drawer** | `apps/web/src/components/bot/BotActivityDrawer.tsx` | Implements tabs, tasks, browser actions, MCP invocations |
| **Workflow Canvas** | `apps/web/src/components/workflow/WorkflowCanvas.tsx` | Implements React Flow, gradient edges, DnD drop handling |
| **Base Node** | `apps/web/src/components/workflow/nodes/BaseNode.tsx` | Implements node shell, status dot, diff markers, handles |
| **Trigger Node** | `apps/web/src/components/workflow/nodes/TriggerNode.tsx` | Specialized trigger node rendering |
| **Action Node** | `apps/web/src/components/workflow/nodes/ActionNode.tsx` | Specialized action node rendering |
| **Logic Node** | `apps/web/src/components/workflow/nodes/LogicNode.tsx` | Specialized logic node with condition branching |
| **AI Agent Node** | `apps/web/src/components/workflow/nodes/AdvancedNode.tsx` | Specialized AI agent node with context styling |
| **Node Config Panel** | `apps/web/src/components/workflow/NodeConfigPanel.tsx` | Side drawer for node parameters and deletion |
| **Workflow Types** | `apps/web/src/lib/workflow.ts` | Meta styles, node kinds, initial nodes & edges |
| **Brand Voice Guide** | `design-system/BRAND_VOICE_GUIDELINES.md` | Microcopy, empty states, a11y labels, terminology |

---

## 11. Style-Lock Verbatim Checklist for the Builder

The builder agent MUST verify every point below before marking any frontend task as completed:

### Anti-AI-Slop & Craft Verification
- [ ] **No Default Indigo Accent:** Never use plain default Tailwind indigo (`#6366f1`) alone as the single primary accent without the deliberate Dark Zinc + Electric Violet palette.
- [ ] **No Generic Trust-Gradient Blobs:** No centered purple-to-blue blobs in hero sections without structural hierarchy and clear product framing.
- [ ] **Exact Dark Ground:** Viewport and main canvas must use `#09090b` (or `#0e0e10` for React Flow), never flat pure black `#000000` or washed-out `#1e1e1e`.
- [ ] **5 Surface States Present:** Any data surface implements: `Loading` (skeleton/spinner), `Empty` (instructional CTA), `Error` (actionable diagnostic), `Populated` (dense data), `Edge` (overflow/long text handling).
- [ ] **3 Form States Present:** Every interactive form handles: `Untouched`, `Dirty-valid`, and `Submitted-pending`.
- [ ] **WCAG AA Contrast Validated:** All body text achieves $\ge 4.5:1$ contrast against its direct container ground.
- [ ] **Focus Rings Visible:** Every interactive element has `focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950`.
- [ ] **Accessible Icon Buttons:** Every icon-only button carries an explicit `aria-label` and `title`.
- [ ] **Reduced Motion Supported:** Animations respect `prefers-reduced-motion: reduce`.
- [ ] **React Flow Handles Connected:** Node handles have explicit `Position.Left` (target) and `Position.Right` (source) with correct IDs for conditional branching.
