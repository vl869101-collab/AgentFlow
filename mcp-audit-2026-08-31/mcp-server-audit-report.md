# AGENTFLOW MCP SERVER ARCHITECTURE & IMPLEMENTATION AUDIT REPORT
**Audit Date:** August 31, 2026  
**Auditor:** MCP Building Elite — Architecture & Security Division (Worker Pane `pane-1308`)  
**Mission:** `11b0E8fKYlrP` — "MCP BUILDING ELITE — Complete MCP Server & Integration Engine"  
**Classification:** Production-Grade Technical Diagnostic & Conformance Audit  

---

## 1. Executive Summary

A comprehensive architectural inspection and security audit of the AgentFlow Model Context Protocol (MCP) server implementation was conducted. The audit analyzed protocol compliance against the Model Context Protocol specification (Protocol Version `2024-11-05`), JSON-RPC 2.0 transport mechanics, lifecycle discovery endpoints, tool schemas and aliases, multi-tenant RBAC security, cryptographic token validation, and Merkle-tree audit logging.

### Audit Verdict: **PASSED (PRODUCTION-READY WITH TARGETED OPTIMIZATIONS)**
The AgentFlow MCP server demonstrates robust engineering with strict multi-tenant isolation, cryptographic SHA-256 token verification, tamper-evident Merkle audit logging, dual camelCase/snake_case tool alias resolution, and comprehensive test coverage across CLI, IDE (Cursor/VSCode), Web, and desktop clients (Claude Desktop).

---

## 2. File & Component Architecture Map

```
apps/api/
├── src/
│   ├── mcp/
│   │   ├── protocol.ts         # JSON-RPC 2.0 types, MCP constants, standard error & result constructors
│   │   ├── server.ts           # Core MCP message dispatcher (handleMcpMessage), lifecycle & discovery
│   │   ├── tools.ts            # 125+ MCP Tool definitions, scope verification, execution engine (callTool)
│   │   └── state.ts            # In-memory server enablement state, active session registry & client metrics
│   ├── routes/
│   │   └── mcp.ts              # Fastify routes (/mcp, /mcp/http, /mcp/sse, /token, /status), Auth & Rate Limiting
│   ├── services/
│   │   ├── audit-ledger.ts     # Cryptographic Merkle-tree hash-chained audit logging
│   │   ├── nodes/
│   │   │   └── mcp-client.ts   # Outbound MCP Client node integration for AgentFlow workflows
│   │   └── vault/              # Credential resolution & universal injection engine
│   └── lib/
│       ├── prisma.ts           # Database ORM client (PostgreSQL / In-Memory adapter for tests)
│       └── store.ts            # Memory DB store lifecycle management
└── test/
    ├── mcp.test.ts                       # Core protocol, lifecycle, execution, aliases, scopes, mock flag
    ├── mcp-security-hardening.test.ts    # SHA-256 API key hashing, expiration, RBAC spoof prevention, multi-tenancy, Merkle audit
    └── mcp-platform-integrator.test.ts   # Multi-client compatibility (Claude Desktop, Cursor, Web), BullMQ async triggers
```

---

## 3. Detailed Architectural & Protocol Diagnostics

### 3.1 Transports & Protocol Mechanics (`/mcp`, `/mcp/http`, `/mcp/sse`)
* **Streamable HTTP (`POST /mcp`, `POST /mcp/http`, `POST /mcp/sse`):**
  * Implemented via `handleMcpPost` in `apps/api/src/routes/mcp.ts`.
  * Fully supports both single JSON-RPC 2.0 request objects and JSON-RPC 2.0 batch arrays (`JsonRpcRequest[]`).
  * Emits required HTTP headers on all responses:
    * `mcp-protocol-version: 2024-11-05`
    * `mcp-session-id: <session-id>`
  * Returns `HTTP 202 Accepted` with an empty body when all incoming messages are notifications (e.g. `notifications/initialized`).
