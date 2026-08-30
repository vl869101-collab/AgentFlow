# Hackerai — Full Security Audit Prompt

## Target
AgentFlow — Full-stack workflow automation platform
- Backend: Fastify + Prisma + PostgreSQL + Redis
- Frontend: Next.js 15 + React + TypeScript
- Auth: JWT (access + refresh tokens)
- AI: NVIDIA NIM integration
- Billing: Stripe integration

## Scope
Perform an exhaustive security audit of the entire codebase. Check EVERY file under:
- `apps/api/src/` (all routes, middleware, services, lib)
- `apps/web/src/` (all pages, components, lib, hooks)
- `packages/shared/src/` (schemas, validation)
- `packages/database/prisma/schema.prisma` (data model)
- Config files: `.env`, `docker-compose.yml`, `Dockerfile`, `tsconfig.json`, `next.config.ts`

## Vulnerability Categories — Check ALL

### 1. Authentication & Authorization
- JWT weaknesses (algorithm confusion, key strength, expiry)
- Token storage vulnerabilities (XSS token theft)
- Missing auth guards on routes
- IDOR (Insecure Direct Object References) — can user A access user B's data?
- Role-based access control bypasses
- Session fixation / session hijacking
- Refresh token rotation issues
- Password policy enforcement

### 2. Injection Attacks
- SQL injection via Prisma raw queries or string interpolation
- NoSQL injection
- Command injection (any `exec`, `spawn`, `eval`, `Function()`)
- Template injection
- LDAP injection
- Header injection (CRLF)

### 3. Cross-Site Scripting (XSS)
- Stored XSS in user inputs (workflow names, descriptions, configs)
- Reflected XSS in error messages or query params
- DOM-based XSS via `innerHTML`, `dangerouslySetInnerHTML`, `document.write`
- Next.js specific: `getServerSideProps` data injection, `__NEXT_DATA__`

### 4. Cross-Site Request Forgery (CSRF)
- Missing CSRF tokens on state-changing endpoints
- Cookie-based auth without SameSite/HttpOnly/Secure flags
- CORS misconfiguration allowing credential theft

### 5. Server-Side Request Forgery (SSRF)
- NVIDIA NIM proxy — can URL be manipulated?
- HTTP node in workflow executor — can it hit internal services?
- Webhook endpoints — do they validate callback URLs?
- Any URL input that gets fetched server-side

### 6. Broken Access Control
- Missing rate limiting on sensitive endpoints
- Privilege escalation (user → admin)
- Mass assignment vulnerabilities
- GraphQL-specific: introspection enabled, missing depth limiting

### 7. Security Misconfiguration
- `.env` file exposure (git history, Docker, logs)
- Default credentials / secrets in code
- Verbose error messages leaking stack traces
- Missing security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- Debug mode in production
- Unnecessary ports/services exposed

### 8. Cryptographic Issues
- Weak hashing (MD5, SHA1 for passwords)
- Hardcoded encryption keys
- Insecure random number generation for tokens
- Missing encryption at rest for sensitive data (credentials, API keys)
- TLS/SSL configuration issues

### 9. Data Exposure
- Sensitive data in logs (passwords, tokens, API keys)
- API responses returning more data than needed (over-fetching)
- Database connection strings in error messages
- Stack traces exposed to clients
- NVIDIA API key in git history

### 10. Business Logic Flaws
- Race conditions in workflow execution
- Quota bypass (can users exceed limits?)
- Payment manipulation (Stripe webhook signature verification)
- Workflow execution sandboxing (can nodes access other workflows?)
- IDOR in workflow/execution/approval access

### 11. Dependency Vulnerabilities
- Check `package.json` files for known CVEs
- Outdated packages with security patches
- Supply chain risks (typosquatting, dependency confusion)

### 12. Container & Infrastructure Security
- Dockerfile best practices (running as root, layer caching secrets)
- Docker Compose security (exposed ports, volume permissions)
- PostgreSQL security (authentication method, network exposure)
- Redis security (requirepass, bind address)

### 13. API Security
- Missing input validation on all endpoints
- Request size limits
- Content-Type validation
- API versioning
- Request/response signing
- OpenAPI/Swagger exposure

### 14. Frontend Security
- Client-side secret exposure (`NEXT_PUBLIC_*` vars)
- Source map exposure in production
- Subresource Integrity (SRI) missing
- Open redirect vulnerabilities
- Clickjacking via iframe embedding

### 15. Workflow Engine Security
- Node code execution sandboxing (can code nodes escape?)
- HTTP node SSRF potential
- Condition node injection
- Workflow data isolation between users
- Execution history access control

## Output Format

For EACH vulnerability found, report:

```
### [SEVERITY: CRITICAL/HIGH/MEDIUM/LOW/INFO] — [Vulnerability Title]

**File:** `path/to/file.ts:line_number`
**Category:** [from list above]
**CWE:** CWE-XXX

**Description:** What the vulnerability is and how it works.

**Proof of Concept:**
[Code snippet or steps to reproduce]

**Impact:** What an attacker could achieve.

**Remediation:**
[Specific fix with code example]
```

## Severity Definitions
- **CRITICAL**: Remote code execution, auth bypass, data breach of all users
- **HIGH**: Privilege escalation, significant data exposure, SSRF
- **MEDIUM**: XSS, CSRF, IDOR on non-critical data
- **LOW**: Missing headers, verbose errors, info disclosure
- **INFO**: Best practice violations, hardening opportunities

## Rules
1. Check EVERY file, not just obvious ones
2. Follow the data flow from input to output
3. Test each vulnerability class independently
4. Assume the attacker has a valid user account
5. Consider chained vulnerabilities (low + low = high)
6. Include fix suggestions for every finding
7. Prioritize by exploitability and impact
