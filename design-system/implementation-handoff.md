# AgentFlow Design System — Implementation Handoff Guide

> **Recipient:** Frontend Engineer / Builder Agent  
> **Source:** Design Scout & Design System Architecture Team  
> **Status:** Final Production Specification  

---

## 1. Quick Start & Files to Consume

Consume the design system directly from these canonical files:

1. **Tokens & Theme:**
   - Canonical CSS tokens: `design-system/tokens.css` (imported in `apps/web/src/styles/globals.css`).
   - Tailwind v4 theme bridge: `design-system/tailwind-v4.css`.
   - Machine tokens manifest: `design-system/design-tokens.json`.

2. **Component & Layout Reference:**
   - Master Component Fixture: `design-system/components.html`.
   - Component Machine Manifest: `design-system/components.manifest.json`.
   - Visual Previews: `design-system/preview/colors.html`, `design-system/preview/typography.html`, `design-system/preview/spacing.html`.

3. **Guidelines & Copy:**
   - Visual Architecture: `design-system/DESIGN.md`.
   - Microcopy & Voice: `design-system/BRAND_VOICE_GUIDELINES.md`.
   - Media & Icon Inventory: `design-system/MEDIA_ICON_INVENTORY.md`.

---

## 2. Binding Constraints for Builder

### 2.1 Color & Surface Rules
- **Base Canvas:** Always use `#09090b` (`bg-zinc-950` or `var(--color-background)`).
- **Cards & Node Shells:** Always use `bg-zinc-900/80` or `bg-zinc-900` with `border border-white/10` and `backdrop-blur-xl`.
- **Primary CTA:** Use linear gradient `bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white font-medium shadow-md shadow-violet-500/20 hover:opacity-90 active:scale-[0.98]`.
- **Focus Rings:** Always apply `focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 outline-none`.

### 2.2 Typography Rules
- **Display & Interface:** Use `font-sans` (`Geist`).
- **Telemetry, Code, Node Configs, Metrics:** Use `font-mono` (`Geist Mono` / `JetBrains Mono`).
- **Field Labels:** Always use `text-xs font-medium text-zinc-400 uppercase tracking-wider`.

### 2.3 Motion Rules
- Fast interactions (150ms): `transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]`.
- Modal/Drawer entries (200ms - 300ms): Use Framer Motion or compositor-only CSS transforms (`opacity`, `transform`, `filter`).
- Always respect `@media (prefers-reduced-motion: reduce)`.

---

## 3. Mandatory State Coverage Checklist

Every interactive data view built in `apps/web/` must explicitly implement:

### 3.1 Five Surface States
1. **Loading:** Skeleton loader or `LoadingSpinner` with disabled interactions.
2. **Empty:** High-clarity 3-step value proposition + primary creation action button.
3. **Error:** Clear technical diagnosis + retry action button + error code.
4. **Populated:** Dense, readable, high-contrast tabular or card data.
5. **Edge:** Long strings truncated with ellipsis, extreme viewport adaptation, scroll boundaries.

### 3.2 Three Form States
1. **Untouched:** Neutral placeholders, subtle hairline borders.
2. **Dirty-valid:** High-contrast input text, active submit button enabled.
3. **Submitted-pending:** Form fields locked, submit button showing loading spinner.

---

## 4. Acceptance Criteria for First Artifact

The first artifact created by the builder must prove:
1. Zero hardcoded colors outside of `tokens.css` / Tailwind tokens.
2. Complete WCAG AA compliance with visible keyboard focus rings on all interactive controls.
3. Node configuration drawer cleanly sliding from right with zero horizontal viewport shift.
4. React Flow node handles connecting seamlessly with glowing violet hover states.
