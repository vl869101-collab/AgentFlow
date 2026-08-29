# HANDOFF — PostgreSQL / Prisma database review

Data da revisão: 2026-08-29  
Escopo: `packages/database/prisma/schema.prisma` e todas as migrations sob `packages/database/prisma/migrations`.

## Verdict

**NEEDS-FIX**

O gate não pode ser aprovado enquanto o histórico não conseguir provisionar um banco vazio. Há também drift entre migration e schema, rollback não confiável na migration de hardening e ausência de uma política explícita de pooling/limites de conexão.

Não foi alterado código de banco: os blockers não são P0 triviais nem seguros para correção automática sem conhecer o estado dos ambientes já existentes.

## Findings

### P0 — DB-001: não existe migration baseline; `migrate deploy` não cria o AgentFlow do zero

**Evidência**

- Existem somente duas migrations: `20260811_backend_hardening` e `202608160001_refresh_tokens`.
- A primeira instrução efetiva do histórico é `ALTER TYPE "Plan" ...` em `20260811_backend_hardening/migration.sql:6`, seguida por índices em tabelas preexistentes.
- Não há migration que crie `Plan`, `User`, `Organization`, `Workflow` ou as demais tabelas do schema.
- O deployment documentado usa Prisma Migrate, portanto um banco novo executaria a migration de hardening contra objetos inexistentes e falharia antes de chegar a `RefreshToken`.
- No PostgreSQL local alcançável, `prisma migrate status` encontrou as duas migrations como pendentes. Isso é compatível com um banco inicializado por `db push`/fora do histórico, não com um histórico Prisma reproduzível.

**Impacto**

- Primeiro deploy e disaster recovery não são reproduzíveis.
- Ambientes podem ter schema físico correto e `_prisma_migrations` divergente.
- `prisma migrate deploy` pode falhar no release ou induzir alguém a marcar migrations como aplicadas sem validar o schema real.

**Correção requerida**

Definir uma baseline imutável que crie o schema anterior ao hardening e testar `migrate deploy` em PostgreSQL 16 vazio. Para bancos já existentes, comparar o schema físico antes de qualquer `prisma migrate resolve`; não marcar migrations como aplicadas cegamente.

### P1 — DB-002: drift do enum `Plan`

**Evidência**

- `20260811_backend_hardening/migration.sql:6` adiciona `TEAM` ao enum PostgreSQL.
- `schema.prisma:405-411` declara `FREE`, `STARTER`, `BASIC`, `GROWTH` e `PRO`, mas não `TEAM`.
- A aplicação não possui uso funcional de `TEAM`; a única ocorrência relevante está na própria migration.

**Impacto**

O schema Prisma, o client gerado e o schema físico após migration não representam o mesmo domínio. Drift futuro e comportamento inconsistente em introspecção/novas migrations são prováveis.

**Correção requerida**

Decidir se `TEAM` é suportado. Se for, incluí-lo no schema e na lógica de plano; se não for, não adicioná-lo em instalações novas e criar uma estratégia forward-only segura para instalações onde o valor já exista.

### P1 — DB-003: `20260811_backend_hardening/down.sql` não é reversível com segurança

**Evidência**

- O próprio up declara a alteração de enum forward-only (`migration.sql:2-4`). O down não remove `TEAM`, logo não restaura o estado anterior.
- O up remove `Approval_userId_key`, permitindo múltiplas aprovações por usuário. O down recria a unicidade (`down.sql:23`) sem detectar ou reconciliar duplicatas criadas após o up; nessas condições o rollback falha.
- O comentário do up diz que o rollback manteria os índices aditivos, mas o down remove todos eles (`down.sql:2-21`).
- Prisma Migrate não executa automaticamente esses `down.sql`; eles são artefatos operacionais manuais e os testes atuais só verificam strings/presença.

**Impacto**

Rollback pode parar no meio, deixar estado parcial ou ser impossível depois de uso normal da nova cardinalidade.

