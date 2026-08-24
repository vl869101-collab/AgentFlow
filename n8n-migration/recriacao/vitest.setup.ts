/**
 * Setup file executed before any test files are loaded.
 * Must run before crypto.ts is imported (it checks for CREDENTIAL_ENCRYPTION_KEY
 * at module load time).
 */
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
