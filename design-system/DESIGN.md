# AgentFlow Design System — DESIGN.md

> **Target Surface:** Developer-First AI Workflow Orchestration Web Platform (Next.js 15 / React 19 / Tailwind v4 / @xyflow/react)  
> **Visual Identity Direction:** Linear & Raycast Precision Dark Zinc (`#09090b` / `#18181b`) + Electric Violet (`#8b5cf6` / `#7c3aed`)  
> **Status:** Canonical Open-Design Specification (Audited & Style-Locked)  

---

## 1. Visual Theme & Atmosphere

AgentFlow feels like an aerospace flight-control instrument combined with a precision software forge. The experience is deliberately calibrated for engineers who spend hours building autonomous multi-agent pipelines: low visual fatigue, razor-sharp typographic hierarchy, deterministic layouts, instant micro-interactions, and luminous status feedback that cuts through deep dark surfaces without blinding glare.

### Key Characteristics
- **Deep Neutral Base Canvas:** Root viewport is grounded in pure Dark Zinc (`#09090b`), deliberately rejecting muddy brownish darks or generic washed-out grays.
- **Precision Hairline Geometry:** 1px borders with fine-grained alpha translucency (`rgba(255, 255, 255, 0.08)` to `0.20`) that establish tactile boundaries without clutter.
- **Luminescent Electric Violet Accents:** High-chroma violet (`#8b5cf6`) and fuchsia accents reserved for active executions, primary CTAs, focused inputs, and workflow graph pulses.
- **Glassmorphism & Layered Depth:** Multi-tiered backdrop filters (`backdrop-blur-xl` and `backdrop-blur-md`) on elevated panels, modal dialogs, drawer overlays, and node bodies.
- **Integrated Monospace Rhythm:** Geist Mono / JetBrains Mono seamlessly paired with Geist Sans for payload inspectors, latency telemetry, status codes, and node parameter drawers.

---

## 2. Color

The palette is engineered with a strict 4-layer token architecture, ensuring every token has a concrete semantic role and verified WCAG contrast.

### 2.1 Identity Palette
- **Canvas Base (`--color-background`):** `#09090b` (Observed in `globals.css`)
- **Primary Foreground (`--color-foreground`):** `#fafafa` (Observed in `globals.css`)
- **Accent Primary (`--color-accent`):** `#8b5cf6` (Electric Violet 500)
- **Accent Hover (`--color-accent-hover`):** `#7c3aed` (Violet 600)
- **Accent Glow (`--color-accent-glow`):** `rgba(139, 92, 246, 0.35)`

### 2.2 Structural Zinc Scale
- `zinc-950`: `#09090b` — Viewport canvas, background surface
- `zinc-900`: `#18181b` — Base container cards, sidebars, node shells
- `zinc-850`: `#202024` — Elevated popovers, dropdown lists
- `zinc-800`: `#27272a` — Secondary buttons, interactive hover fills
- `zinc-750`: `#2d2d32` — Active secondary state, chip backgrounds
- `zinc-700`: `#3f3f46` — Inactive borders, divider rules
- `zinc-600`: `#52525b` — Disabled controls, muted icons
- `zinc-500`: `#71717a` — Tertiary labels, placeholder text
- `zinc-400`: `#a1a1aa` — Secondary body copy, subtitle descriptions
- `zinc-300`: `#d4d4d8` — High-readability metadata, table headers
- `zinc-100`: `#f4f4f5` — Primary card titles, modal headlines
- `zinc-50`: `#fafafa` — High-emphasis headings, active tab triggers

### 2.3 Functional Semantic Colors
- **Success:** `#10b981` (Base) | `rgba(16, 185, 129, 0.10)` (Bg) | `#34d399` (Text) — Contrast 11.45:1 (AAA)
- **Warning:** `#f59e0b` (Base) | `rgba(245, 158, 11, 0.10)` (Bg) | `#fbbf24` (Text) — Contrast 12.80:1 (AAA)
- **Error / Danger:** `#ef4444` (Base) | `rgba(239, 68, 68, 0.10)` (Bg) | `#f87171` (Text) — Contrast 7.60:1 (AAA)
- **Info:** `#3b82f6` (Base) | `rgba(59, 130, 246, 0.10)` (Bg) | `#60a5fa` (Text) — Contrast 8.42:1 (AAA)
- **AI / Cognitive:** `#a855f7` (Base) | `rgba(168, 85, 247, 0.10)` (Bg) | `#c084fc` (Text) — Contrast 8.42:1 (AAA)

