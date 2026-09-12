# WOB L 7503 — POST-#1617 retry-budget fix (END_VALIDATION_RETRY_BUDGET_RESET_LOOP)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R12-WOB7503-RETRY-BUDGET-001 |
| **Source type** | PRODUCTION_OBSERVATION + CODE + TEST |
| **Forensic authority** | Draft PR #1625 — [WOB_L_7503_POST_1617_PHYSICAL_ACCEPTANCE_2026-09-12.md](WOB_L_7503_POST_1617_PHYSICAL_ACCEPTANCE_2026-09-12.md) |
| **Fix branch** | `cursor/r12-cusum-retry-budget-fix-64c8` (draft; **not merged / not deployed**) |
| **BASE_MAIN_SHA** | `7cb184ffc5926521429f75524a1dcb65579769f6` |
| **PRODUCTION_SHA (failure)** | `a8320f2cabccf7dbeb38cab5afdfc6ee00abdea0` @ `20260912194023_v4994` |
| **Vehicle** | WOB L 7503 — canonical trip `4083e24c-fc8f-4f56-8d95-a27d517169dc` |
| **Classification** | **FAIL on Production** — bounded fallback unreachable; **CI GREEN on fix branch** |

## Production failure (read-only, not repaired)

| Metric | Observed @ Production |
|--------|------------------------|
| END_VALIDATION runs (canonical trip, ~20:40 UTC window) | **17×** |
| `cusum_still_ongoing` | **17×** |
| FINALIZE | **0×** |
| Per-cycle `completedAttempt` | always **1** |
| Per-cycle `persistedAttemptsAfterReset` | always **0** |
| `TRIP_END_VALIDATION_MAX_ATTEMPTS` | **3** |
| #1617 boundary preservation | **YES** — trusted `stopBoundaryAt` preserved across reopen |
| #1603 PEC→EV lock order | **NOT reproduced** — EV tracking runs persist |

**Primary root cause:** `END_VALIDATION_RETRY_BUDGET_RESET_LOOP` — `buildPossibleEndToActiveReset()` always wrote `endValidationAttempts: 0` on CUSUM still-ongoing reopen, so PEC Step 4 never reached Step 5 `max_completed_cusum_attempts_fallback`.

**Out of scope (separate tracks):**

- `CUSUM_DECISION_SEMANTICS` — immutable 27-point window + `still_active_at_window_end` (detector unchanged in this fix)
- `live_mid_trip_gap_split` false start — spurious trip `802a54ba-139a-4740-87db-6ef619659d5c`

## Minimal fix contract (HEAD)

| Reopen reason | `endValidationAttempts` |
|---------------|-------------------------|
| `ACTIVITY_RESUMED` (default) | **0** |
| `CUSUM_STILL_ONGOING` + trusted boundary + no post-boundary movement | **`completedEndValidationAttempts`** (just-completed EV count) |

Implementation:

- `trip-end-cycle-reset.ts` — optional `completedEndValidationAttempts`; preserve only when `resolveTrustedStopBoundaryForCusumRetry` succeeds
- `trip-detection-orchestration.service.ts` — pass `completedAttempt` on CUSUM ongoing path; log actual `persistedAttemptsAfterReset`

**Does not change:** CUSUM thresholds/tail, maxAttempts=3, #1603 lock deferral, #1617 boundary strip/preserve semantics.

## Deterministic proof (Postgres + BullMQ)

| Probe | File |
|-------|------|
| Integration | [`trip-r12-cusum-retry-budget.postgres-redis.integration.spec.ts`](../../../backend/src/modules/vehicle-intelligence/trips/trip-r12-cusum-retry-budget.postgres-redis.integration.spec.ts) |
| BASE/HEAD worktree script | [`trip-r12-cusum-retry-budget-base-head-red-proof.sh`](../../../backend/scripts/test/trip-r12-cusum-retry-budget-base-head-red-proof.sh) |

### Expected BASE shape (@ `7cb184ff…`)

| Field | Expected |
|-------|----------|
| EV runs | **≥ 4** |
| completedAttempt sequence | `1,1,1,1…` |
| persistedAttempts sequence | `0,0,0,0…` |
| max fallback | **NO** |
| FINALIZE | **NO** |

### Expected HEAD shape (fix branch)

| Field | Expected |
|-------|----------|
| EV runs | **3** |
| completedAttempt sequence | `1,2,3` |
| persistedAttempts sequence | `1,2,3` |
| EV4 | **NO** |
| max fallback reason | `max_completed_cusum_attempts_fallback` |
| terminal chain | FINALIZE → COMPLETED → RESTING → `activeTripId` NULL |

## Physical acceptance status

**Physical acceptance remains FAIL** until a fresh Production drive after deploy of this fix. This artifact proves repository/CI bounded behavior only.

## Related decisions preserved

| PR | Status in this fix |
|----|-------------------|
| #1603 PEC→EV/FINALIZE lock deferral | **Non-regression** — unchanged |
| #1617 CUSUM boundary preservation | **Non-regression** — unchanged; retry budget added orthogonally |
