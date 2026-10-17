# LDI-10D Phase 3C — Algorithm comparison matrix

| Algorithm | Trip vs pinned L3 MAE (km/h) | Video vs tacho MAE | Video paired coverage | Causal | Key risks |
| --- | --- | --- | --- | --- | --- |
| L3_BASELINE_PRODUCTION | 0.0000 | 2.3031 | 65.85% | yes | — |
| L3_REPLAY_FROM_PINNED_POSITIONS | 0.0000 | NOT_ASSESSABLE | n/a | yes | — |
| ADAPTIVE_DT_LEG_MEAN | 0.0000 | NOT_ASSESSABLE | n/a | yes | — |
| MEDIAN_LEG_3S | 1.1254 | NOT_ASSESSABLE | n/a | yes | ASYMMETRIC_LEGS_BIAS |
| CAUSAL_EMA_LEGS | 1.7846 | NOT_ASSESSABLE | n/a | yes | LAG_UNDER_ACCELERATION |
| MOTION_GATE_DISPLACEMENT | 0.0000 | NOT_ASSESSABLE | n/a | yes | COVERAGE_LOSS_AT_CRAWL |
| NONCAUSAL_OFFLINE_CENTERED_MEAN | 1.3711 | NOT_ASSESSABLE | n/a | no | NONCAUSAL_OFFLINE_ONLY_NOT_FOR_PRODUCTION_STREAM |

**Best validated (video tacho witness, development+holdout pooled baseline only):** `L3_BASELINE_PRODUCTION`.
