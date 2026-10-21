# EXP-021 S4F-7U — Fresh Tiny staging authority / NO_BACKFILL preflight

**Date (UTC):** 2026-10-06  
**Scope:** Read-only Production verification + fresh staging authority derivation. **No** env mutation, deploy, restart, DB write, migrations, GLOBAL/Tiny/S4 activation, or provider calls.

## 0 — Repository anchor

| Field | Value |
|-------|--------|
| `STARTING_MAIN_SHA` (expected) | `dc360a2c7c1d2e584fac79dca1348914deaca2af` |
| `CURRENT_MAIN_SHA` (after `git fetch origin main`) | `dc360a2c7c1d2e584fac79dca1348914deaca2af` |
| Main drift | **NONE** (matches expected) |

## 1 — Production topology (live)

| Field | Value |
|-------|--------|
| `CURRENT_PRODUCTION_SHA` | `0c19eb62cef292e4e26ebeb2cf3b8f8afcbca2a2` |
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261006064327_v4994` |
| `REPLICA_A_PID` / `REPLICA_B_PID` | `1272786` / `1273047` |
| `REPLICA_A_SHA` / `REPLICA_B_SHA` | `0c19eb62…` (both) |
| `NO_MIXED_RUNTIME_SHA` | **YES** |
| Health / readiness A & B | **PASS** |
| `NGINX_DUAL_UPSTREAM` | **PASS** |
| `SCHEDULER_LEADER_COUNT` | **1** (A=LEADER, B=FOLLOWER) |
| `SCHEDULER_CONVERGENCE` | **PASS** |

## 2 — In-process attestation baseline

Authenticated localhost `/api/v1/metrics` (token not logged).

| Replica | Samples | State | Fingerprint | Contract |
|---------|---------|-------|-------------|----------|
| A (`3001`) | **1** | **PRESTATE** | `b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d` | `v1` |
| B (`3002`) | **1** | **PRESTATE** | `b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d` | `v1` |

`REPLICA_ATTESTATION_PARITY=YES`

## 3 — `backend.env` prestate

| Field | Value |
|-------|--------|
| `BACKEND_ENV_SHA256` | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` |
| Six S4 enable flags | **MISSING** → effective **OFF** |
| Three Tiny staging keys | **MISSING** |

## 4 — GLOBAL kill + S4 zero-state

| Field | Value |
|-------|--------|
| `GLOBAL_ROW_COUNT` | **1** |
| `GLOBAL_KILL_STATE` | **KILLED** |
| `EFFECTIVE_GLOBAL_KILL_STATE` | **KILLED** |
| `di_v0_s4_pipeline_versions` | **0** |
| `di_v0_s4_work_items` | **0** |
| Active work items (status not `RETIRED`/`FAILED`) | **0** |
| `di_v0_s4_evidence_snapshots` | **0** |
| Shadow runs / intervals (schema tables) | **0** / **0** |

`S4_RUNTIME_ACTIVITY_DETECTED=NO`

## 5–6 — Tiny vehicle + provider authority (Production DB)

| Field | Value |
|-------|--------|
| `TINY_ORGANIZATION_ID` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `TINY_VEHICLE_ID` | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| `TINY_VEHICLE_LABEL` | **`KS MS 661`** (`license_plate`) |
| `TINY_VEHICLE_LIFECYCLE_STATE` | **ACTIVE** (`registry_lifecycle`) |
| `TINY_VEHICLE_ORGANIZATION_MATCH` | **YES** |
| `TINY_HARDWARE_CLASS` | **LTE_R1** |
| `TINY_SOURCE_CLASS` | **RUPTELA_R1** (LTE_R1 hardware authority for Tiny R1 path) |
| `TINY_PROVIDER_LINK_ACTIVE` | **YES** (DIMO consent ACTIVE + `dimo_vehicle_id` linked) |
| `TINY_TRANSFER_PENDING` | **NO** (no `vehicle_station_transfers` in `PLANNED`/`IN_TRANSIT`) |
| `TINY_OFFBOARD_PENDING` | **NO** |
| `TINY_CROSS_TENANT_MISMATCH` | **NO** |

## 7 — Budget / Redis

`synqdrive_dimo_global_budget_enabled 1` on both replicas → **ENABLED**. `REDIS_REACHABLE=YES`.

## 8 — Discovery cutoff semantics (code @ `dc360a2c7…`)

