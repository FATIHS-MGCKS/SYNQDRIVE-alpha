# Fleet AI Assistant — Test Matrix & Coverage — 2026-07-25 (Prompt 27/32)

Contract-grade unit and integration tests for all Fleet AI components (Prompts 5–26).

## Test inventory (39 suites, 360 tests)

| Area | Spec files | Contract focus |
|------|------------|------------------|
| Evidence & contracts | `ai-evidence.validation.spec.ts`, `fleet-ai-evidence-matrix.spec.ts`, `ai-evidence-telemetry.mapper.spec.ts`, `ai-domain-error.spec.ts` | Validation, freshness, availability, confidence, reason codes, reason→error mapping, PII/`forLlm` |
| Security | `ai-execution-context.spec.ts`, `chat-execution-context.resolver.spec.ts`, `fleet-chat-security.detector.spec.ts`, `ai-domain-tool-registry.spec.ts` | Context, tenant isolation, roles, manipulated IDs, missing membership, injection |
| Resolvers | `ai-vehicle-resolution.spec.ts`, `fleet-chat-intent-router.spec.ts` | Plates, VIN, vehicle name, ambiguity, foreign org, booking context, combined intents |
| Tools | Five `ai-get-*` / overdue / booking specs + mapper | Location, telemetry, health, overdue, booking, partial, timeout, provider outage |
| Router & orchestrator | `fleet-chat-orchestrator.spec.ts`, `fleet-chat-orchestrator.contract.spec.ts` | Intents, parallelism, max tool cap, LLM outage, permission, clarification |
| Answer composition | `fleet-chat-evidence-response.golden.spec.ts`, `fallback.spec.ts`, `fleet-chat-evidence-context.util.spec.ts`, `fleet-chat-evidence-llm-input.builder.spec.ts` | Grounding guards, last-known, limited data, inconsistent state, safe fallback |
| Limits & audit | `ai-agent-*.spec.ts`, `ai-request-audit.service.spec.ts` | Rate limits, concurrency, budget, circuit breaker, tool cache |
| Documents / Mistral (parallel) | `documents/*.spec.ts`, `providers/mistral/*.spec.ts` | AI Upload OCR path (not fleet chat) |

Shared fixtures: `backend/src/modules/ai/__fixtures__/fleet-ai-test.fixtures.ts`.

## Coverage report (backend `modules/ai/`)

Command:

```bash
cd backend && npm test -- --testPathPattern='src/modules/ai/' \
  --coverage \
  --collectCoverageFrom='modules/ai/**/*.ts' \
  --collectCoverageFrom='!modules/ai/**/*.spec.ts' \
  --coverageReporters=text-summary
```

**Snapshot (2026-07-25):**

| Metric | Coverage |
|--------|----------|
| Statements | **65.28%** (3163/4845) |
| Branches | **55.92%** (1445/2584) |
| Functions | **51.98%** (562/1081) |
| Lines | **66.53%** (3016/4533) |

Artifact: `backend/coverage/coverage-summary.json` after run.

## Remaining gaps (documented, not blocking)

### P1 — HTTP / E2E

- `ChatController` integration tests mock `ChatService` — no JWT `AuthGuard` + real orchestrator in-process.
- Playwright `e2e/ai-chat-flow.spec.ts` covers 5 representative SSE flows (not all 27 × locale).

### P1 — Router LLM path

- `FleetChatIntentRouterService` with mocked `LlmGatewayService` classification (util schema tested; service path not).

### P2 — Orchestrator edge cases

- Orchestrator does not propagate `AiAgentLimitException` (budget/circuit) to user-facing limit copy — handled in `ChatService` acquire path only.
- `SYNQDRIVE_KNOWLEDGE` with tools empty finalizes as `TEMPORARY_UNAVAILABLE` when `skipLlm` (documented contract test).

### P2 — Tool coverage holes

- Individual tool files &lt;100% branch coverage on DIMO edge paths (live fetch, webhook recovery).
- `get_vehicle_booking_context` partial field combinations not exhaustively table-driven.

### P2 — Evidence

- `partial_data` reason code intentionally has **no** domain-error mapping (documented in matrix spec).
- Confidence `unknown` on observed evidence edge case.

### P3 — Frontend

- Full `frontend` vitest suite has unrelated pre-existing failures outside AI module.
- No dedicated frontend unit tests for `AIAssistantView` structured rendering (E2E responsive only).

### P3 — Hygiene

- Migrate legacy specs to `fleet-ai-test.fixtures.ts` (duplicate fleet corpus in router/resolution specs).
- `FleetChatIntentRouterService` integration with real `AiVehicleResolutionService` + Prisma (test DB).

## Running tests

```bash
# All Fleet AI backend tests
cd backend && npm test -- --testPathPattern='src/modules/ai/'

# Frontend Playwright (layout)
cd frontend && npx playwright test e2e/ai-chat-responsive.spec.ts
```

## Architecture cross-links

- Evidence model: `FLEET_AI_EVIDENCE_MODEL_2026-07-24.md`
- Limits: `AI_AGENT_LIMITS_AND_CACHE_2026-07-25.md`
- Audit: `AI_REQUEST_AUDIT_LOGGING_2026-07-25.md`
