# AgentFlow Frontend — Complete Build Task

## Project Location
`C:\Users\VICTOR\Downloads\Claude Code\AgentFlow`

## What Exists Already (Foundation)
The monorepo is set up. Your work goes in `apps/web/`.

Existing packages you can import:
- `@agentflow/shared` — Zod schemas, types, enums, node type definitions
- `@agentflow/database` — Prisma client (types available)

Key files to read first:
- `packages/shared/src/index.ts` — all types, schemas, enums, NODE_TYPES constant
- `tsconfig.base.json` — base TypeScript config
- `.env.example` — environment variables

## Tech Stack for apps/web
- **Next.js 14+** (App Router)
- **React 18+** with TypeScript strict
- **Tailwind CSS v4** 
- **React Flow** (`@xyflow/react` v12) for the visual workflow editor
- **Framer Motion** for animations
- **Lucide React** for icons
- **Geist** font (from Vercel)

## Design System — Dark Premium Glassmorphism

### Colors
- Background: `#09090b` (zinc-950)
- Surface: `#18181b` (zinc-900) with `backdrop-blur-xl` and `bg-white/5`
- Card: `#27272a` (zinc-800) border `border-white/10`
- Primary gradient: `from-indigo-500 via-violet-500 to-fuchsia-500`
- Text primary: `#fafafa` (zinc-50)
- Text secondary: `#a1a1aa` (zinc-400)
- Success: `#22c55e`
- Warning: `#f59e0b`
- Error: `#ef4444`
- Border: `border-white/10`

### Typography
- Font: Geist Sans
- Headings: font-semibold tracking-tight
- Body: text-sm text-zinc-400

### Components Style
- Cards: `bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-xl`
- Buttons: gradient bg with hover glow effect
- Inputs: `bg-zinc-900 border border-white/10 rounded-lg focus:ring-2 focus:ring-violet-500`
- Sidebar: fixed left, collapsible, dark with hover highlights

## Screens to Build (13 total)

### 1. Landing Page (`/`)
Modern SaaS landing page with:
- **Navbar**: Logo + nav links + CTA button (gradient)
- **Hero**: Large gradient heading "Automate Anything with AI", subtitle, CTA buttons, and a mockup/illustration of the workflow editor
- **Logos bar**: "Trusted by" with placeholder company logos
- **Features section**: 6 feature cards in a grid (AI-Powered, Visual Editor, 8+ Integrations, Smart Retries, Team Collaboration, Real-time Monitoring) — each with an icon, title, description
- **How it works**: 3 steps (Describe → Build → Automate) with numbered cards
- **Pricing**: 3 tiers (Free $0, Pro $29/mo, Enterprise custom) with feature lists and CTA
- **CTA section**: "Ready to automate?" with gradient background
- **Footer**: Links, social icons, copyright

### 2. Login (`/login`)
- Email + password form
- "Forgot password?" link
- "Sign up" link
- Gradient submit button
- Clean centered card layout

### 3. Register (`/register`)
- Name + email + password + confirm password
- Terms checkbox
- Gradient submit button
- "Already have account?" link

### 4. Forgot Password (`/forgot-password`)
- Email input
- Submit button
- Success message state

### 5. Dashboard (`/dashboard`)
- **Stats row**: 4 cards (Total Workflows, Active Workflows, Executions This Month, Success Rate) with icons and values
- **Recent executions table**: Workflow name, status badge, duration, date, expand button
- **Quick actions**: Create Workflow, View All, Settings
- **Usage meter**: Progress bar showing executions vs plan limit

### 6. Workflow List (`/workflows`)
- **Header**: "Workflows" title + "Create Workflow" button (gradient)
- **Search bar** with filter dropdown (status: all, active, draft, archived)
- **Grid/List toggle**
- **Workflow cards** (grid mode): Name, status badge (colored dot + text), last execution, node count, actions (edit, duplicate, archive, delete)
- **Empty state**: Illustration + "Create your first workflow" CTA

### 7. Workflow Editor (`/workflows/[id]/editor`) — MOST IMPORTANT
This is the core of the product. Build it carefully.

- **Top bar**: Workflow name (editable), Save button, Execute button (gradient), Back button
- **Left panel (node palette)**: Draggable node types grouped by category:
  - Triggers: Webhook, Schedule
  - Actions: HTTP Request, Send Email, Discord, Telegram, Google Sheets
  - Logic: Condition, Transform, Delay
  - Advanced: AI Agent, Approval
- **Center (React Flow canvas)**: 
  - Custom node components with glassmorphism styling
  - Each node shows: icon, label, status indicator
  - Colored border per node type (use NODE_TYPES from shared)
  - Animated connections between nodes
  - MiniMap in corner
  - Controls (zoom in/out/fit)
- **Right panel (node config)**: 
  - Appears when a node is selected
  - Dynamic form based on node type
  - Fields for config, test connection button
  - Delete node button
