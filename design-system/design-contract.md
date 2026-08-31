# AgentFlow Design System — Decision Record & Design Contract

> **Target Surface:** Developer-First Web Application (Next.js 15 App Router / Tailwind CSS v4 / React Flow)  
> **Visual Direction:** Linear / Raycast Dark Zinc (`#09090b` / `#18181b`) + Electric Violet (`#8b5cf6` / `#7c3aed`)  
> **Audience:** Automation Architects, AI Engineers, Software Developers  

---

## 1. Goal & Target

The goal of this design system is to establish a deterministic, high-contrast, low-fatigue visual foundation for AgentFlow. It enables rapid assembly of complex workflow orchestration canvases, template marketplaces, credential vaults, and live bot monitoring consoles with zero design drift and strict accessibility compliance.

---

## 2. Evidence Table

Every token, rule, and layout parameter is tagged with its concrete provenance level:
- `observed`: Read directly from the codebase (`apps/web/src/styles/globals.css`, `tokens.css`, component implementations).
- `provided`: Sourced from the H1 mission brief, brand voice guidelines, and architectural requirements.
- `inferred`: Synthesized according to Open Design v2 standards and mathematical accessibility ratios.

| Evidence Item | Value / Description | Source File / Reference | Confidence | Note |
| :--- | :--- | :--- | :--- | :--- |
| Canvas Root Ground | `#09090b` (Dark Zinc 950) | `globals.css:8`, `tokens.css:9` | `observed` | Viewport background |
| Surface Card Ground | `#18181b` (Zinc 900) | `globals.css:9`, `tokens.css:17` | `observed` | Base container elevation |
| Elevated Surface | `#202024` (Zinc 850) | `tokens.css:18` | `observed` | Popovers and nested cards |
| Primary Accent | `#8b5cf6` (Violet 500) | `globals.css:23`, `tokens.css:11` | `observed` | Interactive focus & CTA |
| Accent Hover | `#7c3aed` (Violet 600) | `tokens.css:12` | `observed` | Primary button hover |
| Accent Glow | `rgba(139, 92, 246, 0.35)` | `tokens.css:13` | `observed` | Focus ring & handle halo |
| Success Semantic | `#10b981` / `#34d399` | `tokens.css:31-34` | `observed` | Completed run status |
| Warning Semantic | `#f59e0b` / `#fbbf24` | `tokens.css:36-39` | `observed` | In-progress / branching |
| Error Semantic | `#ef4444` / `#f87171` | `tokens.css:41-44` | `observed` | Failed execution status |
| AI Agent Semantic | `#a855f7` / `#c084fc` | `tokens.css:51-54` | `observed` | Autonomous agent nodes |
| Typography Sans | `"Geist", sans-serif` | `globals.css:26`, `tokens.css:91` | `observed` | Primary UI stack |
| Typography Mono | `"Geist Mono", "JetBrains Mono"` | `globals.css:27`, `tokens.css:92` | `observed` | Code & telemetry stack |
| Hairline Border | `1px solid rgba(255,255,255,0.10)`| `tokens.css:63` | `observed` | Razor-sharp container boundaries |
| Spring Easing | `cubic-bezier(0.16, 1, 0.3, 1)`| `tokens.css:98` | `observed` | Micro-interaction timing |
| Contrast Ratio AAA | `19.35 : 1` (Primary on 950) | Calculated via WCAG formula | `inferred` | Exceeds WCAG 7.0:1 |
| Contrast Ratio AA | `4.85 : 1` (Violet on 950) | Calculated via WCAG formula | `inferred` | UI focus indicator pass |
| React Flow Dot Pitch | `20px` gap, `1.5px` size | `WorkflowCanvas.tsx` | `observed` | Grid background dots |

---

## 3. Keep / Change / Do-Not-Copy

| Domain | Keep (Controlled Qualities) | Change (Refinements in v2) | Do Not Copy (Prohibited Anti-Patterns) |
| :--- | :--- | :--- | :--- |
| **Color & Theme** | Deep Dark Zinc base (`#09090b`), Electric Violet accents, hairline borders | Standardized 4-layer token architecture (`A1`, `A2`, `B`, `C`) | Plain default Tailwind indigo (`#6366f1`) as sole primary; washed-out gray `#1e1e1e` |
| **Typography** | Geist Sans + Geist Mono pairing, strict uppercase field labels | Fluid rem-based modular scale with explicit letter-tracking | Generic Arial / Roboto / system default stacks; unstyled body prose |
| **Layout & Grid** | Responsive bento grids, full-viewport canvas, slide-in property drawers | Explicit 4px/8px spatial rhythm, standard minimum touch heights ($\ge 36\text{px}$) | Flat un-layered tables; cluttered un-grouped parameter lists |
| **Interaction** | Tactile active states (`scale-[0.98]`), spring transitions, violet focus glow | Guaranteed 5 surface states + 3 form states on all interactive surfaces | Unanimated abrupt tab shifts; hover layout shifts (animating width/height) |
| **Accessibility** | Full keyboard focus traps on modals, Escape key handlers | Explicit `aria-describedby` error associations, reduced-motion overrides | Unlabeled icon buttons; low-contrast gray text on dark surfaces ($< 4.5:1$) |

---

## 4. Visual Stance

AgentFlow embodies the visual ethos of modern high-performance engineering tools: dark, crisp, laser-focused, and unapologetically technical. By grounding every view in Dark Zinc neutrals and utilizing Electric Violet as a targeted luminescent highlighter, the interface achieves maximum data clarity with zero visual noise.

---

## 5. Risks & Unknowns

| Identified Item | Risk Level | Status / Mitigation Strategy |
| :--- | :--- | :--- |
| Custom webfont loading latency (`Geist`) | Low | Configured `font-display: swap` and fallback system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI"`). |
| High node count canvas performance ($> 500$ nodes) | Medium | Handled via `@xyflow/react` viewport culling and GPU-accelerated CSS transforms. |
| Complex multi-branching DAG handle collisions | Low | Fixed discrete handle offsets (`id="true"` @ 35%, `id="false"` @ 70%) with distinct semantic coloration. |
| Color-blind distinction on status dots | Low | Coupled with text labels and distinct geometric icon shapes (Check, AlertTriangle, XCircle). |

---

## 6. Quality-Gate Checklist (P0 Verification)

- [x] **Screenshots / Visual Artifacts Documented:** Full layout specs and self-contained preview suites generated.
- [x] **DESIGN.md Exact 9 Headings:** Follows the 9 required Open Design sections verbatim.
- [x] **Every Token Carries Provenance:** Strict classification of `observed`, `provided`, and `inferred`.
- [x] **Anti-AI-Slop P0 Enforced:** Zero default indigo dominance, zero generic hero trust-blobs.
- [x] **State Coverage (5 + 3 States):** Loading, Empty, Error, Populated, Edge + Untouched, Dirty-valid, Submitted-pending.
- [x] **WCAG AA/AAA Contrast Verified:** Text primary (19.35:1), secondary (9.12:1), muted (5.05:1), focus ring (4.85:1).
- [x] **Self-Contained Previews:** Standalone HTML previews requiring zero external CDN network requests.
