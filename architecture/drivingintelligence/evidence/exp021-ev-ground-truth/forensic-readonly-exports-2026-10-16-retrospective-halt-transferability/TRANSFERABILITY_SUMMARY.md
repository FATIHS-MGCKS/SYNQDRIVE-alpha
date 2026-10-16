# EXP021 v0_2 transferability summary

Detector: **EXP021_RETROSPECTIVE_HALT_PROTOTYPE_V0_2** (frozen, no recalibration).

| Trip | Integration | Video GT | Gaps ≥3s | LIKELY_HALT | NOT_DIST | Present % | Notes |
|------|-------------|----------|----------|-------------|----------|-----------|-------|
| `358d0158…` | TESLA_SOFTWARE_DIMO | partial (Tesla ref) | 10 | 6 | 3 | 76% | MANY_LIKELY_HALT_GAPS — inspect for stop-and-go or uplink pattern. |
| `f502a4a0…` | RUPTELA_LTE_R1 | none | 1 | 0 | 1 | 100% | ROBUSTNESS_ONLY_NO_INDEPENDENT_VIDEO — no hit-rate claim. |
| `24deb8af…` | RUPTELA_LTE_R1 | none | 3 | 2 | 1 | 52% | ROBUSTNESS_ONLY_NO_INDEPENDENT_VIDEO — no hit-rate claim. |
| `0effed9d…` | TESLA_SOFTWARE_DIMO | none | 3 | 2 | 1 | 72% | ROBUSTNESS_ONLY_NO_INDEPENDENT_VIDEO — no hit-rate claim. |
| `3815920e…` | RUPTELA_LTE_R1 | none | 7 | 2 | 4 | 62% | ROBUSTNESS_ONLY_NO_INDEPENDENT_VIDEO — no hit-rate claim. |
| `08f2e58c…` | RUPTELA_LTE_R1 | none | 5 | 2 | 3 | 91% | ROBUSTNESS_ONLY_NO_INDEPENDENT_VIDEO — no hit-rate claim. |
| `be07d73f…` | RUPTELA_LTE_R1 | none | 6 | 4 | 1 | 67% | ROBUSTNESS_ONLY_NO_INDEPENDENT_VIDEO — no hit-rate claim. |
| `533b2bf8…` | RUPTELA_LTE_R1 | none | 23 | 14 | 9 | 37% | ROBUSTNESS_ONLY_NO_INDEPENDENT_VIDEO — no hit-rate claim. |
| `c26d3c13…` | RUPTELA_LTE_R1 | none | 8 | 4 | 4 | 44% | ROBUSTNESS_ONLY_NO_INDEPENDENT_VIDEO — no hit-rate claim. |
| `c65e7b49…` | RUPTELA_LTE_R1 | none | 1 | 0 | 1 | 32% | ROBUSTNESS_ONLY_NO_INDEPENDENT_VIDEO — no hit-rate claim. |
| `c069cc9b…` | TESLA_SOFTWARE_DIMO | none | 22 | 17 | 5 | 72% | ROBUSTNESS_ONLY_NO_INDEPENDENT_VIDEO — no hit-rate claim. |

## Missing independent validation cases (next video GT)

- Halt without traffic signal (Ampel).
- Slow roll-through without full halt.
- Stop-and-go cluster.
- Resume driving with position/data gap.
- Maneuver / return near same coordinates.