# KS MX 2024 — CH assist skip resume revalidation (runtime safety)

**Date:** 2026-09-17 (UTC)  
**Forensic authority:** PR #1673 / `KS_MX_2024_POST_1648_FALSE_TERMINAL_ROOT_CAUSE_2026-09-16.md`  
**Implementation:** separate runtime PR (this workstream)  
**Production trip:** `a1aab26a-b42e-4ea9-9c55-5350f9690152`

## Problem (reconfirmed)

After EV1 `cusum_still_ongoing` reopen and empty-core ClickHouse re-latch, EV2
`clickhouse_end_assist_skip_cusum` finalized the stale provider end at `2026-09-16T20:48:03Z`
without post-boundary resume/movement revalidation — while physical resume ~20:52 was not yet
visible in the first live fetch.

## Fix (bounded)

Immediately before CH skip terminal consumption in `processEndValidation()`:

1. `checkDimoActivityResumed(resumeAfterAt=cusumSegmentEnd)` — visible resume → invalidate candidate, reopen ACTIVE.
2. No resume but dwell since CH re-latch anchor (`chSkipResumeRevalidationRelatchEnteredAt`) < `TRIP_END_VALIDATION_RETRY_MS + TRIP_END_CH_ASSIST_STABILITY_MS` → defer END_VALIDATION (preserve original candidate event time; separate `chSkipResumeRevalidationDeferCount`; do not consume #1627 attempt budget).
3. After immaturity window matures with no resume → existing CH skip finalize path unchanged (original provider event-time end preserved).
4. **Closure (boundedness):** persistent fetch uncertainty after immaturity bound OR defer budget exhausted → `HANDOFF_TO_CUSUM_VALIDATION`: clear `endDetectionMode`, preserve candidate event time in evidence, fall through to existing CUSUM `#1627` retry-budget path — **never** infinite FETCH_UNCERTAIN defer loop and **never** blind CH skip finalize on fetch failure.

## Regression proof

- Integration: `trip-r12-ch-assist-resume-invalidation.postgres-redis.integration.spec.ts` (Postgres + Redis/BullMQ) — includes Scenario A fetch-failure bounded handoff + portable BASE/HEAD probe (`test:trip-r12:ch-assist-resume:base-head-red-proof`)
- Unit: `evaluateChSkipResumeRevalidationMaturity` in `trip-end-cycle-reset.spec.ts`
- Literal BASE SHA `9580a3247a572191a4ead77b6a6c77ea2828855b` vs corrected HEAD via worktree proof harness

### Portable probe HEAD metrics (positive invariants)

- `HEAD_OLD_CH_END_NOT_FINALIZED_PREMATURELY=YES` — no `clickhouse_end_assist_skip_cusum` at immature EV2; FSM remains `POSSIBLE_END`
- `HEAD_FIRST_FETCH_IMMATURE_DEFERRED=YES`, `HEAD_LATER_RESUME_INVALIDATES_OLD_END=YES`, `HEAD_SAME_TRIP_CONTINUES=YES`, `HEAD_GREEN_PROVEN=YES`
- Do **not** use inverted `HEAD_OLD_CH_END_FINALIZED_PREMATURELY` (removed — prior `YES` meant *not* prematurely finalized)

## Explicit non-goals

- No Production mutation / historical repair
- No #1648 pause-shadow scope expansion (follow-up observability only)
- No change to full_inactivity admission semantics
