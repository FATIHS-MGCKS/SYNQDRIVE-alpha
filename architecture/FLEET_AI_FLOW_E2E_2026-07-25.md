# Fleet AI — Full Data Flow E2E — 2026-07-25 (Prompt 28/32)

End-to-end and integration tests for the complete AI data path:

**Frontend → API → Auth → Intent → Resolver → Domain Tools → Evidence → LLM/fallback → Response → Frontend**

All scenarios use controlled fixtures in `fleet-ai-flow.fixtures.ts` / `fleet-ai-test.fixtures.ts` — no production customer data.

## Backend integration

| Spec | Scope |
|------|--------|
| `chat/chat.flow.integration.spec.ts` | Table-driven: **27 scenarios × de/en** (55 cases) + audit metadata |
| `chat/chat.controller.integration.spec.ts` | Supertest: `POST /api/v1/organizations/:orgId/chat/message`, SSE `/message/stream`, validation |

Harness: `__fixtures__/fleet-ai-pipeline.harness.ts` — real `FleetChatOrchestratorService` with mocked router/tools/LLM; real evidence `prepare`/`finalize`/`compose`.

**Deterministic fallback contract:** LLM mock returns **empty content** with `llmUsed: true` so `finalize()` keeps `prepared.responseType` while `buildDeterministicFallback()` supplies visible text.

## Frontend Playwright

| Spec | Scope |
|------|--------|
| `e2e/ai-chat-flow.spec.ts` | Key flows on `desktop-1280`: location fresh, health limited (EN), overdue, combined, permission denied |
| `e2e/ai-chat-flow-fixtures.ts` | Controlled SSE payloads for `POST .../chat/message/stream` |

Mocks extend `ai-chat-fixtures.ts` — route matcher resolves user message → SSE `status` / `progress` / `result`.

## Binding scenario coverage

| Area | IDs | de/en |
|------|-----|-------|
| Standort | `location-fresh`, `location-last-known`, `location-stale`, `location-unavailable`, `location-telemetry-disconnected`, `location-provider-timeout` | ✓ |
| Health | `health-unremarkable`, `health-limited-data`, `health-critical-dtc`, `health-battery-warning`, `health-stale-tire`, `health-observation-blocker`, `health-signal-not-supported` | ✓ |
| Overdue | `overdue-true`, `overdue-grace-period`, `overdue-extension-approved`, `overdue-completed`, `overdue-stale-runtime`, `overdue-no-booking`, `overdue-cancelled-wrongly` | ✓ |
| Combined | `combined-location-overdue`, `combined-health-telemetry`, `combined-full-summary` | ✓ |
| Security | `security-foreign-org`, `security-role-restricted`, `security-customer-pii`, `security-manipulated-id` | ✓ |

## Test results (2026-07-25)

```bash
cd backend && npm test -- --testPathPattern='chat.flow.integration|chat.controller.integration' --no-coverage
# 58 passed (55 flow table + 1 audit + 2 controller)

cd backend && npm test -- --testPathPattern='src/modules/ai/' --no-coverage
# 368+ tests (full AI module suite)
```

## Remaining gaps

### P1 — True HTTP stack

- `ChatController` tests mock `ChatService` — no JWT `AuthGuard`, real `ChatService` → orchestrator, or Redis limits in-process.
- No supertest against running app with test DB + seeded fleet vehicles.

### P1 — Orchestrator clarification path

- `security-manipulated-id` returns **without** `structuredResponse` (early clarification) — frontend E2E not yet asserting this path.

### P2 — LLM success path

- Flow integration tests use deterministic fallback only; grounded LLM text success (`llmUsed` + validation) not table-driven per scenario.

### P2 — Frontend E2E breadth

- Playwright flow spec covers 5 representative scenarios, not all 27 × locale.
- No EN stream content assertion for location/overdue/combined (DE locale in openAiChatPage init).

### P3 — COMBINED / BOOKING fallback

- `buildDeterministicFallback` now includes `BOOKING_SUMMARY` and `COMBINED_SUMMARY` branches (added for flow tests).

### P3 — Product vs test alignment

- Tool errors with `data == null` resolve as `PARTIAL_DATA`, not `PERMISSION_RESTRICTED`, unless `permission_denied` — scenarios updated to match composer.

## Running tests

```bash
# Backend flow integration
cd backend && npm test -- --testPathPattern='chat.flow.integration'

# Frontend flow E2E (requires dev server)
cd frontend/e2e && npx playwright test ai-chat-flow.spec.ts --project=desktop-1280
```