* **Server-Sent Events (`GET /mcp`, `GET /mcp/http`, `GET /mcp/sse`):**
  * Implemented via `handleMcpGet` in `apps/api/src/routes/mcp.ts`.
  * Opens streaming connection with `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
  * Sends initial `: connected\n\n` frame and gracefully terminates on client disconnect.
* **Rate Limiting:**
  * Fastify rate-limiting middleware configured at 60 req/min per API key (expanded to 10,000 req/min during automated test runs).

### 3.2 JSON-RPC 2.0 Specification Conformance
* **Message Format:** Strictly validates `jsonrpc === "2.0"`. Malformed messages return `-32600` (Invalid Request) with `id: null`.
* **ID Propagation:** Preserves `id` types (string, number, null) throughout the entire dispatch cycle.
* **Standard Error Codes:**
  * `-32700`: Parse error
  * `-32600`: Invalid Request (non-2.0 or malformed structure)
  * `-32601`: Method not found (unsupported JSON-RPC method)
  * `-32602`: Invalid params (missing required tool name or parameter validation failure)
  * `-32003`: Security & Scope Violation (insufficient role privileges)

### 3.3 Server Lifecycle & Discovery Engine
* **`initialize`:**
  * Assigns or touches session ID (`mcp-<uuid>`).
  * Declares server capabilities:
    ```json
    {
      "protocolVersion": "2024-11-05",
      "capabilities": {
        "tools": { "listChanged": false },
        "resources": { "subscribe": false, "listChanged": false },
        "prompts": { "listChanged": false }
      },
      "serverInfo": { "name": "AgentFlow MCP Server", "version": "1.0.0" }
    }
    ```
  * Automatically records an audit event (`mcp.session.open`) into the tamper-evident Merkle ledger.
* **`notifications/initialized`:**
  * Touches session last-active timestamp without returning response payload.
* **`ping`:** Returns empty success result (`{}`) as a lightweight heartbeat.
* **`tools/list`:**
  * Returns the complete schema definitions for 125+ tools categorized into Workflows, Database, AI/LLM, Google Workspace, Slack, Comms, and Utilities.
  * Evaluates server toggle state via `isMcpEnabled()`; returns `{ tools: [] }` if MCP is globally disabled.
* **`resources/list` & `resources/read`:**
  * Exposes static and dynamic resources:
    * `agentflow://system/status`: Server health, version, protocol compliance.
    * `agentflow://workflows`: Active workflow counts and supported transport list.
    * `agentflow://metrics`: Real-time operational metrics.
    * `agentflow://tools`: Schema registry metadata.
* **`prompts/list` & `prompts/get`:**
  * Exposes AI generation prompts:
    * `build_workflow`: Generates workflow DAG nodes and edges from natural language descriptions.
    * `troubleshoot_execution`: Analyzes execution logs and node error traces to propose remediations.

### 3.4 Tool Execution Contracts & Alias Interoperability
* **Workflow Engine Integration:**
  * `search_workflows` (Alias: `searchWorkflows`, `list_workflows`): Queries organization workflows with status and search filters.
  * `execute_workflow` (Alias: `executeWorkflow`, `run_workflow`): Synchronously runs DAG execution via the workflow engine.
  * `get_workflow_details` (Alias: `getWorkflowDetails`, `get_execution_status`): Fetches workflow structure and historical run data.
  * `trigger_workflow` (Alias: `triggerWorkflow`): Asynchronously queues workflow execution via BullMQ.
  * `validate_workflow` (Alias: `validateWorkflow`): Performs static topology validation, cycle detection, and missing parameter verification.
* **Node Tool Calling (`execute_node_tool` / `mcp_client_call_tool`):**
  * Seamlessly routes tool calls through AgentFlow's outbound MCP client (`apps/api/src/services/nodes/mcp-client.ts`), supporting workflow-level chaining of external MCP servers.

---

## 4. Security, Multi-Tenancy & Cryptographic Verification

### 4.1 Authentication Hierarchy
1. **API Key Token Authentication (`af_*`):**
   * Raw tokens formatted as `af_<32_hex_chars>`.
   * Stored and looked up exclusively via SHA-256 cryptographic hashes (`createHash("sha256").update(token).digest("hex")`) in `prisma.apiKey`.
   * Validates `expiresAt` expiration thresholds.
   * Updates `lastUsed` timestamp asynchronously without blocking the request pipeline.
2. **JWT Session Authentication:**
   * Validates bearer JWT tokens via Fastify JWT verification.
   * Resolves `userId` and `orgId` against active organization memberships.

### 4.2 Server-Side RBAC Scope Enforcement
* **Role Derivation (`deriveScopesForRole`):**
  * `OWNER` / `ADMIN`: `["*"]` (unrestricted access)
  * `MEMBER`: `["workflows:read", "workflows:write", "workflows:execute", "executions:write", "executions:read", "tools:call", "tools:list"]`
  * `VIEWER`: `["workflows:read", "executions:read", "tools:list"]`
* **Anti-Spoofing Protection:**
  * In production mode, client-sent headers (e.g. `x-mcp-scopes`) are strictly ignored. Scopes are derived server-side from the verified database role.
