# P1.8.3.6 — INC-07 Natural Warm-Tier Retrospective Closure Audit

**Date:** 2026-09-04  
**Incident:** INC-07 — `INTRA_TRIP_GAP_SPLIT` reconciliation re-application idempotency  
**Remediation:** PR #1525 (`5b788a223d0461f29b96b142e51388c9831366a2`)  
**Validation baseline:** PR #1528 (`95234b28bfa88b328430bb7af769e57ad30a275a`)  
**Extension:** P1.8.3.6.1 — 09:18Z warm-tier cycle evidence extension  
**Final audit:** P1.8.3.6.2 — ~2-day INC-07 replay + OQ-28 FULL_N2 certification audit (2026-09-05)  
**Verdict:** `FINAL AUDIT COMPLETE — INC-07 NOT CLOSED` (evidence MODERATE); `OQ-28 NOT CLOSED` (longest segment 76832s)

---

## Machine-readable verdict block

```
P1_8_3_6_RETROSPECTIVE_VERDICT = INC_07_REMAINS_OPEN_MODERATE_EVIDENCE
P1_8_3_6_1_EXTENSION_VERDICT = EVIDENCE_EXTENDED_AUTHORITY_CORRECTED

AUDIT_WINDOW_START = 2026-09-03T21:19:07Z
PREVIOUS_AUDIT_WINDOW_END = 2026-09-04T09:17:20Z
AUDIT_WINDOW_END = 2026-09-04T09:47:08Z
AUDIT_WINDOW_SECONDS = 44881
AUDIT_WINDOW_HOURS = 12.47

INC07_FIX_PRESENT_FOR_ENTIRE_AUDIT_WINDOW = YES
DEPLOYMENT_BOUNDARY_COUNT_IN_AUDIT_WINDOW = 0
PRE_T0_DEPLOYMENT_BOUNDARY_COUNT = 1

HISTORICAL_DUPLICATE_GROUP_COUNT_BASELINE = 2
HISTORICAL_DUPLICATE_ROW_COUNT_BASELINE = 4
HISTORICAL_DUPLICATE_GROUP_COUNT_NOW = 2
HISTORICAL_DUPLICATE_ROW_COUNT_NOW = 4
HISTORICAL_DUPLICATE_ROWS_MUTATED = NO

THIRD_WARM_TIER_CYCLE_OBSERVED = YES
THIRD_WARM_TIER_START = 2026-09-04T09:18:43Z
THIRD_WARM_TIER_END = 2026-09-04T09:18:48Z
THIRD_WARM_TIER_VEHICLE_COUNT = 6
THIRD_WARM_TIER_REPAIR_COUNT = 1

WARM_TIER_EXECUTION_COUNT_AFTER_T0 = 3
NATURAL_WARM_TIER_CYCLES_OBSERVED = 3
WARM_TIER_EXECUTION_TIMESTAMPS = 2026-09-04T01:18:43Z,2026-09-04T05:18:43Z,2026-09-04T09:18:43Z

EXTENSION_INTRA_TRIP_GAP_SPLIT_REPAIR_ROWS = 1
EXTENSION_DETERMINISTIC_REPAIR_IDS = 1
EXTENSION_APPLIED = 1
EXTENSION_PROPOSED = 0
EXTENSION_REJECTED = 0

POST_T0_INTRA_TRIP_GAP_SPLIT_REPAIR_ROWS = 1
POST_T0_DETERMINISTIC_REPAIR_IDS = 1
POST_T0_LEGACY_REPAIR_IDS = 0
POST_T0_APPLIED = 1
POST_T0_PROPOSED = 0
POST_T0_REJECTED = 0

NATURAL_REPAIR_REPLAY_COUNT = 0
NATURAL_IDEMPOTENT_SKIP_COUNT = 0
NATURAL_REPLAY_WITH_SECOND_MUTATION_COUNT = 0

IDEMPOTENT_SKIP_DELTA = UNAVAILABLE_NO_T0_BASELINE
IDEMPOTENT_SKIP_EVIDENCE_SOURCE = LOGS_AND_DB_ABSENCE

NEW_DUPLICATE_GROUP_COUNT_AFTER_T0 = 0
NEW_DUPLICATE_ROW_COUNT_AFTER_T0 = 0
NEW_INC07_EQUIVALENT_DUPLICATE_GROUP_COUNT = 0

MAX_COMMITTED_MUTATIONS_PER_REPAIR_ID = 1
REPAIR_IDS_WITH_MULTIPLE_MUTATIONS = 0

APPLIED_DOWNGRADE_SIGNAL_FOUND = NO
APPLIED_TO_REJECTED_COUNT = 0
APPLIED_TO_PROPOSED_COUNT = 0

INC07_TRANSACTION_FAILURE_COUNT = 0
INC07_ADVISORY_LOCK_FAILURE_COUNT = 0
INC07_TX_TIMEOUT_COUNT = 0
INC07_DEADLOCK_COUNT = 0
COMMIT_STATE_ALREADY_APPLIED_COUNT = 0

DUPLICATE_ROUTE_SIDE_EFFECT_SIGNAL = NO
DUPLICATE_ATE_SIDE_EFFECT_SIGNAL = NO
DUPLICATE_DI_SIDE_EFFECT_SIGNAL = NO
POST_COMMIT_ENQUEUE_LOSS_SIGNAL = NO

DOUBLE_RECONCILIATION_SIGNAL = NO
MUTEX_STALE_SIGNAL = NO
MUTEX_RENEW_FAILURE_SIGNAL = NO
RETRY_AMPLIFICATION_SIGNAL = NO

MAX_PROVEN_LEADER_COUNT = 1
SPLIT_BRAIN_SIGNAL_FOUND = NO
RUNTIME_ZERO_LEADER_ANOMALY = NO
CURRENT_REPLICA_COUNT = 2
CURRENT_REPLICA_SHA_MATCH = YES
CURRENT_EXTERNAL_HEALTH = OK
CURRENT_LEADER_COUNT = 1

QUEUE_RUNAWAY_SIGNAL = NO
QUEUE_STALLED_SIGNAL = NO
QUEUE_RETRY_AMPLIFICATION_SIGNAL = NO
QUEUE_DUPLICATE_PROCESSING_SIGNAL = NO

FULL_N2_START_REQUIREMENTS = BOTH_REPLICAS_SIMULTANEOUSLY_HEALTHY_AND_SAME_SHA
CURRENT_FULL_N2_SEGMENT_START = 2026-09-03T21:18:52Z
FULL_N2_START_EVIDENCE = P1.8.3.5 deploy: A healthy 21:18:37Z, B healthy 21:18:51Z, SHA invariant 21:18:52Z
CURRENT_FULL_N2_SEGMENT_SECONDS = 44896
FULL_N2_CONTINUITY_BROKEN = NO
FULL_N2_BREAK_TIMESTAMPS =
OQ28_EARLIEST_24H_CHECKPOINT_UTC = 2026-09-04T21:18:52Z
OQ28_24H_CHECKPOINT_REACHED = NO

INC07_PRODUCTION_EVIDENCE_STRENGTH = MODERATE

INC_07_STATUS = FIX_DEPLOYED_PRODUCTION_VALIDATION_IN_PROGRESS
INC_07_PRODUCTION_VALIDATED = NO

OQ_30_STATUS = PARTIAL

N2_PRODUCTION_CERTIFICATION = EARLY
OQ_28_STATUS = PARTIAL

NEW_P0_COUNT = 0
NEW_P1_COUNT = 0
NEW_P2_COUNT = 0
NEW_P3_COUNT = 0

PRODUCTION_MUTATION_EXECUTED = NO
PRODUCTION_DEPLOY_EXECUTED = NO
MANUAL_RECONCILIATION_EXECUTED = NO
ARTIFICIAL_REPAIR_TRIGGERED = NO

NEXT_STAGE = CONTINUE_NATURAL_INC07_PRODUCTION_OBSERVATION
```

