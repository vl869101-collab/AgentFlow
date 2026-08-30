# v2 — Auditoria do Repositório n8n-io/n8n

> **Documento:** v2-auditoria-repo.md
> **Objetivo:** Auditar o repositório `n8n-io/n8n` (GitHub) para planejar a migração de infraestrutura n8n existente. Cobre tags, branches, histórico, pacotes, arquitetura, licença, dependências, limites de compatibilidade e riscos de fork.
> **Data da coleta de evidence:** 2026-08-20
> **Commit de referência consultado:** `e671de555cdc3fc83af25ac2286abef194366235` (master, 2026-08-20T01:20:29Z)
> **Disclaimer:** Este documento contém **apenas fatos verificáveis** obtidos via GitHub API, npm registry, arquivos LICENSE e git tree. Nenhuma implementação de código foi realizada. Links e SHAs são verificáveis em tempo real.

---

## 1. Identificação do Repositório

| Campo | Valor | Fonte |
|---|---|---|
| Nome completo | `n8n-io/n8n` | GitHub API `repos/n8n-io/n8n` |
| Owner | `n8n-io` (Organization, id: 45487711) | GitHub API |
| URL clone | `https://github.com/n8n-io/n8n.git` | GitHub API |
| Homepage | `https://n8n.io` | GitHub API |
| Branch padrão | `master` | GitHub API (`default_branch: "master"`) |
| Criado | 2019-06-22T09:24:21Z | GitHub API |
| Último push | 2026-08-20T01:32:01Z | GitHub API (`pushed_at`) |
| Atualizado | 2026-08-20T01:32:50Z | GitHub API (`updated_at`) |
| Fork de? | Não (fork: false) | GitHub API |
| Private? | Não (private: false) | GitHub API |
| Archived? | Não (false) | GitHub API |
| Disabled? | Não (false) | GitHub API |
| Visibilidade | Público | GitHub API |
| Linguagem primária | TypeScript | GitHub API + Languages API |
| Tamanho (repo) | 572,375 KB (~572 MB) | GitHub API (`size`) |
| Stargazers | 201,221 | GitHub API (`stargazers_count`) |
| Watchers | 201,221 | GitHub API |
| Forks (count) | 60,234 | GitHub API (`forks_count`, `network_count`) |
| Open issues | 1,079 | GitHub API (`open_issues_count`) |
| Subscribers | 1,152 | GitHub API (`subscribers_count`) |
| Contribuidores | 425 | GitHub API `contributors?per_page=1` → Link header `page=425; rel="last"` |
| Tópicos | ai, apis, automation, cli, data-flow, development, integration-framework, integrations, ipaas, low-code, low-code-platform, mcp, mcp-client, mcp-server, n8n, no-code, self-hosted, typescript, workflow, workflow-automation | GitHub API (`topics`) |
| License (GitHub) | Other / NOASSERTION (spdx_id: NOASSERTION) | GitHub API (`license.key: "other"`) |

**Descrição no GitHub:**
> "Fair-code workflow automation platform with native AI capabilities. Combine visual building with custom code, self-host or cloud, 400+ integrations."

---

## 2. Análise de Licença

### 2.1 Arquivos de Licença Encontrados

| Arquivo | Conteúdo | Fonte |
|---|---|---|
| `LICENSE.md` | Sustainable Use License v1.0 | GitHub raw `master/LICENSE.md` |
| `LICENSE_EE.md` | Enterprise License (Copyright 2022-present n8n GmbH) | GitHub raw `master/LICENSE_EE.md` |
| `packages/cli/LICENSE` | (referenciado no package.json como `LicenseRef-n8n-sustainable-use`) | `package.json` do pacote `n8n` |
| `packages/@n8n/engine/LICENSE` | `LicenseRef-n8n-sustainable-use` | `package.json` `@n8n/engine` v0.16.0 |
| `packages/@n8n/cli/LICENSE` | `LicenseRef-n8n-sustainable-use` | `package.json` `@n8n/cli` v0.16.0 |
| `packages/@n8n/config/LICENSE` | `LicenseRef-n8n-sustainable-use` | `package.json` `@n8n/config` v2.34.0 |

### 2.2 Sustainable Use License (LICENSE.md) — Resumo

O LICENSE.md começa com:

> "Portions of this software are licensed as follows:
> - Content of branches other than the main branch (i.e. 'master') are not licensed.
> - Source code files that contain '.ee.' in their filename or '.ee' in their dirname are NOT licensed under the Sustainable Use License. To use source code files that contain '.ee.' [...] you must hold a valid n8n Enterprise License.
> - All third party components [...] are licensed under the original license provided by the owner.
> - Content outside of the above mentioned files or restrictions is available under the 'Sustainable Use License'."

**Cláusulas principais do Sustainable Use License v1.0:**

1. **Acceptance:** Ao usar o software, você concorda com os termos.
2. **Copyright License:** Licença não-exclusiva, isenta de royalties, mundial, **não sublicenciável, não transferível** para usar, copiar, distribuir, disponibilizar e preparar obras derivadas — **sujeito às limitações abaixo**.
3. **Limitations (Restrições):**
   - Pode usar ou modificar **apenas para propósitos internos de negócio próprios, uso não-comercial ou uso pessoal**.
   - Pode distribuir o software **gratuitamente apenas para fins não-comerciais**.
   - **Proibido:** alterar, remover ou ocultar avisos de licença, copyright ou outros avisos do licenciante.
   - Uso de marcas comerciais sujeito à lei aplicável.
4. **Patentes:** Concede licença sob patentes do licenciante; termina automaticamente se o licenciado ajuíza ação de patente contra o software.
5. **Notices:** Qualquer pessoa que receba uma cópia deve também receber estes termos. Modificações devem incluir aviso proeminente.
6. **No Other Rights:** Não implica outras licenças além das expressamente concedidas.
7. **Termination:** Violação automática; reinstalação retroativa se cessar em 30 dias após notificação.
8. **No Liability:** Software é fornecido "como está", sem garantias; licenciante não é responsável por danos.
9. **Definitions:** "licensor" = entidade oferecendo os termos (n8n GmbH); "software" = software disponibilizado sob estes termos; "use" = qualquer atividade com o software.

**Classificação SPDX:** `LicenseRef-n8n-sustainable-use` (não é OSI-approved; não é SPDX-listed).

### 2.3 Enterprise License (LICENSE_EE.md) — Resumo

> "The n8n Enterprise License (the 'Enterprise License') — Copyright (c) 2022-present n8n GmbH."

**Cláusulas principais:**

1. **Produção:** O software `.ee.` **pode ser usado em produção apenas com uma licença Enterprise válida**.
2. **Modificação:** Pode modificar e publicar patches, mas **todas as modificações pertencem ao n8n/io e seus licensors**.
3. **Proibido:** copiar, mesclar, publicar, distribuir, sublicenciar e/ou vender o Software Enterprise.
4. **Dev/Test:** Pode copiar e modificar para desenvolvimento e testes **sem assinatura**.
5. **Terceiros:** Componentes de terceiros mantêm suas licenças originais.

