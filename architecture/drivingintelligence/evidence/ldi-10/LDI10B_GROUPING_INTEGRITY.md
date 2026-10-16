# LDI10B — Grouping integrity

**Trip:** `f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9` · **Groups reproduced:** **32** (LDI-10A: match)

## Reproduction

- Candidates: **75**
- LDI08 snapshot SHA-256: `effe180fe128a6c9f5c5f74f52f34ddc0c7d6f9960825d55573b02ca5b2f7009`
- LDI10A audit SHA-256: `8e2ba39e562bf339bb59cbd8db8e15d3eeaa423b843b950f6685e5437d7a2e33`

## Size distribution (steps per group)

| Steps | Groups |
|-------|--------|
| 1 | 7 |
| 2 | 12 |
| 3 | 9 |
| 4 | 3 |
| 5 | 1 |

## Segmentation review

- **Oversegmentation:** single-step groups (`oversplitRisk` in JSON) — short Δv chains split by ±3 km/h gate.
- **Undersegmentation:** multi-step chains (4+ steps) — continuous accel/decel on 1 Hz L3 grid.
- **Sign changes:** not merged across kinds — accel and decel groups remain separate (no mixed-sign single group).
- **Pauses / gaps:** `gapToNextGridSecondMs` after group end; no interpolation across missing buckets.

## Sensitivity (not activated)

```json
{
  "note": "Parameters documented only — not applied to grouping or QC",
  "hypotheticalMergePauseMs": 2000,
  "hypotheticalMinStepsPerManeuver": 2,
  "effectIfActivated": "would_merge_some_single_step_groups_with_gap_lt_2s — not computed"
}
```

## Boundary impact (UNTRUSTED / ROW_ABSENT)

- UNTRUSTED buckets (trip): **52** — groups touching: **8**
- ROW_ABSENT GPS buckets: **16** — groups touching: **0**

Maneuver windows overlapping UNTRUSTED or ROW_ABSENT buckets reduce promotion-grade interpretability without invalidating kinematic delta arithmetic on L3 numeric steps