---

## Authority pins

| Field | Value |
|-------|-------|
| `PR_1525_MERGED` | YES |
| `PR_1525_MERGE_SHA` | `5b788a223d0461f29b96b142e51388c9831366a2` |
| `PR_1528_MERGED` | YES |
| `PR_1528_MERGE_SHA` | `95234b28bfa88b328430bb7af769e57ad30a275a` |
| `INC07_VALIDATION_START_UTC` | `2026-09-03T21:19:07Z` |
| `CURRENT_PRODUCTION_SHA` | `5b788a223d0461f29b96b142e51388c9831366a2` |
| `CURRENT_RELEASE` | `20260903211138_v4994` |

---

## Audit horizon

| Metric | Value |
|--------|-------|
| Start | `2026-09-03T21:19:07Z` (P1.8.3.5 validation start) |
| Previous end | `2026-09-04T09:17:20Z` (initial P1.8.3.6 collection) |
| End | `2026-09-04T09:47:08Z` (P1.8.3.6.1 extension collection) |
| Duration | `44881s` (~`12.47h`) |

Elapsed wall-clock time alone does **not** prove INC-07 validation. This audit required actual warm-tier execution evidence and, ideally, a natural same-repair replay with `IDEMPOTENT_SKIP`.

---

## Deploy boundaries

