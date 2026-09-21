# M3.3 B1 — Generalized evidence shadow activation (production)

**Date (UTC):** 2026-09-21  
**Runtime SHA (unchanged from B0):** `105f2c5ff28f74c0f8bc83655da94ab98749ce0d`  
**Release:** `20260921172342_v4994`  
**B0 evidence:** `M3_3_B0_FLAG_OFF_PRODUCTION_DEPLOY_2026-09-21.md` (docs merged @ `2dac7f05`)  
**Mode:** Shadow-only — `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED=true`; **no** new application deploy (main docs @ `2dac7f05` not deployed for B1).

## 0 — Governance cleanup

| Check | Result |
|-------|--------|
| PR **#1715** merged | **YES** — merge commit `2dac7f05cafe888bba3c843c0d24348c15f92c25` |
| PR **#1709** merged | **NO** |
| PR **#1709** closed superseded | **YES** — `SUPERSEDED_BY_1710` (#1710 / M3.3A) |

```
PR_1709_MERGED=NO
PR_1709_SUPERSEDED_CLOSED=YES
```

## 1 — B1 preflight

| Field | Value |
|-------|-------|
| `PRODUCTION_SHA` | `105f2c5ff28f74c0f8bc83655da94ab98749ce0d` |
| `REPLICA_A_SHA` | `105f2c5ff28f74c0f8bc83655da94ab98749ce0d` |
| `REPLICA_B_SHA` | `105f2c5ff28f74c0f8bc83655da94ab98749ce0d` |
| `BOTH_REPLICAS_EXACT_B0_SHA` | **YES** |
| External health | **PASS** |
| PM2 both online | **YES** |
| `SCHEDULER_LEADER_COUNT` | **1** |
| Flag effective pre-B1 (both processes) | **FALSE** (key absent in `backend.env`; default false) |
| `GENERALIZED_EVIDENCE_ROWS_PRE_B1` | **0** |
| `REST_SESSION_ROWS_PRE_B1` | **0** |
| `REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED` | **false** (deployed constant) |
| `REST_STABLE_PROMOTION_ALLOWED` | **NO** |

## 2 — Backup activation state

| Field | Value |
|-------|-------|
| `BACKEND_ENV_BACKUP_PATH` | `/opt/synqdrive/shared/backend.env.bak-m3-3-b1-20260921180250` |
| `BACKEND_ENV_BACKUP_SHA256` | `35acf17d05c170764915d95c27f3e6c27799296dcb175903a4ddb342bcb07c49` |
| `B1_DB_BACKUP_CREATED` | **YES** |
| `B1_DB_BACKUP_PATH` | `/opt/synqdrive/shared/backups/db-pre-b1-20260921180250.sql.gz` |
| `B1_DB_BACKUP_SIZE` | **72M** |

No schema changes.

## 3 — Safe env mutation

Single canonical line in `/opt/synqdrive/shared/backend.env`:

`BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED=true`

| Field | Value |
|-------|-------|
| `GENERALIZED_EVIDENCE_ENV_KEY_COUNT` | **1** |
| `GENERALIZED_EVIDENCE_ENV_VALUE` | **true** |

Nest bootstrap reads `backend/.env` symlink → shared file (same for both replicas after restart).

## 4 — Single-replica canary

| Field | Value |
|-------|-------|
| `CANARY_REPLICA` | `synqdrive` (Replica A, port 3001) |
| Canary restart (UTC) | ~`2026-09-21T18:03:01Z` |
| `CANARY_HEALTH` | **PASS** (health + readiness) |
| `CANARY_SHA` | `105f2c5ff…` |
| `CANARY_FLAG_EFFECTIVE` | **TRUE** after restart (via `.env` bootstrap; PM2 `env` block does not mirror all keys) |
| `FOLLOWER_FLAG_EFFECTIVE` | **FALSE** until B restarted (~28m old process) |
| `MIXED_FLAG_STATE_EXPECTED_DURING_CANARY` | **YES** |

