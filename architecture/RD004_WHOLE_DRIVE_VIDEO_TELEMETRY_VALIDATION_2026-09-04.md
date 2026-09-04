# RD004 — Whole-Drive Video ↔ Telemetry Validation (Segments A + B)

**Date:** 2026-09-04
**Evidence IDs:** DI-EV-0035A.2 (Segment A) + DI-EV-0035B.5 (Segment B)
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`)
**Session:** `f1e81e78-f96b-44ee-80c2-ca5270f21248`
**Reference drive:** `DIMO_LTE_R1_REFERENCE_DRIVE_004`

## Structure

| Segment | Video window (UTC) | Duration | Evidence ID | Offset validated |
|---------|-------------------|----------|-------------|------------------|
| A (pre-refuel) | 03:37:46 – 03:43:56 | ~6:11 | DI-EV-0035A.2 | **NO** |
| Refuel stop | — | — | — | — |
| B (post-refuel) | 03:47:02.217 – 04:03:42.715 | **1000.498365 s** | DI-EV-0035B.5 | **NO** |

## Cross-segment conclusions

### HF cadence

Both segments are far below 1 Hz continuous speed. Segment B median cadence (~10.6 s) is **sparser** than Segment A (~4.7 s). Large gaps (52–105 s) are systemic, not Segment-A-specific.

### Video master timeline (B.2)

Nine clips stitched in order **5→3→1→9→8→7→4→2→6** via audio cross-correlation (not Drive timestamps). Total overlap **16.775 s**; master duration **1000.498365 s**. Canonical artifact: `rd004-b-video-master-timeline.json`.

Time.is anchor at master t≈0.783333 s → `VIDEO_MASTER_T0_UTC_ESTIMATE = 2026-09-04T03:47:02.216667Z` (frame + display uncertainty).

### Clock alignment

- Segment A: insufficient independent high-authority landmarks → offset **null**
- Segment B (B.1): removed speed-selection bias; supportive ~+13.5 s **not validated**
- Segment B (B.2): **frame-verified** first stop at **t≈621.8 s** (not t=630 snapshot); launch bounded **[673.0, 673.5] s**
- Segment B (B.3): **corrected launch predecessor bug** (35.102 s gap, not ~629 s); launch **interval-censored** — +5.x s **removed** as clock evidence
  - Corrected first-stop displacement vs sparse HF zero: **~+21.7 s** (`SPARSE_STATE_SAMPLE`, **not** clock authority)
  - `CLOCK_FIT_PROVIDER_MATCH_COUNT = 0`; `OFFSET_CANDIDATE_RANGE_SUPPORTIVE = null`
  - 43→0 in 1 s after ~28.7 s gap: **not** validated physical dynamics (`PAIR_PHYSICAL_CONTINUITY_VALIDATED = NO`)
  - Stop timing: **no** event-derived offset aligning same event (`STOP_TIMING_ERROR_SECONDS = null`)
  - HF capture completeness (B.4): **exact-window** DIMO replay (75 windows, same `from`/`to`) — **104** original vs **157** replay buckets; **53** late-arrival; **26** definitely excluded by 2 s watermark → **`HF_CAPTURE_ROOT_CAUSE = PROVIDER_LATE_ARRIVAL_PLUS_CAPTURE_WATERMARK_RECOVERY_GAP`**
  - B.3 broad requery 108 vs 66: **superseded** — cross-origin bucket identity comparison **invalid** (`CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID = NO`)
  - `A_B_APPROX_22S_DISPLACEMENT_REPEAT_OBSERVED = YES` but **not** cross-validated
  - `SPARSE_SAMPLE_DELAY_SEPARATED_FROM_CLOCK_OFFSET = YES`
  - **`PROVIDER_TIMESTAMP_OFFSET_VALIDATED = NO`**, `VIDEO_TO_PROVIDER_OFFSET_SECONDS = null`
- Drift over either segment: **not validated**

### Speed accuracy

- DI-EV-0035B MAE ~2.3 km/h: **not canonical** (selection bias)
- B.1/B.2 holdout: time-only matching; **no validated offset** → `SPEED_MAE_KMH = null`
- Diagnostic holdout MAE with unsupported offset: **removed in B.3** (no supportive offset range)
- Sparse HF cadence + dynamic states limit comparable samples
- HF capture audit (B.4): exact-origin replay denser than sealed; late-arrival lag P50 ~2.1 s > 2 s overlap; **not** internal persistence loss

### Stop timing

- t=630: **SUSTAINED_STOP_STATE** only — not stop-transition landmark
- B-T01 first zero: **621.8 s**; B-T02 launch window: **[673.0, 673.5] s**
- `STOP_TIMING_VALIDATED = NO`; **no** supportive offset applied (B.3 removes circular alignment)

### Gear / reverse

Video provides strong gear and reverse ground truth in Segment B. HF telemetry delivers **no gear** and **no direction** in either segment. Reverse cannot define clock offset.

### Legacy detectors

**0** hard/extreme events on available HF data in both segments. Three telemetry kinematic episodes without legacy alarms are **not** validated false negatives.

### Production

**No changes.** Analysis-only. B.5 closes RD004-B **analysis/design** (`RD004_HF_RECOVERY_POLICY_DESIGNED = YES`); runtime fix and absolute validation remain future work (`READY_FOR_RD004_FINAL_CLOSEOUT = NO`).

## B.5 methodology (DI-EV-0035B.5)

1. Preserved B.4 exact-window evidence and root cause classification
2. Counterfactual simulation: settlement delay (0–10 s) × recovery overlap (2–20 s) grid
3. Independent settlement vs overlap analysis — not overlap-only
4. `OBSERVED_MISSED_BUCKET_COUNT_IS_LOWER_BOUND = YES` (zero-result windows not reconstructible)
5. Aggregate bucket observations ≠ unique ECU measurements (explicit in artifacts)
6. Recommended policy: **8 s settlement + 6 s overlap + periodic deep recovery sweep** (design only)
7. Implementation contract for separate production PR (`rd004-b-hf-runtime-fix-contract.json`)
8. Driving Intelligence: lower reconstruction confidence until capture fix; no gap interpolation

## B.4 methodology changes (DI-EV-0035B.4)

1. Invalidated B.3 cross-origin 108-vs-66 bucket identity comparison (`QUERY_FROM_ANCHORED` semantics)
2. Reconstructed **75** original HF query windows from full-session `HF_HISTORICAL` provenance
3. Read-only DIMO **exact-window replay** (identical `hfWindowFrom` / `hfActualQueryTo`, interval `1s`)
4. Same-origin bucket comparison by exact provider field + bucket timestamp (no global floor)
5. Late-arrival differential: closure at `requestCompletedAt`, availability lag lower bound
6. Watermark recovery audit: `DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK` vs `HF_QUERY_OVERLAP_MS = 2000`
7. Root cause: **`PROVIDER_LATE_ARRIVAL_PLUS_CAPTURE_WATERMARK_RECOVERY_GAP`** — not SynqDrive row drop
8. `HF_SPARSE_CADENCE_ORIGIN = NOT_DETERMINABLE`; RD003 ~2 s vs RD004 sealed sparsity **reconciled** at acquisition layer
9. Production capture policy **unchanged** (`CURRENT_2S_OVERLAP_SUFFICIENT = NO` audit finding only)

## B.3 methodology changes (DI-EV-0035B.3)

1. Launch transition uses **immediate predecessor** (`sorted[i-1]`), not first earlier sample
2. Launch provider transition **interval-censored** over 35.102 s — 20 km/h timestamp is **not** exact launch event
3. **+5.x s launch displacement removed** as clock evidence (`FIRST_LAUNCH_CLOCK_FIT_ELIGIBLE = NO`)
4. Context-continuity gate: local 1 s pair after large gap ≠ continuous physical dynamics
5. Stop displacement reclassified as **sparse observation only** (`FIRST_STOP_DISPLACEMENT_CLOCK_AUTHORITY = NO`)
6. Stop timing: **no** event-derived offset → zero error tautology removed
7. Legacy exploratory clock landmarks forced `CLOCK_FIT_ELIGIBLE = NO` with explicit historical reasons
8. HF capture completeness audit: pipeline trace + read-only DIMO requery diagnostic artifact (**B.4 supersedes cross-origin loss conclusion**)

## B.2 methodology changes (DI-EV-0035B.2)

1. Audio-correlated master timeline with per-clip master starts and overlap evidence
2. Improved Time.is T0 from frame-level second boundary (not rounded video start)
3. **VIDEO_STATE_ANCHOR** vs **VIDEO_TRANSITION_LANDMARK** semantics separated
4. Frame-verified B-T01 stop transition (621.8 s); t=630 invalidated as transition
5. Bounded B-T02 launch window [673.0, 673.5] — no invented exact event time
6. Clock reassessment distinguishes **clock offset** from **sparse sampling delay**
7. B.1 calibration/holdout separation and time-only holdout matching preserved

## Artifacts

- Segment A: `docs/audits/data/rd004-segment-a/`
- Segment B: `docs/audits/data/rd004-segment-b/` (incl. B.5 `rd004-b-hf-recovery-policy-*.json`, `rd004-b-hf-runtime-fix-contract.json`)
- Architecture: `architecture/RD004_A_SEGMENT_A_VIDEO_TELEMETRY_ALIGNMENT_2026-09-04.md` (A.2) + this document
