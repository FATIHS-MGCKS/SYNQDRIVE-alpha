# KG-ATE Decision History

Canonical decision nodes: `graph/nodes.yaml` (`ATE-DEC-001` … `ATE-DEC-012`).  
Detail below follows governance: decision, rationale, alternatives, consequences, evidence, status.

---

## ATE-DEC-001 — Document fragmented enrichment / dual truth

| Field | Value |
|-------|-------|
| **Date** | 2026-04-10 |
| **Problem** | Trip enrichment fragmented across V1/V2 paths; dual truth risk |
| **Decision** | Audit and document pipeline; identify overlap before consolidation |
| **Rationale** | Cannot safely automate without understanding existing paths |
| **Alternatives** | Continue ad-hoc fixes (rejected — increased inconsistency) |
| **Consequences** | Foundation for orchestrator mandate (ATE-DEC-011) |
| **Evidence** | ATE-EV-0030 |
| **Status** | VALIDATED |

---

## ATE-DEC-002 — LTE_R1 canonical events query (422 fix)

| Field | Value |
|-------|-------|
| **Date** | 2026-04 (approx.) |
| **Problem** | GraphQL 422 on invalid safetySystem signal queries |
| **Decision** | Use `events(behavior.*)` canonical query path |
| **Rationale** | Provider rejects malformed signal lists |
| **Alternatives** | Broader signal fan-out (rejected — 422 failures) |
| **Consequences** | Reliable LTE_R1 native event ingestion |
| **Evidence** | ATE-EV-0007 |
| **Status** | PRODUCTION_VALIDATED |

---

## ATE-DEC-003 — LTE_R1 assessability: native primary, HF abuse secondary

| Field | Value |
|-------|-------|
| **Date** | 2026-07-05 |
| **Problem** | LTE_R1 HF skip blocked entire trip analysis |
| **Decision** | Native events primary; HF abuse path secondary |
| **Rationale** | LTE hardware may lack dense HF stream but has native events |
| **Alternatives** | Require HF for all hardware (rejected for LTE_R1) |
| **Consequences** | `LteR1BehaviorEnrichmentService` dual-path architecture |
| **Evidence** | ATE-EV-0007, `architecture/TRIP_ANALYSIS_ASSESSABILITY_2026-07-05.md` |
| **Status** | VALIDATED |

---

## ATE-DEC-004 — DI V2 normative contract; orchestrator remains behavior write path

| Field | Value |
|-------|-------|
| **Date** | 2026-07-16 |
| **Problem** | Driving truth fragmentation between V1 counters and V2 runs |
| **Decision** | V2 durable runs via post-finalize producer; behavior queue retained |
| **Rationale** | Parallel migration — V2 not yet full replacement for behavior enrichment |
| **Alternatives** | Immediate cutover to V2-only (not implemented) |
| **Consequences** | Two parallel tracks until ATE-OQ-001 resolved |
| **Evidence** | ATE-EV-0004 |
| **Status** | VALIDATED |

---

## ATE-DEC-005 — Auto post-finalize primary; UI fallback documented

| Field | Value |
|-------|-------|
| **Date** | 2026-08 |
| **Problem** | Fleet trips appeared unenriched until user opened trip detail |
| **Decision** | `processFinalize` → `enqueueBehaviorEnrichment` is primary path |
| **Rationale** | Multi-tenant fleet ops cannot depend on UI clicks |
| **Alternatives** | Keep click-only enrichment (rejected) |
| **Consequences** | `useTripBehaviorEvents` remains fallback for null-status backlog |
| **Evidence** | ATE-EV-0031, ATE-EV-0025, ATE-EV-0003 |
| **Status** | PRODUCTION_VALIDATED |

---

## ATE-DEC-006 — Coverage-aware overlap + deterministic repair IDs

| Field | Value |
|-------|-------|
| **Date** | 2026-08-28 |
| **Problem** | Reconciliation repair duplicate flooding |
| **Decision** | Coverage-aware overlap detection + deterministic `TripRepair` IDs |
| **Rationale** | Idempotent repairs safe under retry and multi-tier reconcile |
| **Alternatives** | Unbounded repair inserts (rejected) |
| **Consequences** | Safer repair → enrichment chain |
| **Evidence** | ATE-EV-0010, `architecture/TRIP_COVERAGE_AWARE_OVERLAP_2026-08-28.md` |
| **Status** | VALIDATED |

---

## ATE-DEC-007 — Global DIMO provider budget (P1.3)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-29 |
| **Problem** | Unbounded DIMO concurrency under fleet growth |
| **Decision** | Global Redis lease semaphore + gateway admission |
| **Rationale** | Protect provider and platform stability |
| **Alternatives** | Per-worker unbounded fetch (rejected at scale) |
| **Consequences** | ATE references budget via `runWithDimoRequestContext`; algorithm owned by Scaling Process |
| **Evidence** | ATE-EV-0022 |
| **Status** | PRODUCTION_VALIDATED |

