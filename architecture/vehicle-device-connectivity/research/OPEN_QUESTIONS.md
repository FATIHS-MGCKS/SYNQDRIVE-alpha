# Vehicle & Device Connectivity — Open Questions

| ID | Question | Phase | Epistemic |
|----|----------|-------|-----------|
| **VDC-Q-001** | What is the Production distribution of post-trip LTE_R1 `source_timestamp` gaps? | 2 | UNKNOWN |
| **VDC-Q-002** | Is IO174 visible in any Production raw payload archive? | 2 | UNKNOWN |
| **VDC-Q-003** | What is the false-positive rate for standby vs offline at 24h/48h boundaries? | 2 | UNKNOWN |
| **VDC-Q-004** | How often do successful polls occur without `source_timestamp` advance over 72h stationary? | 2 | UNKNOWN |
| **VDC-Q-005** | Should connectivity alert policy move to VDC-neutral path (VDC-CX-001 resolution)? | 3 | INFERRED |
| **VDC-Q-006** | How should HM vehicles receive canonical `connectivityRuntime` (VDC-GAP-009)? | 3 | UNKNOWN |
| **VDC-Q-007** | Should operational master-admin list use full timestamp evidence (VDC-GAP-010)? | 3 | CONFIRMED gap |
| **VDC-Q-008** | What retention policy applies to device_connection_episodes and webhook inbox? | 3 | UNKNOWN |
| **VDC-Q-009** | Does equal `sourceTimestamp` replay (**VDC-CX-010**) cause duplicate VLS/episode/trip side effects beyond ClickHouse `skipped_duplicate`? | 2 | INFERRED |
| **VDC-Q-010** | Multi-replica ClickHouse duplicate insert rate at equal `recorded_at`? | 2 | UNKNOWN |
| **VDC-Q-011** | What is the normal stationary LTE_R1 periodic-source-update jitter around 86,400 seconds, and does the current 24 h standby boundary (`standby` < 24 h; `signal_delayed` ≥ 24 h and < 48 h) produce transient false `SOFT_OFFLINE` / `signal_delayed` classifications for healthy devices? | 2 | UNKNOWN |
