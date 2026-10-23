# C5 PTQ V0 — offline design

Research-only estimator `MOTION_CORE_SPEED_C5_PTQ_V0_V0_1_RESEARCH` (`scripts/c5-ptq-v0.cjs`). Production C4 (`computeC4AdaptiveL3`) is unchanged.

## Stack

| Layer | Role |
| --- | --- |
| Hard quarantine (C4 parity) | `detectImplausibleOneSecondLegEndpointLabels` + `detectPositionOutliers` → `OUTLIER_REJECTED`, null speed |
| PTQ attribution | Leave-one-out on interior present points (A, P, B) |
| Robust speed | Theil–Sen on path-length slopes over support window |
| Events (eval only) | `detectMotionManoeuvreEvents` with usable qualities `OK`, `REPAIRED`, `SPARSE_SUPPORT` |

## Frozen parameters (hypotheses)

| Parameter | Value |
| --- | --- |
| `a_max` | 6 m/s² |
| Cross-track limit (time vs position suspect) | 6 m |
| Initial window | ±2 s |
| Max window | ±4 s |
| Min support per side | 3 present, non-suspect, non-hard-rejected points |
| Max neighbor gap | 3 s |
| Lookahead (non-causal bound) | 4 s |

## Attribution labels

- `TIME_SUSPECT` — LOO restores consistency; cross-track to chord A→B ≤ 6 m
- `POSITION_SUSPECT` — LOO restores consistency; cross-track > 6 m
- `INCONSISTENT_UNATTRIBUTED` — local inconsistency, removing P does not restore outer legs
- `UNKNOWN` — insufficient support or no valid slope pairs
- `OK` — no point-level attribution flag

Suspect points are excluded from slope **support** but may still receive a bridged estimate (`REPAIRED` for `TIME_SUSPECT`).

## Non-goals

- No OBD authority, no DIMO acquisition changes, no backend/frontend edits
- No post-hoc tuning on eval drives
- No invented speeds at `ROW_ABSENT` (explicit `NO_POSITION` / `NO_SUPPORT`)

## Dependencies

- Pinned DI kinematics at `579ee8b2fed06593d7d2aa57cffb6036dbf53a24` (verified `git diff` = 0 on `driving-intelligence/`)
- Inputs: same loaders as `ds4-speed-video-reference-20261023` and `ds4-accel-brake-video-reference-20261023`
- Prior research: PR #2136–#2141 (no new video analysis)