**Correção requerida**

Tratar a mudança como forward-only com procedimento de roll-forward documentado, ou definir pré-condição/data remediation explícita antes de restaurar unicidade. Corrigir o comentário e executar o procedimento em teste de integração, não apenas validar texto.

### P1 — DB-004: criação de índices em tabelas existentes pode bloquear escrita

**Evidência**

`20260811_backend_hardening/migration.sql:10-49` usa `CREATE INDEX`, não `CREATE INDEX CONCURRENTLY`, para todas as tabelas existentes. O mesmo arquivo também faz `DROP INDEX` da restrição única de `Approval`.

**Impacto**

Em tabelas grandes, o hardening pode manter locks incompatíveis com escrita durante a construção dos índices. A duração não foi quantificada porque não há cópia/estatísticas de produção no escopo.

**Correção requerida**

Planejar os índices de tabelas existentes como operações online (`CONCURRENTLY`) em migration compatível com execução fora de transação, ou comprovar janela de manutenção e tamanho seguro. Não reescrever migration já aplicada em qualquer ambiente; criar forward migration/procedimento conforme o estado real.

### P1 — DB-005: pooling e orçamento de conexões não estão definidos

**Evidência**

- `schema.prisma:5-8` possui somente `url = env("DATABASE_URL")`; não há URL direta separada para migrations.
- `docker-compose.yml:47` e `:66` conectam API e worker diretamente ao PostgreSQL.
- Não há `pgbouncer`, `connection_limit`, `pool_timeout` ou orçamento documentado por réplica/processo.
- API e pacote database contêm pontos próprios de construção de `PrismaClient` (`apps/api/src/lib/prisma.ts:30` e `packages/database/src/index.ts:7`). Cada processo/serviço pode manter seu pool; escala horizontal multiplica a demanda.

**Impacto**

O limite de conexões pode ser excedido quando API/worker escalam ou quando ambos os caminhos de client são carregados. Migrations também não têm um caminho direto explicitamente separado de eventual pooler transacional.

**Correção requerida**

Definir orçamento por serviço e réplica, configurar limites/timeout na URL ou adotar pooler compatível, e separar a conexão direta usada por migrations quando aplicável. Acrescentar teste/alerta de saturação de conexões.

### P2 — DB-006: índices de workflows cobrem o básico, mas não todo o shape das hot queries

**Pontos positivos**

- `Workflow` possui `@@index([orgId, updatedAt])` e `@@index([ownerId, updatedAt])`; os acessos básicos por organização/owner e recência estão cobertos.
- `@@index([orgId, status])` cobre contagens/filtros por organização e status.

**Lacunas observadas**

- A listagem principal filtra `orgId`, opcionalmente `status`, e ordena por `updatedAt DESC, id DESC` (`apps/api/src/routes/workflows.ts:142-168`). Os índices não incluem o desempate `id`; quando `status` é usado, não há um único índice que cubra filtro e ordenação.
- A busca MCP tem shape semelhante (`apps/api/src/mcp/tools.ts:92-110`).
- Busca `contains` case-insensitive sobre nome/descrição não tem índice trigram/FTS; em volume alto fará scan dentro da organização.

**Recomendação**

Confirmar com `EXPLAIN (ANALYZE, BUFFERS)` e dados representativos. Candidatos, condicionados aos planos reais, são `(orgId, updatedAt DESC, id DESC)` e `(orgId, status, updatedAt DESC, id DESC)`; evitar adicionar ambos sem medir custo de escrita e redundância. Para busca textual quente, considerar `pg_trgm`/GIN.

### P2 — DB-007: relação `ApiKey` está consistente, mas falta índice pelo lado da organização

**Evidência**

- Back-relations corretas: `User.apiKeys` (`schema.prisma:26`) e `Organization.apiKeys` (`:74`).
- Lado owning correto: `ApiKey.user` e `ApiKey.org` (`:376-379`), com `orgId` opcional e `Organization?` coerente.
- Há índices por usuário (`:381-382`), mas nenhum começando por `orgId`.

