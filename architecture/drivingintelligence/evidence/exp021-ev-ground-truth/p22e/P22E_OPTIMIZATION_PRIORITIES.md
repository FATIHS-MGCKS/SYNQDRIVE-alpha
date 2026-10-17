# EXP021 P22E — Optimization Priorities (pre-P23)

| Rank | Item | Category | Δ numeric (s) | False-halt risk | P23? |
|------|------|----------|---------------|-----------------|------|
| 1 | Independent RD003 / new Tesla capture with UTC + video sync | NOT_SOLVABLE_FROM_CURRENT_PIN | 0 | LOW if UTC+video independent | true |
| 2 | Document / enforce STATIONARY_BAND vs display-tacho semantics in UX & reports | SAFE_IMPROVEMENT | 0 | LOW | false |
| 3 | Leg-resynthesis numeric from PRESENT neighbors (Group B experiment) | RESEARCH_HYPOTHESIS | 0 | HIGH | false |
| 4 | Trip prefix denominator trim (101s before video) | DENOMINATOR_ONLY | 0 | MEDIUM (misleading KPI) | false |

## Safe improvements

- Reporting semantics for STATIONARY_BAND vs tacho display (no algorithm change).

## Research hypotheses

- Group-B leg resynthesis (explicitly blocked for 45s cohort).
- Richer slow-roll disambiguation using same geometry + video **offline only**.

## Not solvable from pin

- RD003 UTC + independent clips.
- Pre-video GPS gaps without earlier video.
- Ruptela-specific channels (not in Tesla DIMO software pin).
