# P1.8.3.6 — INC-07 Natural Warm-Tier Retrospective Closure Audit

**Date:** 2026-09-04  
**Incident:** INC-07 — `INTRA_TRIP_GAP_SPLIT` reconciliation re-application idempotency  
**Remediation:** PR #1525 (`5b788a223d0461f29b96b142e51388c9831366a2`)  
**Validation baseline:** PR #1528 (`95234b28bfa88b328430bb7af769e57ad30a275a`)  
**Verdict:** `RETROSPECTIVE COMPLETE — INC-07 NOT CLOSED` (evidence WEAK)

---

## Machine-readable verdict block

```
P1_8_3_6_RETROSPECTIVE_VERDICT = INC_07_REMAINS_OPEN_WEAK_EVIDENCE

AUDIT_WINDOW_START = 2026-09-03T21:19:07Z
AUDIT_WINDOW_END = 2026-09-04T09:17:20Z
AUDIT_WINDOW_SECONDS = 43093
AUDIT_WINDOW_HOURS = 11.97

INC07_FIX_PRESENT_FOR_ENTIRE_AUDIT_WINDOW = YES
DEPLOYMENT_BOUNDARY_COUNT = 1

HISTORICAL_DUPLICATE_GROUP_COUNT_BASELINE = 2
HISTORICAL_DUPLICATE_ROW_COUNT_BASELINE = 4
HISTORICAL_DUPLICATE_GROUP_COUNT_NOW = 2
HISTORICAL_DUPLICATE_ROW_COUNT_NOW = 4
HISTORICAL_DUPLICATE_ROWS_MUTATED = NO

WARM_TIER_EXECUTION_COUNT_AFTER_T0 = 2
NATURAL_WARM_TIER_CYCLES_OBSERVED = 2
WARM_TIER_EXECUTION_TIMESTAMPS = 2026-09-04T01:18:43Z,2026-09-04T05:18:43Z

POST_T0_INTRA_TRIP_GAP_SPLIT_REPAIR_ROWS = 0
POST_T0_DETERMINISTIC_REPAIR_IDS = 0
POST_T0_LEGACY_REPAIR_IDS = 0
POST_T0_APPLIED = 0
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

MAX_COMMITTED_MUTATIONS_PER_REPAIR_ID = 0
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

QUEUE_RUNAWAY_SIGNAL = NO
QUEUE_STALLED_SIGNAL = NO
QUEUE_RETRY_AMPLIFICATION_SIGNAL = NO
QUEUE_DUPLICATE_PROCESSING_SIGNAL = NO

INC07_PRODUCTION_EVIDENCE_STRENGTH = WEAK

INC_07_STATUS = FIX_DEPLOYED_PRODUCTION_VALIDATION_IN_PROGRESS
INC_07_PRODUCTION_VALIDATED = NO

OQ_30_STATUS = PARTIAL

N2_PRODUCTION_CERTIFICATION = EARLY
OQ_28_STATUS = PARTIAL

CURRENT_FULL_N2_SEGMENT_START = 2026-09-03T21:18:36Z
CURRENT_FULL_N2_SEGMENT_SECONDS = 43103
OQ28_EARLIEST_24H_CHECKPOINT_UTC = 2026-09-04T21:18:36Z

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
| End | `2026-09-04T09:17:20Z` (evidence collection) |
| Duration | `43093s` (~`11.97h`) |

Elapsed wall-clock time alone does **not** prove INC-07 validation. This audit required actual warm-tier execution evidence and, ideally, a natural same-repair replay with `IDEMPOTENT_SKIP`.

---

## Deploy boundaries after T0

| # | Time (UTC) | Event | SHA | INC-07 fix |
|---|------------|-------|-----|------------|
| 1 | `2026-09-03T21:11:38Z` | Release `20260903211138_v4994` promoted | `5b788a223…` | YES |

**Finding:** No production deployment occurred after the P1.8.3.5 validation start. Both replicas have been continuously online on the INC-07 remediation SHA since rolling restart at `2026-09-03T21:18:36Z` / `21:18:45Z`.

```
INC07_FIX_PRESENT_FOR_ENTIRE_AUDIT_WINDOW = YES
DEPLOYMENT_BOUNDARY_COUNT = 1
```

Runtime markers verified in current `dist`: `buildIntraTripGapSplitRepairAuditId`, `applyIntraTripGapSplitRepairAtomically`, `recordIntraTripGapSplitFailureSafely` — all PRESENT.

---

## Post-T0 production topology

| Component | State |
|-----------|-------|
| `REPLICA_COUNT` | 2 |
| `synqdrive` (A) | online @ 3001, LEADER, uptime ~12h since deploy |
| `synqdrive-b` (B) | online @ 3002, FOLLOWER |
| `CURRENT_PRODUCTION_SHA` | `5b788a223d0461f29b96b142e51388c9831366a2` (both replicas) |
| nginx dual upstream | `3001` + `3002` configured |
| Direct / external health | OK |
| Scheduler | `leaderCount=1`; snapshot A@3001 LEADER / B@3002 FOLLOWER |

---

## Historical duplicate baseline (frozen)

Pre-deploy P1.8.3.5 baseline and post-audit read-only query are **identical**:

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
| New `trip_repairs` rows after T0 | **0** |
| Deterministic repair IDs (post-T0) | **0** |
| Legacy repair IDs (post-T0) | **0** |
| APPLIED / PROPOSED / REJECTED (post-T0) | **0 / 0 / 0** |
| Repaired trips created after T0 | **0** |

Total fleet `INTRA_TRIP_GAP_SPLIT` rows remain **323 APPLIED** (all pre-fix legacy random UUIDs). No post-remediation gap-split repair was created, updated, or replayed in the database during the audit window.

---

## Natural warm-tier execution evidence

Warm-tier scheduler logs on the **post-fix process** (`pid 2917518`, leader replica):

| Timestamp (UTC) | Event | Repairs |
|-----------------|-------|---------|
| `2026-09-04T01:18:43Z` | Warm reconciliation starting | 0 across 6 vehicles |
| `2026-09-04T01:18:48Z` | Warm reconciliation complete | 0 |
| `2026-09-04T05:18:43Z` | Warm reconciliation starting | 0 across 6 vehicles |
| `2026-09-04T05:18:45Z` | Warm reconciliation complete | 0 |

**Note:** The `2026-09-03T19:07:29Z` warm cycle occurred **before** validation start (`21:19:07Z`) on the **pre-fix** binary and is excluded from post-T0 evidence.

```
WARM_TIER_EXECUTION_COUNT_AFTER_T0 = 2
NATURAL_WARM_TIER_CYCLES_OBSERVED = 2
```

Cadence observed post-deploy: ~4h between warm cycles (01:18 → 05:18), consistent with historical INC-07 duplicate timing.

---

## Natural same-repair replay / idempotent skip

Searched PM2 logs (current + rotated `2026-09-04`) for:

- `INTRA_TRIP_GAP_SPLIT idempotent skip`
- `INTRA_TRIP_GAP_SPLIT retro:`
- `repairIdentity=`
- `IDEMPOTENT_SKIP`

**Result after T0:** zero matches.

| Metric | Value |
|--------|-------|
| `NATURAL_REPAIR_REPLAY_COUNT` | 0 |
| `NATURAL_IDEMPOTENT_SKIP_COUNT` | 0 |
| `NATURAL_REPLAY_WITH_SECOND_MUTATION_COUNT` | 0 |

Prometheus `/metrics` on port 3001 returned HTML (auth-gated); no T0 baseline was retained for `synqdrive_trip_reconciliation_repair_idempotent_skip_total`. Delta classification: **UNAVAILABLE**.

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
| **MODERATE** | ≥2 warm cycles + meaningful gap-split activity + no new duplicates | **PARTIAL** (2 cycles, no gap-split activity) |
| **WEAK** | Time elapsed without meaningful reconciliation opportunity | **YES** |
| **FAILED** | New equivalent duplicate or second mutation | **NO** |

```
INC07_PRODUCTION_EVIDENCE_STRENGTH = WEAK
```

### Closure decision

Per P1.8.3.5 natural warm-tier contract and Phase 17 closure rules:

- Two proven post-fix warm-tier cycles executed ✓
- No new INC-07-equivalent duplicates ✓
- No APPLIED downgrade or transaction ambiguity ✓
- **But:** zero post-T0 `INTRA_TRIP_GAP_SPLIT` candidates, zero natural replay, zero `IDEMPOTENT_SKIP` observability

**INC-07 remains open.** Elapsed time and absence of new duplicates are necessary but insufficient for closure without exercising the remediated idempotency path under natural warm-tier reconciliation.

```
INC_07_STATUS = FIX_DEPLOYED_PRODUCTION_VALIDATION_IN_PROGRESS
INC_07_PRODUCTION_VALIDATED = NO
```

---

## OQ-30 decision

OQ-30 tracks `INTRA_TRIP_GAP_SPLIT` reconciliation idempotency. Production fix is deployed and N=2 is healthy, but the retrospective did not produce STRONG or sufficient MODERATE replay evidence.

```
OQ_30_STATUS = PARTIAL
```

---

## N2 / OQ-28 segment

Current uninterrupted FULL_N=2 segment began at deploy rolling restart:

| Field | Value |
|-------|-------|
| `CURRENT_FULL_N2_SEGMENT_START` | `2026-09-03T21:18:36Z` |
| `CURRENT_FULL_N2_SEGMENT_SECONDS` | `43103` (~12.0h at audit end) |
| `OQ28_EARLIEST_24H_CHECKPOINT_UTC` | `2026-09-04T21:18:36Z` |

```
N2_PRODUCTION_CERTIFICATION = EARLY
OQ_28_STATUS = PARTIAL
```

Do not combine segmented intervals. INC-07 closure (when it occurs) does not automatically upgrade N2 certification.

---

## Residual findings

| ID | Severity | Notes |
|----|----------|-------|
| INC-07 validation | Open | Await natural gap-split candidate or same-repair replay with `IDEMPOTENT_SKIP` |
| OQ-28 24h soak | Partial | ~12h continuous segment; checkpoint `2026-09-04T21:18:36Z` |
| Battery OQ-21 | Pre-existing | Not in scope |
| Historical duplicates | Pre-existing P2 | Frozen baseline; not mutated |

---

## Next stage

```
NEXT_STAGE = CONTINUE_NATURAL_INC07_PRODUCTION_OBSERVATION
```

Recommended follow-up:

1. Continue read-only observation across additional warm-tier cycles
2. Watch for `INTRA_TRIP_GAP_SPLIT idempotent skip` log lines or metric delta when `/metrics` baseline is captured at T0
3. At `2026-09-04T21:18:36Z`, evaluate OQ-28 uninterrupted 24h FULL_N=2 segment independently
4. Do **not** manually trigger reconciliation or gap-split repairs
