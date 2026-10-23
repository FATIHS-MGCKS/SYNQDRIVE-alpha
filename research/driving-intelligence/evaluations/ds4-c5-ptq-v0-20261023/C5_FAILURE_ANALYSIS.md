# C5 PTQ V0 — failure analysis & Fable deviations

## Why acceptance failed

1. **`minSupportPerSide = 3`** (user-frozen, stricter than Fable prototype A2 which required only three total support points with both sides non-empty). On sparse Tesla-21 grids this drops **57** readable seconds vs C4 (TES21-1: 65.5% → 40.6% coverage). Fable’s ~12 s loss used the looser support rule.
2. **TES16 common-second MAE/P95** slightly worse (+0.11 MAE, +0.42 P95 on 785 shared seconds) while **whole-trip max error** improves dramatically (19.9 → 7.5 km/h). Trade-off: better tail on time-error seconds, slightly worse bulk on shared support.
3. **TIG22** loses 15 paired seconds (−1.1 pp coverage) via `PTQ_INSUFFICIENT_SUPPORT` near sparse gaps — within noise for MAE/P95 on common seconds but fails the −1 pp gate.

## Fable counter-checks

| Question | Finding |
| --- | --- |
| TES16 fix vs UNKNOWN mask? | **Numeric fix** at :20–:23; only `:21` stays `NO_POSITION` (ROW_ABSENT). |
| TES21-1 ~12 s loss in Fable illustration? | **This build loses more** (57 s) due to 3-per-side support + sparse grid; same root cause class (`PTQ_INSUFFICIENT_SUPPORT`). |
| Tiguan :37 wrongful PTQ quarantine? | **No** — `:37` is `OUTLIER_REJECTED` via production `detectPositionOutliers` (hard quarantine), identical to C4. |
| Real accel/curves preserved? | Synthetics pass; TES16 post-fix speeds track video ~125–129 km/h in critical window; strong accel segments on TES21 can become `INCONSISTENT_UNATTRIBUTED` / `NO_SUPPORT` instead of wrong numbers. |
| Missing measurements for PTQ rules? | **Raw within-bucket time** and **hdop** would refine `σ_pos` / time suspect bounds; not available in current 1 Hz AVG containers (per PR #2141). |

## Coverage loss reasons (aggregate)

Dominant codes in `outputs/*_lost_seconds.json`:

- `PTQ_INSUFFICIENT_SUPPORT` — cannot place 3+ support points on each side within ±4 s (sparse/absent rows).
- `HARD_TELEPORT_QUARANTINE` / `POSITION_OUTLIER_QUARANTINE` — same as C4 (not counted as C5-only loss).
- `PTQ_INCONSISTENT_UNATTRIBUTED` — small share on multi-point ambiguous windows (e.g. TIG22 19:04 cluster).

## Improvement only via non-evaluation?

On TES21-1, **common-second** MAE/P95 are worse than C4 while **overall** MAE on remaining seconds looks better — a large fraction of hard seconds became non-numeric (`UNKNOWN`), so paired metrics are **not** comparable to full-trip MAE without reading lost-second reasons.

## Verdict

**FINAL_VERDICT = NOT_PROVEN** — targeted TES16 time-error and false-event goals met, but pre-registered fleet-wide gates fail primarily on **coverage** (support rule × sparse grids) and **TES16 common-second** accuracy.

No further candidate algorithms in this workstream.
