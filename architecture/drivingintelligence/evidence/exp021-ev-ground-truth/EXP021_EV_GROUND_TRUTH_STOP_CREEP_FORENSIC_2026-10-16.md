# EXP021 — stop / creep / data-gap forensic (Auftrag 2)

**Status:** ANALYZED (pinned S4 replay + V2 QC re-eval @ `a0ce01f…`)  
**Trip:** `358d0158-b2a9-47ed-af26-33926c5770b4`  
**Frozen baseline:** [`pre-deploy/`](./pre-deploy/) — **unchanged**  
**Machine export:** [`forensic-readonly-exports-2026-10-16/STOP_CREEP_DATA_GAP_FORENSIC_EXPORT.json`](./forensic-readonly-exports-2026-10-16/STOP_CREEP_DATA_GAP_FORENSIC_EXPORT.json)  
**External video cross-check:** [`external-video-review-kompakt-2026-10-16/Bericht.md`](./external-video-review-kompakt-2026-10-16/Bericht.md)

## Baseline parity (recomputed, must match manifest)

| Metric | Expected | Observed export |
|--------|----------|-----------------|
| Rows | 1136 | 1136 |
| Numeric L3 | 776 | 776 |
| Trusted numeric | 775 | 775 |
| Trusted limited (null speed) | 14 | 14 |
| Trusted max km/h | 129.7885665128692 | match |
| Trusted mean km/h | ~66.08511361500206 | match |

## Video tacho-zero windows vs replay (frozen)

External review reports **135** readable tacho-zero seconds; all mapped to **`NO_MOTION_EVIDENCE`** with **133 `ROW_ABSENT`** and **2 `PRESENT`** — no trusted positive speed (see Bericht.md tables).

The export includes **±5 s** bucket context for:

- Each video tacho-zero window listed in Auftrag 2
- `03:37:41Z`–`03:38:25Z` (start maneuver)
- `03:54:15Z`–`03:54:56Z` (end / rangieren)
- `03:36:00Z`–`03:37:40Z` (pre-video persisted prefix)

Per bucket fields (no coordinates): `positionAvailability`, `positionGapDiagnosis`, S1 `motionState` / `speedEvidenceState`, hold/release classification (`holdTransitionDetail`), `noNumericDisjointV2`, QC trust + reason codes, leg distances / implied speeds from QC support assessment.

## STATIONARY_SUPPORTED vs physical stop

| Topic | Finding |
|-------|---------|
| QC policy | `STATIONARY_MAX_TRUSTED_SPEED_KMH=5` in V2 evaluator (byte-stable vs baseline SHA) |
| Trusted limited seconds | **14** total; **7** contiguous `STATIONARY_SUPPORTED`+`STATIONARY_BAND` intervals summing to **14 s** (see export `stationarySupportedIntervals`) |
| Video overlap | Bericht: **11** of 14 seconds with readable tacho **1–3 km/h**; **3** visually unknown — consistent with **band evaluation**, not “speed = 0” guarantee |
| Product risk | **Semantic** — UI/copy may read `TRUSTED_LIMITED` null as “stopped” while S1 encodes **low-speed band** |

**Classification split (do not merge counts):**

- `NO_MOTION_EVIDENCE` + `ROW_ABSENT` → acquisition / sampling gap in pinned POSITION snapshot (not auto-filled).
- `STATIONARY_SUPPORTED` + `TRUSTED_LIMITED` → QC accepts intentional null in band (rule-conform per policy).
- Positive tacho with missing numeric → separate causes (`NO_MOTION_EVIDENCE`, `TRANSITION_UNCERTAIN`, `STATIONARY_SUPPORTED`) — see Bericht.md §Coverage.

## Pre-video 101 s prefix (`03:36:00`–`03:37:40`)

| Count | Value |
|-------|-------|
| Buckets | 101 |
| `ROW_ABSENT_EXPLICIT` | 98 |
| `PRESENT_OK` | 3 |
| Trusted numeric | 0 |
| Dominant motion | `NO_MOTION_EVIDENCE` |

Confirms early persisted start extends acquisition into a **telemetry desert** before video clock, without assigning trusted speed.

## ROW_ABSENT attribution (replay-level)

Uses `diagnosePositionGapAtLabel` + `classifyNoNumericDisjointV2` on pinned snapshot:

- **Inside window, explicit `ROW_ABSENT`** → POSITION channel row absent in S4 evidence (provider sampling / acquisition hole), **not** synthesized zero in replay.
- **Edges** → `WINDOW_EDGE_OUTSIDE_ACQUISITION` / support-window effects at grid boundaries.

No missing seconds were filled with `0`.

## Non-effects

`PRODUCTION_MUTATIONS=NONE`, `PROVIDER_CALLS=NONE`, algorithm unchanged, pre-deploy hashes **unchanged**.