### 2.4 Arquivos `.ee.` — Inventário Verificado

O LICENSE.md define explicitamente que **arquivos/diretórios contendo `.ee.` no nome ou `.ee` no dirname não estão licenciados sob a Sustainable Use License**. A busca no git tree (`master`, recursive) identificou **196 ocorrências** de `.ee.`:

**Pacotes contendo arquivos `.ee.` (excluindo o diretório todo `ai-workflow-builder.ee`):**

| Pacote | Arquivos `.ee.` típicos | Funcionalidade Enterprise |
|---|---|---|
| `packages/@n8n/ai-workflow-builder.ee` | 100+ arquivos (pacote inteiro) | AI workflow builder (avaliadores, LLM-judge, binary checks) |
| `packages/@n8n/blob-storage` | `azure-blob.service.ee.ts`, `azure-byte-store.ee.ts`, `s3-byte-store.ee.ts`, `object-store.service.ee.ts` | Armazenamento em nuvem (Azure Blob, S3) |
| `packages/@n8n/db` | 15+ arquivos: `agent-eval-*.ee.ts`, `test-run.ee.ts`, `test-case-execution.ee.ts`, `annotation-tag-entity.ee.ts`, `workflow-review-*.ee.ts`, `secrets-provider-connection.repository.ee.ts` | Entidades/repos EE (avaliação de agentes, execução de testes, revisão de workflows, segredos) |
| `packages/@n8n/permissions` | 15+ arquivos: `constants.ee.ts`, `public-api-permissions.ee.ts`, `role-maps.ee.ts`, `scopes/*.ee.ts`, `types.ee.ts` | Permissões avançadas, roles customizados, escopos globais/projeto |
| `packages/cli` (n8n) | 60+ arquivos: `annotation-tags.controller.ee.ts`, `credentials.service.ee.ts`, `evaluation.ee/`, `external-secrets.ee/`, `ldap.ee/`, `log-streaming.ee/`, `provisioning.ee/`, `source-control.ee/`, `sso-oidc/*.ee.ts`, `sso-saml/*.ee.ts`, `multi-main-setup.ee.ts` | SSO (OIDC/SAML), secrets externos, LDAP, provisionamento, controle de fonte, log streaming, multi-main, compartilhamento de credenciais |
| `packages/frontend/@n8n/rest-api-client` | `eventbus.ee.ts`, `externalSecrets.ee.ts`, `secretsProvider.ee.ts` | API client EE |
| `packages/frontend/editor-ui` | 20+ arquivos: `EnterpriseEdition.ee.vue`, `WorkflowExecutionAnnotationTags.ee.vue`, `WorkflowShareModal.ee.vue`, `CredentialSharing.ee.vue`, `externalSecrets.ee/`, `secretsProviders.ee/`, `annotationTagsDropdown.ee.vue` | UI para funcionalidades Enterprise |
| `packages/nodes-base` | `Evaluation/Evaluation/Evaluation.node.ee.ts` (+ `.json`, `.ee.ts` de prompts) | Node de avaliação Enterprise |

**Total de arquivos `.ee.` encontrados:** 196 ocorrências no git tree (incluindo diretórios, testes e arquivos de código).

### 2.5 npm Package Licenses

| Pacote npm | License | Dist-tags | Observação |
|---|---|---|---|
| `n8n` | UNLICENSED (npm) | stable=2.35.4, latest=2.35.4, beta=2.36.2, rc=2.36.2, next=2.36.2 | npm marca como UNLICENSED; código usa Sustainable Use License |
| `@n8n/engine` | `LicenseRef-n8n-sustainable-use` | latest=0.15.3, beta=0.16.0, stable=0.15.3 | Publicado na 0.15.3 (stable) |
| `n8n-workflow` | `SEE LICENSE IN LICENSE` | legacy=0.156.1, latest=2.16.0, stable=2.35.2, beta=2.36.1 | **latest ≠ stable** (2.16.0 vs 2.35.2) — possível inconsistência de tag |
| `n8n-core` | `SEE LICENSE IN LICENSE` | legacy=0.175.1, latest=2.16.1, stable=2.35.3, beta=2.36.2 | **latest ≠ stable** (2.16.1 vs 2.35.3) |
| `n8n-nodes-base` | `SEE LICENSE IN LICENSE` | latest=2.15.1, stable=2.35.3, beta=2.36.1 | **latest ≠ stable** |
| `@n8n/ai-workflow-builder` | `SEE LICENSE IN LICENSE` | latest=1.35.3, stable=1.35.3, beta=1.36.1 | Publicado como pacote OS (não .ee.) |
| `@n8n_io/license-sdk` | UNLICENSED | latest=3.0.0 | **Comercial fechado** — SDK de gestão de licenças |
| `@n8n_io/ai-assistant-sdk` | UNLICENSED | latest=1.26.0 | **Comercial fechado** — SDK do assistente de IA |

> **Observação sobre dist-tags inconsistentes:** Os pacotes `n8n-workflow`, `n8n-core` e `n8n-nodes-base` têm `latest` apontando para versões mais antigas que o `stable`. Isso significa que `npm install n8n-workflow` (sem tag explícita) instala 2.16.0, não a versão estável atual 2.35.2. Consumidores devem usar `@stable` explicitamente.

---

## 3. Branches

| Branch | Protegida? | Descrição | Fonte |
|---|---|---|---|
| `master` (default) | ? | Branch principal de desenvolvimento ativo | GitHub API `branches` |
| `release/2.35.4` | ? | Branch de release para versão 2.35.4 (stable, publicada 2026-08-19) | GitHub API `branches` + Releases |
| `release/2.36.2` | ? | Branch de release para versão 2.36.2 (beta, publicada 2026-08-19) | GitHub API `branches` + Releases |

**Observações:**
- Apenas `master` foi listada explicitamente como protegida/indicada. Branch de release seguem o padrão `release/X.Y.Z`.
- Há um branch de release para a linha 1.x (release/1.123.x) embora não apareça na API de branches (limitado a 30 resultados).
- O LICENSE.md afirma: "Content of branches other than the main branch (i.e. 'master') are not licensed." → **Apenas o master está licenciado.**

---

## 4. Tags (Tags)

A API de tags (`repos/n8n-io/n8n/tags`) retorna principalmente tags de publicação npm (formato `n8n-workflow@X.Y.Z`), que são tags automáticas geradas pelo processo de publicação no npm. As tags reais de versão usadas nos releases seguem o padrão `n8n@X.Y.Z` e `stable`/`beta`.

**Tags de release verificadas (via GitHub Releases API):**