`di-v0-s4b-discovery.service.ts` PRIMARY predicate:

```sql
AND t.end_time >= ${notBefore}
```

| Field | Value |
|-------|--------|
| `DISCOVERY_CUTOFF_FIELD` | `vehicle_trips.end_time` |
| `DISCOVERY_CUTOFF_COMPARATOR` | `>=` |
| `EXACTLY_AT_CUTOFF_ELIGIBLE` | **YES** (inclusive lower bound) |

## 9 — Tiny trip boundary evidence

| Field | Value |
|-------|--------|
| `DATABASE_UTC_NOW` (seal capture) | `2026-10-06T18:33:26.610Z` |
| `TINY_LATEST_COMPLETED_TRIP_ID` | `a4c66c6f-3f27-42fa-a634-dc9920024e15` |
| `TINY_LATEST_COMPLETED_TRIP_END_TIME` | `2026-10-06T12:06:54.070Z` |
| `TINY_COMPLETED_TRIP_COUNT_TOTAL` | **524** |
| `TINY_COMPLETED_TRIP_END_TIME_IN_FUTURE_COUNT` | **0** |

## 10 — Stale old-cutoff exposure (evidence only)

Historical cutoff `2026-10-02T05:55:28.839Z`:

| Field | Value |
|-------|--------|
| `OLD_CUTOFF` | `2026-10-02T05:55:28.839Z` |
| `OLD_CUTOFF_ELIGIBLE_COMPLETED_TRIP_COUNT` | **14** |
| `OLD_CUTOFF_EARLIEST_ELIGIBLE_END_TIME` | `2026-10-02T06:03:22.840Z` |
| `OLD_CUTOFF_LATEST_ELIGIBLE_END_TIME` | `2026-10-06T12:06:54.070Z` |

Reusing the S4F-7I cutoff would backfill-eligible completed trips through the latest Tiny completion — **must not** reuse.

## 11 — Fresh NO_BACKFILL cutoff (sealed authority)

| Field | Value |
|-------|--------|
| `FRESH_TINY_NOT_BEFORE` | **`2026-10-06T18:33:26.610Z`** |
| `FRESH_CUTOFF_SOURCE` | **PRODUCTION_DATABASE_CLOCK** (`clock_timestamp()` UTC, ms via `to_char`) |
| `FRESH_CUTOFF_AFTER_LATEST_COMPLETED_TINY_TRIP` | **YES** (`18:33:26.610` > `12:06:54.070`) |
| `FRESH_CUTOFF_EXISTING_ELIGIBLE_COMPLETED_TRIP_COUNT` | **0** (`end_time >= FRESH` at seal) |

## 12 — Proposed three-key authority (not written)

```
DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=2026-10-06T18:33:26.610Z
DI_V0_S4_ORGANIZATION_ALLOWLIST=faa710c9-6d91-4079-a7d5-91fdccdec14a
DI_V0_S4_VEHICLE_ALLOWLIST=c10351f8-b6a2-4258-947f-631aeaa6d359
```

All six S4 enable flags remain **OFF**.

## 13 — Authority age policy

| Field | Value |
|-------|--------|
| `FRESH_STAGING_AUTHORITY_MAX_AGE_SECONDS` | **900** |
| `FRESH_STAGING_AUTHORITY_EXPIRY_UTC` | **`2026-10-06T18:48:26.610Z`** |

Staging must fail closed if `DB_CURRENT_UTC - FRESH_TINY_NOT_BEFORE > 900` before env mutation.

## 14 — v1 frozen STAGED reference

From `di-v0-s4-runtime-config-attestation.ts`:

| Field | Value |
|-------|--------|
| `CURRENT_V1_FROZEN_STAGED_NOT_BEFORE` | `2026-10-02T05:55:28.839Z` |
| `CURRENT_V1_FROZEN_STAGED_NOT_BEFORE_MATCHES_FRESH` | **NO** |

Frozen org/vehicle constants still match Tiny scope.

## 15–17 — Fresh nine-key fingerprint (main @ `dc360a2c7…`)

Canonical serialization (attestation v1):

