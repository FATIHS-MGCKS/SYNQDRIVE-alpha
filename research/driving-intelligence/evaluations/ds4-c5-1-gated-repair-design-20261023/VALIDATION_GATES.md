# C5.1 — Pre-registered validation gates (offline experiment)

Applies to a **future** implementation PR — not executed in this design gate.

**Authoritative metrics:** `c5_1_experiment_summary.json` only (one runner); markdown/CSV are exports. No duplicate human tables with divergent numbers (#2142 TES21-2 lesson).

Production C4 replay pin: `579ee8b2fed06593d7d2aa57cffb6036dbf53a24`.

## Drives and roles

| ID | Role |
| --- | --- |
| TES16 | Development — TES16 gap/jitter numerics + false ACCEL oracle |
| TIG22 | Development — 19:04 events unscored (video gap) |
| TES21-1, TES21-2 | Regression (non-blind) |
| **Video #5** | Future generalization gate |

## A. Pass-through integrity

| Gate | Criterion |
| --- | --- |
| A1 | Outside ⋃W_k: `valueKmh`, `quality`, `flags` **identical** to C4 |
| A2 | Inside W but REPAIR_REJECTED / UNCERTAIN: identical to C4 |
| A3 | `repair_accepted` ≪ `pass_through` (document counts per drive) |
| A4 | **115-equivalent:** zero C4-numeric → C5.1 null transitions attributable to insufficient support (V0 class forbidden) |

## B. Coverage

| Gate | Criterion |
| --- | --- |
| B1 | Paired readable video seconds: C5.1 ≥ C4 − **0.1 pp** per drive |
| B2 | Zero C4 numeric → C5.1 null unless C4 already null |
| B3 | Lost-second reasons enumerated; fleet-wide `PTQ_INSUFFICIENT_SUPPORT` **forbidden** |

## C. Speed accuracy (video — **evaluation only**, not repair logic)

Four metric blocks per drive: (1) all paired, (2) common seconds, (3) **REPAIR_ACCEPTED only**, (4) **pass-through only** (must match C4 errors exactly).

| Gate | Criterion |
| --- | --- |
| C1 | Common-second MAE ≤ C4 + 0.1 km/h |
| C2 | Common-second P95 ≤ C4 + 0.2 km/h |
| C3 | TES16 `03:50:16–26`: max \|err\| ≤ 8 km/h on REPAIR_ACCEPTED **or** pass-through numerics |
| C4 | Document **residual pass-through risk:** seconds where C4 \|err\|>8 km/h on V0-lost set (expected: 13 on TIG22/TES21; 0 on TES16 lost set) — **not** a pass/fail gate |

**Forbidden:** Using video error to **accept** repairs (removed from spec §3.3).

## D. Manoeuvre oracle (#2139 rules)

Pipeline: `ds4-accel-brake-video-reference-20261023` — **T2/T3**, matching `v2_gap2s`, **`a_plaus`** plausibility bounds.

| Gate | Criterion |
| --- | --- |
| D1 | Confirmed recall: C5.1 ≥ C4 (no missed confirmed) |
| D2 | Hard false alarms: C5.1 ≤ C4 |
| D3 | Unknown/unverifiable: reported separately |
| D4 | TES16: ACCEL `03:50:20–23` **absent** in C5.1 (oracle — not “fewer events”) |
| D5 | TIG22 19:04: **UNSCORED_VIDEO_GAP** |
| D6 | **Forbidden success:** fewer DS4 events than C4 **without** oracle match improvement |

**Event parity:** identical `usableQualities` for C4 and C5.1; repaired samples stay **`REPAIRED`** in event quality mapping.

## E. Motion claims

| Gate | Criterion |
| --- | --- |
| E1 | `falseMotionInConfirmedStill` ≤ C4 |
| E2 | `falseStillInConfirmedMotion` ≤ C4 |
| E3 | `motionNoClaim` delta documented only |

## F. Safety invariants

| Gate | Criterion |
| --- | --- |
| F1 | Hard teleport quarantine label set identical to C4 |
| F2 | No new numeric speed > 250 km/h vs C4 |
| F3 | Lookahead audit: **0** support labels with \|Δt\| > **4** s from repair center |

## G. Eligibility scope (new — post-Fable)

| Gate | Criterion |
| --- | --- |
| G1 | Per drive: `suspicion_window_labels` / grid ≤ **15 %** (design audit: max **10.3 %** on TES21-1) |
| G2 | TES16 gap window covers `:20`, `:22`, `:23` in **one** merged window without absent-row split |
| G3 | Report `repair_accepted` vs `suspicion_window_labels` separately |

## H. Synthetics (fixed fixtures)

Eight scenarios with geodesically correct spacing (`metersAlong/111320` or haversine assert); shared module (no V0 `latOff * 1e-4` bug).

## I. Experiment verdict

- **PROVEN_FOR_LOCAL_REPAIR** — gates A–G pass on four drives; video #5 pending for generalization  
- **NOT_PROVEN** — any gate fail  
- **No parameter retuning** on eval drives after first run