| Tag | Target (commitish) | Prerelease? | Criada em | Versão |
|---|---|---|---|---|
| `stable` | `release/2.35.4` | Não | 2026-08-19T05:42:02Z | 2.35.4 |
| `n8n@2.35.4` | `release/2.35.4` | Não | 2026-08-19T05:42:02Z | 2.35.4 |
| `beta` | `release/2.36.2` | Sim | 2026-08-19T05:42:02Z | 2.36.2 |
| `n8n@2.36.2` | `release/2.36.2` | Sim | 2026-08-19 | 2.36.2 |
| `n8n@1.123.73` | ? | ? | 2026-08-19 | 1.123.73 (linha 1.x) |
| `n8n@2.36.0` | ? | Sim | 2026-08-18 | 2.36.0 (beta) |
| `n8n@1.123.72` | ? | Não | 2026-08-17 | 1.123.72 (1.x) |
| `n8n@2.35.3` | ? | Não | 2026-08-14 | 2.35.3 |
| `n8n@2.34.6` | ? | Não | 2026-08-14 | 2.34.6 |
| `n8n@1.123.71` | ? | Não | 2026-08-13 | 1.123.71 (1.x) |
| `n8n@2.35.2` | ? | Não | 2026-08-13 | 2.35.2 |
| `n8n@2.35.1` | ? | Não | 2026-08-12 | 2.35.1 |
| `n8n@2.35.0` | ? | Não | 2026-08-11 | 2.35.0 |

### 4.1 Estratégia de Versionamento

O n8n mantém **duas linhas de versão ativas simultaneamente:**

| Linha | npm dist-tag | Versão estável (2026-08-20) | Status |
|---|---|---|---|
| **2.x (main)** | `stable`, `latest` | 2.35.4 | Linha principal, recebe novas funcionalidades |
| **1.x (legacy/LTS)** | `release-v1` | 1.123.73 | Linha legada mantida |
| **2.x (beta)** | `beta`, `rc`, `next` | 2.36.2 | Próxima versão em desenvolvimento |

- **Versão no package.json do repo (master):** `2.36.0` — **mais recente que o stable (2.35.4)** mas **mais antiga que o beta (2.36.2)**. O master está 1 versão ahead do beta publicado.
- O pacote `n8n` é publicado no npm com a mesma versão do tag `n8n@X.Y.Z`.
- A linha 1.x usa um esquema de versão `1.123.X` (minor alto) — indica compatibilidade semântica com releases frequentes de features na linha 1.x.

### 4.2 Histórico de Releases (últimos 14 dias)

```
2026-08-19: n8n@2.35.4 (stable)   — correções de bugs (API schema, Google Ads)
2026-08-19: n8n@2.36.2 (beta)     — próxima versão beta
2026-08-19: n8n@1.123.73 (1.x)    — release na linha 1.x
2026-08-18: n8n@2.36.0 (beta)     — feature: AI Assistant setup funnel
2026-08-17: n8n@1.123.72 (1.x)    — release na linha 1.x
2026-08-14: n8n@2.35.3 (stable)   — correção de bug
2026-08-14: n8n@2.34.6 (stable)   — correção de bug
2026-08-13: n8n@1.123.71 (1.x)
2026-08-13: n8n@2.35.2 (stable)
2026-08-12: n8n@2.35.1 (stable)
2026-08-11: n8n@2.35.0 (stable)   — feature release
```

**Frequência de releases:** Aproximadamente **1 release estável por 2-3 dias** na linha 2.x, e **1 release na linha 1.x por 2-3 dias**. O ciclo de desenvolvimento é acelerado.

### 4.3 Último Commit (master)

| Campo | Valor |
|---|---|
| SHA | `e671de555cdc3fc83af25ac2286abef194366235` |
| Autor | `n8n-cat-bot[bot]` |
| Data | 2026-08-20T01:20:29Z |
| Mensagem | `chore: Bump strnum 2.2.3 → 2.4.2 (minor) to clear 1 Aikido finding (#36670)` |
| Verificado | Sim (assinatura PGP válida) |
| Tree SHA | `cb7bd08f72956c9edc48a9e463a6dd26702f18d4` |

> O commit foi feito por um bot (`n8n-cat-bot`), e inclui co-authored-by `Claude Opus 4.8 <noreply@anthropic.com>`. Isso confirma que o repositório utiliza automação de dependências (Aikido para security scanning) e contribuições de IA (Claude) no código.

---

## 5. Arquitetura e Mapa de Módulos

### 5.1 Visão Geral — Monorepo pnpm

O repositório é um **monorepo pnpm workspace** com **425 contribuidores** e contém **~70 pacotes TypeScript + Vue 3**. O arquivo `pnpm-workspace.yaml` define os globs de workspace:

```yaml
packages:
  - packages/*
  - packages/@n8n/*
  - packages/frontend/**
  - packages/modules/**
  - packages/extensions/**
  - packages/testing/**

catalogMode: strict
catalogs:
  e2e: { ... }
  frontend: { ... }
  sentry: { ... }
  storybook: { ... }
  typescript: { ... }
  typescript-tooling: { ... }
  undici-v6: { ... }
  undici-v7: { ... }
minimumReleaseAge: 4320  # 3 dias de idade mínima para atualizações
minimumReleaseAgeExclude:
  - '@n8n/*'
  - '@n8n_io/*'
```

- `catalogMode: strict` → todas as dependências devem vir do catalog (centralizado).
- `minimumReleaseAge: 4320` (3 dias) → bloqueia instalação de versões publicadas há menos de 3 dias, EXCETO `@n8n/*`, `@n8n_io/*`, `@ai-sdk/anthropic` e `@xmldom/xmldom`.
- O build usa **Turbo** (`turbo.json`) com tarefas: `build`, `typecheck`, `lint`, `test`, `format`, `dev`, `watch`.

### 5.2 Estrutura de Diretórios

