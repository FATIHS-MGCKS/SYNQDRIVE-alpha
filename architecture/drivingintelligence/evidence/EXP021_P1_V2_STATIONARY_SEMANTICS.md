# EXP021 P2.1 — P1 speed QC policy V2 (stationary null speed)

**Status:** IMPLEMENTED (opt-in; **not** production-activated)  
**Diagnosis base SHA:** `c18910ae1823bb9ea3991af748abf6c7f1e08063` (PR #2020 diagnosis branch)  
**Implementation:** separate draft PR on `cursor/exp021-p1-v2-stationary-semantics-7d78` (retarget to `main` after #2020 merges)  
**Live compare artifact:** `/opt/cursor/artifacts/exp021-p21-p1-v2-compare.json`

## Plain language

On the verified reference trip, **118 of 144** stationary-band seconds with null S1 speed are now **accepted** under V2 as **trusted limited stationary** (still **no numeric km/h**). **26** remain **withheld**: **17** because the L3 support window is compromised (neighbor hold/release geometry), **9** because of **source conflict** metadata. **No interval outside the 144 stationary candidates changed** between V1 and V2. Numeric trusted count (**691**), max speed (**77.62 km/h**), and mean trusted speed (**36.6 km/h**) are **unchanged**.

## Policy versioning

| Version | Default | Behavior |
|---------|---------|----------|
| `DI_V0_SPEED_QC_POLICY_V1` | yes | Null speed → `NO_NUMERIC` before stationary branch (unchanged) |
| `DI_V0_SPEED_QC_POLICY_V2` | explicit opt-in | Stationary null-speed path before `NO_NUMERIC` |

Unknown versions: rejected (`DiV0SpeedQcPolicyVersionError`). Projection `identity.qcPolicyVersion` / idempotency material includes policy — **no V1/V2 identity collision**.

## Live replay (same pinned trip, `synqdrive_exp021_p21_ro`)

| Measure | V1 | V2 |
|---------|---:|---:|
| Intervals | 1480 | 1480 |
| `trustedNumericCount` | 691 | **691** |
| `trustedNumericCoveragePercent` | 46.7% | **46.7%** |
| `NO_NUMERIC` (reason breakdown) | 763 | **619** |
| `OK_STATIONARY_NULL_SPEED` | 0 | **118** |
| `trustedLimitedStationaryCount` | 0 | **118** |
| `CROSS_SOURCE_CONFLICT` (reason rows) | 26 | **35**† |
| `shadowRawMaxKmh` / `qcTrustedMaxKmh` | 77.62 | **77.62** |
| `qcTrustedMeanKmh` | 36.6 | **36.6** |
| Session | `read_only=on`, `repeatable read` | same |

† **35** includes **26** numeric-interval conflicts (unchanged count via `sourceConflictCount` on numeric path) plus **9** stationary-candidate intervals where V2 surfaces `CROSS_SOURCE_CONFLICT` instead of V1 `NO_NUMERIC`. Not the same counter as “26 numeric QC conflicts” alone.

## Stationary candidates (144)

| Outcome | Count |
|---------|------:|
| V2 accepted (`OK_STATIONARY_NULL_SPEED`) | **118** |
| Withheld — `SUPPORT_WINDOW_COMPROMISED` | 17 |
| Withheld — `CROSS_SOURCE_CONFLICT` | 9 |

## Engineering entrypoints

- `evaluateDiV0SpeedQcInterval({ …, qcPolicyVersion })`
- `buildDiV0TripSpeedQualityProjectionV1({ …, qcPolicyVersion })`
- Ops compare: `backend/scripts/ops/exp021-p21-p1-v2-policy-compare.ts`
- Tests: `di-v0-speed-qc-policy-v2.spec.ts`

## Pre-merge correctness (EXP021_P1_V2_PREMERGE_CORRECTNESS)

| Issue | Fix |
|-------|-----|
| V2 stationary path treated all non-finite like contractual `null` | Gate V2 acceptance on `estimatedSpeedKmh === null` only; `NaN` / `±Infinity` → `NO_NUMERIC` |
| `FROZEN_STOP_SUPPORTED` without center state check | Require center `positionState === FROZEN_STOP_SUPPORTED` |
| `MOVING_SPEED_UNKNOWN` test could skip | Deterministic `pilotHoldThenRelease303m` S1 fixture + hard asserts |
| CI `nest build` / `tsc` on ops forensic script | `abstentionReason as never` in `exp021-p21-r3-forensic.ts` (same as analyze loader) |

**S1→P1 `FROZEN_STOP_SUPPORTED` (real flags):** tiny hold-release fixture yields `STATIONARY_BAND` + `L3_SUPPORT_CROSSES_GAP`; V2 **withholds** `SUPPORT_WINDOW_COMPROMISED` (not `OK_STATIONARY_NULL_SPEED`) — hold protection not loosened.

**Executed tests (agent):** policy-v2, composed, hardening, golden, unit, projection unit; `validate-module-registry.sh`, `validate-docs.sh`; local `npm run build`, `tsc --noEmit`.

**Pre-merge HEAD:** `5ad3961c2ceecc996f0346c34971c088ac40c95e`  
**Replay at pre-merge HEAD:** not executed (VPS `exp021-p21-ro-db.secret` not readable from agent SSH; `di-r3a-run` tree root-owned). **Prior executed compare code SHA:** `f176d709528d7091f64067cdb399c91926b52888` — table above. Guards here do not alter numeric intervals; expected live delta **0** unless trip rows had non-finite speeds or shadow/center `FROZEN_STOP_SUPPORTED` mismatch.

## Non-effects

- S2 rows unchanged; calibration unchanged; no deploy; no customer runtime flag; no provider calls.