---

## ATE-DEC-008 — Scheduler leader election (P1.7)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-30 |
| **Problem** | Multi-replica duplicate scheduler ticks |
| **Decision** | `SchedulerLeaderGuardService.shouldRun(name)` gates schedulers |
| **Rationale** | Only one replica should run interval/cron work per scheduler name |
| **Alternatives** | Accept duplicate ticks (rejected for reconciliation) |
| **Consequences** | Trip reconciliation, dimo snapshot, recovery schedulers leader-gated |
| **Evidence** | ATE-EV-0016, ATE-EV-0021 |
| **Status** | VALIDATED |

---

## ATE-DEC-009 — Per-vehicle reconciliation execution mutex (P1.4)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-30 |
| **Problem** | Overlapping reconciliation on same vehicle |
| **Decision** | `ReconciliationExecutionMutexService` per vehicleId scope |
| **Rationale** | Prevent concurrent repair mutations |
| **Alternatives** | Optimistic-only DB guards (insufficient alone) |
| **Consequences** | Skip on contention; no trip deletion |
| **Evidence** | ATE-EV-0017 |
| **Status** | VALIDATED |

---

## ATE-DEC-010 — Scale-to-2 GO_WITH_CONDITIONS; single-replica soak first

| Field | Value |
|-------|-------|
| **Date** | 2026-08-30 |
| **Problem** | Scale-to-2 blocked without production validation |
| **Decision** | Deploy single replica; 24h soak gate before scale-to-2 |
| **Rationale** | Validate leader + mutex + budget under real traffic first |
| **Alternatives** | Immediate 2-replica deploy (deferred) |
| **Consequences** | Active gate ATE-OQ-007 |
| **Evidence** | ATE-EV-0032 |
| **Status** | EXPERIMENTAL (gate active) |

---

## ATE-DEC-011 — Single canonical orchestrator

| Field | Value |
|-------|-------|
| **Date** | INFERRED from code comments (no single PR date) |
| **Problem** | Multiple half-paths for enrichment (processor vs manual vs repair) |
| **Decision** | All paths through `TripEnrichmentOrchestratorService` |
| **Rationale** | Consistent status tracking, idempotency, logging, downstream chaining |
| **Alternatives** | Separate manual sync implementation (rejected — exists only via same `runEnrichmentSync`) |
| **Consequences** | Mandatory entry for enqueue + sync |
| **Evidence** | ATE-EV-0001 |
| **Status** | PRODUCTION_VALIDATED |

---

## ATE-DEC-012 — Prometheus gauge rename hotfix

| Field | Value |
|-------|-------|
| **Date** | 2026-08-30 |
| **Problem** | Deploy crash: duplicate metric `synqdrive_dimo_provider_cooldown_active` |
| **Decision** | Rename budget gauge to `synqdrive_dimo_global_budget_cooldown_active` |
| **Rationale** | NestJS/Prometheus registration collision prevented app bind |
| **Alternatives** | Disable one metric (rejected — both needed) |
| **Consequences** | Successful P1.3-S6 deploy after rollback + hotfix |
| **Evidence** | ATE-EV-0033 (commit `3874360e0`) |
| **Status** | PRODUCTION_VALIDATED |

---

## ATE-DEC-013 — Energy Event Detection separated from ATE (boundary)

| Field | Value |
|-------|-------|
| **Date** | 2026-08–2026-09 (evolved) |
| **Problem** | Energy semantics mixed with trip enrichment concerns |
| **Decision** | EED owns detect + persist + semantic fields; ATE only MAY_TRIGGER |
| **Rationale** | REFUEL/RECHARGE semantics require independent evolution (P1.3-S5) |
| **Alternatives** | Inline energy logic in orchestrator (rejected) |
| **Consequences** | Step 5 in reconcileWindow; cross-graph contract in `governance/AUTHORITY_BOUNDARIES.md` |
| **Evidence** | ATE-EV-0011, ATE-EV-0034 |
| **Status** | VALIDATED |

---

## ATE-DEC-014 — Driving Intelligence remains separate authority

| Field | Value |
|-------|-------|
| **Date** | 2026-07-16+ |
| **Problem** | Risk of ATE redefining scoring when enqueueing driving-impact |
| **Decision** | ATE enqueues jobs; DI owns models, assessability, TDI rules |
| **Rationale** | Separation of orchestration vs intelligence semantics |
| **Alternatives** | Merge scoring into orchestrator (rejected) |
| **Consequences** | Parallel V2 init + behavior queue + driving-impact processor |
| **Evidence** | ATE-EV-0004, ATE-EV-0015, ATE-EV-0019 |
| **Status** | VALIDATED |