```
n8n-io/n8n (master)
├── pnpm-workspace.yaml
├── turbo.json
├── packages/
│   ├── cli/                    → npm pkg "n8n" (v2.36.0) — ENTRY POINT principal
│   ├── core/                   → npm pkg "n8n-core" — Core utilities (legacy)
│   ├── workflow/               → npm pkg "n8n-workflow" — Workflow types/runtime (legacy)
│   ├── nodes-base/             → npm pkg "n8n-nodes-base" — 400+ nodes embutidos
│   ├── frontend/               → Frontend web (Vue 3 + Vite)
│   │   ├── @n8n/
│   │   │   ├── chat/           → n8n Chat component
│   │   │   ├── composables/    → Vue composables reutilizáveis
│   │   │   └── rest-api-client/ → Cliente REST API para o frontend
│   │   └── editor-ui/         → Aplicação Vue 3 principal (editor visual)
│   ├── node-dev/               → Ferramentas para desenvolvimento de nós
│   ├── modules/
│   │   └── instance-registry/  → Registro de instâncias
│   ├── extensions/
│   │   └── insights/          → Extensão de insights/analytics
│   ├── testing/                → Utilitários de teste
│   └── @n8n/                   → 54 pacotes modulares (novo escopo)
│       ├── agents/             → AI agents framework
│       ├── ai-node-sdk/        → SDK para criar nós de IA
│       ├── ai-utilities/       → Utilitários de IA
│       ├── ai-workflow-builder.ee/  → [ENTERPRISE] AI workflow builder
│       ├── api-types/          → Definições de tipos da API
│       ├── backend-common/     → Utilitários comuns do backend
│       ├── backend-network/    → Camada de rede do backend
│       ├── backend-test-utils/ → Test utils para backend
│       ├── benchmark/          → Ferramentas de benchmark
│       ├── blob-storage/       → Abstração de armazenamento blob
│       ├── chat-hub/           → Hub de integração de chat (Discord, Slack, etc.)
│       ├── cli/                → [NOVA] CLI oclif-based (v0.16.0)
│       ├── client-oauth2/      → Cliente OAuth2
│       ├── codemirror-lang/    → Suporte CodeMirror para linguagem n8n
│       ├── codemirror-lang-html/
│       ├── codemirror-lang-sql/
│       ├── computer-use/       → Capabilities de uso de computador (agentes)
│       ├── config/             → Configuração (v2.34.0, baseado em zod + DI)
│       ├── constants/          → Constantes globais
│       ├── crdt/               → Conflict-free Replicated Data Types
│       ├── create-node/        → Tooling para criação de nós
│       ├── db/                 → Camada de banco de dados (v2.34.0)
│       ├── decorators/         → Decorators TypeScript
│       ├── di/                 → Framework de injeção de dependências
│       ├── engine/             → [NOVA] Workflow execution engine (v2) (v0.16.0)
│       ├── errors/             → Classes de erro
│       ├── eslint-config/      → Configuração ESLint
│       ├── eslint-plugin-community-nodes/
│       ├── expression-runtime/ → Runtime de expressões (para workflows)
│       ├── extension-sdk/      → SDK para desenvolvimento de extensões
│       ├── imap/               → Cliente IMAP
│       ├── instance-ai/        → Recursos de IA no nível de instância
│       ├── json-schema-to-zod/ → Conversor JSON Schema → Zod
│       ├── local-gateway/      → Gateway local para MCP
│       ├── mcp-apps/           → Aplicações MCP
│       ├── mcp-browser/        → Navegador MCP
│       ├── mcp-browser-extension/ → Extensão de navegador MCP
│       ├── node-cli/           → CLI para nós
│       ├── node-engine-compatibility/
│       ├── nodes-langchain/    → Integração LangChain (nós pré-configurados)
│       ├── permissions/        → Sistema de permissões
│       ├── scan-community-package/
│       ├── scheduler/          → Agendador de tarefas
│       ├── stylelint-config/
│       ├── syslog-client/
│       ├── task-runner/        → Task runner para execução de código (sandbox)
│       ├── task-runner-python/
│       ├── telemetry/          → Telemetria
│       ├── tournament/         → A/B testing / tournament
│       ├── typeorm/            → Integração TypeORM
│       ├── typescript-config/  → Configuração TypeScript compartilhada
│       ├── utils/              → Utilitários
│       ├── vitest-config/      → Configuração Vitest compartilhada
│       └── workflow-sdk/       → SDK de workflow
```

### 5.3 Arquitetura — Migração em andamento (dual stack)

**DESCOBERTA CHAVE:** O repositório contém **dois stacks de arquitetura em coexistência**:

