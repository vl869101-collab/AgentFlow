---
id: LxcIFBDC-2
missionId: LxcIFBDCnAvU
titulo: Fix web server startup issue on port 3000. The apps/web dev server has turbop...
status: aberto
---

Fix web server startup issue on port 3000. The apps/web dev server has turbopack timeout issues. Check package.json dev script, next.config, port conflicts. Try starting it and report what happens.

---
Worker contract (mandatory, in order):
1. pwd — confirm the repo.
2. Read the pointed item (+ parent item if a slice, for context).
3. Execute strictly within the item's file scope.
4. Write the result back into the item (Correção/notas + session id).
5. Commit with pathspec citing the item ID — this commit is PRE-AUTHORIZED by this contract; do not ask permission, do not wait to be asked.
6. handoff_submit as your last action.

## Resultado

**Diagnóstico (4 pontos):**
1. `apps/web/package.json` — dev script correto: `next dev --turbopack --port 3000` ✓
2. `apps/web/next.config.ts` — já tinha fix anterior aplicado: `turbopack.root` fixando a raiz do repo (`path.resolve(__dirname, "../..")`), impedindo o watcher de inferir `C:\Users\VICTOR` como root (pnpm-lock.yaml solto na home). ✓
3. Porta 3000 — estava livre, sem processo zumbi (netstat confirmou). ✓
4. Iniciei `pnpm dev` em `apps/web` (task s0maumla, PID 1616 → node PID 26804 escutando na 3000). A primeira compilação do turbopack demorou ~4-5 min porque o `.next` estava limpo — o "timeout" visto antes era compilação lenta de cold start, não crash. Depois do warm-up, responde HTTP 200 em ~2-3s com HTML completo (70KB, chunks turbopack).

**Status: web server no ar na porta 3000.** API na 3001 intacta. Nota: cold start do turbopack no Windows é lento — não matar o processo durante a primeira compilação.

Session: Command Code CLI · 2026-08-16 · task s0maumla (dev server rodando)
