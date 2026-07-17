# Voice AI — Tenant-Safe Read-Only MCP Gateway (2026-07-17)

## Status

Accepted — Prompt 6A (read-only tools)

## Context

ElevenLabs conversational agents need org-scoped access to SynqDrive operational data without exposing user JWTs, cross-tenant IDs, or write capabilities. The production ADR (`VOICE_AI_PRODUCTION_ARCHITECTURE_ADR_2026-07-17.md` §4.4) defines a public MCP gateway with short-lived tokens, tool allowlists, and audit.

## Decision

### Endpoint

- Canonical path: `POST /api/v1/mcp/voice/{organizationId}`
- Public route (no user JWT); authentication via short-lived **MCP bearer token** in `Authorization` header only
- No session identifiers in query strings
- Structured `X-Request-Id` and `X-Correlation-Id` headers

### Transport

- Streamable HTTP compatible JSON-RPC 2.0 over POST
- Methods: `initialize`, `tools/list`, `tools/call`, `ping`
- MCP protocol version: `2024-11-05`

### Token model

Signed JWT (`typ: voice_mcp`) with claims:

| Claim | Purpose |
|-------|---------|
| `org` | organizationId |
| `vai` | voiceAssistantId |
| `adp` | agentDeploymentId |
| `cid` | conversationId |
| `tools` | allowedTools[] |
| `scopes` | e.g. `voice:mcp:read` |
| `jti` | nonce / replay tracking |
| `iat`, `exp` | lifetime (default 15 min) |

- Secret: `VOICE_MCP_TOKEN_SECRET` (fallback `JWT_SECRET` in dev)
- Issued nonces registered in Redis; verification rejects unknown/revoked nonces
- HTTP replay protection via `X-Request-Id` deduplication in Redis

### Middleware chain

1. Feature flag `VOICE_AI_MCP_GATEWAY_ENABLED`
2. Bearer token verification + tenant path match
3. Active voice subscription
4. Active agent deployment binding
5. Per-org rate limit (Redis)
6. Tool allowlist (token + assistant capability matrix)
7. Tool execution timeout
8. Redacted audit (`VoiceToolExecution`)

### Read-only tools (Phase 6A)

| Tool | Capability | Domain service |
|------|------------|----------------|
| `identify_customer` | `customerLookup` | `CustomersService.findAll` |
| `get_customer_summary` | `customerLookup` | `CustomersService.findById` |
| `find_booking` | `bookingSearch` | `BookingsService.findAll` |
| `get_booking_status` | `bookingSearch` | `BookingsService.findById` |
| `get_vehicle_status` | `bookingSearch` | `VehiclesService.findOne` |
| `get_invoice_status` | `customerLookup` | `InvoiceListReadService.list` |
| `get_branch_information` | `answerGeneralQuestions` | `StationsService.findAll` |
| `get_business_hours` | `answerGeneralQuestions` | `StationsService` + assistant config |

### Privacy

- No license/ID/payment payloads
- Phone masking unless caller phone matches tool argument
- Speech-safe refs (`customerRef`, `bookingRef`) instead of UUIDs
- PII redaction before audit logs

### Errors (no stack traces)

`CustomerNotFound`, `MultipleMatches`, `PermissionDenied`, `ToolNotAllowed`, `TenantMismatch`, `DataUnavailable`, `Timeout`, `RateLimited`, `InvalidToken`, `GatewayDisabled`

### Hard prohibitions (unchanged)

- No write tools
- No arbitrary SQL from tool args
- No generic HTTP proxy / shell / code execution

## Module

`backend/src/modules/voice-mcp-gateway/`

## Feature flag

`VOICE_AI_MCP_GATEWAY_ENABLED=true`

## Out of scope (this prompt)

- Write / confirmation-required tools
- Full webhook ingestion changes
- Live PSTN calls
- Customer UI

## Follow-up

- Prompt 6B+: token issuer at conversation start, ElevenLabs agent MCP URL wiring on deploy
- Billing entitlement hard gate (Phase 6 billing prompts)
