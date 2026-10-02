# EXP-021 — PDI → M2 maturation integration repair (2026-09-19)

**Status:** REPAIR IMPLEMENTED (repository); production deploy pending  
**Production forensic baseline:** `b05564ae36a92a8bb2956165ec2d0929ff312ba7` / `20260919132004_v4994` (verified read-only on VPS release tree)  
**OLD activation epoch (`EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO`):** `2026-09-19T13:32:23.000Z`

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
| `PROSPECTIVE_PDI_DISCOVERY` | Cohort `--watch-cohort` | Eligible when authoritative PDI is discovered for a window with `physicalStartAt >= NOT_BEFORE` and `physicalEndAt` after **enrolled-window cursor** (per current `shadowScheduleVersion`); late PDI publication is valid |

**Study runs `PLANNED`:** Unrelated to M2 enrollment.

## Selected repair

**OPTION 2 — Late-PDI-aware maturation discovery** plus **enrolled-window cursor** (fixes baseline bug).

## Anti-backfill / cutover (closes PR #1700 contradiction)

### Phase A — OLD `NOT_BEFORE` restart simulation

Under repaired code, if the cohort operator were restarted with the **existing** production `NOT_BEFORE` (`2026-09-19T13:32:23Z`), zero enrolled families, and cursor `NOT_BEFORE - 1`:

| Property | Seven forensic drives (production audit class) |
|----------|-----------------------------------------------|
| `physicalStartAt` | All **≥** OLD `NOT_BEFORE` (post-epoch cohort drives) |
| Authoritative PDI | Yes (`CANARY_VEHICLE_TRIP_CONFIRMED`) |
| Existing M2 family | No |
| `evaluateProspectiveAuthoritativePdiEligibility` | **PROSPECTIVE_ELIGIBLE** |
| `waitForNextFreshAuthoritativeWindowClose` | **Can return** earliest unenrolled window |
| `executeCanaryEnrollment` (cohort path) | **Can create** families |

**Conclusion (code + forensic class, no production mutation):**

- `OLD_NOT_BEFORE_RESTART_CAN_SELECT_FORENSIC_DRIVE=YES`
- `OLD_NOT_BEFORE_RESTART_CAN_BACKFILL_SEVEN=YES`

The earlier counterfactual (“eligible if discovered”) is **compatible** with `BACKFILL_SEVEN_DRIVES=NO` only as an **operational policy**, not as an automatic code guarantee. **Do not** restart the operator with the OLD boundary after deploy.

### Phase B — Post-deploy production cutover contract (required)

**No separate discovery-cutover field.** Existing `EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO` is sufficient when advanced to a **POST-REPAIR live-validation epoch**.

1. Disable EXP-021 activation (unchanged ops policy).
2. Stop cohort operator (no restart during deploy).
3. Deploy PR #1700 (when approved).
4. Verify both replicas on target SHA; DB/Redis/BullMQ/PM2 health.
5. Set **`NEW_ACTIVATION_NOT_BEFORE_ISO`** to a timestamp **strictly after** the latest forensic `physicalStartAt` (and after deploy wall clock). Persist in `backend.env`.
6. Verify every forensic/historical trip `physicalStartAt` is **before** `NEW_ACTIVATION_NOT_BEFORE_ISO`.
7. Restart cohort operator: same 3-vehicle cohort JSON, **`PROSPECTIVE_PDI_DISCOVERY`**, **`NEW` NOT_BEFORE** (not the OLD epoch).
8. Enable activation.
9. Only trips with `physicalStartAt >= NEW NOT_BEFORE` may become **new** official M2 evidence.

**Execute-time guard:** `executeCanaryEnrollment` in `PROSPECTIVE_PDI_DISCOVERY` re-checks `physicalStartAt >= activationNotBeforeMs` when settlement experiments are present (blocks manual/CLI backfill under a new boundary).

**Invariant:** No PDI whose `physicalStartAt` is before the post-repair cutover may create a new M2 family merely because it becomes discoverable after operator restart.

### OLD epoch vs POST-REPAIR epoch

| | OLD epoch | POST-REPAIR epoch |
|---|-----------|-------------------|
| Authority | `2026-09-19T13:32:23Z` | **New** ISO after deploy (example test value: `2026-09-19T20:00:00Z`) |
| Seven forensic drives | Counterfactual / audit only | **Must remain** without official M2 families |
| New science | N/A | Trips starting at/after NEW boundary only |

## Cursor scope (schedule version)

`maxEnrolledCanonicalWindowToMsForVehicle` is scoped by **`shadowScheduleVersion`** (default `MATURATION_SHADOW_SCHEDULE_v1`). A future `MATURATION_SHADOW_SCHEDULE_v2` epoch does not inherit V1 cursor maxima.

- `CURSOR_SCOPE_SAFE_ACROSS_SCHEDULE_VERSION=YES` (with schedule-scoped query)
- `CURSOR_SCOPE_SAFE_ACROSS_ACTIVATION_EPOCH=YES` when `NOT_BEFORE` is advanced (physicalStart gate); cursor alone does not reset epoch — **NEW NOT_BEFORE is required** to exclude OLD-epoch trips

## Code touchpoints

- `reference-capture-exp021-maturation-shadow-canary-prospective-discovery.lib.ts`
- `reference-capture-exp021-maturation-shadow-canary-enroll.lib.ts` (prospective execute guard; wall-clock wait timeout)
- `reference-capture-exp021-maturation-shadow.repository.ts` — `maxEnrolledCanonicalWindowToMsForVehicle(..., shadowScheduleVersion)`
- Cohort ops CLI + `COHORT_PDI_DISCOVERY` diagnostics

## Validation (repository)

| Suite | Result |
|-------|--------|
| Unit prospective + PHASE_A anti-backfill simulation | PASS |
| `test:exp021:maturation-shadow:prospective-postgres:ci` (E5–E8 + ANTI_BACKFILL + CURSOR_SCOPE) | **PASS** (executed with `REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1`) |
| Wired into `test:exp021:fleet:postgres:ci` | YES |

## Live validation plan (post-deploy) — corrected

1. Deploy repair; **do not** backfill the 7 forensic drives.
2. **Advance** `EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO` to POST-REPAIR epoch (not the OLD value).
3. Restart cohort operator with same cohort JSON and **NEW** `NOT_BEFORE`.
4. On the **next** trip with `physicalStartAt >= NEW NOT_BEFORE`: `COHORT_PDI_DISCOVERY` → enrollment → `familyId`.

```
EXP021_PDI_TO_M2_INTEGRATION_REPAIR=PASS
REPAIR_OPTION=2_LATE_PDI_AWARE_DISCOVERY_PLUS_ENROLLED_CURSOR
PRODUCTION_MUTATION=NO
BACKFILL_SEVEN_DRIVES=NO
POST_DEPLOY_NEW_NOT_BEFORE_REQUIRED=YES
ANTI_BACKFILL_POSTGRES_TEST=PASS
```
