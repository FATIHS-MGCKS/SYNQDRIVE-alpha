# TIG22 deep validation — DS4 motion & speed (2026-10-23)

## Executive summary

Offline replay of the last VW Tiguan trip (`98d2a8e0-8b7d-4529-bf76-acee44d61fbe`, 2026-10-22 18:30–19:04:53Z) against sealed video tachograph references (18:38:34–19:03:02Z) shows:

- **Product-facing speed (C4)** tracks video well on scored seconds (MAE **2.91 km/h**, P95 **5.92 km/h**, n=**1364** paired seconds, 0 s shift).
- **Raw L3** is **not** safe to expose without QC (same window: MAE **14.5 km/h**, max error **~1905 km/h** from a GPS glitch).
- **C5.1 V1.2** on this trip yields **negligible** speed metric delta vs C4 and **identical** manoeuvre-oracle outcomes; FSM remains **C4-fed**.
- **Manoeuvre detector:** 12/18 oracle manoeuvres **ERKANNT**, 4 borderline misses, 1 miss for missing DS4 speed, 1 hard miss (v2_gap2s, PR #2139 rules).
- **FSM motion claims** match video on core still/moving seconds (0 false-moving in STILL_CORE; 0 false-still in MOVING_CONFIRMED) but **stop/start timing** can lag video by several seconds on some halts.

No production code or data was mutated. Algorithm pin: **`716f93fedd9d5408fa1db2de5b4cd1a786d9685c`**.

## Identity & completeness (pre-metrics)

| Check | Result |
| --- | --- |
| Vehicle | VW Tiguan `19fedd4b-c4e8-4de8-a125-dab293326e7e` (WOB L 7503) — `TRIP_IDENTITY.json` |
| Trip | `98d2a8e0-8b7d-4529-bf76-acee44d61fbe`, 18:30:00Z–19:04:53Z |
| S4 evidence snapshot | `DI_V0_S4_EVIDENCE_V1:sha256:22e2a662…` |
| Grid | 2094 s; position present 2005 s |
| Video GT | 1417 scored s inside grid; after **19:03:02Z** → `UNSCORED_VIDEO_GAP` |
| OBD | Pinned sparse speed in container — **non-authoritative** comparison column only |

## A. Speed (video-scored seconds, 0 s shift)

| Path | n | MAE | P95 | Max abs | Bias | within ±3 km/h |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| L3 raw | 1284 | 14.51 | 6.13 | 1904.94 | +8.93 | 54% |
| L3 + QC trusted | 1272 | 2.98 | 5.81 | 14.38 | −2.65 | 55% |
| **C4** | **1364** | **2.91** | **5.92** | **14.38** | **−2.42** | **57%** |
| **C5.1 preferred** | **1364** | **2.90** | **5.90** | **14.38** | **−2.42** | **57%** |

**C5.1 repair states (full grid):** `PASS_THROUGH_OUTSIDE_WINDOW` 2056; `PASS_THROUGH_NO_REPAIR` 12; `REPAIR_REJECTED` 22; `REPAIR_ACCEPTED` **1**; `UNCERTAIN` 3.

**Sensitivity (±1/±2 s, C4):** P95 rises to **7.0** (+1 s) and **12.7** (+2 s) — reference clock uncertainty matters; primary table stays at **0 s** per charter.

**Cause mapping (speed):**

- Catastrophic L3 errors → **GPS source / leg outliers** (CONFIRMED).
- C4 vs video agreement → **C4 estimation** adequate on scored coverage (CONFIRMED).
- C5.1 delta ≈ 0 → **C5.1 repair** rarely changes observable speed on this drive (CONFIRMED).

## B. Movement (FSM vs video classes)

On video-scored reference classes (rules §6):

| Metric | FSM |
| --- | ---: |
| STILL_CORE seconds | 73 |
| False MOVING in STILL_CORE | **0** |
| MOVING_CONFIRMED seconds | 1254 |
| False STILL in MOVING_CONFIRMED | **0** |
| Ambiguous (EDGE/SLOW) seconds | 90 |

L3 motion **claims** show more ambiguity (false-moving in still-core **0**, but higher ambiguous-moving counts) — see `metrics.json` → `motion.l3_claim_vs_video`.

**Architecture note:** FSM is driven by **C4**, not C5.1 (`fsmUsesC4Only: true` in processor wiring).

## C. Stillstand & Anfahren

`fsm_stop_start_timing` (video zero-runs ≥ 3 s):

- Several runs with **late stop detection** (e.g. ref stop 18:41:01Z → FSM STILL found at **+5 s**).
- Mixed start offsets (−1 s to **+10 s** on some runs) — see `metrics.json` for full run list.

Missing position rows during halts correlate with **NO_POSITION** C4 quality (e.g. 18:41:00–02Z in `per_second.csv`).

## D. Acceleration & E. Braking (oracle v2_gap2s, PR #2139)

Oracle manoeuvres on video speed series: **18**.

| Status | C4 events | C5.1 events |
| --- | ---: | ---: |
| ERKANNT | 12 | 12 |
| VERPASST_GRENZWERTIG | 4 | 4 |
| VERPASST_KEINE_DS4_GESCHWINDIGKEIT | 1 | 1 |
| VERPASST | 1 | 1 |

**C5.1 does not change** event outcomes on this trip (same C4 usable-quality guard inputs for detector).

Detail rows: `outputs/events_comparison.csv`.

## Problem windows (`anomalies.csv`)

| Window | Epistemic | Finding |
| --- | --- | --- |
| 18:41Z | CONFIRMED | Video GT present; C4 `NO_POSITION` at standstill edges; FSM `UNKNOWN` then delayed STILL |
| 18:49:13–23Z | LIKELY | Video ~71 km/h; C4 `OUTLIER_REJECTED` entire cluster — GPS jump / quarantine |
| 19:04:34–52Z | **UNSCORED** | No video GT; volatile C4 + FSM transitions — **plausibility only**, no manoeuvre truth claims |

## Architecture diagnosis (selected)

| Issue | Layer | Confidence |
| --- | --- | --- |
| L3 1905 km/h spike | GPS / L3 | CONFIRMED |
| 18:49 OUTLIER_REJECTED wall | C4 quarantine | CONFIRMED |
| QC restores product speed | L3 QC | CONFIRMED |
| FSM lag at halts | Motion FSM (C4 input) | LIKELY |
| Borderline event misses | Event detector + threshold band | CONFIRMED |
| C5.1 no event lift | Events still C4-quality gated | CONFIRMED |
| Post-video speed volatility | Data gap + sparse support | OPEN (UNSCORED) |

## Top 10 evidenced weaknesses (severity)

1. **Raw L3 GPS catastrophe** on scored video seconds (max error ~1905 km/h).
2. **18:49 GPS jump cluster** — C4 quarantine removes speed for 11 consecutive scored seconds while video shows steady ~71 km/h.
3. **133 video-readable seconds** without L3 numeric estimate (`DS4_NULL` class in speed eval).
4. **FSM stop detection latency** up to **+5 s** vs video zero-run starts.
5. **Four borderline manoeuvre misses** (`VERPASST_GRENZWERTIG`).
6. **One manoeuvre missed** for absent DS4 speed in oracle window.
7. **One hard manoeuvre miss** (`VERPASST`) on video GT.
8. **Ambiguous motion** at STILL_EDGE / SLOW_OR_AMBIGUOUS (90 s) — creeping vs UNKNOWN not resolved.
9. **Post-19:03:02Z** trip tail without GT but with moving FSM on sparse/jitter speeds.
10. **C5.1 limited value on this trip** — metrics and events essentially unchanged vs C4.

## What C5.1 already helps here

- Slight improvement in MAE/P95 vs C4 on scored seconds (ΔMAE ≈ 0.005 km/h).
- **One** accepted speed repair bucket (see `per_second.csv` `c5_1_repair_state=REPAIR_ACCEPTED`).

## What remains outside C5.1

- FSM state machine (C4-only input).
- L3 estimation and QC gating for product L3 surfaces.
- GPS outlier / leg quarantine feeding C4.
- Event detector thresholds and borderline band (HF V1 reused).

## Investigate next (with existing data only)

- FSM input switch study: replay FSM on C5.1 series **offline** (not implemented here).
- Per-window review of the **four** `VERPASST_GRENZWERTIG` oracle rows vs C4 quality gaps.
- Correlation of `NO_POSITION` gaps with video stillstand edges (already partially in `per_second.csv`).

## Not provable from available references

- Truth of manoeuvres after **19:03:02Z**.
- Sub-second video↔GPS alignment better than ±1 s without new calibration.
- Fleet-wide generalisation beyond this single Tiguan trip.

## References

- PR **#2136** — `ds4-speed-video-reference-20261023`
- PR **#2139** — `event_eval_lib.cjs` (v2_gap2s); prod shadow export in `inputs/tiguan-prod-shadow-v4/`
- PR **#2145/#2146** — production integration at `716f93fed`
- Research archive **#2147** — index on `cursor/ds4-research-archive-2140-2144-192d` (studies #2140–#2144)