| # | Time (UTC) | Event | SHA | In audit window? | INC-07 fix |
|---|------------|-------|-----|------------------|------------|
| 1 | `2026-09-03T21:11:38Z` | Release `20260903211138_v4994` promoted | `5b788a223…` | **NO** (pre-T0) | YES |

The deployment at `21:11:38Z` occurred **before** validation start (`21:19:07Z`). It is a pre-T0 boundary, not an in-window boundary.

```
INC07_FIX_PRESENT_FOR_ENTIRE_AUDIT_WINDOW = YES
DEPLOYMENT_BOUNDARY_COUNT_IN_AUDIT_WINDOW = 0
PRE_T0_DEPLOYMENT_BOUNDARY_COUNT = 1
```

Runtime markers verified in current `dist`: `buildIntraTripGapSplitRepairAuditId`, `applyIntraTripGapSplitRepairAtomically`, `recordIntraTripGapSplitFailureSafely` — all PRESENT.

---

## Post-T0 production topology

| Component | State |
|-----------|-------|
| `REPLICA_COUNT` | 2 |
| `synqdrive` (A) | online @ 3001, LEADER |
| `synqdrive-b` (B) | online @ 3002, FOLLOWER |
| `CURRENT_PRODUCTION_SHA` | `5b788a223d0461f29b96b142e51388c9831366a2` (both replicas) |
| nginx dual upstream | `3001` + `3002` configured |
| Direct / external health | OK |
| Scheduler | `leaderCount=1`; snapshot A@3001 LEADER / B@3002 FOLLOWER |

---

## Historical duplicate baseline (frozen)

Pre-deploy P1.8.3.5 baseline and post-extension read-only query are **identical**:

| Metric | Baseline | Now |
|--------|----------|-----|
| Duplicate groups | 2 | 2 |
| Duplicate rows | 4 | 4 |
| Vehicle | `8c850ff1-4201-432b-af2e-2711dbc7ca48` | unchanged |

```
HISTORICAL_DUPLICATE_ROWS_MUTATED = NO
```

These rows remain forensic evidence of the pre-fix defect. They were not repaired or deleted in this audit.

---

## Post-T0 INTRA_TRIP_GAP_SPLIT activity

| Metric | Count |
|--------|-------|
| New `trip_repairs` rows after T0 | **1** |
| Deterministic repair IDs (post-T0) | **1** |
| Legacy repair IDs (post-T0) | **0** |
| APPLIED / PROPOSED / REJECTED (post-T0) | **1 / 0 / 0** |
| Repaired trips created after T0 | **1** |

