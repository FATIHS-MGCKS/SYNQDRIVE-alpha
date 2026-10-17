# LDI-10D Phase 3C.2 — Seven-algorithm comparison (Tesla GPS fixture)

Witness: video tacho on synchronized 1 s bucket labels. **Not** OBD ground truth.

| Algorithm | Trusted-pair n | MAE | P95 | Bias | Numeric coverage |
| --- | --- | --- | --- | --- | --- |
| L3_BASELINE_PRODUCTION | 748 | 2.3031 | 4.4830 | -2.0676 | 72.36% |
| L3_REPLAY_FROM_PINNED_POSITIONS | 748 | 2.3031 | 4.4830 | -2.0676 | 72.36% |
| ADAPTIVE_DT_LEG_MEAN | 748 | 2.3031 | 4.4830 | -2.0676 | 72.36% |
| MEDIAN_LEG_3S | 748 | 3.0560 | 6.1242 | -3.0482 | 72.36% |
| CAUSAL_EMA_LEGS | 748 | 3.7664 | 9.4801 | -2.1251 | 72.36% |
| MOTION_GATE_DISPLACEMENT | 748 | 2.3031 | 4.4830 | -2.0676 | 72.27% |
| NONCAUSAL_OFFLINE_CENTERED_MEAN | 748 | 2.9220 | 6.5428 | -1.9921 | 72.36% |

**Best on trusted tacho pairs:** `L3_BASELINE_PRODUCTION` · improvement proven: **NO**
