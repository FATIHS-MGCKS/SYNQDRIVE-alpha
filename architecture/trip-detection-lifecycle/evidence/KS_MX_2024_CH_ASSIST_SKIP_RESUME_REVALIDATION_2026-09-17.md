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
2. No resume but dwell since `possibleEndEnteredAt` < `TRIP_END_VALIDATION_RETRY_MS + TRIP_END_CH_ASSIST_STABILITY_MS` → defer END_VALIDATION (preserve original candidate event time; separate `chSkipResumeRevalidationDeferCount`; do not consume #1627 attempt budget).
3. After immaturity window matures with no resume → existing CH skip finalize path unchanged (original provider event-time end preserved).

## Regression proof

- Integration: `trip-r12-ch-assist-resume-invalidation.postgres-redis.integration.spec.ts` (Postgres + Redis/BullMQ)
- Unit: `evaluateChSkipResumeRevalidationMaturity` in `trip-end-cycle-reset.spec.ts`

## Explicit non-goals

- No Production mutation / historical repair
- No #1648 pause-shadow scope expansion (follow-up observability only)
- No change to full_inactivity admission semantics