### Post-T0 repair identity

| Field | Value |
|-------|-------|
| `REPAIR_ID` | `2074c845-ca32-a9f7-bef7-b2444b7a8c45` |
| `VEHICLE_ID` | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| `WINDOW_FROM` | `2026-09-04T03:44:03Z` |
| `WINDOW_TO` | `2026-09-04T03:47:19Z` |
| `status` | `APPLIED` |
| `created_at` / `applied_at` | `2026-09-04T09:18:44Z` |
| Repaired trip | `ffd93d1c-b8ec-42fb-8842-216f3de39fad` |
| Deterministic ID verified | YES (workspace detector matches stored ID) |
| Encounter type | **First-ever** semantic repair (not replay) |

Log evidence: `INTRA_TRIP_GAP_SPLIT retro: vehicle=a60c0749… gap=196s …` at `09:18:44Z` during third warm-tier cycle.

---

## Natural warm-tier execution evidence

Warm-tier scheduler logs on the **post-fix process** (`pid 2917518`, leader replica):

| Timestamp (UTC) | Event | Repairs |
|-----------------|-------|---------|
| `2026-09-04T01:18:43Z` | Warm reconciliation starting | 0 across 6 vehicles |
| `2026-09-04T01:18:48Z` | Warm reconciliation complete | 0 |
| `2026-09-04T05:18:43Z` | Warm reconciliation starting | 0 across 6 vehicles |
| `2026-09-04T05:18:45Z` | Warm reconciliation complete | 0 |
| `2026-09-04T09:18:43Z` | Warm reconciliation starting | 6 vehicles |
| `2026-09-04T09:18:48Z` | Warm reconciliation complete | **1** trip repaired |

**Note:** The `2026-09-03T19:07:29Z` warm cycle occurred **before** validation start (`21:19:07Z`) on the **pre-fix** binary and is excluded from post-T0 evidence.

```
WARM_TIER_EXECUTION_COUNT_AFTER_T0 = 3
NATURAL_WARM_TIER_CYCLES_OBSERVED = 3
```

Cadence observed post-deploy: ~4h between warm cycles (01:18 → 05:18 → 09:18), consistent with historical INC-07 duplicate timing. The third cycle was expected at ~`09:18:43Z`; the previous audit ended `83s` before that window.

---

## Natural same-repair replay / idempotent skip

Searched PM2 logs (current + rotated `2026-09-04`) for:

- `INTRA_TRIP_GAP_SPLIT idempotent skip`
- `repairIdentity=`
- `IDEMPOTENT_SKIP`

**Result after T0:** zero replay matches. The single post-T0 repair was a **first encounter**, not a re-encounter of an already-APPLIED semantic repair.

| Metric | Value |
|--------|-------|
| `NATURAL_REPAIR_REPLAY_COUNT` | 0 |
| `NATURAL_IDEMPOTENT_SKIP_COUNT` | 0 |
| `NATURAL_REPLAY_WITH_SECOND_MUTATION_COUNT` | 0 |

Prometheus `/metrics` on port 3001 returned HTML (auth-gated); no T0 baseline was retained for `synqdrive_trip_reconciliation_repair_idempotent_skip_total`. Delta classification: **UNAVAILABLE**.

**Next replay watch:** repair `2074c845…` may be re-encountered at the next ~4h warm cycle (~`2026-09-04T13:18:43Z`).

---

## New duplicate group query

Post-T0 semantic duplicate query (`vehicle_id` + `start_time` on `REPAIRED` trips):

```
NEW_DUPLICATE_GROUP_COUNT_AFTER_T0 = 0
NEW_INC07_EQUIVALENT_DUPLICATE_GROUP_COUNT = 0
```

No new INC-07-equivalent duplicate groups were created during the audit window.

---

## APPLIED terminality and transaction signals

