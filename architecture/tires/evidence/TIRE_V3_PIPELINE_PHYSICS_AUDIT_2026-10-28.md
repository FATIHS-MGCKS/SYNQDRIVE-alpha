# Tire Wear V3 — read-only pipeline + physics audit (P3 cohort, 2026-10-28)

| Field | Value |
|-------|--------|
| **Date (Europe/Berlin)** | 2026-10-28 23:08–23:16 (UTC 22:08–22:16) |
| **Production binary** | `6ec3844c3293e8b4a5863fe75562fd82f8f3a839` (release `20261028182651_v4994`) |
| **Mode** | Strictly read-only: `psql` with `default_transaction_read_only=on`; Nest/Prisma replay with `persistShadow: false` and `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED=false` |
| **Cohort** | Tesla Model 3 `68868291…`, VW Tiguan `19fedd4b…`, Audi A4 `c10351f8…`, VW Arteon `8c850ff1…` (org `faa710c9…`) |
| **No-write proof** | `tire_wear_v3_prior_shadow_v1` 0 → 0; `tire_health_snapshots` 9246 / max `created_at` `2026-10-28 19:41:20+00` unchanged; no setup/ledger `updated_at` after audit start |
| **Caveat** | Prisma connections ignore `PGOPTIONS`; the replay session was therefore not DB-enforced read-only. No write path was invoked (verified by the row counts above). |

## Effective flags (shared env, read-only)

| Variable | Value | Audit relevance |
|----------|-------|-----------------|
| `TIRE_WEAR_V3_CUSTOMER_READ_ENABLED` / `_AUTHORITATIVE` | `true` / `true` | V3 authoritative for all customer tire reads |
| `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED` | unset | No V3 prior persistence (expected 0 rows) |
| `TIRE_DS4_SHADOW_ENABLED` | `true` | Tire DS4 adapter active |
| `TIRE_DS4_SHADOW_VEHICLE_ALLOWLIST` | Tesla, Tiguan **only** | Audi / Arteon receive **no** DS4 tire evidence |
| `TIRE_DS4_SHADOW_CATCHUP_ENABLED` | `false` | Historical ledger rows are never back-filled with DS4 evidence |
| `DI_V0_MOTION_CORE_SHADOW_VEHICLE_ALLOWLIST` | all 4 P3 vehicles | DS4 motion runs exist for all 4 |
| `TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA` (code constant) | `0` | DS4 severity never changes V3 output |

## Pipeline trace (14 stages)