* **Granular Tool Enforcement (`scopeMatches`):**
  * Every tool specifies required scopes in `MCP_TOOLS`.
  * `callTool` validates that the caller's scopes satisfy tool requirements before invoking the handler. Unauthorized calls return an error with standard code `-32003`.

### 4.3 Multi-Tenant Boundary Confinement
* All database queries in tool handlers (`search_workflows`, `execute_workflow`, `get_workflow_details`, `create_workflow`, etc.) are partitioned by `orgId`.
* Direct ID lookups across organizational boundaries return `Workflow not found` (preventing ID enumeration or metadata leakage).

### 4.4 Tamper-Evident Merkle Audit Ledger
* Every session open (`mcp.session.open`), tool execution (`mcp.tool.call`), and status modification (`mcp.status.update`) is recorded via `recordAuditEvent`.
* Each audit entry is cryptographically linked using SHA-256 hash chains (`entryHash = H(prevHash + action + metadata)`), verifiable via `verifyAuditLedgerIntegrity(orgId)`.

### 4.5 Production Safety Controls (`MOCK_MCP`)
* When `process.env.MOCK_MCP === "false"`, all mock-flagged tools (`isMock: true`) are rejected with an explicit error, preventing synthetic tools from executing in live production deployments.

---

## 5. Test Suite Verification & Audit Evidence

The MCP implementation was verified across three comprehensive test suites:

| Test Suite | File | Focus Areas | Result |
| :--- | :--- | :--- | :--- |
| **Core MCP Suite** | `apps/api/test/mcp.test.ts` | Streamable HTTP 401 auth rejection, `initialize` handshake, `tools/list` schema validation, real DAG execution, BullMQ async trigger, camelCase aliases, scope enforcement, `MOCK_MCP=false` enforcement, resources & prompts, `/mcp/token` generation, `/mcp/status` | **100% PASSING** |
| **Security Hardening Suite** | `apps/api/test/mcp-security-hardening.test.ts` | Missing & invalid tokens, SHA-256 API key lookup & expiration, server-side RBAC anti-spoofing, multi-tenant isolation (Org A vs Org B confinement), Merkle hash chain cryptographic integrity | **100% PASSING** |
| **Platform Integrator Suite** | `apps/api/test/mcp-platform-integrator.test.ts` | Multi-client compatibility (Claude Desktop, Cursor IDE, Web), tools discovery across 15+ core tools, real DAG workflow execution with AI scoring and Slack notification nodes, BullMQ queuing | **100% PASSING** |

---

## 6. Identified Gaps & Remediation Plan

| ID | Category | Description | Severity | Remediation Plan |
| :--- | :--- | :--- | :--- | :--- |
| **GAP-01** | Protocol Spec | In `apps/api/src/mcp/protocol.ts`, line 2 mentions draft date `2025-03-26` in comments while `MCP_PROTOCOL_VERSION` is pinned to official `2024-11-05`. | **LOW (Documentation)** | Harmonize comment in `protocol.ts` to reference official `2024-11-05` specification. |
| **GAP-02** | Discovery Metadata | Tool aliases (camelCase / snake_case) are handled at runtime in `callTool` and `HANDLERS`, but `tools/list` only outputs canonical names. | **MEDIUM (Developer Experience)** | Add an `aliases` array or `metadata` property to `McpTool` definition so client LLMs can discover available alias bindings. |
| **GAP-03** | SSE Streaming | While SSE transport `/mcp/sse` is open and maintains keep-alive, tool execution progress notifications (`notifications/progress`) for long-running workflows currently execute synchronously. | **LOW (Feature Enhancement)** | Wire SSE event streaming to BullMQ execution events to broadcast real-time node progress over the open SSE connection. |
| **GAP-04** | Resource Subscriptions | `resources/list` reports `"subscribe": false`. Active monitoring of workflow execution status requires polling `resources/read`. | **LOW (Optimization)** | Implement `resources/subscribe` and `resources/unsubscribe` handlers backed by an EventEmitter for real-time workflow state updates. |

---

## 7. Verification Commands

To execute and verify the MCP test suites:

```bash
# Run Core MCP Protocol Tests
npm --prefix apps/api test -- test/mcp.test.ts

# Run Security Hardening & Merkle Audit Tests
npm --prefix apps/api test -- test/mcp-security-hardening.test.ts

# Run Platform Integrator & Client Handshake Tests
npm --prefix apps/api test -- test/mcp-platform-integrator.test.ts
```

---
*Report compiled and verified by AgentFlow MCP Building Elite Division.*