| Check | Result |
|-------|--------|
| APPLIED → REJECTED after T0 | 0 rows |
| APPLIED → PROPOSED after T0 | 0 rows |
| Transaction rollback / deadlock / advisory lock failure logs | none observed |
| `COMMIT_STATE_ALREADY_APPLIED` | 0 |

---

## One-mutation-per-repair semantics

One post-T0 deterministic repair ID exists with exactly one committed trip mutation:

```
MAX_COMMITTED_MUTATIONS_PER_REPAIR_ID = 1
REPAIR_IDS_WITH_MULTIPLE_MUTATIONS = 0
```

---

## Downstream side effects, mutex, queues

| Signal | Result |
|--------|--------|
| Duplicate route / ATE / DI side effects | NO |
| Post-commit enqueue loss | NO |
| Reconciliation mutex keys | 0 |
| Queue wait/active (reconciliation, route, ATE, behavior) | all 0 |
| Queue failed counts | all 0 |
| Runaway / stall / retry amplification | NO |

---

## Evidence strength classification

| Class | Requirement | Met? |
|-------|-------------|------|
| **STRONG** | Natural same-repair replay → `IDEMPOTENT_SKIP` → no second mutation | **NO** |
| **MODERATE** | ≥2 warm cycles + meaningful gap-split activity + no new duplicates + deterministic IDs correct | **YES** |
| **WEAK** | Time elapsed without meaningful reconciliation opportunity | **NO** (superseded) |
| **FAILED** | New equivalent duplicate or second mutation | **NO** |

```
INC07_PRODUCTION_EVIDENCE_STRENGTH = MODERATE
```

### Closure decision

Per P1.8.3.5 natural warm-tier contract and Phase 17 closure rules:

- Three proven post-fix warm-tier cycles executed ✓
- One post-T0 `INTRA_TRIP_GAP_SPLIT` repair with deterministic ID ✓
- No new INC-07-equivalent duplicates ✓
- No APPLIED downgrade or transaction ambiguity ✓
- One mutation per repair ID ✓
- **But:** zero natural same-repair replay, zero `IDEMPOTENT_SKIP` observability

The core INC-07 defect is **re-application idempotency**. First-application success under warm-tier reconciliation is necessary but does not prove the remediated replay path. Evidence upgraded from WEAK to MODERATE; closure requires STRONG replay proof or sufficient MODERATE replay proof per OQ-30.

```
INC_07_STATUS = FIX_DEPLOYED_PRODUCTION_VALIDATION_IN_PROGRESS
INC_07_PRODUCTION_VALIDATED = NO
```

---

## OQ-30 decision

OQ-30 tracks `INTRA_TRIP_GAP_SPLIT` reconciliation idempotency. Production fix is deployed, N=2 is healthy, and meaningful gap-split activity was observed. Replay/idempotent-skip proof remains pending.

```
OQ_30_STATUS = PARTIAL
```

---

## N2 / OQ-28 segment

Per P1.8.3.3 authority, `FULL_N2` requires both replicas simultaneously healthy on the same SHA (gaps excluded). Scheduler convergence is tracked separately.

| Milestone | Time (UTC) |
|-----------|------------|
| Replica A healthy | `21:18:37` |
| Replica B healthy | `21:18:51` |
| SHA invariant OK | `21:18:52` |
| Scheduler convergence | `21:19:06` |
| Validation start (T0) | `21:19:07` |

Earliest defensible FULL_N2 start = max(A healthy, B healthy, SHA invariant) = **`2026-09-03T21:18:52Z`**.

| Field | Value |
|-------|-------|
| `FULL_N2_START_REQUIREMENTS` | BOTH_REPLICAS_SIMULTANEOUSLY_HEALTHY_AND_SAME_SHA |
| `CURRENT_FULL_N2_SEGMENT_START` | `2026-09-03T21:18:52Z` |
| `CURRENT_FULL_N2_SEGMENT_SECONDS` | `44896` (~12.5h at extension end) |
| `FULL_N2_CONTINUITY_BROKEN` | NO |
| `OQ28_EARLIEST_24H_CHECKPOINT_UTC` | `2026-09-04T21:18:52Z` |
| `OQ28_24H_CHECKPOINT_REACHED` | NO |

