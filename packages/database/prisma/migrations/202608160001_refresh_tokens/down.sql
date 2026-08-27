-- Reversal for 202608160001_refresh_tokens
ALTER TABLE IF EXISTS "RefreshToken" DROP CONSTRAINT IF EXISTS "RefreshToken_userId_fkey";
DROP INDEX IF EXISTS "RefreshToken_userId_revokedAt_idx";
DROP INDEX IF EXISTS "RefreshToken_userId_expiresAt_idx";
DROP INDEX IF EXISTS "RefreshToken_tokenHash_key";
DROP INDEX IF EXISTS "RefreshToken_jti_key";
DROP TABLE IF EXISTS "RefreshToken";
