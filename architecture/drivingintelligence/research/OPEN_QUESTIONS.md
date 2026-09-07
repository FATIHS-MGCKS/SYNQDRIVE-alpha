# Driving Intelligence — Open Questions

Explicit **UNKNOWN** items. Absence of an answer here is not a documentation failure.

## HF acquisition and cadence

| ID | Question | Why it matters |
|----|----------|----------------|
| DI-OQ-HF-001 | What is fleet-wide DIMO HF request cost at current enrichment rate? | Scalability planning |
| DI-OQ-HF-002 | Does 30s block polling preserve bucket density on all vehicle types? | **Partial data** — EXP-019 N=1; settlement replay shows max gap 117s **persisted**; **video GT: gap interiors empty at all cadences incl. 10s**; **not validated** |
| DI-OQ-HF-003 | Does ascending 10→60 phase order confound cadence vs route/time? | EXP-019 used ascending order; video GT confirms dynamics inside gaps regardless of cadence | **OPEN** — counterbalanced 60→10 recommended |
| DI-OQ-HF-004 | Can native DIMO events backfill HF gap interiors on KS MX 2024? | EXP-019 event register: 1 native event in session; **0/5** in GT windows | **OPEN** — multi-authority capture proposed |
| DI-OQ-HF-005 | Can boundary-only HF speeds reconstruct video-confirmed trajectories? | EXP-019: start/end sometimes align; interior always void; end often mismatches (e.g. GT-20 111 vs 36) | **OPEN** |
| DI-OQ-HF-006 | Does gap-conditioned HF void generalize to non-gap control windows? | EXP-019 bias-control: **CLEAR_DIFFERENCE** (5/5 gap NONE vs 0/8 control NONE); N=1 ascending drive | **PARTIALLY_ANSWERED** — counterbalanced EXP-020 required |
| DI-OQ-HF-003 | Optimal settlement delay and recovery overlap for production? | Currently 8s/6s provisional |
| DI-OQ-HF-004 | Cross-provider cadence variance beyond LTE_R1 reference drives? | Generalization risk |

## V2 pipeline

| ID | Question | Why it matters |
|----|----------|----------------|
| DI-OQ-V2-001 | Production SLO for stage completion latency? | Ops readiness |
| DI-OQ-V2-002 | Cutover criteria from legacy to V2-only path? | Migration planning |
| DI-OQ-V2-003 | Shadow detector false-positive rate in production? | Misuse case quality |

## Scoring and events

| ID | Question | Why it matters |
|----|----------|----------------|
| DI-OQ-SCORE-001 | Episode V2 score correlation with Impact V1 on same trips? | Cutover safety |
| DI-OQ-SCORE-002 | Should `DriverScoreService` be renamed? | Semantic clarity |
| DI-OQ-SCORE-003 | EV-specific stress dimension weights validated? | Powertrain parity |

## Persistence and replay

| ID | Question | Why it matters |
|----|----------|----------------|
| DI-OQ-PERSIST-001 | Should raw HF be persisted for replay? | Re-enrichment without DIMO re-fetch |
| DI-OQ-PERSIST-002 | ClickHouse mirror coverage in production? | Depends on HF_MIRROR_ENABLED deployment |

## Multi-tenancy and security

| ID | Question | Why it matters |
|----|----------|----------------|
| DI-OQ-SEC-001 | Full audit of nullable organizationId on legacy DI tables? | Tenant isolation proof |
| DI-OQ-SEC-002 | Worker job payload org scoping under all handlers? | Cross-tenant safety |

## Production validation

| ID | Question | Why it matters |
|----|----------|----------------|
| DI-OQ-PROD-001 | Has V2 full DAG run on production fleet with master flag on? | E2E proof |
| DI-OQ-PROD-002 | Live HF calibration operator runbook finalized? | C.1c–e execution |
| DI-OQ-PROD-003 | Reconciliation scheduler leader election enabled in prod? | Duplicate sweep risk |
