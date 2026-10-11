# R1 — Provider budget, failures, and retries

## Components (CONFIRMED_FROM_CODE)

| Component | Path |
|-----------|------|
| Request executor | `provider-budget/dimo-request-executor.service.ts` |
| Global budget | `DIMO_GLOBAL_BUDGET_ENABLED` (observed on Production **by name**) |
| Admission / limiter | `provider/dimo-provider-admission.service.ts`, `dimo-provider-limiter.service.ts` |
| Queue backpressure | `provider-budget/dimo-queue-backpressure.service.ts` |
| Metrics | `provider/dimo-provider-metrics.service.ts` |

## Request categories (typical)

Callers pass `category` + `priority` into `DimoRequestExecutor.execute()`. Examples:

- `ADMIN` — triggers list, ops
- Snapshot / trip enrichment categories (see Driving Intelligence EXP-021 contracts for `POST_TRIP_ENRICHMENT`)

## Failure semantics (partial)

| HTTP | Typical handling |
|------|------------------|
| 401/403 | Auth refresh / terminal failure on token exchange |
| 429 | Budget / cooldown — DI S4F certification references retryable SOURCE_FAILURE |
| 503 | Snapshot job retry via BullMQ attempts |

**Circuit / cooldown:** Implemented in budget Lua scripts (see DI `EXP021_S4F2_PROVIDER_BACKPRESSURE_CLOSURE` evidence).

## R1 gaps

- Exact global budget numeric limits on Production: **UNKNOWN** (values redacted)
- Per-category counters on Production: **UNKNOWN** without metrics scrape (read-only)