Bounded canary smoke (~240s): no generalized-evidence exceptions in error tail; **0** shadow rows during canary window (no qualifying rest capture yet).

## 5 — Full B1 activation

Replica B (`synqdrive-b`) rolling restart ~`2026-09-21T18:07:53Z`.

| Field | Value |
|-------|-------|
| `REPLICA_A_FLAG_EFFECTIVE` | **TRUE** |
| `REPLICA_B_FLAG_EFFECTIVE` | **TRUE** |
| `MIXED_FLAG_STATE` | **NO** (after B restart) |
| `SCHEDULER_LEADER_COUNT` | **1** |
| Both replicas SHA | `105f2c5ff…` |

## 7 — Immutable B1 T0

Recorded only after **both** replicas healthy, exact SHA, flag TRUE, scheduler converged:

**`M3_3_B1_T0=2026-09-21T18:08:19Z`**

| Field | At T0 |
|-------|-------|
| `GENERALIZED_EVIDENCE_ROWS_AT_B1_T0` | **0** |
| `REST_SESSION_ROWS_AT_B1_T0` | **0** |

T0 is **immutable** for this activation (not reset by later observations or audits).

## 8 — Post-activation shadow smoke

Bounded window **360s** after T0 (natural telemetry only; no backfill / manual rows).

| Field | Value |
|-------|-------|
| `GENERALIZED_EVIDENCE_ROWS_POST_SMOKE` | **1** |
| `REST_SESSION_ROWS_POST_SMOKE` | **0** |
| `CANARY_EVIDENCE_PATH_EXERCISED` | **YES** (post-T0 natural LIVE_VOLTAGE classify path) |

Evidence class counts (Postgres enum):

| Class | Count |
|-------|-------|
| `DRIVING_NON_CHARGING` | **1** |
| `DRIVING_CHARGING` | 0 |
| `ENGINE_OFF_TRANSITION` | 0 |
| `PARKED_REST_CANDIDATE` | 0 |
| `REST_WAKE_VOLTAGE` | 0 |
| `STATE_AMBIGUOUS` | 0 |
| `STALE_REPLAY` | 0 |

**Driving class reporting (stored enum — not rollup labels):**

| Field | Count |
|-------|-------|
| `DRIVING_NON_CHARGING` | **1** |
| `DRIVING_CHARGING` | **0** |
| `DRIVING_TOTAL` | **1** (`DRIVING_NON_CHARGING` + `DRIVING_CHARGING`) |

The legacy machine label `DRIVING_EVIDENCE=0` was a **rollup naming mismatch**: `DRIVING_EVIDENCE` is **not** a `BatteryGeneralizedEvidenceClass` value. Post-smoke capture **did** produce driving shadow evidence via `DRIVING_NON_CHARGING`.

No `REST_WAKE_VOLTAGE` — consistent with **`REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED=false`**.

## 8b — Natural validation semantics (split)

Runtime activation and path-specific natural validation are **separate**:

| Field | Value |
|-------|-------|
| `B1_ACTIVATION_RUNTIME_RESULT` | **PASS** |
| `GENERALIZED_EVIDENCE_CAPTURE_OBSERVED` | **YES** (1 post-smoke row) |
| `REST_SESSION_PATH_OBSERVED` | **NO** |
| `PARKED_REST_CANDIDATE_OBSERVED` | **NO** |
| `R1_REST_LADDER_EVIDENCE_OBSERVED` | **NO** |
| `B1_GENERALIZED_CAPTURE_VALIDATION` | **OBSERVED** |
| `B1_REST_EVIDENCE_VALIDATION` | **PENDING** |

**Historical field (unchanged value, clarified scope):**

`B1_NATURAL_EVIDENCE_VALIDATION=OBSERVED` — annotate **`GENERALIZED_CAPTURE_ONLY`** (not rest-session / R1 ladder completeness).

## 9 — Provenance validation (sample n=1)

Observation `24f0ce72-…` @ `2026-09-21T18:12:04Z`:

| Field | Value |
|-------|-------|
| `provider_timestamp_source` | `PROVIDER_FIELD_TIMESTAMP` |
| `actual_rest_age_ms` | null (non-rest class) |
| `nominal_rest_interval_index` | null |
| `tolerance_policy_version` | `M3_3B_V1_1` |
| `source_measurement_id` | linked LIVE_VOLTAGE measurement |
| `trip_id` | null (driving sample) |

```
AUTHORITATIVE_REST_AGE_FROM_PROVIDER_FIELD_TIME_ONLY=YES
INGEST_TIME_USED_AS_AUTHORITATIVE_REST_AGE=NO
NOMINAL_INTERVAL_INDEX_IS_METADATA_ONLY=YES
```

## 10 — Session safety / multi-replica

| Field | Value |
|-------|-------|
| `DUPLICATE_EVIDENCE_ROWS` | **0** |
| `MULTIPLE_ACTIVE_SESSION_VEHICLES` | **0** (statuses `CANDIDATE`/`CONFIRMED`/`RESTING`) |
| `ACTIVE_SESSION_CONSTRAINT_ERRORS` | **0** |
| `LATE_ASSOCIATION_ERRORS` | **0** |

Partial unique index `battery_rest_session_one_active_per_vehicle` unchanged.

## 11 — Automatic promotion hard gate

```
REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED=false
CADENCE_BASED_REST_WAKE_PROMOTION_OCCURRED=NO
R1_CADENCE_EMPIRICALLY_VALIDATED=NO
R1_WAKE_LOAD_ORDER_KNOWN=NO
REST_STABLE_PROMOTION_ALLOWED=NO
```

## 12 — Authoritative isolation

No observed change to REST_60M/REST_6H semantics, assessment, publication, readiness, Trip FSM, or raw LIVE_VOLTAGE persistence (1 LIVE_VOLTAGE row in activation window — expected).

```
AUTHORITATIVE_BATTERY_BEHAVIOR_CHANGED=NO
AUTHORITATIVE_REGRESSION_OBSERVED=NO
```

Event-conditioned REST/assess/pub equivalence **not** claimed.

## 13 — Metrics

Scrape: `GET http://127.0.0.1:3001/api/v1/metrics` (bearer auth).

Observed increments (examples):

- `synqdrive_battery_generalized_evidence_created_total{evidence_class="DRIVING_NON_CHARGING"}` = **1**
- Rest session / REST_WAKE / ladder-unqualified counters = **0** (expected early in B1)

```
M3_3_METRICS_HEALTH=PASS
PROMETHEUS_DUPLICATE_METRIC_ERROR=NO
```

## 14 — Rollback procedure (reference)

On failure: set `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED=false`, rolling restart both replicas, verify FALSE. **Do not** delete shadow rows already written.

## 15 — B1 verdict

```
B1_ACTIVATION_RUNTIME_RESULT=PASS
B1_GENERALIZED_CAPTURE_VALIDATION=OBSERVED
B1_REST_EVIDENCE_VALIDATION=PENDING
GENERALIZED_EVIDENCE_CAPTURE_OBSERVED=YES
REST_SESSION_PATH_OBSERVED=NO
PARKED_REST_CANDIDATE_OBSERVED=NO
R1_REST_LADDER_EVIDENCE_OBSERVED=NO
M3_3_B1_RESULT=B1_ACTIVATION_RUNTIME_PASS
```

**Historical (preserved, annotated):** `B1_NATURAL_EVIDENCE_VALIDATION=OBSERVED` — scope **`GENERALIZED_CAPTURE_ONLY`**.

Runtime PASS does **not** require 8h cadence or rest-session evidence. Rest-session and PARKED_REST / R1 ladder paths remain **PENDING** natural exercise.

**`NEXT_ACTION`:** Continue read-only shadow monitoring; separate authorization before REST_WAKE tolerance / promotion research beyond metadata.

---

## Machine block