- **Background**: Subtle dot grid pattern

### 8. Execution History (`/executions`)
- Table with columns: Workflow, Status (badge), Trigger, Duration, Date, Actions
- Status badges: Running (blue pulse), Success (green), Failed (red), Pending (yellow)
- Filter by status and date range
- Pagination

### 9. Execution Detail (`/executions/[id]`)
- **Header**: Workflow name, status, duration, trigger type
- **Timeline view**: Vertical timeline showing each node execution in order
  - Node name, status icon, duration, expand for logs
  - Error details in red if failed
- **AI Explain button**: "Explain this error" — calls AI endpoint
- **Input/Output panels**: JSON viewer for execution input and output

### 10. Credentials (`/credentials`)
- **List**: Cards showing credential name, provider badge, type, created date, actions
- **Add credential modal**: Name, type dropdown, provider dropdown, dynamic fields based on type
- **Security indicator**: "Encrypted with AES-256" badge
- **Masked values**: Show `••••••••` with reveal toggle

### 11. Approvals (`/approvals`)
- **Pending queue**: Cards with workflow name, request context, requester, time
- **Action buttons**: Approve (green) / Reject (red) with optional message
- **Empty state**: "No pending approvals" with check icon

### 12. Settings (`/settings`)
- **Tabs**: General, Team, Billing, Usage
- **General**: Org name, logo upload, slug
- **Team**: Members list with role badges, invite form, remove button
- **Billing**: Current plan, Stripe integration, upgrade/downgrade buttons
- **Usage**: Execution count this month, API calls, storage, progress bars vs limits

### 13. AI Generator (Modal — triggered from workflow list or editor)
- Text area: "Describe what you want to automate..."
- Example prompts as chips
- "Generate" button with loading state
- Preview of generated workflow nodes
- "Use this workflow" → opens in editor

## File Structure for apps/web
```
apps/web/
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── postcss.config.js
├── public/
├── src/
│   ├── app/
│   │   ├── layout.tsx          (root layout with Geist font, dark theme)
│   │   ├── page.tsx            (landing page)
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── workflows/
│   │   │   ├── page.tsx        (list)
│   │   │   └── [id]/
│   │   │       └── editor/page.tsx
│   │   ├── executions/
│   │   │   ├── page.tsx        (list)
│   │   │   └── [id]/page.tsx   (detail)
│   │   ├── credentials/page.tsx
│   │   ├── approvals/page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── AppLayout.tsx
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Tabs.tsx
│   │   │   ├── Progress.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   └── LoadingSpinner.tsx
│   │   ├── workflow/
│   │   │   ├── nodes/          (custom React Flow nodes)
│   │   │   ├── NodePalette.tsx
│   │   │   ├── NodeConfigPanel.tsx
│   │   │   ├── WorkflowCanvas.tsx
│   │   │   └── AIGeneratorModal.tsx
│   │   └── landing/
│   │       ├── Hero.tsx
│   │       ├── Features.tsx
│   │       ├── HowItWorks.tsx
│   │       ├── Pricing.tsx
│   │       └── Footer.tsx
│   ├── lib/
│   │   ├── api.ts              (API client)
│   │   ├── auth.ts             (auth helpers)
│   │   └── utils.ts            (cn helper, formatters)
│   └── styles/
│       └── globals.css         (Tailwind imports + custom styles)
```

## CRITICAL RULES
1. **ALL files must be complete** — no "// TODO", no placeholder functions, no truncation
2. **Every component must be fully implemented** with real UI, real styling, real interactions
3. **Use mock data** where API isn't connected yet — hardcode realistic sample data
4. **Responsive** — works on mobile and desktop
5. **Every screen listed above MUST exist** — do not skip any
6. **Glassmorphism everywhere** — `backdrop-blur-xl`, `bg-white/5`, `border-white/10`
7. **Gradient accents** on primary buttons and key elements
8. **Animate on hover** — subtle scale/opacity transitions
9. **Import types from `@agentflow/shared`** where applicable
10. **The workflow editor is the STAR** — spend extra time making it beautiful and functional

## Dependencies to Install
```json
{
  "next": "^15.0.0",
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "@xyflow/react": "^12.0.0",
  "framer-motion": "^12.0.0",
  "lucide-react": "^0.460.0",
  "clsx": "^2.1.0",
  "tailwind-merge": "^2.6.0",
  "class-variance-authority": "^0.7.0"
}
```

## How to Work
1. First: `cd C:\Users\VICTOR\Downloads\Claude Code\AgentFlow`
2. Create `apps/web/` with all config files
3. Install dependencies
4. Build components from bottom up: ui/ → layout/ → domain/ → pages
5. Make sure `pnpm dev` works in apps/web at the end

DO NOT ask questions. Build everything. Make it beautiful. Ship it.
