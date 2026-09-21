# M3.3 B1.1 — Natural shadow evidence validation (read-only production forensics)

**Audit window start (immutable):** `M3_3_B1_T0=2026-09-21T18:08:19Z`  
**Forensics captured (UTC):** `2026-09-21T18:40:24Z`  
**Mode:** Read-only — no deploy, restart, env/flag/DB/DIMO mutation; T0 unchanged.  
**Runtime SHA:** `105f2c5ff28f74c0f8bc83655da94ab98749ce0d` (`20260921172342_v4994`)  
**Prior activation evidence:** `M3_3_B1_GENERALIZED_EVIDENCE_SHADOW_ACTIVATION_2026-09-21.md`

## 0 — Runtime safety preflight

| Check | Result |
|-------|--------|
| `PRODUCTION_SHA` / release | `105f2c5ff28f74c0f8bc83655da94ab98749ce0d` @ `/opt/synqdrive/releases/20260921172342_v4994` |
| `REPLICA_A_SHA` | `105f2c5ff28f74c0f8bc83655da94ab98749ce0d` (git in release tree) |
| `REPLICA_B_SHA` | same deployment lineage |
| `BOTH_REPLICAS_EXPECTED_SHA` | **YES** |
| `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED` (shared env) | **true** |
| `REPLICA_A_FLAG_EFFECTIVE` | **TRUE** |
| `REPLICA_B_FLAG_EFFECTIVE` | **TRUE** |
| `MIXED_FLAG_STATE` | **NO** |
| External `/api/v1/health` | **PASS** |
| `SCHEDULER_LEADER_COUNT` | **1** (unchanged from B1; no split-brain signal) |
| `REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED` | **false** (deployed constant) |
| `REST_STABLE_PROMOTION_ALLOWED` | **NO** |

Preflight **PASS** — no material drift from B1 activation baseline.

## 1 — Post-B1-T0 generalized evidence inventory

Query: `battery_generalized_evidence_observations.created_at >= M3_3_B1_T0`.

| Field | Value |
|-------|-------|
| `GENERALIZED_EVIDENCE_TOTAL` | **29** |
| `DISTINCT_VEHICLES_WITH_EVIDENCE` | **1** (`19fedd4b-c4e8-4de8-a125-dab293326e7e`) |
| `FIRST_EVIDENCE_AT` | `2026-09-21T18:12:16.775Z` |
| `LATEST_EVIDENCE_AT` | `2026-09-21T18:40:08.197Z` |

By stored `BatteryGeneralizedEvidenceClass` enum (zeros explicit):

| Class | Count |
|-------|------:|
| `DRIVING_CHARGING` | 0 |
| `DRIVING_NON_CHARGING` | 1 |
| `ENGINE_OFF_TRANSITION` | 0 |
| `PARKED_REST_CANDIDATE` | 0 |
| `REST_WAKE_VOLTAGE` | 0 |
| `REST_STABLE_VOLTAGE` | 0 |
| `ACTIVE_VEHICLE_CONTAMINATED` | 14 |
| `CHARGING_CONTAMINATED` | 14 |
| `STALE_REPLAY` | 0 |
| `STATE_AMBIGUOUS` | 0 |
| `UNKNOWN` | 0 |

Natural traffic in the ~32m window is **active/charging contaminated + one driving sample** — no engine-off or parked-rest ladder path yet.

## 2 — RAW → shadow coverage

Eligible source rows: post-T0 **`LIVE_VOLTAGE`** measurements with `quality = VALID` on `battery_measurements` (ICE capture gate is policy-time in code; all produced rows are for the single ICE vehicle emitting LV in this window).

| Field | Value |
|-------|-------|
| `ELIGIBLE_LIVE_VOLTAGE_MEASUREMENTS` | **29** |
| `GENERALIZED_EVIDENCE_CAPTURED` | **29** |
| `INTENTIONALLY_EXCLUDED` | **0** invalid-quality LV in window |
| `UNEXPECTEDLY_UNCAPTURED` | **0** |
| `DUPLICATE_CAPTURE_COUNT` | **0** |

**Note:** Early forensics SQL joining `battery_measurement_sessions.drive_profile = ICE` reported **0 eligible** because post-T0 LV rows use **`session_id IS NULL`**; corrected join is **`source_measurement_id`** on `battery_measurements` (1:1).

No unexpected gaps.

## 3 — First natural ENGINE_OFF validation

| Field | Value |
|-------|-------|
| `ENGINE_OFF_TRANSITION_OBSERVED` | **NO** |
| `ENGINE_OFF_PATH_RESULT` | **PENDING_NATURAL_EVENT** |

No post-T0 `ENGINE_OFF_TRANSITION` rows — **not a B1.1 failure** (vehicle remained active/charging-classified in window).

## 4 — Rest session opening

| Field | Value |
|-------|-------|
| `REST_SESSION_OPENED_OBSERVED` | **NO** |
| Post-T0 `battery_rest_sessions` | **0** |
| `ANCHOR_OBSERVATION_LINKED_TO_SESSION` | **N/A** (no session) |
| `MAX_ACTIVE_REST_SESSIONS_PER_VEHICLE` | invariant holds |
| `MULTIPLE_ACTIVE_SESSION_VEHICLES` | **0** |
| `ACTIVE_SESSION_CONSTRAINT_ERRORS` | **0** |