```
M3_3_B1_RESULT=B1_ACTIVATION_RUNTIME_PASS

PRODUCTION_SHA=105f2c5ff28f74c0f8bc83655da94ab98749ce0d
REPLICA_A_SHA=105f2c5ff28f74c0f8bc83655da94ab98749ce0d
REPLICA_B_SHA=105f2c5ff28f74c0f8bc83655da94ab98749ce0d

PR_1709_SUPERSEDED_CLOSED=YES

B1_DB_BACKUP_CREATED=YES
BACKEND_ENV_BACKUP_PATH=/opt/synqdrive/shared/backend.env.bak-m3-3-b1-20260921180250

CANARY_REPLICA=synqdrive
CANARY_FLAG_EFFECTIVE=TRUE
CANARY_HEALTH=PASS
CANARY_EVIDENCE_PATH_EXERCISED=YES

REPLICA_A_FLAG_EFFECTIVE=TRUE
REPLICA_B_FLAG_EFFECTIVE=TRUE
MIXED_FLAG_STATE=NO

M3_3_B1_T0=2026-09-21T18:08:19Z

GENERALIZED_EVIDENCE_ROWS_PRE_B1=0
GENERALIZED_EVIDENCE_ROWS_AT_B1_T0=0
GENERALIZED_EVIDENCE_ROWS_POST_SMOKE=1

REST_SESSION_ROWS_PRE_B1=0
REST_SESSION_ROWS_AT_B1_T0=0
REST_SESSION_ROWS_POST_SMOKE=0

DRIVING_NON_CHARGING=1
DRIVING_CHARGING=0
DRIVING_TOTAL=1

GENERALIZED_EVIDENCE_CAPTURE_OBSERVED=YES
REST_SESSION_PATH_OBSERVED=NO
PARKED_REST_CANDIDATE_OBSERVED=NO
R1_REST_LADDER_EVIDENCE_OBSERVED=NO

ENGINE_OFF_TRANSITION=0
PARKED_REST_CANDIDATE=0
REST_WAKE_VOLTAGE=0
STATE_AMBIGUOUS=0
STALE_REPLAY=0

AUTHORITATIVE_REST_AGE_FROM_PROVIDER_FIELD_TIME_ONLY=YES
INGEST_TIME_USED_AS_AUTHORITATIVE_REST_AGE=NO
NOMINAL_INTERVAL_INDEX_IS_METADATA_ONLY=YES

DUPLICATE_EVIDENCE_ROWS=0
MULTIPLE_ACTIVE_SESSION_VEHICLES=0
ACTIVE_SESSION_CONSTRAINT_ERRORS=0

REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED=false
CADENCE_BASED_REST_WAKE_PROMOTION_OCCURRED=NO

R1_CADENCE_EMPIRICALLY_VALIDATED=NO
R1_WAKE_LOAD_ORDER_KNOWN=NO
REST_STABLE_PROMOTION_ALLOWED=NO

M3_3_METRICS_HEALTH=PASS
PROMETHEUS_DUPLICATE_METRIC_ERROR=NO

AUTHORITATIVE_BATTERY_BEHAVIOR_CHANGED=NO
AUTHORITATIVE_REGRESSION_OBSERVED=NO

B1_ACTIVATION_RUNTIME_RESULT=PASS
B1_GENERALIZED_CAPTURE_VALIDATION=OBSERVED
B1_REST_EVIDENCE_VALIDATION=PENDING
B1_NATURAL_EVIDENCE_VALIDATION=OBSERVED
B1_NATURAL_EVIDENCE_VALIDATION_SCOPE=GENERALIZED_CAPTURE_ONLY

PRODUCTION_CHANGED=YES
AUTHORITATIVE_PRODUCTION_BEHAVIOR_CHANGED=NO

NEXT_ACTION=SHADOW_MONITORING_REST_SESSION_AND_PARKED_REST_CANDIDATE_PENDING
```

---

## Documentation clarification (2026-09-21, PR #1716)

Semantic-only doc fix — **no** production mutation, flag change, deploy, or **`M3_3_B1_T0`** change.

```
B1_DOC_CLARIFICATION_RESULT=PASS
M3_3_B1_T0_UNCHANGED=YES
PRODUCTION_CHANGED=NO
```