| # | Stage | Tesla | Tiguan | Audi A4 | Arteon | Verdict |
|---|-------|-------|--------|---------|--------|---------|
| 1 | Trip finalization (`tripStatus=COMPLETED`, `tripAnalysisStatus ∈ {COMPLETED,SKIPPED}`) → `tireUsageAttributionStatus` | 124 APPLIED; **935 finalized trips unattributed (7 318 km, Apr–Jun 2026, pre-ledger)** | 358 APPLIED; 2 SKIPPED_NO_SETUP | 422 APPLIED; **160 unattributed (741 km, Apr–Jun)** | 370 APPLIED; 2 unattributed (5.6 km) + 12 IN_PROGRESS (64 km) | PARTIAL |
| 2 | Tire trip usage ledger (active rows / km / last processed) | 124 / 592.3 km / 10-27 12:53Z | 358 / 7 896.3 km / 10-28 19:58Z | 423 / 2 927.1 km / 10-28 16:53Z | 371 / 4 882.1 km / 10-28 16:51Z | PASS (live) |
| 2b | Ledger km ÷ odometer delta since anchor | **0.069** | 0.687 | 1.034 | 0.517 | GAP |
| 3 | DS4 motion core shadow runs (`SUCCEEDED`, bundles) | 38 runs, latest bundle V4_C5_1_FSM_GAP_BRIDGE_V1_3_1_EVENT_V0_3 | 46 runs | 48 runs (bundle V3) | 18 runs (bundle V3) | PASS; outbox 0 failures |
| 4 | Accepted accel/brake events (latest SUCCEEDED adapter row per ledger) | acc OK 16 / dec OK 25 / degraded 0 / artefact 0 | acc OK 56 / dec OK 99 / degraded 7+11 / artefact 3+3 | — (no adapter rows) | — | PASS (2 vehicles) |
| 5 | M3 (J/kg/km, acc+dec per trip) | median 83.0, km-weighted 71.1 (2 trips) | median 46.4, km-weighted 42.8 (25 trips, 2 neutral) | — | — | PASS (values present) |
| 6 | DS4 temporal coverage | PARTIAL ×2; accountable 0.578; degraded 1 175 s + invalid 498 s of 4 067 s | PARTIAL ×25; accountable 0.586; invalid 7 952 s + degraded 2 928 s + unknown 970 s of 25 909 s | — | — | PARTIAL — **0 VERIFIED rows** |
| 7 | Tire DS4 shadow adapter persistence (`tire_ds4_motion_shadow_input_v1`) | 4 rows (2 SUCCEEDED v1.1.1, 2 NOT_AVAILABLE) | 31 rows (25 SUCCEEDED, 3 RETRY_EXHAUSTED, 3 NOT_AVAILABLE) | **0** | **0** | PARTIAL |
| 7b | Ledger rows without any adapter row | 120 / 566 km | 331 / 7 693 km | 423 / 2 927 km | 371 / 4 882 km | GAP (catch-up off) |
| 8 | V3 severity aggregation (`computeSetupDs4Severity`) | coverage **0.0198**, sRel **4.74** | coverage **0.0120**, sRel **2.85** | coverage 0, `DS4_SEVERITY_NO_LEDGER_DISTANCE` | coverage 0, same flag | PASS (computes) |
| 9 | Dynamic β / wear multiplier | β=0 → factor 1, `DYNAMIC_BETA_ZERO` | same | same | same | PASS (by design neutral) |
| 10 | Baseline (initial tread / replacement / life prior) | 6.555 F / 5.3 R mm, repl 3 mm, `prior_life_table` | 7.18 mm all, repl 3 mm, `prior_life_table` | 8.11 F / 8.17 R mm, repl 3 mm | **8 mm default fallback**, `prior_life_widened` | PASS / Arteon default |
| 11 | Odometer & measurement quality | ANCHORED 171 647 → 180 178; **`ODOMETER_STALE_OR_JUMP_AHEAD_OF_LEDGER`**; 1 measurement w/o odometer | ANCHORED 21 → 11 514; same flag; 1 calibration measurement w/o odometer | ANCHORED 190 010 → 192 842; no flag; 1 measurement w/o odometer | ANCHORED 113 649 → 123 084; same flag; **0 measurements** | PARTIAL |
| 12 | Per-wheel wear rate (mm/1000 km) | F 0.089–0.110; R 0.058–0.071 | 0.105–0.129 all | F 0.128–0.158; R 0.129–0.160 | 0.10–0.20 (widened) | PASS (prior-only, L1/L0) |
| 13 | Summary / Detail / Wear Analysis (`wearReadModel=v3`) | `BASELINE_ESTIMATE` L1; display 5.62–5.80 F / 4.69–4.81 R; no point mm | `BASELINE_ESTIMATE` L1; 5.69–5.98 | `BASELINE_ESTIMATE` L1; 7.66–7.75 F / 7.72–7.80 R | `INSUFFICIENT` L0; display `null` | PASS |
| 14 | Rental health + UI authority | `MEASUREMENT_REQUIRED`, `V3_VERIFICATION_INSUFFICIENT_EVIDENCE`+`TREAD_DEFAULT_ASSUMPTION`, overall `UNKNOWN` | same | same | same (unevaluable) | PASS (fail-closed) |

Verification axis: all four setups `INSUFFICIENT_EVIDENCE` (`VERIFICATION_NO_ACCEPTED_ANCHOR`; measurements lack odometer).

Frontend authority: `frontend/src/rental/lib/tire-wear-read-model-ui.ts` gates on `summary.wearReadModel === 'v3' && summary.wearV3 != null`; `TireWearV3CustomerPanel`, `HealthErrorsView` and `FleetConditionDetailView` render intervals / insufficient-evidence copy and hide legacy percent. Backend `applyAuthoritativeV3` overrides `overallStatus`, `displayTreadMm`, `isDefaultAssumption`, `confidence=LOW`, `actionState=CHECK_SOON` when insufficient.

## Offline replay

- Existing `scripts/ops/tire-v3-p3-offline-e2e-validation.readonly.ts` re-run on the production binary: run1 == run2 (`idempotent: true`) for all four setups; input fingerprints `49ea96cb…` (Tesla), `72d9e87e…` (Tiguan), `9aeb5f6c…` (Audi), `daf754ba…` (Arteon); `modelConfigHash 7a09085a…`; model `tire-wear-v3-prior-0.2.0`.
- Output classes match the cutover-time service validation (`post-v3-validation.json`): 3× `BASELINE_ESTIMATE`, Arteon `INSUFFICIENT`, no fabricated point mm, rental `unknown` / measurement required.
- In-memory recomputation of each wheel's prior rate via `buildWearRateEstimate` matched the service result exactly (16/16 wheels).

### Deterministic counterfactuals (same mileage)

