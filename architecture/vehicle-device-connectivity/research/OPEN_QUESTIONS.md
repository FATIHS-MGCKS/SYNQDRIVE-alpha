# Vehicle & Device Connectivity — Open Questions

| ID | Question | Phase | Epistemic | Phase 2 status |
|----|----------|-------|-----------|----------------|
| **VDC-Q-001** | What is the Production distribution of post-trip LTE_R1 `source_timestamp` gaps? | 2 | PRODUCTION_OBSERVATION | **Partially answered** — KS MX 2024: 86,563–86,581 s (n=3). Fleet distribution still open. |
| **VDC-Q-002** | Is IO174 visible in any Production raw payload archive? | 2 | PRODUCTION_OBSERVATION | **Not found** in signalsLatest/webhook surfaces — IO174_NOT_EXPOSED_BY_CURRENT_INGEST |
| **VDC-Q-003** | What is the false-positive rate for standby vs offline at 24h/48h boundaries? | 2 | PRODUCTION_OBSERVATION | **Partial (KS MX 2024)** — potential classification window quantified at 163–181 s per ~24 h cycle; actual runtime evaluation / false-positive rate requires execution evidence (see VDC-Q-011) |
| **VDC-Q-004** | How often do successful polls occur without `source_timestamp` advance over 72h stationary? | 2 | PRODUCTION_OBSERVATION | **Answered** — ~99.7% (1027/1030) in 3.75 d window |
| **VDC-Q-005** | Should connectivity alert policy move to VDC-neutral path (VDC-CX-001 resolution)? | 3 | INFERRED | Open |
| **VDC-Q-006** | How should HM vehicles receive canonical `connectivityRuntime` (VDC-GAP-009)? | 3 | UNKNOWN | Open |
| **VDC-Q-007** | Should operational master-admin list use full timestamp evidence (VDC-GAP-010)? | 3 | CONFIRMED gap | Open |
| **VDC-Q-008** | What retention policy applies to device_connection_episodes and webhook inbox? | 3 | UNKNOWN | Open |
| **VDC-Q-009** | Does equal `sourceTimestamp` replay (**VDC-CX-010**) cause duplicate VLS/episode/trip side effects beyond ClickHouse `skipped_duplicate`? | 2 | PRODUCTION_OBSERVATION | **Partial** — high churn MATERIAL; no erroneous Sep episodes |
| **VDC-Q-010** | Multi-replica ClickHouse duplicate insert rate at equal `recorded_at`? | 2 | PRODUCTION_OBSERVATION | **Observed** — up to 11,293 duplicate rows at one timestamp (historical) |
| **VDC-Q-011** | LTE_R1 jitter around 86,400 s and false `signal_delayed` / SOFT_OFFLINE? | 2 | PRODUCTION_OBSERVATION | **Answered (window geometry)** — +163 to +181 s **potential** windows quantified; Sep cycles: 0 SNAPSHOT jobs in exact windows, 0 persisted alerts, **RUNTIME_EVALUATION_NOT_PROVEN** for projection/alert sync |
| **VDC-Q-012** | What causes historical ClickHouse duplicate `recorded_at` rows at equal source timestamps? | 2 | UNKNOWN | **Open** — duplicates CONFIRMED; causal link to VDC-CX-010 equality upserts, multi-replica race, or replay **not proven** |
| **VDC-Q-013** | What caused Aug 2026 KS MX 2024 device-connection inbox `enqueue_failed` and ~100 min canonicalization delay? | 2 | PARTIAL | **Partial** — `enqueue_failed` + ~100.5 min delay **confirmed**; later processing at 22:22:30Z **consistent with** scheduler retry path (CODE/repo note); scheduler as actor and full root cause (worker/deploy/replay) **not proven** from retained execution logs |