## 5 — Late trip association

No sessions opened post-T0:

| Field | Value |
|-------|-------|
| `SESSIONS_WITH_TRIP_AT_CREATE` | 0 |
| `SESSIONS_LATE_ASSOCIATED` | 0 |
| `SESSIONS_ASSOCIATION_PENDING` | 0 |
| `LATE_ASSOCIATION_ERRORS` | 0 |

## 6 — PARKED_REST_CANDIDATE validation

| Field | Value |
|-------|-------|
| `PARKED_REST_CANDIDATE_OBSERVED` | **NO** |
| `PARKED_REST_PATH_RESULT` | **PENDING_NATURAL_EVENT** |

## 7 — Sub-4h / nominal index semantics

| Field | Value |
|-------|-------|
| `SUB_4H_CANDIDATES` | 0 |
| `SUB_4H_INDEX0_CORRECT` | N/A |
| `SUB_4H_FALSE_LADDER_PROMOTION_COUNT` | **0** |

## 8 — R1 ladder observation

| Field | Value |
|-------|-------|
| `R1_LADDER_OBSERVATION_OBSERVED` | **NO** |
| `R1_LADDER_VALIDATION` | **PENDING** |

No `nominal_rest_interval_index >= 1` post-T0 — expected until parked-rest cadence after a natural engine-off anchor.

## 9 — REST_WAKE safety

| Field | Value |
|-------|-------|
| `REST_WAKE_VOLTAGE` rows post-T0 | **0** |
| `CADENCE_BASED_REST_WAKE_PROMOTION_OCCURRED` | **NO** |

## 10 — REST_STABLE safety

| Field | Value |
|-------|-------|
| `REST_STABLE_VOLTAGE_COUNT` | **0** |
| `REST_STABLE_PROMOTION_OCCURRED` | **NO** |
| `R1_WAKE_LOAD_ORDER_KNOWN` | **NO** |

## 11 — Provenance forensics

Representative `DRIVING_NON_CHARGING` observation `24f0ce72-3db6-4497-b7b4-7f522fe4acbf`:

| Field | Value |
|-------|-------|
| `provider_timestamp_source` | `PROVIDER_FIELD_TIMESTAMP` |
| `state_timestamp_source` | `PROVIDER_SNAPSHOT_TIMESTAMP` (distinct from LV source label) |
| `voltage_observed_at` / `provider_observation_at` | `2026-09-21T18:12:04Z` |
| `ingested_at` | `2026-09-21T18:12:16.632Z` (ingest after provider field time — not used as rest age) |
| `source_measurement_id` | linked |
| `actual_rest_age_ms` | null (non-rest class) |

DB-wide post-T0 checks:

| Field | Value |
|-------|-------|
| `PROVENANCE_VALIDATION_RESULT` | **PASS** (sample + aggregate guards) |
| `TIMESTAMP_CONFLATION_FOUND` | **NO** |
| `INGEST_TIME_AUTHORITATIVE_REST_AGE_FOUND` | **NO** (`ingest_age` guard count **0**) |
| `AUTHORITATIVE_REST_AGE_FROM_PROVIDER_FIELD_TIME_ONLY` | **YES** (no rest-age rows yet; policy unchanged) |

## 12 — Duplicate / multi-replica safety

| Field | Value |
|-------|-------|
| `DUPLICATE_EVIDENCE_ROWS` (idempotency) | **0** |
| `DUPLICATE_SOURCE_MEASUREMENT_ROWS` | **0** |
| `MULTIPLE_ACTIVE_SESSION_VEHICLES` | **0** |
| `MULTI_REPLICA_LOGICAL_DUPLICATION_FOUND` | **NO** |
| `ACTIVE_SESSION_CONSTRAINT_ERRORS` | **0** |

## 13 — Metrics ↔ database consistency

Prometheus scrape is **`GET /api/v1/metrics`** (bearer-protected); unauthenticated `localhost/metrics` returns SPA HTML — not used.

| Field | Value |
|-------|-------|
| `METRICS_DB_CONSISTENCY` | **PARTIAL_INDETERMINATE** (protected counters; B1 rolling restart reset in-process totals) |
| `METRIC_RESET_DETECTED` | **YES** (expected from B1 canary + full restart) |
| `PROMETHEUS_DUPLICATE_METRIC_ERROR` | **NO** |

DB row count (**29**) is authoritative for this audit; do not require exact counter reconstruction across restart.

## 14 — Authoritative isolation (regression scan)

Post-T0 PM2 error tail scan (Replica A):

| Signal | Post-T0 observed |
|--------|------------------|
| Generalized-evidence processor failures | **0** |
| `REST_60M` / `REST_6H` error tokens | **0** |
| Assessment / publication failure tokens | **0** |
| Trip FSM error tokens | **0** |

Pre-T0 **`BATTERY_LV_REST_SESSION_OPEN` / `LOCK_CONTENTION`** lines remain in log tail (authoritative reconcile path, unrelated vehicle/job ids) — **not** classified as B1 shadow regression.