```
N2_PRODUCTION_CERTIFICATION = EARLY
OQ_28_STATUS = PARTIAL
```

Do not combine segmented intervals. INC-07 closure (when it occurs) does not automatically upgrade N2 certification.

---

## Evidence Extension — 2026-09-04 ~09:18Z cycle

**Extension trigger:** Previous audit ended `2026-09-04T09:17:20Z`, approximately 83 seconds before the expected third ~4h warm-tier cycle (~`09:18:43Z`).

**Extension cutoff:** `2026-09-04T09:47:08Z`

### Extension findings

| Check | Result |
|-------|--------|
| Third warm-tier cycle observed | **YES** (`09:18:43Z` → `09:18:48Z`) |
| Extension INTRA_TRIP_GAP_SPLIT rows | **1** (APPLIED) |
| Natural replay / IDEMPOTENT_SKIP | **0** |
| New duplicate groups | **0** |
| Authority corrections applied | deployment boundary, FULL_N2 start, empty-set max semantics |

### Authority corrections (P1.8.3.6.1)

1. **Deployment boundary:** Pre-T0 deploy at `21:11:38Z` is not an in-window boundary → `DEPLOYMENT_BOUNDARY_COUNT_IN_AUDIT_WINDOW = 0`, `PRE_T0_DEPLOYMENT_BOUNDARY_COUNT = 1`.
2. **FULL_N2 segment start:** Derived from P1.8.3.3 definition + P1.8.3.5 deploy evidence → `21:18:52Z` (SHA invariant), not `21:18:36Z` (replica A restart alone).
3. **Empty-set max semantics:** With zero post-T0 repair IDs the max is `NOT_APPLICABLE_NO_POST_T0_REPAIR_IDS`; with one repair ID exercised, `MAX_COMMITTED_MUTATIONS_PER_REPAIR_ID = 1`.

---

## Residual findings

| ID | Severity | Notes |
|----|----------|-------|
| INC-07 validation | Open | Await natural same-repair replay with `IDEMPOTENT_SKIP` (~13:18Z cycle) |
| OQ-28 24h soak | Partial | ~12.5h continuous segment; checkpoint `2026-09-04T21:18:52Z` |
| Battery OQ-21 | Pre-existing | Not in scope |
| Historical duplicates | Pre-existing P2 | Frozen baseline; not mutated |

---

## Next stage

```
NEXT_STAGE = CONTINUE_NATURAL_INC07_PRODUCTION_OBSERVATION
```

Recommended follow-up:

1. Continue read-only observation across additional warm-tier cycles
2. Watch for replay of repair `2074c845…` at ~`2026-09-04T13:18:43Z` with `IDEMPOTENT_SKIP`
3. At `2026-09-04T21:18:52Z`, evaluate OQ-28 uninterrupted 24h FULL_N=2 segment independently
4. Do **not** manually trigger reconciliation or gap-split repairs

---

## P1.8.3.6.2 — Final ~2-day extension (2026-09-05)

**Previous cutoff:** `2026-09-04T09:47:08Z`  
**Final audit end:** `2026-09-05T23:19:52Z`  
**Total INC-07 window:** `180034s` (~`50.0h`)

### Final machine-readable verdict block (P1.8.3.6.2)

