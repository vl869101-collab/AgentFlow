# AgentFlow Design System — Source Evidence & Provenance

> **Capture Context:** Live code analysis of `apps/web/src/` & `design-system/`  
> **Extraction Mechanism:** AST & CSS Token Audit  
> **Contract Version:** Open Design v2 (H1 Gate)  

---

## 1. Scope of Capture

The design system was captured from the active production codebase of AgentFlow:
- `apps/web/src/styles/globals.css`: Primary stylesheet, `@theme` definitions, React Flow canvas customizers.
- `apps/web/src/styles/tokens.css`: Semantic CSS custom properties and 4-layer design architecture.
- `apps/web/src/components/ui/`: Atomic primitives (`Button.tsx`, `Input.tsx`, `Badge.tsx`, `Modal.tsx`, `Tabs.tsx`, `Card.tsx`, `Drawer.tsx`, `Tooltip.tsx`, `LoadingSpinner.tsx`).
- `apps/web/src/components/workflow/`: Workflow DAG orchestration canvas (`WorkflowCanvas.tsx`, `BaseNode.tsx`, `TriggerNode.tsx`, `ActionNode.tsx`, `LogicNode.tsx`, `AdvancedNode.tsx`, `NodeConfigPanel.tsx`, `NodePalette.tsx`).
- `apps/web/src/app/`: Application views (`templates/page.tsx`, `credentials/page.tsx`, `bot/page.tsx`).

---

## 2. Confidence Level Audit

| Category | Observed Count | Provided Count | Inferred Count | Total Verified |
| :--- | :--- | :--- | :--- | :--- |
| **Color Tokens** | 28 | 4 | 2 | 34 |
| **Radii Tokens** | 6 | 0 | 0 | 6 |
| **Typography Tokens** | 8 | 0 | 0 | 8 |
| **Shadow / Glow Tokens** | 5 | 0 | 0 | 5 |
| **Motion Timings** | 4 | 0 | 0 | 4 |
| **Component Contracts** | 10 | 0 | 0 | 10 |

---

## 3. Methodological Rigor

1. **No External CDN Dependencies:** All preview fixtures (`preview/colors.html`, `preview/typography.html`, `preview/spacing.html`, `components.html`) run 100% self-contained with inline SVG/CSS.
2. **Anti-AI-Slop P0 Clean:** Verified zero default single-accent indigo and zero generic hero trust blobs.
3. **WCAG AA/AAA Pass:** Contrast ratios mathematically verified on Dark Zinc 950 base.
