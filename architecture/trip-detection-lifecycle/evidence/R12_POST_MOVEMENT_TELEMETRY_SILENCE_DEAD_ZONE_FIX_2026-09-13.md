# R12 — POST_MOVEMENT_TELEMETRY_SILENCE_DEAD_ZONE fix (2026-09-13)

| Field | Value |
|-------|-------|
| **Forensic authority (read-only)** | Draft PR #1634 |
| **Fix PR** | (assigned on merge request open) |
| **Root cause class** | `POST_MOVEMENT_TELEMETRY_SILENCE_DEAD_ZONE` |
| **BASE SHA** | `df8d9d756d171b24bece564fd705bd570b3d4204` |
| **Production vehicle (forensic only)** | WOB L 7503 — not final physical acceptance |

## BEFORE

After credible movement, when any trusted stop boundary was absent or retired by movement, final stop + `SUCCESS_EMPTY` core + stale VLS (`vls_stale_provider_observation`) produced unbounded `KEEP_OPEN` in `assessSuccessfulEmptyCoreEndEligibility` with no decision-level liveness bound. Poll backoff capped delay only; `emptyCoreDeferralStreak` could grow without reaching `POSSIBLE_END`.

## CHANGE

Introduced `assessProviderSilenceEmptyCoreAdmission` in `trip-empty-core-end-gate.ts`:

- Reuses **`TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS` (120_000 ms)** as `EMPTY_CORE_LIVENESS_BOUND_MS` (`BOUND_SOURCE=TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS`).
- After bounded provider silence with stale UNKNOWN VLS, no trusted boundary, and no post-stop contradictions → conservative `POSSIBLE_END` via `provider_silence_empty_core_admission`.
- Silence end candidate: `provider_silence_candidate` @ `lastProviderActivityAt` / last VLS `sourceTimestamp` (EVENT_TIME, **trust=false**). Does **not** fabricate stop from `workerNow` or `lastMeaningfulMovementAt`.
- Orchestration passes `silenceEndCandidate` into `resolvePossibleEndBoundaryCandidate` before movement fallback.
- **#1627 interoperability:** `resolveProviderSilenceCandidateForCusumRetry` + `CUSUM_RETRY_PRESERVE_PROVIDER_SILENCE_KEYS` preserve completed END_VALIDATION attempts across CUSUM_STILL_ONGOING reopens for the **same** low-trust silence episode (without `stopBoundaryTrust=true`).
- Normal `POSSIBLE_END_CHECK → END_VALIDATION → FINALIZE` chain unchanged; #1603 / #1617 trusted-boundary paths preserved.

## Safety constraints honored

| Constraint | Status |
|------------|--------|
| `stopBoundaryAt = workerNow` | **NO** |
| `stopBoundaryAt = lastMeaningfulMovementAt` | **NO** |
| Stale VLS promoted to fresh INACTIVE | **NO** |
| Direct finalize from empty-core silence | **NO** |
| CUSUM / retry budget weakened | **NO** |

## Validation

| Suite | Path |
|-------|------|
| RED/GREEN portable probe | `backend/scripts/test/trip-r12-post-stop-telemetry-silence-dead-zone-base-head-red-proof.sh` |
| Integration | `trip-r12-post-stop-telemetry-silence-dead-zone.postgres-redis.integration.spec.ts` |
| #1627 interoperability | `trip-r12-provider-silence-cusum-retry-budget.postgres-redis.integration.spec.ts` |
| Unit defenses | `trip-fsm-r12-provider-silence-empty-core-admission.spec.ts` |
| PRE_FIX/HEAD proof | `scripts/test/trip-r12-provider-silence-cusum-retry-budget-base-head-red-proof.sh` |

## Remaining gaps

- Production deploy + precisely timed physical acceptance drive still required after merge.
- Historical WOB L 7503 trips remain forensic evidence only (PR #1634); no backfill/repair.
