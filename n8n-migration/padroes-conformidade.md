# Padrões de Código e Conformidade - AgentFlow Monorepo

Este documento estabelece os padrões de código, convenções e práticas de conformidade que devem ser seguidos pelo Builder ao implementar funcionalidades no monorepo AgentFlow, especificamente para o projeto de recriação do n8n.

## 📋 Sumário

1. [Linter e Comandos](#linter-e-comandos)
2. [Framework e Padrão de Testes](#framework-e-padrão-de-testes)
3. [Convenções de Import e Estrutura de Pastas](#convenções-de-import-e-estrutura-de-pastas)
4. [Regras de Componentes (Server/Client)](#regras-de-componentes-serverclient)
5. [Padrão de Banco (Prisma Client Singleton)](#padrão-de-banco-prisma-client-singleton)
6. [Checklist de Conformidade para Novo Código](#checklist-de-conformidade-para-novo-código)

---

## 🔧 Linter e Comandos

### Ferramentas Utilizadas
- **ESLint** (configurado em `eslint.config.mjs`)
- **Prettier** (configurado em `.prettierrc`)
- **TypeScript** (type checking via `tsc`)
- **TurboRepo** para execução de tasks em monorepo

### Scripts Disponíveis (package.json raiz)
```bash
pnpm run lint        # Executa ESLint em apps/ e packages/
pnpm run typecheck   # Executa TypeScript type checking via turbo
pnpm run test        # Executa testes via turbo
pnpm run dev         # Inicia desenvolvimento em todos os pacotes
pnpm run dev:api     # Desenvolve apenas a API
pnpm run dev:web     # Desenvolve apenas o web
pnpm run build       # Constrói todos os pacotes
```

### Configuração ESLint (`eslint.config.mjs`)
- Baseada em `@typescript-eslint/recommended` e `eslint-plugin-react/recommended`
- Ignora: `node_modules`, `dist`, `.next`, `.turbo`, `*.config.*`, `next-env.d.ts`
- Ignora especificamente: `apps/api/test/**`, `apps/api/tests/**`, `packages/database/prisma/**`
- Regras TypeScript:
  - `@typescript-eslint/no-unused-vars`: warn (ignore args com padrão `_`)
  - `@typescript-eslint/no-explicit-any`: warn
  - `no-undef`: off (TypeScript já trata)
  - `react/react-in-jsx-scope`: off
  - `react/prop-types`: off
- Regras React:
  - `react-hooks/rules-of-hooks`: error
  - `react-hooks/exhaustive-deps`: warn
- Integração com Prettier via `eslint-config-prettier`

### Configuração Prettier (`.prettierrc`)
```json
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": false,
  "tabWidth": 2,
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### GitHub Actions (CI/CD)
- **CI** (`.github/workflows/ci.yml`): Lint, Typecheck, Test (com PostgreSQL)
- **Deploy** (`.github/workflows/deploy.yml`): Deploy automático para Vercel (web) e Railway (API)

---

## 🧪 Framework e Padrão de Testes

### Estratégia de Testes
- **Unit Tests**: Funções individuais, utilitários, componentes
- **Integration Tests**: Endpoints de API, operações de banco de dados
- **E2E Tests**: Fluxos críticos de usuário (framework escolhido por linguagem)

### Ferramentas por Pacote
- **API** (`apps/api`):
  - Vitest (`vitest`) para testes unitários e de integração
  - Script de teste: `tsx --test test/backend.test.ts`
  
- **Web** (`apps/web`):
  - Next.js com teste implícito via `next test` (Jest por padrão)
  
- **Shared/Packages**:
  - Type checking via `tsc --noEmit`
  - Testes específicos conforme necessidade

### Convenções de Teste
- **AAA Pattern**: Arrange-Act-Assert
- **Nomenclatura descritiva**: Explicam o comportamento sob teste
  - `test('returns empty array when no markets match query', () => {})`
  - `test('throws error when API key is missing', () => {})`
- **Test-Driven Development (TDD)** obrigatório:
  1. Escreva o teste primeiro (RED)
  2. Rode o teste - deve falhar
  3. Implemente mínimamente para passar (GREEN)
  4. Rode o teste - deve passar
  5. Refatore (IMPROVE)
  6. Verifique cobertura (80%+)

### Requisitos de Cobertura
- **Mínimo 80%** de cobertura para todos os tipos de teste
- Testes devem cobrir: unit, integration e E2E
- Verificar com `pnpm run test` ou scripts específicos de cada pacote

---

## 📦 Convenções de Import e Estrutura de Pastas

### Estrutura do Monorepo
```
AgentFlow/
├── apps/
│   ├── api/          # Node.js/Fastify backend
│   └── web/          # Next.js 16 frontend
├── packages/
│   ├── database/     # Prisma ORM e schemas
│   └── shared/       # Código compartilhado (Zod schemas, tipos, utils)
├── .github/          # Workflows CI/CD
└── n8n-migration/    # Diretório da missão atual
```

### Convenções de Import (@agentflow/*)
Configuradas em `tsconfig.base.json` via `paths`:
```json
{
  "paths": {
    "@agentflow/database": ["./packages/database/src"],
    "@agentflow/shared": ["./packages/shared/src"],
    "@agentflow/workflow-engine": ["./packages/workflow-engine/src"],
    "@agentflow/integrations": ["./packages/integrations/src"],
    "@agentflow/ai": ["./packages/ai/src"]
  }
}
```

#### Exemplos de Import Correto
```typescript
// Correto - usando aliases
import { prisma } from "@agentflow/database";
import { z } from "@agentflow/shared";
import { executeWorkflow } from "@agentflow/workflow-engine";

// Também aceito - imports relativos quando apropriado
import { utils } from "../../utils";
```

### Estrutura de Pastas por Pacote

#### API (`apps/api/src`)
```
src/
├── lib/              # Utilitários reutilizáveis (env.ts, prisma.ts, store.ts)
├── middleware/       # Middleware Fastify (auth.ts, quota.ts)
├── routes/           # Rotas da API (auth.ts, workflows.ts, billing.ts, etc.)
├── services/         # Lógica de negócio (executor.ts, queue.ts)
├── docs/             # Documentação OpenAPI
├── server.ts         # Entrada da aplicação
└── worker.ts         # Worker para processos em background
```

#### Web (`apps/web/src`)
```
src/
├── app/              # Next.js App Router (route handlers, layouts)
├── components/       # Componentes React reutilizáveis
├── lib/              # Utilitários frontend (api.ts, utils.ts, workflow.ts)
└── styles/           # Estilos globais e configuração Tailwind
```

#### Shared (`packages/shared/src`)
```
src/
├── index.ts          # Exportação principal
└── [arquivos .ts]    # Schemas Zod, tipos compartilhados, utilitários
```

#### Database (`packages/database/src`)
```
src/
├── index.ts          # Prisma client singleton + exportação
└── seed.ts           # Script de seed para desenvolvimento
```

#### Prisma (`packages/database/prisma`)
```
prisma/
├── schema.prisma     # Modelo de dados Prisma
└── migrations/       # Histórico de migrações
```

---

## 🖥️ Regras de Componentes (Server/Client)

### Distinção Server/Client (Next.js 16)
- **Componentes Server**: Por padrão, todos os componentes na pasta `app/` são Server Components
- **Componentes Client**: Marcados com `"use client"` no topo do arquivo
- **Regra**: Minimizar uso de Client Components; preferir Server Components para melhor performance e SEO

#### Exemplo de Componente Server
```typescript
// app/dashboard/page.tsx - Server Component por padrão
import { WorkflowCard } from "@/components/workflow-card";

export default function DashboardPage() {
  return (
    <div>
      <h1>Meus Workflows</h1>
      <WorkflowCard />
    </div>
  );
}
```

#### Exemplo de Componente Client
```typescript
// components/workflow-card.tsx
"use client";

import { useState } from "react";
import { useWorkflow } from "@/lib/workflow";

export function WorkflowCard({ workflow }) {
  const [isRunning, setIsRunning] = useState(false);
  
  // Lógica client-side aqui
  return (
    <div>
      {/* Conteúdo que requer estado client-side */}
    </div>
  );
}
```

### Convenções de Componentes React
1. **Props**: Definir com `interface` ou `type` (nunca `React.FC` a menos que necessário)
2. **Nomeclatura**: PascalCase para componentes, camelCase para props
3. **Arquivo**: Um componente por arquivo (para componentes reutilizáveis)
4. **Hooks**: Custom hooks em `lib/` com prefixo `use`
5. **Estilos**: Usar Tailwind CSS via classes utility (não StyleSheet.create)

#### Exemplo de Props
```typescript
interface WorkflowCardProps {
  workflow: {
    id: string;
    name: string;
    status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  };
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function WorkflowCard({ workflow, onEdit, onDelete }: WorkflowCardProps) {
  // Implementação
}
```

### Regras de Renderização
- **Server Components**: Buscar dados diretamente, acessar variáveis de ambiente server-side
- **Client Components**: Gerenciar estado interativo, eventos de usuário, efeitos colaterais
- **Hydration**: Evitar mismatches entre server e client render

---

## 🗃️ Padrão de Banco (Prisma Client Singleton)

### Implementação Atual
O AgentFlow implementa um singleton do Prisma Client para evitar múltiplas instâncias e conexões desnecessárias.

#### Arquivo: `packages/database/src/index.ts`
```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export * from "@prisma/client";
```

### Uso Correto em Toda a CódigoBase
```typescript
// Importação correta em qualquer lugar do monorepo
import { prisma } from "@agentflow/database";

// Exemplos de uso
const user = await prisma.user.findUnique({
  where: { email: "user@example.com" }
});

const workflows = await prisma.workflow.findMany({
  where: { orgId: org.id },
  include: { owner: true }
});
```

### Pontos Importantes
1. **Nunca instanciar diretamente** `new PrismaClient()` exceto no arquivo singleton
2. **Sempre importar de** `@agentflow/database`
3. **Log condicional**: Query logs apenas em desenvolvimento
4. **Instância global**: Mantida em desenvolvimento para evitar reconexões em hot reload
5. **Produção**: Nova instância criada apenas se não existir globalmente

### Operações Comuns Prisma
- **Find**: `findUnique`, `findMany`, `findFirst`
- **Create**: `create`, `createMany`
- **Update**: `update`, `updateMany`, `upsert`
- **Delete**: `delete`, `deleteMany`
- **Aggregation**: `count`, `groupBy`, `aggregate`
- **Transações**: `$transaction`
- **Query Bruta**: `$queryRaw`, `$executeRaw`

---

## ✅ Checklist de Conformidade para Novo Código

Antes de entregar qualquer código, o Builder deve verificar:

### 🔍 Qualidade Geral
- [ ] Código é legível e bem nomeado (variáveis, funções, componentes descritivos)
- [ ] Funções focadas (<50 linhas)
- [ ] Arquivos coesos (<800 linhas)
- [ ] Nenhum aninhamento profundo (>4 níveis)
- [ ] Erros tratados explicitamente (não silenciosamente)
- [ ] Nenhum `console.log` ou statements de debug
- [ ] Testes existem para nova funcionalidade
- [ ] Cobertura de testes ≥ 80%

### 🛡️ Segurança
- [ ] Nenhum segredo hardcodado (API keys, senhas, tokens)
- [ ] Todas as entradas do usuário validadas
- [ ] Prevenção de SQL injection (usar Prisma parameterized queries)
- [ ] Prevenção de XSS (sanitização de HTML quando necessário)
- [ ] Proteção CSRF habilitada (via Fastify plugins)
- [ ] Autenticação/autorização verificada
- [ ] Rate limiting em todos os endpoints
- [ ] Mensagens de erro não vazam dados sensíveis

### 📦 Imports e Estrutura
- [ ] Usando aliases `@agentflow/*` quando apropriado
- [ ] Nenhum import relativo excessivamente longo (preferir aliases)
- [ ] Estrutura de pastas seguida conforme definido
- [ ] Componentes no lugar correto (`components/`, `app/`, `lib/`, etc.)

### ⚛️ Componentes React/Next.js
- [ ] Distinção clara entre Server e Client Components
- [ ] Client Components marcados com `"use client"`
- [ ] Props tipadas com `interface` ou `type`
- [ ] Nenhum uso de `React.FC` sem motivo específico
- [ ] Estilos usando Tailwind CSS utility classes
- [ ] Componentes pequenos e focados (preferir composição sobre props excessivos)

### 🗄️ Banco de Dados (Prisma)
- [ ] Usando singleton do Prisma via `@agentflow/database`
- [ ] Nenhuma instanciação direta de `new PrismaClient()`
- [ ] Queries eficientes (evitar N+1, usar `include` e `select` apropriadamente)
- [ ] Migrações criadas quando esquema mudar (`prisma migrate dev`)
- [ ] Tipos Prisma importados corretamente

### 🧪 Testes
- [ ] Testes escritos seguindo AAA pattern
- [ ] Nomes de teste descritivos e explicativos
- [ ] Testes de unidade, integração e E2E quando apropriado
- [ ] Cobertura verificada com `pnpm run test`
- [ ] Testes passando antes do commit

### 📝 Estilo e Formatação
- [ ] Código formatado com Prettier (`pnpm run lint` deve passar)
- [ ] Nenhum trailing whitespace
- [ ] Uso consistente de aspas duplas (Prettier config)
- [ ] Importações ordenadas (eslint-plugin-import recomendado se adicionado)
- [ ] Comentários úteis e atualizados

### 🔄 Git e Commits
- [ ] Mensagens de commit seguindo conventional commits
  - `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`
- [ ] Nenhum commit com `.env`, `.env.local`, ou arquivos de ambiente
- [ ] Branch atualizado com main antes do PR
- [ ] Conflitos de merge resolvidos
- [ ] PR description completo com plano de teste quando necessário

### 🏗️ Específico para Workflow Engine (n8n-like)
- [ ] Seguir padrões de nó existentes em `packages/shared/src/index.ts`
- [ ] Tipos de nó validados contra Zod schema (`workflowNodeTypeSchema`)
- [ ] Configurações de nó seguindo padrão `z.record(z.unknown())`
- [ ] Edge connections validadas (source/target obrigatórios)
- [ ] Persistência seguindo modelos Prisma existentes (`WorkflowNode`, `WorkflowEdge`)
- [ ] Executors seguindo padrão em `apps/api/src/services/executor.ts`

---

## 📚 Referências Adicionais

Para orientações mais específicas, consulte:
- `CLAUDE.md` na raiz - Visão geral do repositório
- `.claude/rules/` - Regras detalhadas de desenvolvimento
- `packages/database/prisma/schema.prisma` - Modelo de dados completo
- `apps/api/src/lib/store.ts` - Implementação do storage em memória (para testes)
- `apps/api/src/services/` - Exemplos de camadas de serviço
- `apps/web/lib/` - Exemplos de utilitários frontend

Este documento deve ser tratado como fonte única da verdade para padrões de código no AgentFlow monorepo. Qualquer divergência deve ser discutida e alinhada antes da implementação.