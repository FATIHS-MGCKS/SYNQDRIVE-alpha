# EXP-021 KS MS 661 — CANDIDATE_BRACKET_V3 evidence freeze (2026-09-12)

**CURRENT_V3_RUN_EVIDENCE_FROZEN = YES**

| Field | Value |
|-------|-------|
| Vehicle | KS MS 661 |
| vehicleId | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| tokenId | `187361` |
| RC session | `6720ad68-f80e-452e-8356-2f11d9fb2205` |
| calibration series | `07ad7f7b-b953-4c75-8405-ab099a69dfa4` |
| settlement experiment | `exp-021-6720ad68-b25b9f5f` |
| production SHA | `f6f5eaa3a9fd9525d10b5d0b8130e7ed42eeaa50` |
| plan | `candidate_bracket_v3` / `EXP021_CANDIDATE_BRACKET_V3` |
| PHYSICAL_T0 | `2026-09-12T04:36:36.000Z` |
| PHYSICAL_END | `2026-09-12T05:06:59.000Z` |
| vehicle trip | `a05fa903-9ea7-4f20-8281-5cf185233c1a` |

## Phase wall durations (frozen)

| Phase | Start | End | Wall (s) | Valid movement (s) |
|-------|-------|-----|----------|-------------------|
| 120s | `2026-09-12T04:36:36.000Z` | `2026-09-12T04:46:48.418Z` | 612.4 | 454.7 |
| 90s | `2026-09-12T04:46:48.418Z` | `2026-09-12T04:57:00.047Z` | 611.6 | 532.5 |
| 60s | `2026-09-12T04:57:00.047Z` | `2026-09-12T05:07:12.589Z` | 612.5 | 375.5 |

## Request-slot ledger (frozen)

| Phase | V3 expected | Persisted | Issued | Success | Failure |
|-------|-------------|-----------|--------|---------|---------|
| 120s | 5 | 5 | 5 | 5 | 0 |
| 90s | 7 | 4 | 4 | 4 | 0 |
| 60s | 10 | 5 | 5 | 4 | 1 |
| **Total** | **22** | **14** | **14** | **13** | **1** |

Root cause of 90/60 slot shortfall: `buildInitialPhaseCounters()` and settlement shadow used `resolveNominalPhaseDurationMs(cadence)` without durable V3 plan → 5-minute UPPER_BOUND_V2 fallback for 90s/60s.

## Native buckets (frozen)

| Phase | Native buckets | PHASE_NATIVE provenance | Buckets/successful request |
|-------|----------------|-------------------------|---------------------------|
| 120s | 57 | 5 | 11.4 |
| 90s | 10 | 2 | 5.0 |
| 60s | 5 | 2 (+1 ZERO_RESULT) | 2.5 |

## Settlement FIXED_INTERVAL (frozen — actual geometry)

| Phase | Actual windows | V3 nominal | Temporal coverage |
|-------|----------------|------------|-------------------|
| 120s | 19 | 19 | 100% |
| 90s | 9 | 19 | 49.9% |
| 60s | 9 | 19 | 50.0% |

Terminal schedules: 246 (230 COMPLETED + 16 SKIPPED). SKIPPED = WHOLE_TRIP PDI only.

## Known defects (frozen, not repaired in this run)

1. Settlement nominal duration used UPPER_BOUND_V2 defaults on PM2 backend (not orchestrator env).
2. HF slot ledger initialized with 5-minute nominal for 90s/60s (4 and 5 slots vs 7 and 10).
3. `calibrationPlanId` / `calibrationPlanVersion` not durably persisted on calibration series.

## Attached evidence artifacts

- `EXP_021_KS_MS_661_CANDIDATE_BRACKET_V3_AUDIT_JSON_2026-09-12.json`
- `EXP_021_KS_MS_661_CANDIDATE_BRACKET_V3_FULL_POST_RUN_FORENSIC_2026-09-12.md`

## Do not mutate

- No retrospective +30/+60/+120 settlement age backfill
- No missing schedule creation for historical windows
- Historical UPPER_BOUND_V2 evidence remains separate
