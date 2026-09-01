# AgentFlow — Design DNA & Portable Design System Specification

> **Sector:** Developer-First AI Agent & Workflow Automation Platform (Next.js 15 / React 19 / Tailwind CSS v4 / @xyflow/react)  
> **Visual Identity:** Linear & Raycast Precision Dark Zinc (`#09090b` / `#18181b`) + Electric Violet (`#8b5cf6` / `#7c3aed`)  
> **Aesthetic Tone:** Aerospace flight-control precision, dark high-contrast luminescence, hairline geometry, instant micro-interactions.  
> **Canonical Contract Location:** `./design-system/` (12 artifacts fully compliant with Open Design v2 specification).

---

## 1. Executive Summary & Design DNA

AgentFlow provides an ultra-refined, low-fatigue visual system engineered for automation architects and software engineers. The design language combines deep structural Dark Zinc surfaces with vibrant Electric Violet accents, razor-sharp 1px alpha borders, responsive modular typography, and mathematical WCAG AAA contrast ratios.

### Signature Design Moves
1. **Precision Dark Zinc Canvas (`#09090b` / `#18181b`):** Pure neutral base canvas rejecting muddy brown or washed-out gray tones.
2. **Luminescent Violet Action Accents (`#8b5cf6` / `#7c3aed`):** Dedicated focal color for primary CTAs, active node runs, handle halos, and keyboard focus rings.
3. **Hairline Geometry & Glass Layering:** Multi-tier backdrop filters (`backdrop-blur-xl`, `backdrop-blur-md`) with subtle 1px borders (`rgba(255, 255, 255, 0.08)` to `0.20`).
4. **Monospace Telemetry Alignment:** Seamless pairing of `Geist Sans` with `Geist Mono` / `JetBrains Mono` for live payload viewers, node configs, latency counters, and status badges.
5. **Deterministic Interaction Physics:** High-speed micro-interactions (`150ms cubic-bezier(0.16, 1, 0.3, 1)`) with tactile active states (`scale-[0.98]`).

---

## 2. Core Design Tokens (Overview)

```css
:root {
  /* Canvas & Accent */
  --color-background: #09090b;
  --color-foreground: #fafafa;
  --color-accent: #8b5cf6;
  --color-accent-hover: #7c3aed;
  --color-accent-glow: rgba(139, 92, 246, 0.35);

  /* Functional Semantics */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;
  --color-ai: #a855f7;

  /* Typography Stacks */
  --font-sans: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: "Geist Mono", "JetBrains Mono", "Fira Code", monospace;

  /* Spatial Geometry */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
}
```

---

## 3. Open Design v2 Contract Artifacts

The complete design system package is maintained in `./design-system/`:

| Artifact | Location | Purpose |
| :--- | :--- | :--- |
| `DESIGN.md` | `design-system/DESIGN.md` | Canonical human-readable specification with 9 fixed sections. |
| `design-contract.md` | `design-system/design-contract.md` | Decision record with evidence table, Keep/Change/Do-Not-Copy & P0 gate. |
| `implementation-handoff.md` | `design-system/implementation-handoff.md` | Operational builder instructions with 5 surface + 3 form state rules. |
| `tokens.css` | `design-system/tokens.css` | 4-layer canonical CSS token definitions (`A1`, `A2`, `B`, `C`). |
| `design-tokens.json` | `design-system/design-tokens.json` | W3C DTCG-compliant machine-readable tokens. |
| `tailwind-v4.css` | `design-system/tailwind-v4.css` | Tailwind CSS v4 `@theme` compatibility bridge. |
| `components.html` | `design-system/components.html` | Standalone zero-dependency component fixture. |
| `components.manifest.json` | `design-system/components.manifest.json` | Machine inventory of classes, state selectors, and token mappings. |
| `preview/` | `design-system/preview/*.html` | Self-contained visual preview suite (`colors`, `typography`, `spacing`). |
| `source/` | `design-system/source/*` | Full provenance tracking, scanned files, and token contract report. |
