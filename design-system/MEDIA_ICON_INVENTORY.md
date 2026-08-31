# AgentFlow — Media & Iconography Inventory

> **Document Status:** Gate H1 Approved / Asset Audit Completed  
> **Scope:** Design System Core, Workflow Canvas, Templates Marketplace, Credentials Vault Modal  
> **Reference:** `design-system/DNA_DESIGN_SYSTEM.md`  

---

## 1. Executive Summary & Inventory Conclusion

Following the comprehensive audit of the AgentFlow platform (`@agentflow/web`), all visual iconography and media requirements across the 4 key functional areas are **100% resolved natively** through:
1. **Installed Vector Icon Library:** `lucide-react` (v0.511.0) providing clean, resolution-independent SVG glyphs with customizable stroke, size, and accessible ARIA attributes.
2. **Deterministic CSS Tokens & Micro-Graphics:** Native Tailwind CSS v4 custom properties for category borders, handles, status dots, diff markers, and brand gradients (`linear-gradient(to right, #6366f1, #8b5cf6, #d946ef)`).
3. **Typography & Code Glyphs:** Monospace glyphs (`Geist Mono` / `JetBrains Mono`) for node operators, handles, and diff tags.

**Conclusion:** **Zero new raster/AI-generated image files are required.** Generating bitmap/diffusion assets for UI icons would introduce visual anti-patterns, blurriness on Retina/High-DPI displays, and violate Rule 4 of the Design System DNA (*"Texto e ícones nítidos no código/vetor"*).

---

## 2. Area-by-Area Media & Iconography Matrix

### 2.1 Workflow Canvas & React Flow Nodes
| Component / Context | Visual Need | Implementation & Resolution | Asset Status |
| :--- | :--- | :--- | :--- |
| **Node Palette Header** | AI assist / search | `Sparkles`, `Search`, `GripVertical`, `ChevronDown` (`lucide-react`) | Reused from Lucide |
| **Node Icons (Palette)** | Visual category indicators | Unicode & Lucide vector glyphs with semantic background pills (`bg-indigo-500/10`, `bg-cyan-500/10`, etc.) | Native CSS + Vector |
| **Trigger Nodes** | Ingestion & scheduling triggers | Left accent border `border-l-indigo-500` + `lucide-react` (`Webhook`, `Clock`, `Mail`) | Native CSS + Vector |
| **Action Nodes** | HTTP, APIs & connectors | Left accent border `border-l-cyan-400` + `lucide-react` (`Globe`, `Send`, `Table`, `FileText`) | Native CSS + Vector |
| **Logic & Flow Control** | Branching & conditionals | Left accent border `border-l-amber-400` + `lucide-react` (`GitFork`, `Shuffle`, `Filter`) | Native CSS + Vector |
| **AI Agent Nodes** | LLM / Cognitive agents | Left accent border `border-l-purple-500` + `lucide-react` (`Sparkles`, `Bot`, `Cpu`) with halo glow | Native CSS + Vector |
| **Node Handles & Edges** | Connectors & glow | Hairline SVG edges (`#8b5cf6`), animated dash strokes, and radial handle dots | Native React Flow SVG |

### 2.2 Templates Marketplace (`apps/web/src/app/templates/page.tsx`)
| Component / Context | Visual Need | Implementation & Resolution | Asset Status |
| :--- | :--- | :--- | :--- |
| **Marketplace Hero Banner** | Atmosphere & category badges | Translucent atmospheric gradient (`bg-gradient-to-tr from-violet-600/20 to-indigo-500/20 blur-[100px]`) + `Sparkles` | Native CSS radial glow |
| **Category Navigation Pills** | Category taxonomy icons | `Sparkles` (AI & RAG), `Zap` (Vendas/CRM), `Globe` (Suporte), `Code2` (DevOps), `Flame` (Marketing) | Reused from Lucide |
| **Template Cards** | Template icon badges | Dynamic tinted square containers (`bg-[#color]15 border-[#color]35`) with vector `Zap` / connector glyphs | Native CSS + Vector |
| **Connector Tags** | 3rd-party integration tags | Semantic badge with emerald dot indicator + text label (Slack, Drive, Stripe, Jira, etc.) | Native CSS pill badge |
| **Card Metadata** | Node count & setup time | `Layers` (`lucide-react`) + `Clock` (`lucide-react`) | Reused from Lucide |
| **Preview & Actions** | View graph / clone | `Eye`, `Upload`, `Plus`, `Search`, `Download` (`lucide-react`) | Reused from Lucide |

### 2.3 Credentials Vault Modal (`apps/web/src/app/credentials/page.tsx`)
| Component / Context | Visual Need | Implementation & Resolution | Asset Status |
| :--- | :--- | :--- | :--- |
| **Credential Row Icons** | App/Vault type identifier | Rounded square container with `KeyRound` (`lucide-react`) in `text-violet-400` | Reused from Lucide |
| **Live Verification Status** | Test connection states | `CheckCircle2` (Emerald-400), `XCircle` (Rose-400), `Loader2` (Spinning), `Zap` (Amber-400) | Reused from Lucide |
| **Modal Header & Search** | App filter dropdown | `Search`, `ChevronDown`, `X` (`lucide-react`) | Reused from Lucide |
| **Connection Form Tabs** | Navigation tabs & assistance | `Sparkles` (Ask AI Assistant), `ExternalLink` (OAuth connect), `Shield` (AES-256 badge) | Reused from Lucide |
| **Secret Visibility** | Mask / Unmask API Keys | `Eye`, `EyeOff` (`lucide-react`) with accessible `aria-label` | Reused from Lucide |
| **Sharing & Owner Avatars** | Team sharing identifier | Gradient circle badge (`from-violet-600 to-cyan-500`) with high-contrast text initials | Native CSS Gradient Avatar |
| **Account Details Payload** | Structured response keys | `User`, `Building`, `Clock`, `Shield`, `Info` (`lucide-react`) | Reused from Lucide |

### 2.4 Design System Core & Primitives (`design-system/DNA_DESIGN_SYSTEM.md`)
| Component / Context | Visual Need | Implementation & Resolution | Asset Status |
| :--- | :--- | :--- | :--- |
| **Button States** | Loading spinner & actions | `LoadingSpinner` SVG primitive with stroke animation | Native Component |
| **Badge Indicators** | Status indicator dots | `h-1.5 w-1.5 rounded-full` in emerald/amber/red/purple/neutral | Native CSS |
| **Modal Overlays** | Backdrop depth | `backdrop-blur-xl` + `bg-black/60` | Native CSS |
| **Active Tab Line** | Smooth layout animation | Framer Motion `layoutId="active-tab"` with gradient stroke | Native Framer Motion |

---

## 3. Decision Rationale & Compliance

1. **Reusability & Performance:** The application already includes `@lucide-react` (0.511.0) with zero runtime network overhead, instant tree-shaking, and zero external asset requests.
2. **Theme Consistency & Dark Zinc DNA:** All icons adhere to the Dark Zinc (`#09090b` / `#18181b`) + Electric Violet (`#8b5cf6`) color scheme with precise contrast ratios ($\ge 4.85:1$ to $19.35:1$), fulfilling WCAG AA / AAA.
3. **No External Asset Dependencies:** No external third-party CDN images or uncompressed PNG assets are utilized, ensuring high reliability, offline resilience, and immediate rendering.
