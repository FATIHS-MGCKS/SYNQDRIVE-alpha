# P1.8.3.5 — INC-07 Production Validation Baseline

**Date:** 2026-09-03  
**Incident:** INC-07 — `INTRA_TRIP_GAP_SPLIT` reconciliation re-application idempotency  
**Merged remediation:** PR #1525  
**Verdict:** `DEPLOYMENT + VALIDATION BASELINE PASSED` — INC-07 **not closed**

---

## Authority pin

| Field | Value |
|-------|-------|
| `PR_1525_MERGED` | YES |
| `PR_1525_MERGE_SHA` | `5b788a223d0461f29b96b142e51388c9831366a2` |
| `REQUESTED_DEPLOY_SHA` | `5b788a223d0461f29b96b142e51388c9831366a2` |
| `PRE_DEPLOY_PRODUCTION_SHA` | `0e0f09259f206aef44bd66eb4c142f7aee3fe29c` |
| `POST_DEPLOY_PRODUCTION_SHA` | `5b788a223d0461f29b96b142e51388c9831366a2` |
| `PRE_DEPLOY_RELEASE` | `20260903101734_v4994` |
| `POST_DEPLOY_RELEASE` | `20260903211138_v4994` |
| `ROLLBACK_TARGET_SHA` | `0e0f09259f206aef44bd66eb4c142f7aee3fe29c` |
| `ROLLBACK_EXECUTED` | NO |
| `INC07_VALIDATION_START_UTC` | `2026-09-03T21:19:07Z` |

---

## Exact-SHA provenance chain (DEC-016 / OQ-18)

| Identity point | SHA | Proof class |
|----------------|-----|-------------|
| `REQUESTED_DEPLOY_SHA` | `5b788a223d0461f29b96b142e51388c9831366a2` | DIRECT — `cloud-agent-deploy.sh` explicit pin |
| `BOOTSTRAP_SCRIPT_SHA` | `5b788a223d0461f29b96b142e51388c9831366a2` | DIRECT — TMP `git fetch` + `ACTUAL == REQUESTED` gate |
| `RELEASE_SOURCE_SHA` | `5b788a223d0461f29b96b142e51388c9831366a2` | DIRECT — `vps_clone_release_at_sha` verified in deploy log |
| `TARGET_SHA` | `5b788a223d0461f29b96b142e51388c9831366a2` | DIRECT — deploy provenance line |
| `REPLICA_A_SHA` | `5b788a223d0461f29b96b142e51388c9831366a2` | DIRECT — rolling verify `sha=true` + `SHA invariant OK` |
| `REPLICA_B_SHA` | `5b788a223d0461f29b96b142e51388c9831366a2` | DIRECT — rolling verify `sha=true` + shared `current` symlink |

```
DEC_016_FULL_INVARIANT_PRODUCTION_PROOF = YES
DEC_016_PRODUCTION_VALIDATION = FULLY_PRODUCTION_VALIDATED
DEC_016_FULL_INVARIANT = VERIFIED_PRODUCTION
OQ_18_STATUS = CLOSED
OQ_18_CLOSURE_CANDIDATE = YES
```

Bootstrap source: `CANONICAL_EXACT_SHA_PATH` (`cloud-agent-deploy.sh` TMP bootstrap, not stale `current`).

---

## Rolling deployment timeline (UTC)

| Time | Event |
|------|-------|
| `21:10:56` | Pre-deploy baseline captured |
| `21:11:38` | Release clone started (`20260903211138_v4994`) |
| `21:18:37` | Replica A rolling restart verified (port 3001) |
| `21:18:51` | Replica B rolling restart verified (port 3002) |
| `21:18:52` | `SHA invariant OK: all replicas on 5b788a223…` |
| `21:19:06` | Scheduler convergence PASS (`LEADER/FOLLOWER`, leaders=1) |
| `21:19:07` | External health PASS; multi-replica verification PASS |
| `21:19:28` | Post-deploy baseline captured |

**Leader convergence:** 6 transient zero-leader polls, 2 stable leader=1 observations, `LEADER_CONVERGENCE_MS ≈ 14000`, `MAX_LEADER_COUNT = 1`.

---

## Post-deploy topology

| Component | State |
|-----------|-------|
| `REPLICA_COUNT` | 2 |
| `synqdrive` (A) | online @ 3001, LEADER |
| `synqdrive-b` (B) | online @ 3002, FOLLOWER |
| nginx dual upstream | PASS (`3001` + `3002`) |
| Direct health A/B | OK |
| External health | OK |
| Redis | PONG |
| Reconciliation mutex keys | 0 (healthy) |
| Trip/route/ATE queues | wait=0, failed=0 |

---

## INC-07 runtime fix in production

Deployed `dist` contains (grep-verified):

- `buildIntraTripGapSplitRepairAuditId` — PRESENT
- `applyIntraTripGapSplitRepairAtomically` — PRESENT
- `recordIntraTripGapSplitFailureSafely` — PRESENT
- `acquirePgAdvisoryXactLock64` — PRESENT

```
INC07_RUNTIME_FIX_PRESENT = YES
```

No manual reconciliation or repair triggers were executed.

---

## Historical duplicate baseline (frozen)

**Pre-deploy and post-deploy identical** — no mutation.

