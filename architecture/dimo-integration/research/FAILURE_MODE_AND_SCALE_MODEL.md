# R2 — Failure modes and scale model

## Failure matrix (selected)

| Mode | Detection | Retry | Data loss risk | SynqDrive path |
|------|-----------|-------|----------------|----------------|
| Vehicle JWT expired | 401 from GraphQL | Re-fetch via `getVehicleJwt` + lock | Poll skip for vehicle | Auth service |
| Consent revoked | 403 exchange/GraphQL | Terminal until re-link | Stale VLS possible | Onboarding |
| Invalid privileges | 403 | No auto subset retry | Query empty/error | Gateway |
| GraphQL 422 | HTTP error / validate-segments | Job fail + BullMQ retry | Segment fetch miss | Segments client |
| Provider 429 | Budget executor | Backoff / cooldown | Delayed freshness | `DimoProviderBudgetService` |
| 5xx / timeout | Axios | BullMQ attempts on snapshot | Missed poll window | Processor |
| Redis down | Infra alert | Scheduler/worker degrade | **UNKNOWN** | Platform |
| Queue saturated | Backpressure service | Defer enqueue | Slower tiers | `DimoQueueBackpressureService` |
| Duplicate webhook | No edge dedupe | Coalesce downstream | Duplicate wake jobs possible | Wake coordinator |
| Missed webhook | No event | Scheduler tier poll | Delay until poll | APDS |
| Stale hardware data | Freshness rules | N/A (not error) | Wrong business decisions | Consumers |
| Offboarded vehicle | Registry lifecycle gate | Skip poll | No new fetches | `dimo-snapshot.processor` |
| Driving events failure | HTTP error | 3 retries then `[]` | **Silent zero events** | DIM-GAP-007 |

## Scale model (THEORETICAL)

Assumptions stated explicitly.

### Snapshot Q001 only (tier mix)

| Fleet | All ACTIVE_DRIVING 30s | All LONG_IDLE 30min |
|-------|------------------------|---------------------|
| 5 | 14.4k calls/day | 240 calls/day |
| 50 | 144k | 2.4k |
| 500 | 1.44M | 24k |
| 5000 | 14.4M | 240k |

**Production:** activity-tier polling **enabled**; real mix between tiers — **OBSERVED_BEHAVIOR** not measured in R2.

### With global budget enabled

`DIMO_GLOBAL_BUDGET_ENABLED=true` on Production — admission may throttle before theoretical max (**INFERRED**, numeric limits UNKNOWN_REDACTED).

### Active trip parallel queries

During trips, Q006–Q008 add multipliers (see Phase 2A §22) — **THEORETICAL**.
