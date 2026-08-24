/**
 * Setup file executado antes de qualquer teste WF3.
 * Deve rodar antes de crypto.ts ser importado (ele checa
 * CREDENTIAL_ENCRYPTION_KEY no momento do carregamento do modulo).
 */
process.env.CREDENTIAL_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
