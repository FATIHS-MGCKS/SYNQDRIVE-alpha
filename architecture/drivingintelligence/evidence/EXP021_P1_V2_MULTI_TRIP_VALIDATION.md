# EXP021 P1 V2 — multi-trip stationary QC regression

**Status:** HISTORICAL (superseded for closure gates by [EXP021_P1_V2_MULTI_TRIP_EVIDENCE_CLOSURE.md](./EXP021_P1_V2_MULTI_TRIP_EVIDENCE_CLOSURE.md))  
**POLICY_IMPLEMENTATION_SHA:** `f7a285b59fd1f70e57b5fd72c04406286e1b96f1` (#2021)  
**First-run runner identity:** mislabeled as policy SHA; scripts were uncommitted scp — see closure doc  
**Organization:** `faa710c9-6d91-4079-a7d5-91fdccdec14a`  
**Reference trip excluded:** `d0af9cc7-ce0d-4e40-9854-2c1341e83bed` (single-trip closure in [EXP021_P1_V2_STATIONARY_SEMANTICS.md](./EXP021_P1_V2_STATIONARY_SEMANTICS.md))

## Artifacts

| File | Role |
|------|------|
| `/opt/cursor/artifacts/EXP021_P1_V2_MULTI_TRIP_SELECTION_MANIFEST.json` | Pre-compare inventory + deterministic selection |
| `/opt/cursor/artifacts/EXP021_P1_V2_MULTI_TRIP_RESULT.json` | Aggregated V1/V2 compare (10 trips) |
| `backend/scripts/ops/exp021-p21-p1-v2-multi-trip-validation.ts` | Read-only batch runner |
| `backend/scripts/ops/exp021-p21-p1-v2-policy-compare.lib.ts` | Shared per-trip compare + regression gates |

## Selection rule (fixed before compare)

Pool: completed **active PRIMARY** work items with verified pinned snapshot + shadow run (RO role tables only). Exclude reference trip. Greedy diversity (max 10): new `vehicle_id` (+3), new UTC **shadow-window start date** (+3), new shadow-derived duration bucket (+1). Tie-break: `completed_at` DESC, then `trip_id`. Inventory uses shadow interval stats (RO role cannot read `vehicle_trips` / `vehicles`).

## Execution

| Field | Value |
|-------|--------|
| Mode | `LIVE_READONLY_DB` on Production VPS `~/di-r3a-run` |
| Role | `synqdrive_exp021_p21_ro` |
| `transaction_read_only` | `on` (all loads) |
| `transaction_isolation` | `repeatable read` |
| Provider calls | none |
| Production mutations | none |

## Inventory

| Measure | Count |
|---------|------:|
| Eligible distinct trips (org) | **67** |
| Additional trips evaluated | **10** |
| Distinct vehicles (evaluated) | **4** |
| Distinct shadow-window UTC dates (evaluated) | **6** |
| Excluded inputs during compare | **0** |

## Regression totals (10 trips, 13 534 shadow intervals)

| Measure | Value |
|---------|------:|
| Stationary candidates (`STATIONARY_SUPPORTED` + `STATIONARY_BAND`) | **438** |
| V2 accepted (`OK_STATIONARY_NULL_SPEED`) | **328** |
| V2 withheld | **110** (`SUPPORT_WINDOW_COMPROMISED` **103**, `CROSS_SOURCE_CONFLICT` **7**) |
| Changes outside stationary-candidate path | **0** |
| `null→0` qc speed conversions | **0** |
| Unsafe promotions (RELEASE / FROZEN_UNRESOLVED accept) | **0** |
| Trips with numeric max/count/coverage drift V1→V2 | **0** |
| **REGRESSION_VERDICT** | **PASS** |

## Per-trip summary

| Trip ID | Vehicle (prefix) | UTC date | Intervals | Stat. cand. | V2 accept | Withheld (top) | Trusted # V1/V2 | Cov% V1/V2 | Max V1/V2 | Outside path |
|---------|------------------|----------|----------:|------------:|----------:|----------------|----------------:|-----------:|----------:|-------------:|
| `f502a4a0-…` | `19fedd4b` | 2026-10-14 | 1090 | 37 | 19 | 18 SWC | 931 / 931 | 85.4 / 85.4 | 65.77 / 65.77 | 0 |
| `24deb8af-…` | `c10351f8` | 2026-10-13 | 185 | 29 | 27 | 2 SWC | 4 / 4 | 2.2 / 2.2 | 6.38 / 6.38 | 0 |
| `0effed9d-…` | `68868291` | 2026-10-12 | 350 | 38 | 38 | — | 185 / 185 | 52.9 / 52.9 | 53.69 / 53.69 | 0 |
| `3815920e-…` | `8c850ff1` | 2026-10-11 | 611 | 11 | 8 | 3 SWC | 283 / 283 | 46.3 / 46.3 | 49.75 / 49.75 | 0 |
| `08f2e58c-…` | `19fedd4b` | 2026-10-10 | 1691 | 16 | 16 | — | 1233 / 1233 | 72.9 / 72.9 | 104.54 / 104.54 | 0 |
| `be07d73f-…` | `19fedd4b` | 2026-10-09 | 1008 | 119 | 71 | 42 SWC, 6 CSC | 358 / 358 | 35.5 / 35.5 | 67.78 / 67.78 | 0 |
| `533b2bf8-…` | `19fedd4b` | 2026-10-14 | 4694 | 149 | 110 | 38 SWC, 1 CSC | 1140 / 1140 | 24.3 / 24.3 | 81.33 / 81.33 | 0 |
| `c26d3c13-…` | `19fedd4b` | 2026-10-14 | 1175 | 7 | 7 | — | 216 / 216 | 18.4 / 18.4 | 62.34 / 62.34 | 0 |
| `c65e7b49-…` | `19fedd4b` | 2026-10-14 | 711 | 0 | 0 | — | 0 / 0 | 0 / 0 | null / null | 0 |
| `c069cc9b-…` | `68868291` | 2026-10-14 | 2019 | 32 | 32 | — | 1313 / 1313 | 65 / 65 | 108.97 / 108.97 | 0 |

SWC = `SUPPORT_WINDOW_COMPROMISED`; CSC = `CROSS_SOURCE_CONFLICT`.

**Examples:** `0effed9d-…` — all 38 stationary candidates accepted with numeric metrics unchanged. `be07d73f-…` — high withhold rate (48/119) with conflict + compromised support, still zero V1/V2 numeric drift. `c65e7b49-…` — no stationary-band null-speed candidates (hold-heavy / no band), regression still clean.

## Case groups

| Group | Covered in this run? |
|-------|----------------------|
| Stationary accept (full trip) | yes (`0effed9d`, `c069cc9b`, …) |
| Stationary withhold — support window | yes (`be07d73f`, `533b2bf8`, …) |
| Stationary withhold — cross-source conflict | yes (`be07d73f`, `533b2bf8`) |
| No stationary-band candidates | yes (`c65e7b49`) |
| Low numeric coverage | yes (`24deb8af`, `c26d3c13`) |
| High numeric coverage | yes (`f502a4a0`, `08f2e58c`) |
| Long shadow window (≈78 min span) | yes (`533b2bf8`) |
| Multi-vehicle / multi-day spread | partial (4 vehicles, 6 dates; fleet has 5 vehicles in docs) |
| Explicit `RELEASE` / `FROZEN_UNRESOLVED` V2 promotion attempt | not targeted in selection (no violation observed) |
| Independent speed / physics ground truth | **not available** (consistency-only) |

## SHA reconciliation

| Label | SHA |
|-------|-----|
| Merged main (#2021) — **this multi-trip execute** | `f7a285b59fd1f70e57b5fd72c04406286e1b96f1` |
| Prior single-trip live replay execute | `0a6f8de2515d05436cf9502119bd6bea0b5cf354` (evaluator unchanged vs merge head per [EXP021_P1_V2_STATIONARY_SEMANTICS.md](./EXP021_P1_V2_STATIONARY_SEMANTICS.md)) |
| Diagnosis merge (#2020) | `8152d313d1ef1c9f9508bbd5e1a96d779e0c5b06` |

## Non-effects

V1 remains default; no calibration/S2/default policy change; no customer runtime activation; no new work items or provider captures.
