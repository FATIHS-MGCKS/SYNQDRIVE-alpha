# EXP-021 S4F-7A — Tiny execution prerequisites engineering

**Date:** 2026-10-01  
**Scope:** Engineering only — no Production execution, deploy, migration, operator grant, or Tiny activation.

## Workstreams

1. **S4 runtime composition** — `DiV0S4RuntimeModule` imported by `VehicleIntelligenceModule` (not `AppModule`). Composes S4B, S4E, S4F; registers exactly one S4C executor via `DiV0S4cRuntimeBootstrap` sharing `DI_V0_S4B_CONTROL_PLANE_CONFIG` and DIMO ports from `DimoModule` (`forwardRef`).
2. **NO_BACKFILL containment** — `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE` parsed at composition; PRIMARY discovery requires `trip.end_time >= notBeforeUtc` in addition to existing predicates. Missing/malformed/future → `CONTAINMENT_UNAVAILABLE`, zero candidates.
3. **DB GLOBAL kill initializer** — `initializeDiV0S4GlobalKillRow()` + operator CLI `backend/scripts/ops/di-v0-s4-initialize-global-kill-row.ts`. Inserts `KILLED` only; idempotent on existing `KILLED`; refuses `NOT_KILLED` / malformed. **Not** migration-seeded, **not** bootstrap-invoked.

## Authority placement (NO_BACKFILL)

| Decision | Value |
|----------|--------|
| `S4A_FROZEN_CONTRACT_CHANGED` | **NO** — `s4a-contract.v2.json` unchanged |
| `NO_BACKFILL_AUTHORITY_PLACEMENT` | **S4B runtime discovery policy / Tiny containment overlay** (`di-v0-s4b-discovery-containment.ts`) |

## S4F-7 deploy prerequisite correction (supersedes ambiguous wording)

| Field | Value |
|-------|--------|
| `CURRENT_PRODUCTION_RUNTIME_WIRING_PRESENT` | **NO** (Production SHA `8fa531b27…` unchanged) |
| `EXISTING_S4_CORE_IMPLEMENTATION_ALREADY_PRESENT` | **YES** on main |
| `ENGINEERING_RUNTIME_WIRING_CHANGE_REQUIRED` | **YES** (this slice) |
| `NEW_PRODUCTION_DEPLOY_REQUIRED_BEFORE_TINY_EXECUTION` | **YES** |
| `NEW_S4_SCHEMA_REQUIRED_BEFORE_TINY_EXECUTION` | **NO** |
| `MIGRATION_REQUIRED_BEFORE_TINY_EXECUTION` | **NO** |

Historical Production facts in S4F-7 evidence are preserved; `CODE_DEPLOY_REQUIRED_BEFORE_TINY_EXECUTION=NO` must be read only as “no new S4 **algorithm/schema** on main,” not “no deploy needed for Tiny.”

## Frozen Tiny gates (unchanged)

Operator authorization **not** granted. Gates remain **5/6**, `TINY_ACTIVATION_READY=NO`.

## Amendment S4F-7A.1 (2026-10-01) — PR #1873 safety micro-closure

| Item | Detail |
|------|--------|
| Containment syntax | Canonical `YYYY-MM-DDTHH:mm:ss.SSSZ` only; offsets/date-only/local rejected; calendar + round-trip validation |
| Discovery status | `stopReason=CONTAINMENT_UNAVAILABLE` (not `UNEXPECTED_ERROR`) |
| Kill initializer | `INSERT … RETURNING` is sole authority for `INSERTED_KILLED`; concurrent loser → `ALREADY_KILLED` |
| Production | **No** mutation; Tiny gates **5/6**, operator auth **NOT_SATISFIED** |

## Machine result block

```
EXP021_S4F7A_TINY_EXECUTION_PREREQUISITES_ENGINEERING_RESULT=PASS
STARTING_MAIN_SHA=9176efe3946d7030168ff8863eab7cb0ecdfb8e9
RUNTIME_COMPOSITION_MODULE=DiV0S4RuntimeModule
RUNTIME_COMPOSITION_ENTRYPOINT=VehicleIntelligenceModule
S4B_RUNTIME_REGISTERED=YES
S4_DISCOVERY_RUNTIME_REACHABLE_IN_CODE=YES
S4_WORKER_RUNTIME_REACHABLE_IN_CODE=YES
S4C_EXECUTOR_REGISTERED=YES
S4C_EXECUTOR_REGISTRATION_COUNT=1
S4C_SHARED_CONTROL_PLANE_INSTANCE=YES
S4E_RUNTIME_REGISTERED=YES
S4F_RUNTIME_REGISTERED=YES
ALL_OFF_RUNTIME_DORMANT=YES
NO_BACKFILL_CONTROL_NAME=DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE
NO_BACKFILL_CONTROL_SCOPE=S4B_PRIMARY_DISCOVERY
NO_BACKFILL_CONTROL_FAIL_CLOSED=YES
DISCOVERY_REQUIRES_VALID_NOT_BEFORE=YES
DISCOVERY_FILTERS_TRIP_END_TIME=YES
DB_KILL_INITIALIZER_DEFAULT_STATE=KILLED
DB_KILL_ROW_SEEDED_BY_MIGRATION=NO
EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED
FROZEN_TINY_GATE_SATISFIED_COUNT=5
FROZEN_TINY_GATE_TOTAL=6
TINY_ACTIVATION_READY=NO
PRODUCTION_MUTATION_OCCURRED=NO
NEXT_ACTION=REVIEW_AND_MERGE_S4F7A_THEN_SEPARATE_DORMANT_PRODUCTION_DEPLOY_PREFLIGHT
```
