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

**Final closure (2026-10-14):**
- **Import fence:** `di-v0-p21-r3-forensic-loader.ts` no longer imports `s4a-contract` directly; uses re-exported `DiV0S4SourceFamily` from `di-v0-trip-speed-quality-projection.types.ts` (allowlisted P2 edge). Same fix backported to diagnosis PR #2020 at `04432d929da8558e60c391c08bc6fd09fa7298ae`.
- **Live replay executed:** artifact `/opt/cursor/artifacts/exp021-p21-p1-v2-compare-final.json`; `transaction_read_only=on`, `transaction_isolation=repeatable read`; WI `bcfe842e-a022-4a16-9db9-e9603b712bfb` / trip `d0af9cc7-ce0d-4e40-9854-2c1341e83bed`.
- **Executed replay code SHA (historical):** `0a6f8de2515d05436cf9502119bd6bea0b5cf354` — `evaluate-di-v0-speed-qc-interval.ts` and V2 policy files **byte-identical** to `298c820c4e70962f96944451cab0e9aab69b2850` and later stack heads (merge-only deltas).
- **V1 reproduced on replay:** 1480 intervals, 691 trusted numeric, 763 `NO_NUMERIC`, 26 `CROSS_SOURCE_CONFLICT` reason rows, max **77.62** km/h, mean **36.6** km/h.
- **V2 on same input:** 118 `OK_STATIONARY_NULL_SPEED`, 26 withheld (17 `SUPPORT_WINDOW_COMPROMISED`, 9 `CROSS_SOURCE_CONFLICT`), **0** changes outside 144 stationary candidates; numeric trusted count/coverage/max unchanged vs V1.

## Non-effects

- S2 rows unchanged; calibration unchanged; no deploy; no customer runtime flag; no provider calls.
