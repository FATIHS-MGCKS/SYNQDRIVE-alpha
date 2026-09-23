# M3.3C C4 — Shadow lifecycle wiring (post-mutation triggers)

**Date:** 2026-09-23  
**Scope:** Wire C3 `RestSessionFeatureComputationService` behind default-OFF shadow flag via synchronous post-mutation triggers. No queues, no production deploy, no schema change.

## Execution model

`C4_EXECUTION_MODEL=SYNCHRONOUS_POST_MUTATION_FAIL_OPEN`

1. Authoritative rest-session / late-association mutation completes (separate repository calls / commits).
2. `RestSessionFeatureShadowTriggerService.triggerFeatureComputation()` runs.
3. C3 opens its own Serializable transaction + session `FOR UPDATE`.
4. C3 failures are caught → `FAILED_ISOLATED`; primary lifecycle outcome unchanged.

## Trigger graph

| Trigger reason | Hook location | C3 phase (derived) |
|----------------|---------------|-------------------|
| `VALID_REST_OBSERVATION_LINKED` | `BatteryRestSessionService.processObservation` after valid rest GE link | INCREMENTAL (when session active) |
| `REST_SESSION_TERMINAL` | `BatteryRestSessionService.endSession` after status/endReason/endedAt persist | FINAL (trust from session) |
| `LATE_TRIP_ASSOCIATION` | `LateTripAssociationService.linkSessionToTrip` after session + GE tripId updates | INCREMENTAL or FINAL per persisted session |

**Explicitly not wired**

- `ENGINE_OFF_TRANSITION` session open — no C4 compute (incremental waits for material valid rest or terminal).
- `GeneralizedEvidenceCaptureService` — no direct C3 hook (avoids pre-linkage / duplicate semantics).
- `ProviderObservabilityGapService` — no direct feature trigger.

## Double flag gate

- C4 trigger checks `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED` before calling C3.
- C3 retains the same gate before any DB access.
- Flag OFF → `SKIPPED_FLAG_OFF`, zero `computeAndPersist` invocations.

## Nest registration

`BatteryGeneralizedEvidenceModule` providers:

- `RestSessionFeatureComputationService` (`@Injectable`, `PrismaService` injection)
- `RestSessionFeatureShadowTriggerService`
- Existing lifecycle services receive optional trigger injection.

Registration performs zero feature-table queries at bootstrap.

## Outcome contract (C4 layer)

`SKIPPED_FLAG_OFF` | `CREATED` | `DUPLICATE_EXISTING` | `SESSION_NOT_FOUND` | `FAILED_ISOLATED`

Trigger reason and terminal subcontext are log metadata only — **not** in C3 digest.

## Dedupe authority

`C4_DEDUPE_AUTHORITY=C3_INPUT_DIGEST` — no Redis/process mutex in C4.

## Validation

| Suite | Command |
|-------|---------|
| C4 unit | `jest rest-session-feature-shadow-trigger.service.spec` |
| C4 module DI | `jest rest-session-feature-shadow-trigger.module.spec` |
| C4 Postgres | `test:battery:v2:rest-session-feature:shadow:postgres` |
| C3 regression | `test:battery:v2:rest-session-feature:computation:postgres` + policy unit |
| C1/C2 regression | existing battery retention + charge-opportunity suites |

## Production constraints (unchanged)

- `C1_PRODUCTION_MIGRATION_APPLIED=NO`
- `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED=false`
- No deploy authorized in C4.