```
DI_V0_S4_MASTER_ENABLED=OFF
DI_V0_S4_DISCOVERY_ENABLED=OFF
DI_V0_S4_WORKER_ENABLED=OFF
DI_V0_S4_POSITION_ENABLED=OFF
DI_V0_S4_R1_ENABLED=OFF
DI_V0_S4_NATIVE_ENABLED=OFF
DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=VALUE:2026-10-06T18:33:26.610Z
DI_V0_S4_ORGANIZATION_ALLOWLIST=VALUE:faa710c9-6d91-4079-a7d5-91fdccdec14a
DI_V0_S4_VEHICLE_ALLOWLIST=VALUE:c10351f8-b6a2-4258-947f-631aeaa6d359

```

| Field | Value |
|-------|--------|
| `FRESH_EXPECTED_RUNTIME_ATTESTATION_FINGERPRINT` | **`9abb1a57cd25a5937bb033f43f90e98a4f5eab58a66147f977c2c2665049474a`** |
| `FRESH_FINGERPRINT_RECOMPUTATION_MATCH` | **YES** (duplicate `evaluateDiV0S4RuntimeConfigAttestation`) |
| `FRESH_FINGERPRINT_LENGTH` | **64** |
| `FRESH_FINGERPRINT_LOWERCASE_HEX` | **YES** |
| `FRESH_EXPECTED_RUNTIME_ATTESTATION_STATE_UNDER_V1` | **OTHER** (not equal to frozen STAGED triple) |
| `FRESH_FINGERPRINT_BINDS_ALL_9_KEYS` | **YES** |
| `FRESH_FINGERPRINT_BINDS_ALL_6_ENABLE_FLAGS_OFF` | **YES** |
| `FRESH_FINGERPRINT_BINDS_EXACT_NOT_BEFORE` | **YES** |
| `FRESH_FINGERPRINT_BINDS_EXACT_ORG_ALLOWLIST` | **YES** |
| `FRESH_FINGERPRINT_BINDS_EXACT_VEHICLE_ALLOWLIST` | **YES** |

Future staging proof contract (v1): accept **`state=OTHER`** only with **exact** fresh fingerprint above — not generic OTHER.

## 18–19 — Current staging tool compatibility

`di-v0-s4-stage-tiny-production.sh` + `di-v0-s4-tiny-staging-production/*`:

| Field | Value |
|-------|--------|
| `CURRENT_STAGING_TOOL_FROZEN_TO_OLD_CUTOFF` | **YES** (`OPS_FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE` = `2026-10-02T05:55:28.839Z`) |
| `CURRENT_STAGING_TOOL_SUPPORTS_EXTERNAL_FRESH_NOT_BEFORE` | **NO** |
| `CURRENT_STAGING_TOOL_SUPPORTS_EXTERNAL_EXPECTED_FINGERPRINT` | **NO** |
| `CURRENT_STAGING_TOOL_ACCEPTS_EXACT_FRESH_OTHER_STATE` | **NO** (`proveReplicaRuntimeAttestation` PRIMARY_STAGING requires `STAGED` + frozen STAGED fingerprint) |
| `FRESH_STAGING_TOOL_ENGINEERING_REQUIRED` | **YES** |
| `S4F7V_REQUIRED` | **YES** |
| `S4F7V_RUNTIME_DEPLOY_REQUIRED` | **NO** |
| `S4F7V_PRODUCTION_RUNTIME_CODE_CHANGE_REQUIRED` | **NO** |
| `S4F7V_OPERATOR_TOOLING_ONLY` | **YES** |

## 20 — Gate 6 (unchanged)

| Field | Value |
|-------|--------|
| `FROZEN_TINY_NON_OPERATOR_GATES_SATISFIED` | **5** |
| `FROZEN_TINY_GATE_TOTAL` | **6** |
| `EXPLICIT_OPERATOR_AUTHORIZATION_GATE` | **NOT_SATISFIED** |
| `TINY_ACTIVATION_READY` | **NO** |

## Closure

| Field | Value |
|-------|--------|
| `FRESH_TINY_STAGING_AUTHORITY_READY` | **YES** (authority sealed; tooling not ready) |
| `FINAL_RESULT` | **PASS** |
| `NEXT_ACTION` | **ENGINEER_S4F7V_FRESH_FINGERPRINT_STAGING_TOOLING_BEFORE_ANY_PRODUCTION_STAGING_AUTHORIZATION** |

**Note:** `FRESH_TINY_NOT_BEFORE` expires at `2026-10-06T18:48:26.610Z`; any staging attempt must re-run S4F-7U or refresh authority before mutation.

## Production prohibition

All mutation gates **NO** (read-only SQL + metrics only).
