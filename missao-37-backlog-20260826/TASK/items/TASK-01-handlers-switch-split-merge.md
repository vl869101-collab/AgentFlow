# TASK-01: Handlers de Controle de Fluxo — Switch, SplitInBatches, Merge Avançado, Contrato de Items {json, binary} & Motor de Expressões $json

- **Prioridade:** P0 (Core Engine / Bloqueador)
- **Domínio:** Core Executor / Flow Control / Expression Engine
- **Alvo:** `apps/api/src/services/nodes/`, `apps/api/src/services/executor.ts` & `apps/api/src/services/expressions.ts`

## 1. Contexto & Problema
Workflows no AgentFlow precisam de controle de fluxo determinístico de multi-caminhos, iteração em coleções/lotes, junção flexível de branches e conformidade universal com o contrato de dados baseado em itens `{ json, binary }` e resolução dinâmica de expressões `$json`.

## 2. Objetivos & Especificação
1. **Nó Switch (Roteamento n-vias):**
   - Suporte a múltiplas saídas nomeadas baseadas em regras encadeadas (`equals`, `notEquals`, `contains`, `regex`, `greaterThan`, `lessThan`, `isEmpty`, `isNotEmpty`, `default`).
   - Roteamento condicional direcionando cada item para a porta/saída correta (`sourceHandle`).
2. **Nó SplitInBatches (Batching & Loops):**
   - Quebra de arrays de itens em lotes com tamanho fixo ou dinâmico configurável.
   - Contexto de iteração injetado: `batchIndex`, `totalBatches`, `isLastBatch`, `batchSize`.
   - Compatibilidade com loops de retroalimentação no grafo do workflow.
3. **Nó Merge (Fusão Avançada):**
   - Modos de fusão: `append` (concatenação), `combineByPosition` (zip de itens), `multiplex` (produto cartesiano), `waitAll` (sincronização de branches paralelas).
4. **Contrato Universal de Items `{ json, binary }`:**
   - Todo nó recebe e emite um array tipado `NodeItem[] = Array<{ json: Record<string, any>, binary?: Record<string, BinaryData> }>`.
   - Garantia de isolamento e imutabilidade entre nós executados.
5. **Motor de Expressões `$json`:**
   - Resolução dinâmica de referências em tempo de execução: `{{ $json.foo }}`, `{{ $json['bar'].baz }}`, `{{ $item("NodeName").json.field }}`, `{{ $executionId }}`, `{{ $now }}`.
   - Tratamento de safe-navigation sem crash por undefined/null.

## 3. Critérios de Aceite
- [ ] O nó `switch` avalia regras e roteia itens com precisão para os outputs `sourceHandle` correspondentes.
- [ ] O nó `splitInBatches` divide itens em lotes mantendo estado e flags de iteração (`isLastBatch`).
- [ ] O nó `merge` suporta com perfeição os modos `append`, `combineByPosition` e `waitAll`.
- [ ] Todos os dados que trafegam entre nós respeitam estritamente a estrutura `Array<{ json, binary }>`.
- [ ] Expressões contendo `$json` e `$item()` são avaliadas com interpolação segura e sanitizada.
- [ ] 100% de testes unitários cobrindo nós de controle de fluxo e motor de expressões.