**Impacto**

Consulta de chaves por organização e validação/cascade de FK podem degradar para scan quando a tabela crescer.

**Recomendação**

Se a coleção `Organization.apiKeys` ou remoção de organização for caminho operacional, medir e adicionar `@@index([orgId, createdAt])` (ou `@@index([orgId])` conforme o query shape).

### P2 — DB-008: testes de migration são estáticos

`pnpm --filter @agentflow/database test` passa 4/4, porém `packages/database/test/migrations.test.ts` verifica somente existência e trechos de SQL. Não executa:

1. deploy completo em banco vazio;
2. up sobre baseline populada;
3. down na ordem inversa;
4. comparação do schema resultante;
5. rollback após inserção de duas `Approval` para o mesmo usuário.

Adicionar esses cenários em PostgreSQL efêmero fecharia as lacunas que hoje permitem o P0 e o rollback inseguro passarem no CI.

## Avaliação de destrutividade e reversibilidade por migration

| Migration | Up | Down | Resultado |
|---|---|---|---|
| `20260811_backend_hardening` | Aditiva em enum/índices, mas remove uma restrição única e usa índices bloqueantes; pressupõe baseline inexistente no repositório. | Parcial: não remove `TEAM`; pode falhar ao recriar unicidade; remove índices apesar do comentário contrário. | **FAIL** |
| `202608160001_refresh_tokens` | Cria tabela, duas uniques, dois índices e FK `ON DELETE/UPDATE CASCADE`; sem perda de dados preexistentes. | Remove FK/índices/tabela; restaura o schema anterior, mas descarta todos os refresh tokens criados após o up. | **PASS condicional** para rollback de schema; destrutivo para dados pós-up, como esperado ao remover a feature. |

Não há `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` ou DML destrutivo nos arquivos up. A remoção de `Approval_userId_key` é, contudo, uma mudança destrutiva de constraint/invariante e exige plano operacional.

## Comandos e resultados

| Comando | Resultado |
|---|---|
| `pnpm --filter @agentflow/database exec prisma validate` | **FAIL (P1012)** no shell de revisão: `DATABASE_URL` não estava exportada para o processo do pacote. |
| Mesmo validate com uma URL PostgreSQL sintaticamente válida e não conectável, apenas para validar estrutura | **PASS**: `The schema ... is valid`. `prisma validate` não requer conexão quando a variável existe. |
| `pnpm --filter @agentflow/database exec prisma migrate status` | **FAIL (P1012)** pelo mesmo motivo no ambiente do comando literal. |
| Prisma `migrate status` equivalente, carregando a `.env` raiz sem imprimir credenciais | **DB alcançável** em PostgreSQL; **2 migrations found**, ambas pendentes. |
| `pnpm --filter @agentflow/database test` | **PASS**: 1 arquivo, 4 testes. Limitação: testes somente estáticos. |
| `rg --files packages/database/prisma/migrations` e inspeção integral dos SQL | Confirmadas exatamente duas migrations, cada uma com `migration.sql` e `down.sql`. |

## Critérios para re-review / aprovação

- `prisma migrate deploy` passa em PostgreSQL 16 vazio e produz schema equivalente ao `schema.prisma`.
- Estratégia de baseline para bancos existentes está documentada e verificada antes de qualquer `migrate resolve`.
- Enum `Plan` está alinhado entre migration, schema e aplicação.
- Rollback/roll-forward do hardening está coerente, testado com dados e não promete reversibilidade inexistente.
- Índices de tabelas existentes têm estratégia online ou janela de manutenção comprovada.
- Pooling tem limite por réplica/processo, capacidade total calculada e conexão de migrations definida.

Até esses itens serem atendidos, o gate database-reviewer permanece **NEEDS-FIX**.
