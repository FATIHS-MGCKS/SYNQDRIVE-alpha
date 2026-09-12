# Vehicle & Device Connectivity — Open Questions

Phase 3 triage: [../reconciliation/PHASE3_RECONCILIATION.md](../reconciliation/PHASE3_RECONCILIATION.md) §5.  
**Do not delete answered questions** — append triage and consequence.

| ID | Question | Phase | Epistemic | Triage | Answer / evidence | Decision consequence | Follow-up owner |
|----|----------|-------|-----------|--------|-------------------|----------------------|-----------------|
| **VDC-Q-001** | Production distribution of post-trip LTE_R1 `source_timestamp` gaps? | 2 | PRODUCTION_OBSERVATION | **PARTIALLY_ANSWERED** | KS MX 2024: 86,563–86,581 s (n=3) | LTE_R1 profile observation; not fleet invariant | VDC analytics |
| **VDC-Q-002** | IO174 visible in Production raw payload archive? | 2 | PRODUCTION_OBSERVATION | **ANSWERED** | Not in signalsLatest/webhook surfaces | VDC-GAP-005 partial resolution | VDC |
| **VDC-Q-003** | False-positive rate standby vs offline at 24h/48h? | 2 | PRODUCTION_OBSERVATION | **PARTIALLY_ANSWERED** | 163–181 s potential windows; runtime evaluation not proven | VDC-DEC-005; GT required for rate | VDC + GT |
| **VDC-Q-004** | Polls without source advance over 72h stationary? | 2 | PRODUCTION_OBSERVATION | **ANSWERED** | ~99.7% (1027/1030) | Supports VDC-DEC-002 | VDC |
| **VDC-Q-005** | Move alert policy to VDC-neutral path? | 3 | INFERRED | **PROPOSED** (via VDC-DEC-009) | Ownership split policy/delivery | VDC-RB-006 | VDC/DIMO |
| **VDC-Q-006** | HM vehicles canonical `connectivityRuntime`? | 3 | UNKNOWN | **DEFERRED** | HM not in runtime (GAP-009) | VDC-RB-015 | HM Integration |
| **VDC-Q-007** | Operational list full timestamp evidence? | 3 | CONFIRMED gap | **OPEN** | GAP-010 unresolved | VDC-RB-009 | Master Admin |
| **VDC-Q-008** | Retention for episodes/webhook inbox? | 3 | UNKNOWN | **OPEN** | GAP-011 design gap | VDC-RB-016 | Platform ops |
| **VDC-Q-009** | CX-010 side effects beyond CH dedupe? | 2 | PRODUCTION_OBSERVATION | **PARTIALLY_ANSWERED** | High churn; no Sep episode errors | VDC-DEC-002 | VDC |
| **VDC-Q-010** | CH duplicate rate at equal `recorded_at`? | 2 | PRODUCTION_OBSERVATION | **PARTIALLY_ANSWERED** | Up to 11,293 rows observed | VDC-RB-017 | VDC/CH |
| **VDC-Q-011** | LTE_R1 jitter and false SOFT_OFFLINE? | 2 | PRODUCTION_OBSERVATION | **PARTIALLY_ANSWERED** | Window geometry; 0 SNAPSHOT in windows; runtime eval not proven | VDC-DEC-005; GT | VDC + GT |
| **VDC-Q-012** | CH duplicate root cause? | 2 | UNKNOWN | **OPEN** | Causality to CX-010 not proven | VDC-RB-017 | VDC |
| **VDC-Q-013** | Aug 2026 enqueue_failed + ~100 min delay? | 2 | PARTIAL | **PARTIALLY_ANSWERED** | 4.7s delivery confirmed; delay confirmed; actor unknown | VDC-DEC-006 | VDC/ops |
| **VDC-Q-014** | Safe adaptive polling/backoff intervals per provider/device profile preserving trip-start, disconnect, recovery latency? | 3 | UNKNOWN | **OPEN** | VDC-DEC-011 principle only; LTE_R1 n=1 ~24h source advance — **do not** hardcode 24h poll | VDC-RB-018; GT-R1 + fleet evidence | VDC |
