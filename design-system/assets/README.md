# AgentFlow Design System — Vector Iconography & Visual Asset Inventory

> **Format:** 100% Crisp Vector / Lucide React v0.511.0 + Native SVG & CSS  
> **Aesthetic Standard:** Zero blurry rasters, zero AI-slop stock art, razor-sharp high-DPI rendering  

---

## 1. Vector Logo Specification

The AgentFlow brand mark is rendered as a precision SVG glyph: an interconnected triple-node DAG representing autonomous agent flows.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
  <defs>
    <linearGradient id="af-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="50%" stop-color="#8b5cf6" />
      <stop offset="100%" stop-color="#d946ef" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="8" fill="#18181b" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
  <circle cx="9" cy="16" r="3" fill="#6366f1"/>
  <circle cx="23" cy="10" r="3" fill="#8b5cf6"/>
  <circle cx="23" cy="22" r="3" fill="#d946ef"/>
  <path d="M12 16h8M12 16l8-6M12 16l8 6" stroke="url(#af-grad)" stroke-width="1.5" stroke-linecap="round"/>
</svg>
```

---

## 2. Master Iconography Matrix

| Surface / Domain | Lucide Icon Identifier | Visual Role | Semantic Color Token |
| :--- | :--- | :--- | :--- |
| **Trigger Node** | `Zap`, `Webhook`, `Clock`, `Mail` | Event listener & entry point | `#6366f1` (Indigo-500) |
| **Action Node** | `Globe`, `Send`, `Database`, `FileText` | Outbound external action | `#22d3ee` / `#10b981` (Cyan / Emerald) |
| **Logic Node** | `GitBranch`, `Filter`, `Split`, `Hourglass` | Conditional execution branch | `#f59e0b` (Amber-500) |
| **AI Agent Node** | `Bot`, `Sparkles`, `Cpu`, `Layers` | Autonomous intelligence loop | `#a855f7` (Purple-500) |
| **Vault / Credential** | `Key`, `Shield`, `Lock`, `Eye`, `EyeOff` | Secret masking & encryption | `#8b5cf6` (Violet-500) |
| **Telemetry / Status** | `CheckCircle2`, `AlertTriangle`, `XCircle`, `Loader2` | Execution lifecycle feedback | Semantic Status Palette |
| **Navigation** | `Home`, `LayoutGrid`, `FolderTree`, `Sliders`, `Search` | Application viewport routing | `#a1a1aa` (Zinc-400) |