```
P1_8_3_6_2_FINAL_VERDICT = INC_07_REMAINS_OPEN_MODERATE_EVIDENCE_OQ28_PARTIAL

FINAL_AUDIT_END = 2026-09-05T23:19:52Z
TOTAL_INC07_WINDOW_SECONDS = 180034
TOTAL_INC07_WINDOW_HOURS = 50.01

LATEST_MAIN_SHA = a4377f3a200ca45a97b7ce422caf8d92faddabbe
CURRENT_PRODUCTION_SHA = 3d5040b67abfdc7e95c1b507e13f45d1bc65af11
MAIN_AHEAD_OF_PRODUCTION = YES

PRODUCTION_BOUNDARY_COUNT_AFTER_T0 = 2
INC07_FIX_PRESENT_FOR_ENTIRE_AUDIT_WINDOW = YES

TOTAL_NATURAL_WARM_TIER_CYCLES_AFTER_T0 = 11
WARM_TIER_EXECUTION_TIMESTAMPS = 2026-09-04T01:18:43Z,2026-09-04T05:18:43Z,2026-09-04T09:18:43Z,2026-09-04T13:18:43Z,2026-09-04T17:18:43Z,2026-09-04T22:40:18Z,2026-09-05T02:40:18Z,2026-09-05T06:40:18Z,2026-09-05T13:05:26Z,2026-09-05T17:05:26Z,2026-09-05T21:05:26Z

KNOWN_REPAIR_ID = 2074c845-ca32-a9f7-bef7-b2444b7a8c45
KNOWN_REPAIR_FIRST_APPLIED_AT = 2026-09-04T09:18:44Z
KNOWN_REPAIR_REENCOUNTER_COUNT = 0
KNOWN_REPAIR_IDEMPOTENT_SKIP_COUNT = 0
KNOWN_REPAIR_SECOND_MUTATION_COUNT = 0
KNOWN_REPAIR_FINAL_STATUS = APPLIED

POST_T0_DETERMINISTIC_REPAIR_COUNT = 8
POST_T0_APPLIED = 8
POST_T0_PROPOSED = 0
POST_T0_REJECTED = 0

MAX_COMMITTED_MUTATIONS_PER_REPAIR_ID = 1
REPAIR_IDS_WITH_MULTIPLE_MUTATIONS = 0

HISTORICAL_DUPLICATE_GROUP_COUNT_NOW = 2
HISTORICAL_DUPLICATE_ROW_COUNT_NOW = 4
HISTORICAL_DUPLICATE_ROWS_MUTATED = NO
NEW_DUPLICATE_GROUP_COUNT_AFTER_T0 = 0
NEW_INC07_EQUIVALENT_DUPLICATE_GROUP_COUNT = 0

APPLIED_DOWNGRADE_SIGNAL_FOUND = NO
APPLIED_TO_REJECTED_COUNT = 0
APPLIED_TO_PROPOSED_COUNT = 0

INC07_TRANSACTION_FAILURE_COUNT = 0
INC07_TX_TIMEOUT_COUNT = 0
INC07_DEADLOCK_COUNT = 0
INC07_ADVISORY_LOCK_FAILURE_COUNT = 0
COMMIT_STATE_ALREADY_APPLIED_COUNT = 0

DUPLICATE_ROUTE_SIDE_EFFECT_SIGNAL = NO
DUPLICATE_ATE_SIDE_EFFECT_SIGNAL = NO
DUPLICATE_DI_SIDE_EFFECT_SIGNAL = NO
POST_COMMIT_ENQUEUE_LOSS_SIGNAL = NO

INC07_PRODUCTION_EVIDENCE_STRENGTH = MODERATE

INC_07_STATUS = FIX_DEPLOYED_PRODUCTION_VALIDATION_IN_PROGRESS
INC_07_PRODUCTION_VALIDATED = NO
INC_07_CLOSURE_UTC =

OQ_30_STATUS = PARTIAL

FULL_N2_SEGMENT_COUNT = 3
FULL_N2_CALENDAR_ELAPSED_SECONDS = 180049
LONGEST_FULL_N2_SEGMENT_START = 2026-09-03T21:18:52Z
LONGEST_FULL_N2_SEGMENT_END = 2026-09-04T18:39:24Z
LONGEST_FULL_N2_SEGMENT_SECONDS = 76832
QUALIFYING_24H_FULL_N2_SEGMENT = NO

CURRENT_FULL_N2_SEGMENT_START = 2026-09-05T09:05:28Z
CURRENT_FULL_N2_SEGMENT_SECONDS = 51257

MAX_PROVEN_LEADER_COUNT = 1
SPLIT_BRAIN_SIGNAL_FOUND = NO
PERSISTENT_ZERO_LEADER_SIGNAL = NO
UNEXPECTED_PM2_RESTART_COUNT = 0
UNEXPECTED_PROCESS_EXIT_COUNT = 0

REPLICA_SHA_DIVERGENCE_SIGNAL = NO
DEAD_UPSTREAM_SIGNAL = NO
QUEUE_RUNAWAY_SIGNAL = NO
QUEUE_STALLED_SIGNAL = NO
QUEUE_RETRY_AMPLIFICATION_SIGNAL = NO
MUTEX_DOUBLE_EXECUTION_SIGNAL = NO
DIMO_LIMIT_BREACH_COUNT = 0

OQ_28_STATUS = PARTIAL
N2_PRODUCTION_CERTIFICATION = EARLY
N2_CERTIFICATION_SCOPE = N2_PRODUCTION_TOPOLOGY_ONLY_NOT_N1000_NOT_PROVIDER_CEILING

PRODUCTION_MUTATION_EXECUTED = NO
PRODUCTION_DEPLOY_EXECUTED = NO
MANUAL_RECONCILIATION_EXECUTED = NO
ARTIFICIAL_REPAIR_TRIGGERED = NO

NEXT_STAGE = CONTINUE_NATURAL_INC07_REPLAY_OBSERVATION_AND_CURRENT_FULL_N2_SEGMENT
```

