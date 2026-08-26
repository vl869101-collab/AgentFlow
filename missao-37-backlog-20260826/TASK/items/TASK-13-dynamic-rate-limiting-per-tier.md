# TASK-13: Rate Limiting Dinâmico em Janela Deslizante por Plano

- **Prioridade:** P1 (Proteção de Infraestrutura & SLA)
- **Domínio:** Traffic Management / Rate Limiting / Redis
- **Alvo:** `apps/api/src/middlewares/rate-limit.ts` & `apps/api/src/lib/redis.ts`

## 1. Contexto & Problema
Diferentes planos contratuais possuem diferentes limites de vazão de requisições e execuções de webhook. É necessário aplicar rate limiting em janela deslizante (Sliding Window Log) no Redis, adaptado ao tier da organização.

## 2. Objetivos & Especificação
1. **Sliding Window Rate Limiter com Redis:**
   - Algoritmo baseado em sorted sets Redis (`ZADD`, `ZREMRANGEBYSCORE`, `ZCARD`) garantindo contagem precisa sem picos de fronteira de janela.
2. **Limites Dinâmicos por Tier:**
   - Free: 60 req/min, Pro: 600 req/min, Enterprise: 6000 req/min (ou customizável).
   - Cabeçalhos de resposta HTTP padrão: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
3. **Resposta `429 Too Many Requests`:**
   - Retorno estruturado informando o tempo restante de espera (`Retry-After`).

## 3. Critérios de Aceite
- [ ] Requisições que excederem o limite do tier são barradas com código HTTP 429.
- [ ] Cabeçalhos de rate limit refletem a janela deslizante de forma acurada.
- [ ] Testes de concorrência com simulação de rajada (burst) respeitando o limite configurado.
