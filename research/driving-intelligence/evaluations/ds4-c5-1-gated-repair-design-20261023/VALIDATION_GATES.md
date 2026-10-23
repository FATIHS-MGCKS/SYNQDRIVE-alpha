# C5.1 — Pre-registered validation gates (offline experiment)

Applies to a **future** implementation PR — not executed in this design gate. Metrics: **one JSON summary** per run (`c5_1_experiment_summary.json`), all markdown/CSV exported from it.

## Drives and roles

| ID | Role |
| --- | --- |
| TES16 | Development — must fix `03:50:20–23` false ACCEL numerically |
| TIG22 | Development — no auto score for 19:04 events (no video after ~19:03:02) |
| TES21-1, TES21-2 | Regression (non-blind; prior research exposure) |
| **Video #5** | Future **generalization gate** (not in first experiment) |

Production C4 replay pin: `579ee8b2fed06593d7d2aa57cffb6036dbf53a24`.

## A. Pass-through integrity

| Gate | Criterion |
| --- | --- |
| A1 | Labels outside all repair windows: `valueKmh`, `quality`, `flags` **identical** to C4 replay |
| A2 | Labels inside window but REPAIR_REJECTED / UNCERTAIN: identical to C4 |
| A3 | Count of pass-through labels documented; expect **≫** repaired labels (whole trip) |

## B. Coverage

| Gate | Criterion |
| --- | --- |
| B1 | Paired readable video seconds: C5.1 ≥ C4 − **0.1 pp** per drive (stricter than V0 −1 pp — coverage loss not normal) |
| B2 | **Zero** labels where C4 numeric → C5.1 null unless C4 already null |
| B3 | Lost-second reasons enumerated; `PTQ_INSUFFICIENT_SUPPORT` class **forbidden** as fleet-wide outcome (repair must reject to C4 numeric instead) |

## C. Speed accuracy (separate views)

Report **four** metric blocks per drive:

1. **All paired seconds** (readable ref, in grid)
2. **Common seconds** (C4 and C5.1 both numeric)
3. **Repaired-only** (REPAIR_ACCEPTED)
4. **Pass-through-only** (must match C4 errors exactly)

| Gate | Criterion |
| --- | --- |
| C1 | Common-second MAE ≤ C4 + 0.1 km/h |
| C2 | Common-second P95 ≤ C4 + 0.2 km/h |
| C3 | TES16 critical window `03:50:16–26`: max \|err\| ≤ 8 km/h on REPAIR_ACCEPTED or pass-through numerics |
| C4 | Whole-trip max error reported separately (not a gate unless regression vs C4 max) |

## D. Manoeuvre oracle (#2139 rules)

Reuse `ds4-accel-brake-video-reference-20261023` pipeline:

- **T2:** detector on video reference speed vs DS4 events
- **T3:** visible runs
- Matching: `v2_gap2s` (per current eval default)
- **Same** `usableQualities` for C4 and C5.1 series

| Gate | Criterion |
| --- | --- |
| D1 | **Confirmed recall** (hard oracle manoeuvres): C5.1 ≥ C4 − 0 (no missed confirmed) |
| D2 | **Hard false alarms:** C5.1 ≤ C4 (no new hard FP) |
| D3 | **Unknown / unverifiable:** reported separately — not counted as improvement |
| D4 | TES16: ACCEL `03:50:20–23` absent in C5.1 |
| D5 | TIG22 19:04: events listed but status **UNSCORED_VIDEO_GAP** |

**Forbidden:** Treating “event disappeared” as success without oracle match (C5 V0 lesson on TIG22 / TES21-1).

## E. Motion claims (speed thresholds)

Same `eval_lib` STILL/MOVING bands on readable seconds:

| Gate | Criterion |
| --- | --- |
| E1 | `falseMotionInConfirmedStill` ≤ C4 |
| E2 | `falseStillInConfirmedMotion` ≤ C4 |
| E3 | Increase in `motionNoClaim` documented; not a pass criterion by itself |

## F. Safety invariants

| Gate | Criterion |
| --- | --- |
| F1 | Hard teleport quarantine label set **identical** to C4 |
| F2 | No new numeric speed > 250 km/h view entries vs C4 |
| F3 | Lookahead audit: **0** support labels with \|Δt\| > 4 s from center |

## G. Synthetics (fixed fixtures in repo)

Eight scenarios with **geodesically correct** spacing (`metersAlong/111320` or haversine-checked legs):

1. Constant cruise ~100 km/h  
2. Strong accel  
3. Strong brake  
4. Curve  
5. Start from stop  
6. Time-mislabeled interior point  
7. Lateral outlier (hard quarantine parity)  
8. Missing bucket(s)  

Regression runner must **not** duplicate weak scaling from V0 `runSynthetics` (`latOff * 1e-4` bug).

## H. Experiment verdict

- **PROVEN_FOR_LOCAL_REPAIR** — all gates A–F pass on four drives; #5 video pending for generalization  
- **NOT_PROVEN** — any gate fail  
- No parameter retuning on eval drives after first run