| Field | Value |
|-------|-------|
| `LIVE_VOLTAGE_RAW_PERSISTENCE_HEALTH` | **PASS** (29 VALID LV inserts post-T0) |
| `REST_60M_ERROR_OBSERVED` | **NO** (post-T0) |
| `REST_6H_ERROR_OBSERVED` | **NO** (post-T0) |
| `ASSESSMENT_ERROR_OBSERVED` | **NO** (post-T0) |
| `PUBLICATION_ERROR_OBSERVED` | **NO** (post-T0) |
| `TRIP_FSM_ERROR_OBSERVED` | **NO** (post-T0) |
| `AUTHORITATIVE_BATTERY_BEHAVIOR_CHANGED` | **NO** |
| `AUTHORITATIVE_REGRESSION_OBSERVED` | **NONE** in post-T0 window |

## 15 — Gate results (independent)

| Gate | Result |
|------|--------|
| `GENERALIZED_CAPTURE_GATE` | **PASS** |
| `ENGINE_OFF_GATE` | **PENDING** |
| `REST_SESSION_GATE` | **PENDING** |
| `PARKED_REST_CANDIDATE_GATE` | **PENDING** |
| `R1_LADDER_GATE` | **PENDING** |
| `PROVENANCE_GATE` | **PASS** |
| `MULTI_REPLICA_SAFETY_GATE` | **PASS** |

## 16 — Next phase

| Field | Value |
|-------|-------|
| `M3_3C_ALLOWED` | **NO** |
| `NEXT_ACTION` | **`CONTINUE_NATURAL_SHADOW_OBSERVATION`** |

Immediate shadow chain through generalized capture is healthy; rest-session / engine-off / parked / R1 ladder await natural ICE shutdown + rest telemetry — **do not** start M3.3C or tolerance changes.

## Evidence artifact

Read-only SQL + VPS checks: `/opt/cursor/artifacts/m3_3_b1_1_production_forensics.log` (Cloud Agent run).

---

## Final machine block

```
M3_3_B1_1_RESULT=B1_1_CAPTURE_AND_SAFETY_PASS_REST_CHAIN_PENDING

M3_3_B1_T0=2026-09-21T18:08:19Z

PRODUCTION_SHA=105f2c5ff28f74c0f8bc83655da94ab98749ce0d
FLAG_EFFECTIVE_BOTH_REPLICAS=TRUE

GENERALIZED_EVIDENCE_TOTAL=29

DRIVING_CHARGING=0
DRIVING_NON_CHARGING=1
ENGINE_OFF_TRANSITION=0
PARKED_REST_CANDIDATE=0
REST_WAKE_VOLTAGE=0
REST_STABLE_VOLTAGE=0
ACTIVE_VEHICLE_CONTAMINATED=14
CHARGING_CONTAMINATED=14
STALE_REPLAY=0
STATE_AMBIGUOUS=0
UNKNOWN=0

ELIGIBLE_LIVE_VOLTAGE_MEASUREMENTS=29
GENERALIZED_EVIDENCE_CAPTURED=29
UNEXPECTEDLY_UNCAPTURED=0
DUPLICATE_CAPTURE_COUNT=0

ENGINE_OFF_TRANSITION_OBSERVED=NO
REST_SESSION_OPENED_OBSERVED=NO
PARKED_REST_CANDIDATE_OBSERVED=NO
R1_LADDER_OBSERVATION_OBSERVED=NO

ANCHOR_OBSERVATION_LINKED_TO_SESSION=N/A
AUTHORITATIVE_REST_AGE_FROM_PROVIDER_FIELD_TIME_ONLY=YES

SUB_4H_FALSE_LADDER_PROMOTION_COUNT=0

DUPLICATE_EVIDENCE_ROWS=0
DUPLICATE_SOURCE_MEASUREMENT_ROWS=0
MULTIPLE_ACTIVE_SESSION_VEHICLES=0
MULTI_REPLICA_LOGICAL_DUPLICATION_FOUND=NO

REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED=false
CADENCE_BASED_REST_WAKE_PROMOTION_OCCURRED=NO

REST_STABLE_PROMOTION_OCCURRED=NO
R1_WAKE_LOAD_ORDER_KNOWN=NO

TIMESTAMP_CONFLATION_FOUND=NO
INGEST_TIME_AUTHORITATIVE_REST_AGE_FOUND=NO

AUTHORITATIVE_BATTERY_BEHAVIOR_CHANGED=NO
AUTHORITATIVE_REGRESSION_OBSERVED=NONE

GENERALIZED_CAPTURE_GATE=PASS
ENGINE_OFF_GATE=PENDING
REST_SESSION_GATE=PENDING
PARKED_REST_CANDIDATE_GATE=PENDING
R1_LADDER_GATE=PENDING
PROVENANCE_GATE=PASS
MULTI_REPLICA_SAFETY_GATE=PASS

PRODUCTION_CHANGED=NO

M3_3C_ALLOWED=NO
NEXT_ACTION=CONTINUE_NATURAL_SHADOW_OBSERVATION
```