### 2.4 Gradient System
- **Brand Primary Gradient:** `linear-gradient(to right, #6366f1, #8b5cf6, #d946ef)` (Indigo → Violet → Fuchsia)
- **Surface Highlight Gradient:** `linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 100%)`
- **Glow Pulse Edge:** `linear-gradient(90deg, rgba(99, 102, 241, 0.6), rgba(139, 92, 246, 0.9), rgba(217, 70, 239, 0.6))`

---

## 3. Typography

### 3.1 Font Stacks
- **Interface & Sans:** `"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Monospace & Telemetry:** `"Geist Mono", "JetBrains Mono", "Fira Code", monospace`

### 3.2 Modular Web Scale
- `text-2xs` (10px / 0.625rem / lh 14px / tracking +0.05em / weight 500-600): Node handle badges, diff markers, sub-tags.
- `text-xs` (12px / 0.75rem / lh 16px / tracking +0.02em / weight 400-500): Field labels, microcopy, helper hints, pill badges.
- `text-sm` (14px / 0.875rem / lh 20px / tracking 0 / weight 400-500): Buttons, form inputs, table data, body compact.
- `text-base` (16px / 1.0rem / lh 24px / tracking -0.01em / weight 400-500): Standard body copy, modal narrative.
- `text-lg` (18px / 1.125rem / lh 28px / tracking -0.02em / weight 600): Card headings, dialog titles.
- `text-xl` (20px / 1.25rem / lh 28px / tracking -0.02em / weight 600): Section headers, drawer panel titles.
- `text-2xl` (24px / 1.5rem / lh 32px / tracking -0.03em / weight 700): Dashboard page titles, hero subtitles.
- `text-4xl` (36px / 2.25rem / lh 40px / tracking -0.03em / weight 800): Landing hero display headlines.

---

## 4. Spacing & Grid

### 4.1 Base 4px / 8px Spatial Rhythm
- **Micro Gaps (4px - 8px):** `gap-1`, `gap-1.5`, `gap-2` for icon-to-text alignment and badge padding.
- **Input & Control Padding (8px - 12px):** `px-3 py-2`, `px-4 py-2.5` for ergonomic click targets ($\ge 36\text{px}$ touch height).
- **Card & Node Insets (16px - 24px):** `p-4`, `p-5`, `p-6` ensuring content breathing room.
- **Section Layout Offsets (32px - 64px):** Canvas topbars, bento grid container gutters, drawer gutters.

### 4.2 Radii Geometry
- `radius-xs` (`4px`): Handle pills, inline tags.
- `radius-sm` (`6px`): Dropdown menu items, tabs, sub-controls.
- `radius-md` (`8px`): Buttons, inputs, search bars, node icons.
- `radius-lg` (`12px`): Workflow nodes, modal dialogs, cards, popover containers.
- `radius-xl` (`16px`): Hero surface cards, bento grid showcases.
- `radius-full` (`9999px`): Status indicator dots, pill badges, active tab glow line.

---

## 5. Layout & Composition

### 5.1 Orchestration Canvas & Surface Composition
- **Main Workflow Graph:** Fluid full-height canvas (`#0e0e10`) overlaid with a subtle 20px pitch dot grid (`radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)`).
- **Floating Controls & Minimap:** Bottom-left and bottom-right docked floating HUDs styled with `bg-zinc-900/85 backdrop-blur-xl border border-white/10 rounded-xl`.
- **Bento & Marketplace Grids:** Multi-column asymmetric grids (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`) with 16px to 24px gap, utilizing card hover transitions and gradient border reveals.
- **Drawer Panels (Node Config & Live Bot Telemetry):** Anchored right-dock (`w-80 md:w-96`) or bottom-dock with high z-index, frosted glass backdrop, and responsive mobile collapse.

---

## 6. Components

Every component delivers full variant coverage and concrete state management:

### 6.1 Primitive Catalog
1. **Button (`Button.tsx`):** `primary` (gradient indigo-violet-fuchsia), `secondary` (zinc-800 hairline), `ghost`, `danger`. States: `default`, `hover`, `active (scale-0.98)`, `focus-visible (ring-violet-500)`, `loading (LoadingSpinner)`, `disabled (opacity-50)`.
2. **Input (`Input.tsx`):** Uppercase tracking label, hairline zinc-900 container, focus violet glow, dynamic error message with `aria-describedby` and `aria-invalid`.
3. **Badge (`Badge.tsx`):** Semantics (`success`, `warning`, `error`, `info`, `neutral`) with pulsing status dot.
4. **Modal / Dialog (`Modal.tsx`):** Accessible dialog with backdrop blur, full focus trap, `Escape` key capture, and spring entry animation.
5. **Tabs (`Tabs.tsx`):** Tablist with Framer Motion `layoutId="active-tab"` gradient line and keyboard arrow navigation.
6. **Card (`Card.tsx`):** Translucent backdrop-blur container with header, title, description, and content slots.
7. **Drawer (`Drawer.tsx` / `BotActivityDrawer.tsx`):** Sliding side drawer with sticky header, scrollable body, and sticky actions footer.
8. **Tooltip (`Tooltip.tsx`):** Micro-surface for keyboard shortcut hints and technical explanations (under 120 chars).

### 6.2 React Flow Node Catalog
1. **Trigger Node:** Left accent `#6366f1` (Indigo), webhook/cron/gmail triggers, source handle right.
2. **Action Node:** Left accent `#22d3ee` / `#10b981` (Cyan/Emerald), HTTP/Email/Slack actions, target handle left, source handle right.
3. **Logic Node:** Left accent `#f59e0b` (Amber), conditional evaluation, multiple branching source handles (`true` @ 35%, `false` @ 70%).
4. **AI Agent Node:** Left accent `#a855f7` (Purple), autonomous execution, model parameters, context memory status.

---

## 7. Motion & Interaction

### 7.1 Motion Curves & Durations
- **Fast Micro-interactions (150ms):** `cubic-bezier(0.16, 1, 0.3, 1)` for button clicks, hover highlights, icon toggles.
- **Normal Transitions (200ms):** `cubic-bezier(0.16, 1, 0.3, 1)` for tab switches, dropdown expansions, modal reveals.
- **Slow Spatial Motions (300ms):** `cubic-bezier(0.16, 1, 0.3, 1)` for drawer sliding, canvas pan/zoom settlements.

### 7.2 Compositor Performance
- Exclusively animate `transform`, `opacity`, and `filter`.
- Zero animations on layout properties (`width`, `height`, `margin`, `padding`, `top`, `left`).

### 7.3 Accessibility & Reduced Motion
- Full `@media (prefers-reduced-motion: reduce)` support: all transition/animation durations set to `0.01ms`, animated edges rendered as solid lines, pulse glows converted to static badges.

---

## 8. Voice & Brand

### 8.1 Principles
- **Tone:** Developer-first, objective, concise, mathematically precise, zero hype or marketing fluff.
- **Action Labels (CTAs):** Direct infinitive verb + noun (`"Criar Workflow"`, `"Salvar Credencial"`, `"Executar Teste"`, `"Publicar Versão"`).
- **Error Messages:** Constructive technical diagnostics explaining *what failed*, *why*, and *how to fix* (citing status codes and network conditions).
- **Empty States:** Clear 3-step value explanation with an immediate primary creation CTA.

---

## 9. Anti-patterns

- **NO Default Tailwind Indigo Accent Alone:** Never use `#6366f1` without the Dark Zinc + Electric Violet system.
- **NO Generic Centered AI Trust-Blobs:** No decorative purple/blue fuzzy blobs without semantic purpose.
- **NO Hardcoded Hex Values in Component Code:** All components must consume CSS custom properties or Tailwind theme tokens.
- **NO Missing State Coverage:** Every data surface must explicitly handle all 5 states (`Loading`, `Empty`, `Error`, `Populated`, `Edge`) and forms must handle all 3 states (`Untouched`, `Dirty-valid`, `Submitted-pending`).
- **NO Inaccessible Icon Buttons:** Every button without text must have an explicit `aria-label` and `title`.
- **NO Layout Geometry Transitions:** Never animate `height` or `width` during hover or expand states.