| Metric | Value |
|--------|-------|
| `HISTORICAL_DUPLICATE_GROUP_COUNT` | 2 |
| `HISTORICAL_DUPLICATE_ROW_COUNT` | 4 |
| Vehicle | `8c850ff1-4201-432b-af2e-2711dbc7ca48` |

### Group 1 — `start_time = 2026-09-01 15:22:57`

| Trip ID | Created at |
|---------|------------|
| `9e1cd516-6a39-417c-825a-15309447d5ff` | `2026-09-01 15:47:10` |
| `0d62dfa8-715e-4bb3-9d54-47be1c528726` | `2026-09-01 19:47:07` (+4h) |

### Group 2 — `start_time = 2026-09-01 18:55:00`

| Trip ID | Created at |
|---------|------------|
| `9a536bf0-64fc-4ba0-9d6a-33a234a32563` | `2026-09-01 19:47:08` |
| `49a5e86a-f1ba-486c-aa7c-a0d7ada16902` | `2026-09-01 23:47:08` (+4h) |

```
HISTORICAL_DUPLICATE_GROUPS_DELETED = NO
HISTORICAL_DUPLICATE_ROWS_MUTATED = NO
NEW_INC07_DUPLICATE_GROUPS_IMMEDIATE = 0
```

---

## TripRepair baseline at validation start

| Status | Count |
|--------|-------|
| `INTRA_TRIP_GAP_SPLIT` APPLIED | 323 |
| `INTRA_TRIP_GAP_SPLIT` PROPOSED | 0 |
| `INTRA_TRIP_GAP_SPLIT` REJECTED | 0 |
| Deterministic INC-07 repair IDs (post-fix style) | 0 (historical baseline — all 323 rows are pre-fix random UUIDs) |

**Detector authority note:** P1.8.3.5 pre-deploy deterministic count was zero by historical state (legacy random UUID rows only). The initial baseline script used an incorrect full-SHA256 SQL equality check; the detector was corrected in this final authority pass to match `buildIntraTripGapSplitRepairAuditId()` before any retrospective use. The broken detector did not independently prove the zero count.

```
DETERMINISTIC_INC07_REPAIR_ID_COUNT_PRE_DEPLOY = 0
DETERMINISTIC_ID_DETECTOR_CANONICAL_SOURCE = buildIntraTripGapSplitRepairAuditId (intra-trip-gap-split-repair-id.util.ts)
FUTURE_RETROSPECTIVE_DETECTOR_READY = YES
```

---

## Natural warm-tier validation contract

**Do not close INC-07 from deploy alone.**

Evidence must span **≥2 natural warm-tier reconciliation opportunities** after `INC07_VALIDATION_START_UTC`.

Historical warm-tier cadence for INC-07 duplicates: **~4 hours**.

| Evidence class | Requirement |
|----------------|-------------|
| **STRONG** | Same deterministic repair identity re-encountered → `IDEMPOTENT_SKIP` → no second trip mutation |
| **MODERATE** | Multiple warm cycles with eligible reconciliation activity, no new duplicate group |
| **WEAK** | Time elapsed without meaningful reconciliation opportunity |

**Earliest theoretical two-cycle window:** `2026-09-04T05:19:07Z` (validation start + 8h for two ~4h cycles). Recommended conservative retrospective: **`2026-09-04T09:00:00Z`** or later.

Elapsed wall-clock time alone does **not** prove validation; retrospective evidence must be classified **STRONG**, **MODERATE**, or **WEAK** per the table above.

Retrospective must inspect:

1. All `INTRA_TRIP_GAP_SPLIT` candidates after validation start
2. Deterministic repair identities and `APPLIED` rows
3. `trip_reconciliation_repair_idempotent_skip_total` metrics/logs
4. Any new repaired-trip duplicate groups (semantic gap identity)
5. Route/ATE/enrichment side effects
6. Reconciliation job failures/retries

```
NATURAL_WARM_TIER_CYCLES_OBSERVED = 0
INC_07_STATUS = FIX_DEPLOYED_PRODUCTION_VALIDATION_IN_PROGRESS
INC_07_PRODUCTION_VALIDATED = NO
```

---

## Residual findings

| ID | Severity | Notes |
|----|----------|-------|
| — | — | No new P0/P1 from this deploy |
| Battery OQ-21 | Pre-existing | Record only; not remediated |
| Historical INC-07 duplicates | Pre-existing P2 | Frozen baseline; not mutated |

---

## Ops script

Read-only baseline: `backend/scripts/ops/inc07-production-validation-baseline.sh`

Deterministic repair-ID detection uses `backend/scripts/ops/inc07-deterministic-repair-id-detector.mjs` (canonical semantics aligned with `buildIntraTripGapSplitRepairAuditId()` — first 32 SHA256 hex chars as UUID, not full 64-char digest).

```bash
sudo bash /opt/synqdrive/current/backend/scripts/ops/inc07-production-validation-baseline.sh PRE_DEPLOY
sudo bash /opt/synqdrive/current/backend/scripts/ops/inc07-production-validation-baseline.sh POST_DEPLOY
```

---

## Next stage

`RETROSPECTIVE_INC_07_NATURAL_WARM_TIER_VALIDATION_AFTER_AT_LEAST_TWO_CYCLES`