| Variation | Values tried | V3 output change | V2 factor change (contrast) |
|-----------|--------------|------------------|-----------------------------|
| `curbWeightKg` | 1200 / 1500 / actual / 2200 | **none** (no input slot) | `computeLoadFactor` 0.979–1.048 |
| `frontWeightDistributionPct` | 40 / 50 / actual / 70 | **none** | `computeAxleFactor` 0.88–1.22 |
| `driveType` | FWD / RWD / AWD | **none** | axle + regen factors vary |
| `brakeForceFrontPercent` | 50 / actual / 80 | **none** | not consumed by any tire model (brakes module only) |
| DS4 severity `sRel` | 0.5 / 1 / 2 / 3.5 at coverage actual / 0.5 / 1.0 | **none** — factor 1, `DYNAMIC_BETA_ZERO` (48 cases × 16 wheels) | n/a |

144 vehicle-spec combinations × 16 wheels: `v3RateInvariantToVehicleSpec = true` everywhere.

## Vehicle-spec usage matrix

| Parameter | Storage | V2 (`tire-wear-model.service.ts`) | V3 prior | DS4 tire adapter | Status |
|-----------|---------|-----------------------------------|----------|------------------|--------|
| `curbWeightKg` | `vehicles.curb_weight_kg` (all 4 present) | `computeLoadFactor` | not read | not read (M3 is per-kg) | STORED_ONLY + USED_BY_V2 |
| `frontWeightDistributionPct` | `vehicles` (Tesla null) | `computeAxleFactor` | not read | not read | STORED_ONLY + USED_BY_V2 |
| `brakeForceFrontPercent` | `vehicles` (Tesla null; **Arteon = 1 %, implausible**) | not read | not read | not read | STORED_ONLY (brakes module only) |
| `driveType` | `vehicles` (Tesla null) | drivetrain bias + regen | not read | not read | STORED_ONLY + USED_BY_V2 |
| Load index / XL / reinforced | `ai_tire_spec` (Audi XL=true; Arteon no spec) | `computeLoadFactor` (×0.97), `resolveExpectedLifeKm` (×1.05) | **not read** (`resolvePriorLifeKmInterval` ignores XL) | not read | USED_BY_V2 |
| Compound / season / archetype | `tire_season`, `ai_tire_spec.tireArchetype` | yes | **yes** — life table + replacement mm + archetype defaults | not read | USED_BY_V3 |
| Pressure, temperature, usage mix, k-factor | latest state / trips / setup | yes | not read | not read | USED_BY_V2 |
| M3 kinetic severity (J/kg/km), temporal coverage | `tire_ds4_motion_shadow_input_v1` | no | computed (sRel, coverage) but **β=0 → no effect** | produced | USED_BY_DS4 / STORED_ONLY for V3 |
| Axle/wheel load, tyre pressure vs load, cornering | — | — | — | — | NOT_AVAILABLE |

## Findings

1. **V3 is a pure distance × season/archetype prior.** Mass, axle distribution, drivetrain and brake split cannot change any V3 output; F/R differences in the cohort come only from different initial tread per axle.
2. **DS4 evidence reaches V3 only for Tesla/Tiguan** (tire adapter allowlist) and covers **≤ 2 %** of ledger distance; with catch-up disabled and 0 `VERIFIED` temporal rows the coverage cannot reach the `dynamicDownwardMinCoverage=0.9` threshold even if β were non-zero.
3. **Severity reference mis-scaled.** Observed km-weighted M3 is 43–71 J/kg/km vs `severityReferenceM3JPerKgPerKm = 15` → sRel 2.85–4.74; any future β>0 would clamp at `dynamicFactorBounds.max = 1.3` for all covered vehicles. Recalibration needed before β activation (no change made).
4. **Ledger coverage gaps.** Tesla ledger = 6.9 % of odometer delta (935 finalized Apr–Jun trips never attributed); Arteon 52 %; Audi 103 % (ledger > odometer, anchor plausibly inferred). V3 projects on odometer delta, so tread intervals stay consistent, but `ODOMETER_STALE_OR_JUMP_AHEAD_OF_LEDGER` is raised for 3/4 vehicles.
5. **No measurement carries an odometer**, so no setup can leave L1/`INSUFFICIENT_EVIDENCE`; rental stays measurement-required by design.
6. Data quality: Arteon `brake_force_front_percent = 1`, Tesla `drive_type`/`front_weight_distribution_pct` null, Arteon no `ai_tire_spec` and no initial tread.

## Artifacts (Cloud Agent run, not in git)

- `/opt/cursor/artifacts/tire-v3-pipeline-audit-sql-2026-10-28.log`, `…-sql2-2026-10-28.log`
- `/opt/cursor/artifacts/tire-v3-offline-replay-2026-10-28.json`
- `/opt/cursor/artifacts/tire-v3-physics-counterfactual-2026-10-28.json`
