# AI Agent Limits, Cache & Cost Boundaries — 2026-07-25 (Prompt 26/32)

Production guardrails for the SynqDrive Fleet AI Assistant: Redis-backed rate limits, concurrency slots, token budgets, circuit breaker, tool cache rules, and user-facing limit errors.

## Scope

Applies to `POST /organizations/:orgId/chat/message` and SSE stream endpoints via `ChatService` → `FleetChatOrchestratorService` → `AiDomainToolRegistry` → `AiAgentLlmExecutorService`.

Global Nest `@nestjs/throttler` (200/min/IP) remains; this layer adds **org/user-scoped** limits on top.

## Limit dimensions

| Dimension | Mechanism | Default (env) |
|-----------|-----------|---------------|
| Per user rate | Redis fixed window `incr` | 30/min (`AI_AGENT_RATE_LIMIT_PER_USER_PER_MINUTE`) |
| Per org rate | Redis fixed window | 120/min (`AI_AGENT_RATE_LIMIT_PER_ORG_PER_MINUTE`) |
| Per IP (supplementary) | Redis fixed window | 60/min (`AI_AGENT_RATE_LIMIT_PER_IP_PER_MINUTE`) |
| Parallel requests (org) | Redis Lua slot acquire | 5 (`AI_AGENT_MAX_CONCURRENT_PER_ORG`) |
| Parallel requests (user) | Redis Lua slot acquire | 2 (`AI_AGENT_MAX_CONCURRENT_PER_USER`) |
| Tool invocations / chat | In-process tracker in orchestrator | 8 (`AI_AGENT_MAX_TOOL_INVOCATIONS_PER_CHAT`) |
| LLM retries | `AiAgentLlmExecutorService` loop + backoff | 1 (`AI_AGENT_MAX_LLM_RETRIES`) |
| Token budget (user/day) | Redis `INCRBY` UTC day bucket | 100k (`AI_AGENT_TOKEN_BUDGET_PER_USER_PER_DAY`) |
| Token budget (org/day) | Redis `INCRBY` UTC day bucket | 500k (`AI_AGENT_TOKEN_BUDGET_PER_ORG_PER_DAY`) |
| Max tokens / LLM call | `maxTokens` cap on gateway | 768 (`AI_AGENT_MAX_TOKENS_PER_LLM_CALL`) |
| Conversation history | `getHistory` cap | 100 (`AI_AGENT_MAX_CONVERSATION_HISTORY`) |
| Per-tool timeout | `withTimeout` in registry | per tool definition `timeoutMs` |
| Request timeout | `AiAgentLimitsService.withRequestTimeout` | 45s (`AI_AGENT_REQUEST_TIMEOUT_MS`) |
| Provider circuit breaker | In-process `ClickHouseCircuitBreaker` pattern | 5 failures / 60s cooldown |

Master switch: `AI_AGENT_LIMITS_ENABLED` (default `true`). Redis failures: `AI_AGENT_LIMITS_FAIL_OPEN` (default `true`).

## Cache rules (`AiAgentToolCacheService`)

| Data | Policy |
|------|--------|
| Live vehicle location | Request cache + Redis 3s TTL; **never** cache `isLastKnownLocation` |
| Telemetry status | `request_short_ttl` per tool definition |
| Health summary | `request_short_ttl` aligned to domain freshness |
| Booking / return context | `no_cache` or short TTL — no long uncertain TTLs |
| Permissions / auth | Never cached cross-tenant; keys always include `organizationId` |
| PII | Cache stores sanitized tool outcomes only |

Redis keys: `synqdrive:ai-chat:tool:{orgId}:{toolName}:{hash}`.

Request-scoped cache is cleared in `ChatService` `finally` via `correlationId`.

## User-facing errors

`AiAgentLimitException` → persisted assistant message + structured `warnings: [kind]`:

| Kind | HTTP (API) | User message (DE) |
|------|------------|-------------------|
| `rate_limit` | 429 | Zu viele Anfragen… |
| `concurrency_limit` | 429 | Zu viele parallele Anfragen… |
| `budget_exceeded` | 503 | Tägliches KI-Budget erreicht… |
| `provider_overloaded` | 503 | KI-Anbieter überlastet… |
| `circuit_breaker_open` | 503 | Assistent vorübergehend nicht verfügbar… |
| `tool_timeout` | — | Datenabruf zu lange (domain error in tool outcome) |
| `request_timeout` | — | Anfrage zu lange… |

Stream path emits `error` SSE event with the same copy before `result`.

## Module layout

```
backend/src/modules/ai/limits/
  ai-agent-limits.service.ts          # facade: acquire/release, budget, timeout
  ai-agent-rate-limit.service.ts      # org/user/ip windows
  ai-agent-concurrency.service.ts     # parallel slots
  ai-agent-token-budget.service.ts    # daily token budget
  ai-agent-tool-cache.service.ts      # tool outcome cache
  ai-llm-circuit-breaker.service.ts   # provider breaker
  ai-agent-llm-executor.service.ts    # LLM + retries + budget record
  ai-agent-limit.errors.ts            # AiAgentLimitException
```

## Observability

- Rate/concurrency/budget failures logged at `warn` when fail-open.
- Tool timeouts audited as `ai.domain_tool.timeout` (existing registry audit).
- Circuit breaker state available via `AiLlmCircuitBreakerService.getSnapshot()` (internal).

## Tests

- Unit: rate limit, tool cache rules.
- Integration: `ai-agent-limits.integration.spec.ts` — rate, concurrency, budget, circuit breaker, request timeout mapping.