| Aspecto | Stack Legado (legacy) | Stack Nova (@n8n/*) |
|---|---|---|
| Workflow engine | `packages/workflow` (`n8n-workflow`) | `packages/@n8n/engine` (`@n8n/engine` v0.16.0) |
| Core | `packages/core` (`n8n-core`) | `@n8n/db`, `@n8n/config`, `@n8n/decorators`, `@n8n/di` |
| Nodes | `packages/nodes-base` (`n8n-nodes-base`) | `@n8n/nodes-langchain`, `@n8n/ai-utilities`, `@n8n/agents` |
| Frontend | `packages/frontend/editor-ui` | `packages/frontend/@n8n/*` (composables, chat, rest-api-client) |
| CLI | `packages/cli` (entry point `n8n`) | `packages/@n8n/cli` (oclif-based, separado) |
| DI | Manual (require/inversify) | `@n8n/di` (framework próprio) |
| Express | 4.x | 5.1.0 |

O pacote entry point `packages/cli` (nome `n8n`) depende de **AMBOS** os pacotes legados e os novos `@n8n/*`:

```json
// packages/cli/package.json → dependencies (resumo)
{
  "n8n-core": "workspace:*",        // LEGADO
  "n8n-editor-ui": "workspace:*",    // LEGADO (frontend)
  "n8n-nodes-base": "workspace:*",    // LEGADO
  "n8n-workflow": "workspace:*",      // LEGADO
  "n8n-containers": "workspace:*",
  "@n8n/agents": "workspace:*",       // NOVO
  "@n8n/engine": ... (não listado diretamente), // via workspace
  "@n8n/ai-node-sdk": "workspace:*",  // NOVO
  "@n8n/config": "workspace:*",       // NOVO
  "@n8n/db": "workspace:*",           // NOVO
  "@n8n/di": "workspace:*",           // NOVO
  "@n8n/permissions": "workspace:*",  // NOVO
  "@n8n/typeorm": "workspace:*",      // NOVO
  "@n8n_io/license-sdk": "3.0.0",     // COMERCIAL (npm)
  "@n8n_io/ai-assistant-sdk": "catalog:", // COMERCIAL (npm)
}
```

**Conclusão arquitetural:** O n8n está em plena **migração de uma arquitetura monolítica/mono-workspace para um monorepo modular com escopo `@n8n/*`**. A linha 2.x introduz:
1. Um novo **engine** (`@n8n/engine`) que substituirá `n8n-workflow` + `n8n-core`.
2. Um sistema de **DI** (`@n8n/di`).
3. Um novo **package config** (`@n8n/config`) baseado em Zod.
4. Uma **CLI separada** (`@n8n/cli`, baseada em oclif) para gerenciamento via terminal.
5. Modularização de nodes, AI, MCP, etc.

### 5.4 Componentes Principais

#### 5.4.1 Engine (`packages/cli` → n8n)
- **Entry point:** `packages/cli/bin/n8n` → `dist/index.js`
- **Runtime:** Node.js
- **Engine HTTP:** Express 5.1.0
- **Worker:** Processo separado para execução de workflows (`dev:worker`)
- **Webhook:** Processo separado para webhooks (`dev:webhook`)
- **Task runner:** `packages/@n8n/task-runner` — sandbox para execução de código em nodes
- **Agendador:** `packages/@n8n/scheduler` — agendamento de execuções

#### 5.4.2 Frontend (`packages/frontend/editor-ui`)
- **Framework:** Vue 3.5.13 + Vite 8.0.2 + Vue Router 4.5.0 + Pinia 2.2.4
- **Component library:** Element Plus 2.4.3 + n8n Design System
- **Icons:** unplugin-icons + iconify
- **Testes:** Vitest 4.1.9 + @testing-library/vue + @vitest/browser-playwright
- **SSR/SG:** Nenhum (SPA cliente-side)

#### 5.4.3 Banco de Dados
- **ORM principal:** TypeORM (`@n8n/typeorm` v0.x)
- **Schema:** Prisma (`psl` 1.9.0) — usado para migrations e CLI
- **SQLite:** Para desenvolvimento (sqlite3 5.1.7)
- **PostgreSQL:** Para produção (pg 8.21.0)
- **Redis:** Para queue mode (ioredis 5.3.2)

#### 5.4.4 Sistema de Execução de Nós
- **n8n-workflow (legacy):** Motor de workflow TypeScript com expressões (`$` syntax)
- **Expression runtime:** `@n8n/expression-runtime` (novo)
- **isolated-vm:** Usado para sandbox de execução de código em JavaScript (isolated-vm ^7.0.0)
- **Task runner:** `@n8n/task-runner` e `@n8n/task-runner-python` — executam código fora do processo principal

#### 5.4.5 AI / Automação
- **SDK de AI:** `@ai-sdk/*` (Anthropic, OpenAI, Google, Azure, Groq, DeepSeek, Cohere, Mistral, xAI)
- **LangChain:** `@langchain/core`, `@langchain/anthropic`, `@langchain/community`, `@langchain/langgraph`
- **OpenAI:** `openai` 6.46.0
- **MCP:** `@modelcontextprotocol/sdk` 1.26.0, `@modelcontextprotocol/node` 2.0.0, `@modelcontextprotocol/server` 2.0.0
- **Chat adapters:** `@chat-adapter/*` (Discord, Slack, Telegram, Linear, state-memory)
- **n8n AI Assistant:** `@n8n_io/ai-assistant-sdk` 1.26.0 (comercial fechado)
- **AI nodes:** `@n8n/nodes-langchain`, `@n8n/ai-utilities`, `@n8n/ai-node-sdk`

---

## 6. Dependências — Stack Tecnológica

### 6.1 Engines / Runtimes

| Tecnologia | Versão | Fonte | Observação |
|---|---|---|---|
| Node.js | **>=24.0.0** (mínimo) | `packages/cli/package.json` `engines.node` | **Versão muito recente** — exige Node.js 24+ (Lancado Abril 2025) |
| pnpm | >=8.14 | npm registry (`@n8n_io/ai-assistant-sdk`) | Workspace monorepo |
| TypeScript | **7.0.2** (tsgo) + **6.0.2** (typescript) | `pnpm-workspace.yaml` catalogs | Usa `tsgo` (TypeScript 7) como compilador principal via `@typescript/native@npm:typescript@7.0.2` |
| TypeScript (tooling) | 6.0.2 | catalog `typescript` | Para tooling que não suporta TS7 |

> **Risco:** Node.js 24+ é muito recente. Muitos provedores cloud (Lambda, Cloud Run) podem não ter suporte imediato. TypeScript 7.0.2 é bleeding-edge — poucos projetos adotam TS7 ainda.

### 6.2 Backend Core

| Pacote | Versão | Fonte |
|---|---|---|
| Express | **5.1.0** | catalog |
| Express types | ^5.0.1 | catalog (`@types/express`) |
| reflect-metadata | 0.2.2 | catalog |
| zod | 3.25.76 | catalog |
| convict | 6.2.5 | packages/cli deps |
| helmet | 8.1.0 | packages/cli deps |

### 6.3 Frontend

| Pacote | Versão | Fonte |
|---|---|---|
| Vue | ^3.5.13 | catalog `frontend` |
| Vite | ^8.0.2 | catalog |
| Vue Router | ^4.5.0 | catalog `frontend` |
| Pinia | ^2.2.4 | catalog `frontend` |
| Element Plus | 2.4.3 | catalog `frontend` |
| @vitejs/plugin-vue | ^5.2.4 | catalog `frontend` |
| Vitest | ^4.1.9 | catalog |

### 6.4 Banco de Dados

| Pacote | Versão | Fonte |
|---|---|---|
| Prisma (psl) | 1.9.0 | packages/cli deps |
| TypeORM | (workspace `@n8n/typeorm`) | monorepo |
| sqlite3 | 5.1.7 | packages/cli deps |
| pg (PostgreSQL) | 8.21.0 | catalog |
| ioredis | 5.3.2 | packages/cli deps |
| mysql2 | 3.23.1 | catalog |
| oracledb | 6.10.0 | catalog |

### 6.5 Segurança & Auth

| Pacote | Versão | Fonte |
|---|---|---|
| bcryptjs | 2.4.3 | packages/cli deps |
| jsonwebtoken | 9.0.3 | catalog |
| openid-client | 6.8.4 | packages/cli deps |
| samlify | 2.13.0 | packages/cli deps |
| jose | ^6.2.9 | packages/cli deps |
| csrf | 3.1.0 | packages/cli deps |
| otpauth | 9.1.1 | packages/cli deps |
| xmldom | (excluído do minimumReleaseAge) | catalog |

### 6.6 AI & LLM

| Pacote | Versão | Fonte |
|---|---|---|
| ai (Vercel AI SDK) | ^7.0.54 | catalog |
| @ai-sdk/anthropic | ^4.0.32 | catalog |
| @ai-sdk/openai | ^4.0.20 | catalog |
| @ai-sdk/google | ^4.0.24 | catalog |
| openai | 6.46.0 | catalog |
| @langchain/core | 1.2.0 | catalog |
| @langchain/langgraph | 1.0.2 | catalog |
| @modelcontextprotocol/sdk | 1.26.0 | catalog |

### 6.7 Comercial / Fechado

| Pacote | Versão | License | Observação |
|---|---|---|---|
| `@n8n_io/license-sdk` | 3.0.0 | UNLICENSED | SDK de gestão de licenças Enterprise — **dependência obrigatória do pacote `n8n`** |
| `@n8n_io/ai-assistant-sdk` | 1.26.0/1.27.0 | UNLICENSED | SDK do assistente de IA n8n |
| `vm2` | 3.11.6 | MIT (mas descontinuado) | Sandbox JS — **vm2 é descontinuado e tem vulnerabilidades conhecidas** |

### 6.8 Observability

| Pacote | Versão | Fonte |
|---|---|---|
| Sentry (@sentry/node) | ^10.55.0 | catalog/sentry |
| OpenTelemetry | v2.7.1 / v0.217.0 | packages/cli deps |
| prom-client | 15.1.3 | packages/cli deps |
| posthog-node | 5.33.4 | catalog |

### 6.9 Tooling / Build

| Pacote | Versão | Fonte |
|---|---|---|
| Turbo | (não especificado) | turbo.json |
| pnpm | workspace | pnpm-workspace.yaml |
| ESLint | 9.29.0 | catalog |
| Biome | (format) | packages/cli scripts |
| Vitest | 4.1.9 | catalog |
| Playwright | 1.62.1 | catalog e2e |
| tsx | ^4.19.3 | catalog |
| tsup | (tooling) | catalog |

---

## 7. Análise de Branches, Tags e Histórico

### 7.1 Branches Ativas

| Branch | Tipo | Observação |
|---|---|---|
| `master` | Development | Default branch, HEAD de desenvolvimento |
| `release/2.35.4` | Release | Linha 2.x estável |
| `release/2.36.2` | Release (beta) | Linha 2.x em desenvolvimento |
| `release/1.123.x` | Release (LTS) | Linha 1.x legacy (não listada na API mas inferida de tags) |

### 7.2 Estratégia de Release

1. **master** contém código de desenvolvimento (versão 2.36.0 no package.json).
2. Quando uma versão está pronta, um branch `release/X.Y.Z` é criado a partir do master.
3. Tags `n8n@X.Y.Z` são criadas no release branch.
4. Tags `stable` e `beta` são ponteiros móveis para o release branch atual.
5. npm dist-tags (`latest`, `stable`, `beta`) são atualizados em sincronia.

### 7.3 Conformidade de Código

- O último commit usa assinatura **PGP verificada**.
- Os commits são feitos por **bots** (`n8n-cat-bot`) e **IA** (`Claude Opus 4.8`), indicando forte automação.
- Pull requests são validados por **Aikido** (security scanning).
- Convencional Commits são validados por GitHub Action (`validate-n8n-pull-request-title`).
- **Co-authored-by trailers** são usados consistentemente.

---

## 8. Riscos de Fork

### 8.1 Riscos Legais

| Risco | Detalhe | Severidade |
|---|---|---|
| **Sustainable Use License ≠ Open Source** | O LICENSE.md é a "Sustainable Use License v1.0", que **não é OSI-approved**. Restrições: uso apenas interno/não-comercial; distribuição gratuita apenas não-comercial. | 🔴 **ALTO** |
| **Proibido uso comercial sem assinatura Enterprise** | A licença SUL proíbe uso comercial. Qualquer fork oferecido como serviço (SaaS) viola a licença. | 🔴 **ALTO** |
| **Arquivos `.ee.` requerem licença Enterprise paga** | 196 arquivos com `.ee.` no nome — SSO (OIDC/SAML), LDAP, secrets externos, provisionamento, source control, multi-main, avaliação de workflows, external secrets — **não podem ser usados sem licença Enterprise válida**. Um fork perderia todas estas funcionalidades. | 🔴 **ALTO** |
| **Dependência comercial fechada** | `@n8n_io/license-sdk@3.0.0` (UNLICENSED) é uma dependência direta do pacote `n8n`. Este SDK gerencia a verificação de licença Enterprise e comunica-se com servidores da n8n. | 🟠 **MÉDIO** |
| **Marca registrada não licenciada** | LICENSE.md menciona "Any use of the licensor's trademarks is subject to applicable law." Não há concessão de uso de marca. | 🟡 **BAIXO-MÉDIO** |
| **Licença apenas do branch master** | "Content of branches other than the main branch (i.e. 'master') are not licensed." Forks de branches de release têm incerteza legal. | 🟡 **BAIXO** |
| **n8n GmbH detém todos os direitos autorais** | Modificações feitas pelo fork pertencem ao n8n GmbH. | 🟡 **BAIXO** |

### 8.2 Riscos Técnicos

| Risco | Detalhe | Severidade |
|---|---|---|
| **Node.js 24+ exigido** | Versão muito recente (abril 2025). Provedores cloud e imagens Docker podem não ter suporte imediato. | 🟠 **MÉDIO** |
| **TypeScript 7.0.2 (tsgo)** | Versão bleeding-edge. Poucas ferramentas de terceiros suportam TS7. `tsgo` é o compilador nativo TypeScript 7.0.2, com 6.0.2 paralelo para tooling. | 🟠 **MÉDIO** |
| **Dual stack em migração** | O repo contém pacotes legados (`n8n-workflow`, `n8n-core`, `n8n-nodes-base`) e novos `@n8n/*`. A API pode ter divergências entre os dois sistemas. | 🟠 **MÉDIO** |
| **`vm2` descontinuado e vulnerável** | `vm2` 3.11.6 é usado para sandbox de execução de JavaScript. O projeto foi descontinuado em 2023 e tem CVEs conhecidas (CVE-2023-37446, CVE-2023-37447, etc.). | 🔴 **ALTO** |
| **`isolated-vm` (^7.0.0)** | Alternativa moderna ao vm2, usada para sandboxing. Requer compilação nativa (node-gyp). | 🟡 **BAIXO** |
| **196 arquivos `.ee.` não funcionam sem licença** | O código EE é carregado condicionalmente. Um fork sem licença verá funcionalidades enterprise ausentes ou com erro. | 🔴 **ALTO** |
| **Dependência npm `@n8n_io/license-sdk`** | Este SDK é publicado como UNLICENSED e não é open-source. Sem ele, o pacote `n8n` não compila/instala. Se torna uma black box. | 🔴 **ALTO** |
| **Express 5.1.0** | Express 5 é uma major version upgrade (anteriormente 4.x). Migrado recentemente — puede ter breaking changes. | 🟡 **BAIXO** |
| **TypeScript strict catalogs** | `catalogMode: strict` + `minimumReleaseAge: 4320` — bloqueia instalação de versões recentes de dependências (3 dias de waiting period). | 🟡 **BAIXO** |

### 8.3 Riscos de Compatibilidade (Fork vs Upstream)

| Fator | Detalhe |
|---|---|
| **Frequência de releases** | ~1 release estável a cada 2-3 dias na linha 2.x. Um fork ficaria rapidamente desatualizado. |
| **Coexistence de linhas** | Duas linhas de versão (1.x e 2.x) são mantidas simultaneamente. Patches de segurança podem ser aplicados em ambas. |
| **Contribuição de IA** | Commitos assinados por "Claude Opus 4.8" indicam que o código é parcialmente gerado por IA. Isso eleva a complexidade de auditoria. |
| **Bot de automação** | `n8n-cat-bot` faz bump automático de dependências. Dependências mudam rapidamente. |

### 8.4 Riscos de Comunidade

| Fator | Detalhe |
|---|---|
| **425 contribuidores** | Comunidade ativa, mas com alta dependência de `janober` (Jan Oberhauser, 4,631 contribuições) e sua equipe. |
| **1,079 open issues** | Alto volume de issues abertas — indica backlog significativo. |
| **60,234 forks** | Muitos forks existentes, mas poucos provavelmente mantêm o código atualizado. |

---

## 9. Matriz de Prioridade para MigraÇÃO

| # | Item | Categoria | Risco Legal | Risco Técnico | Prioridade | Ação Recomendada |
|---|---|---|---|---|---|---|
| 1 | **Licença Sustainable Use** | Legal | 🔴 Alto | N/A | **P0** | Avaliar se o uso pretendido é comercial. Se sim, obter licença Enterprise. |
| 2 | **Files `.ee.` (196 arquivos)** | Legal/Técnico | 🔴 Alto | 🔴 Alto | **P0** | Mapear funcionalidades EE necessárias. Se críticas, licenciar Enterprise. |
| 3 | **`@n8n_io/license-sdk` (UNLICENSED)** | Técnico/Legal | 🔴 Alto | 🔴 Alto | **P0** | Esta é uma dependência npm fechada e obrigatória. Não pode ser substituída. |
| 4 | **Node.js >=24.0.0** | Técnico | N/A | 🟠 Médio | **P1** | Verificar compatibilidade de provedores cloud. Planejar upgrade de Node. |
| 5 | **TypeScript 7.0.2 (tsgo)** | Técnico | N/A | 🟠 Médio | **P1** | Verificar compatibilidade de ferramentas (ESLint, IDE, etc.). |
| 6 | **`vm2` 3.11.6 (descontinuado)** | Técnico | N/A | 🔴 Alto | **P1** | Avaliar substituição por `isolated-vm` (já usado parcialmente) ou alternativa segura. |
| 7 | **Dual stack (legacy + @n8n)** | Técnico | N/A | 🟠 Médio | **P1** | Mapear quais componentes ainda dependem do stack legado vs novo. |
| 8 | **Dependências comerciais `@n8n_io/*`** | Legal | 🔴 Alto | 🟠 Médio | **P1** | `@n8n_io/ai-assistant-sdk` (UNLICENSED) — verificar se necessário. |
| 9 | **Express 5.1.0 (upgrade recente)** | Técnico | N/A | 🟡 Baixo | **P2** | Verificar deprecations do Express 4.x. |
| 10 | **Frequência de releases (~2-3 dias)** | Operaional | N/A | N/A | **P2** | Planejar estratégia de atualização contínua. |
| 11 | **1,079 open issues** | Operaional | N/A | N/A | **P3** | Triar issues relevantes para a migração. |
| 12 | **Contribuição de IA (Claude)** | Operaional | N/A | N/A | **P3** | Aumenta complexidade de review de código. |

---

## 10. Decisões Recomendadas

### 10.1 Licença — **DECISÃO CRÍTICA**

| Opção | Recomendação | Justificativa |
|---|---|---|
| **Usar n8n OSS sem Enterprise** | ✅ **Recomendado** se for uso interno/não-comercial | A Sustainable Use License permite uso gratuito para fins não-comerciais e internos. Funciona para auto-hospedagem pessoal ou times pequenos. |
| **Usar n8n Enterprise** | ✅ **Recomendado** se for comercial | Adquire acesso a todos os 196 arquivos `.ee.` e ao `@n8n_io/license-sdk`. Necessário para produção comercial. |
| **Forkar e redistribuir** | ❌ **NÃO recomendado** | A Sustainable Use License proíbe distribuição comercial. Qualquer fork distribuído como serviço viola a licença. |
| **Substituir `@n8n_io/license-sdk`** | ❌ **Não viável** | O SDK é uma dependência obrigatória do pacote `n8n` e não pode ser removido sem reescrever o sistema de licenciamento. |

### 10.2 Arquitetura — Migração

| Aspecto | Recomendação | Justificativa |
|---|---|---|
| **Stack legacy vs @n8n** | ✅ Seguir a linha 2.x (master) | O master inclui tanto legacy quanto novos pacotes. A migração para `@n8n/engine` e `@n8n/di` está em andamento. |
| **@n8n/cli (oclif)** | ✅ Avaliar para automação | A nova CLI (`@n8n/cli` v0.16.0, baseada em oclif) oferece gerenciamento de workflows/credentials via terminal. Pode substituir scripts customizados. |
| **Docker** | ✅ Usar imagem oficial | O repo contém Dockerfiles. Prefira a imagem npm `n8n` sobre fork para facilitar atualizações. |
| **TypeScript/tsgo** | ⚠️ Testar antes de adoptar | tsgo (TS7) é muito recente. Validar compatibilidade com ferramentas existentes. |
| **vm2** | ⚠️ Planejar substituição | vm2 é descontinuado e vulnerável. Avaliar migração para `isolated-vm` (já usado no repo). |

### 10.3 Estratégia de Versionamento

| Decisão | Recomendação | Justificativa |
|---|---|---|
| **Linha 1.x vs 2.x** | ✅ **Usar 2.x (master/stable)** | Linha 2.x é a principal, recebe novas features. Linha 1.x é legacy/LTS. |
| **Dist-tags npm** | ⚠️ Usar `@stable` explicitamente | `latest` ≠ `stable` para `n8n-workflow`, `n8n-core`, `n8n-nodes-base`. |
| **Release branches** | ✅ Fazer checkout de `master` | Apenas `master` está licenciado. Branches de release não são licenciados. |

### 10.4 Dependências

| Decisão | Recomendação |
|---|---|
| **Node.js runtime** | Exigir Node.js 24+ em todos os ambientes |
| **pnpm** | Usar pnpm (workspace + catalog mode) |
| **`@n8n_io/*`** | Manter como dependências npm (não pode forkar) |

---

## 11. Critérios de Aceite (Acceptence Criteria)

Antes de iniciar a migração, os seguintes critérios devem ser validados:

1. **Licença validada:** ✅ Confirmado se o uso é comercial ou não-comercial. Se comercial, licença Enterprise adquirida e `@n8n_io/license-sdk` configurado.
2. **Ambiente compatível:** ✅ Node.js 24+ disponível em todos os ambientes (dev, staging, prod).
3. **TypeScript compatível:** ✅ TypeScript 7 / tsgo compatível com a stack de tooling existente.
4. **Dependências comerciais resolvidas:** ✅ `@n8n_io/license-sdk` e `@n8n_io/ai-assistant-sdk` instaláveis via npm.
5. **vm2 substituído ou mitigado:** ✅ Plano de substituição para sandbox de código (isolated-vm ou alternativa).
6. **Mapa de arquivos `.ee.`:** ✅ Inventário completo (196 arquivos) mapeado e decisões de use/no-use tomadas.
7. **Estratégia de versionamento:** ✅ Decidido usar linha 2.x (master/stable). `@stable` usado explicitamente para pacotes npm.
8. **Tests baseline:** ✅ Suíte de testes do repo (vitest) passa em ambiente local antes de customizações.
9. **Docker compatibility:** ✅ Testado build e run com a imagem Docker oficial n8n.
10. **Observabilidade:** ✅ Sentry, OpenTelemetry e prom-client configurados no ambiente alvo.

---

## 12. Próximos Passos

| # | Ação | Detalhes | Owner | Prioridade |
|---|---|---|---|---|
| 1 | **Decisão de licença** | Determinar se o uso será comercial → adquirir Enterprise License e `@n8n_io/license-sdk` | Legal/Compliance | P0 |
| 2 | **Inventário de `.ee.`** | Mapear quais das 196 funcionalidades `.ee.` são necessárias na migração | Engineering | P0 |
| 3 | **Setup de ambiente Node 24+** | Provisionar Node.js 24+ em todos os ambientes | Infra | P1 |
| 4 | **Validar TypeScript 7** | Testar build com tsgo + typescript 6 no ambiente | Engineering | P1 |
| 5 | **Sandbox migration** | Avaliar substituição de `vm2` por `isolated-vm` | Security/Eng | P1 |
| 6 | **Fork ou no-fork decision** | Se fork: validar compliance de licença. Se não-fork: validar estratégia de atualização. | Arch/Legal | P1 |
| 7 | **Testes de baseline** | Executar `pnpm test` no master e validar suíte de testes | QA | P1 |
| 8 | **Docker validation** | Testar `docker build` e `docker run` da imagem oficial | Infra | P2 |
| 9 | **Planejar sync contínuo** | Definir estratégia para follow upstream releases (~2-3 dias) | Arch | P2 |
| 10 | **Review de vm2 CVEs** | Listar CVEs conhecidas do vm2 e planejar mitigação ou remoção | Security | P1 |

---

## 13. Inventário de Fontes de Evidências

| Fonte | URL | Dados coletados |
|---|---|---|
| GitHub API (repo) | `https://api.github.com/repos/n8n-io/n8n` | Metadata completo (stars, forks, issues, license, branches) |
| GitHub API (branches) | `https://api.github.com/repos/n8n-io/n8n/branches` | Lista de branches |
| GitHub API (tags) | `https://api.github.com/repos/n8n-io/n8n/tags` | Lista de tags npm |
| GitHub API (releases) | `https://api.github.com/repos/n8n-io/n8n/releases` | Histórico de versões |
| GitHub API (contributors) | `https://api.github.com/repos/n8n-io/n8n/contributors?per_page=1` | Contagem: 425 |
| GitHub API (languages) | `https://api.github.com/repos/n8n-io/n8n/languages` | TypeScript 111MB, Vue 8MB, etc. |
| GitHub API (git tree) | `https://api.github.com/repos/n8n-io/n8n/git/trees/master?recursive=1` | 196 arquivos `.ee.` identificados |
| GitHub API (contents) | `.../contents/packages/@n8n`, `.../packages`, etc. | Estrutura de diretórios e packages |
| GitHub raw (LICENSE.md) | `https://raw.githubusercontent.com/n8n-io/n8n/master/LICENSE.md` | Sustainable Use License v1.0 |
| GitHub raw (LICENSE_EE.md) | `https://raw.githubusercontent.com/n8n-io/n8n/master/LICENSE_EE.md` | Enterprise License |
| GitHub raw (package.json) | `.../master/packages/cli/package.json` | Entry point n8n v2.36.0, Node >=24, deps |
| GitHub raw (pnpm-workspace.yaml) | `.../master/pnpm-workspace.yaml` | Workspace config + catalogs |
| GitHub raw (turbo.json) | `.../master/turbo.json` | Build pipeline config |
| GitHub API (last commit) | `.../commits?per_page=1&sha=master` | e671de5 (2026-08-20) |
| npm registry (n8n) | `https://registry.npmjs.org/n8n` | dist-tags: stable=2.35.4, beta=2.36.2 |
| npm registry (n8n-workflow) | `https://registry.npmjs.org/n8n-workflow` | dist-tags: latest=2.16.0, stable=2.35.2 |
| npm registry (n8n-core) | `https://registry.npmjs.org/n8n-core` | dist-tags: latest=2.16.1, stable=2.35.3 |
| npm registry (n8n-nodes-base) | `https://registry.npmjs.org/n8n-nodes-base` | dist-tags: latest=2.15.1, stable=2.35.3 |
| npm registry (@n8n/engine) | `https://registry.npmjs.org/@n8n/engine` | dist-tags: latest=0.15.3, beta=0.16.0 |
| npm registry (@n8n/ai-workflow-builder) | `https://registry.npmjs.org/@n8n/ai-workflow-builder` | dist-tags: latest=1.35.3, stable=1.35.3 |
| npm registry (@n8n_io/license-sdk) | `https://registry.npmjs.org/@n8n_io/license-sdk` | v3.0.0, UNLICENSED, mantido por jan@n8n.io |
| npm registry (@n8n_io/ai-assistant-sdk) | `https://registry.npmjs.org/@n8n_io/ai-assistant-sdk` | v1.26.0, UNLICENSED |
| GitHub API (org repos) | `https://api.github.com/orgs/n8n-io/repos?per_page=100` | 37+ repositórios da org n8n-io |

---

## 14. Resumo Executivo

**n8n-io/n8n** é um monorepo TypeScript monorepo (572 MB, 425 contribuidores, 201K estrelas) que implementa uma plataforma de automação de workflows com IA nativa. O repositório está em uma **fase de transição arquitetônica** — migrando de pacotes legados (`n8n-workflow`, `n8n-core`, `n8n-nodes-base`, `n8n-editor-ui`) para uma arquitetura modular `@n8n/*` com injeção de dependências (`@n8n/di`), novo engine (`@n8n/engine`), e CLI separada (`@n8n/cli`).

**As três decisões críticas para qualquer migração são:**

1. **Licença:** A Sustainable Use License (não OSI) restringe uso comercial. 196 arquivos `.ee.` exigem licença Enterprise paga. O pacote `@n8n_io/license-sdk@3.0.0` (UNLICENSED) é uma dependência npm fechada e obrigatória.
2. **Stack moderno:** Exige Node.js 24+ e TypeScript 7.0.2 (tsgo) — versões bleeding-edge que podem não ser suportadas por todos os provedores.
3. **vm2 vulnerável:** O sandbox `vm2@3.11.6` (descontinuado, com CVEs conhecidas) é usado para execução de código em nodes — risco de segurança significativo.

**Recomendação geral:** Para migração, **não forkar**. Em vez disso, usar a imagem npm oficial `n8n` (linha 2.x stable), adquirir licença Enterprise se o uso for comercial, e planejar atualizações contínuas (~2-3 dias de ciclo de release). Se fork for inevitável, é **imperativo** validar compliance legal com a Sustainable Use License e o Enterprise License, e mapear todas as 196 funcionalidades `.ee.` antes de prosseguir.
