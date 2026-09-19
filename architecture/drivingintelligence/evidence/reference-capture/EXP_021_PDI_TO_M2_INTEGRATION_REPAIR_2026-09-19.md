# EXP-021 — PDI → M2 maturation integration repair (2026-09-19)

**Status:** REPAIR IMPLEMENTED (repository); production deploy pending  
**Production forensic baseline:** `b05564ae36a92a8bb2956165ec2d0929ff312ba7` / `20260919132004_v4994`  
**Activation NOT_BEFORE:** `2026-09-19T13:32:23.000Z`

## Production forensic (read-only, pre-repair)

| Metric | Value |
|--------|-------|
| Post-epoch trips | 7 |
| Successful RC recordings | 7 |
| PDI published (`CANARY_VEHICLE_TRIP_CONFIRMED`) | 7 |
| M2 families enrolled | 0 |
| `OPERATOR_SAW_PDI_COUNT` (structured logs) | 0 |
| `ZERO_FAMILY_CLASS` | 9 (PDI→M2 integration defect) |

**Retracted hypothesis:** Zero families were **not** caused by short trip duration (`SHORT_DRIVE_CAN_PREVENT_FAMILY_ENROLLMENT=NO`). RC capture durations were 359–1679s.

## Root cause

1. **Operational freshness misapplied to prospective discovery:** `waitForNextFreshAuthoritativeWindowClose` treated wall-clock age from `physicalEndAt` as stale when PDI metadata appeared **379–850s** after physical end, while `freshnessGuardMs` is only **~3–25s** (earliest planned age minus execution slack).

2. **Enrollment cursor poisoned by settlement baseline:** `computeCanaryWaitAfterPhysicalEndMs` used max `physicalEndAt` from all settlement experiments at cycle start, so after restart/timeout unenrolled epoch-valid PDIs became `physicalEndMs <= afterPhysicalEndMs` and were never selected.

## Intended semantics (post-repair)

| Mode | Use | Freshness meaning |
|------|-----|-------------------|
| `OPERATOR_IMMEDIATE` | Token-scoped CLI with `--canonical-window-to` / frozen startup wait | Must enroll before first planned observation age (minus slack) relative to **physicalEndAt** |
| `PROSPECTIVE_PDI_DISCOVERY` | Cohort `--watch-cohort` | Eligible when authoritative PDI is discovered for a window with `physicalStartAt >= NOT_BEFORE` and `physicalEndAt` after **enrolled-window cursor**; late PDI publication is valid; observation jobs use `computeEnqueueDelayMs` (0 for elapsed ages) |

**Study runs `PLANNED`:** Unrelated to M2 enrollment (canary `reserveStudyRunForCanaryActivation` creates `PLANNED`; no transition on RC/PDI complete).

## Selected repair

**OPTION 2 — Late-PDI-aware maturation discovery** plus **enrolled-window cursor** (fixes baseline bug).

Rejected for this workstream:

- **OPTION 1** (earlier PDI publish): higher risk to RC/settlement ordering; PDI already authoritative from trip bounds at publish time but publish is intentionally post-settlement today.
- **OPTION 3** (split readiness): larger surface; Option 2 achieves the same cohort outcome with smaller diff.

## Code touchpoints

- `reference-capture-exp021-maturation-shadow-canary-prospective-discovery.lib.ts` — modes, cursor, eligibility
- `reference-capture-exp021-maturation-shadow-canary-enroll.lib.ts` — wait loop modes, execute enrollment freshness
- `reference-capture-exp021-maturation-shadow-canary-cli-wiring.lib.ts` — cohort prospective options
- `reference-capture-exp021-maturation-shadow-canary-cohort-watch.lib.ts` — cohort cycle wiring + diagnostics
- `reference-capture-exp021-maturation-shadow.repository.ts` — `maxEnrolledCanonicalWindowToMsForVehicle`

## Invariants preserved

- No historical backfill of the 7 production drives
- `NOT_BEFORE` / epoch guard on `physicalStartAt`
- `CANARY_VEHICLE_TRIP_CONFIRMED` authoritative
- Physical interval from canonical `vehicle_trip` (never fabricated)
- One family per `(org, vehicle, token, canonicalWindowTo, schedule version)`
- Trip FSM, Stage1A, VDC, M3 analytics, TGR/gap-debt unchanged

## Live validation plan (post-deploy)

1. Deploy repair; **do not** backfill the 7 forensic drives.
2. Restart cohort operator with same cohort JSON and NOT_BEFORE.
3. On **next** prospective trip: confirm `COHORT_PDI_DISCOVERY` log → `PROSPECTIVE_ENROLLED` → `familyId`.
4. Verify strata/slots/attempts enqueue; no duplicate families on restart.

## Counterfactual (7 drives under repaired semantics)

All seven would be **eligible** for enrollment (`PROSPECTIVE_ELIGIBLE`) if discovered after deploy with cursor at `NOT_BEFORE-1` and no prior enrollment — they are **not** official M2 evidence unless enrolled prospectively after deploy.

## Validation (repository)

| Suite | Result |
|-------|--------|
| `reference-capture-exp021-maturation-shadow-canary-prospective-discovery.spec.ts` (E1–E3, E6, operational guard) | PASS |
| `reference-capture-exp021-maturation-shadow-canary-prospective-discovery.postgres.integration.spec.ts` (E5–E8) | PASS when `REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1` |
| Wait-loop timeout | Wall-clock deadline (tests with frozen `now()` no longer hang) |

```
EXP021_PDI_TO_M2_INTEGRATION_REPAIR=PASS
REPAIR_OPTION=2_LATE_PDI_AWARE_DISCOVERY_PLUS_ENROLLED_CURSOR
PRODUCTION_MUTATION=NO
BACKFILL_SEVEN_DRIVES=NO
TESTS_E1_E10=UNIT_PASS_POSTGRES_HARNESS_E5_E8
```