### Deploy / continuity boundaries (post candidate start)

| # | Timestamp (UTC) | Type | SHA | FULL_N2 broken |
|---|-----------------|------|-----|----------------|
| — | `2026-09-03T21:18:52Z` | FULL_N2 candidate start (SHA invariant) | `5b788a223…` | — |
| 1 | `2026-09-04T18:39:24Z` | Rolling deploy restart (replica A) | `43c9ae6c…` | **YES** |
| 2 | `2026-09-04T18:40:17Z` | Rolling deploy restart (replica B) | `43c9ae6c…` | segment 2 begins |
| 3 | `2026-09-05T09:05:24Z` | Rolling deploy restart (replica A) | `3d5040b67…` | **YES** |
| 4 | `2026-09-05T09:05:28Z` | Replica B online | `3d5040b67…` | segment 3 begins |

All post-T0 deployed SHAs contain `buildIntraTripGapSplitRepairAuditId` (INC-07 fix present).

### Known repair `2074c845…` replay analysis

| Check | Result |
|-------|--------|
| First APPLIED | `2026-09-04T09:18:44Z` (warm cycle 3) |
| Expected replay cycle (`13:18:43Z`) | Warm cycle ran; **0 repairs** fleet-wide |
| Explicit `INTRA_TRIP_GAP_SPLIT idempotent skip` logs | **0** (logged at DEBUG level in code; not retained in PM2 out logs) |
| Second DB row for same semantic window | **0** |
| Second trip mutation for same window | **0** |

After first apply, trip topology changed (gap split committed). Subsequent warm cycles did not re-present the same semantic candidate; this is **not** equivalent to proven same-repair `IDEMPOTENT_SKIP` replay.

### INC-07 closure decision

Evidence upgraded through P1.8.3.6.1 (WEAK → MODERATE) and sustained at MODERATE after ~50h / 11 warm cycles / 8 post-T0 repairs. **STRONG** closure criteria (natural same-repair re-encounter → `IDEMPOTENT_SKIP` → no second mutation) **not met**. INC-07 remains open.

### OQ-28 cross-reference

See `architecture/P1_8_3_7_OQ_28_UNINTERRUPTED_24H_FULL_N2_CERTIFICATION_2026-09-06.md`. Longest uninterrupted FULL_N2 segment `76832s` (< `86400`). OQ-28 remains **PARTIAL**.
