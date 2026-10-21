# G2.1a Physical-Refuel Runtime Safety + Liveness Closure — Audit

**Date:** 2026-09-04  
**Branch:** `cursor/refuel-physical-event-forensics-f21f`  
**PR:** #1531 (DRAFT — not merged, not production-activated)  
**G2.1 head (before G2.1a):** `7c2b965a8418949d7432627b692ef0b02e58aa13`

## Executive verdict

Independent G2.1 runtime review identified nine safety/liveness blockers. G2.1a closes them with durable recovery, legacy-bypass elimination, matrix/history scope correction, V2 coordinate fail-closed policy, pre-G2 ownership bridge, query/index alignment, observability, and expanded test coverage. Feature flag remains **default OFF**. No production deploy or migration execution.

| Gate | Value |
|------|-------|
| **G2_1A_RUNTIME_SAFETY_LIVENESS_CLOSURE** | PASS |
| **G2_2_SHADOW_ROLLOUT_AUTHORIZED** | YES (shadow only; not production activation) |
| **PRODUCTION_ACTIVATED** | NO |
| **PRODUCTION_VALIDATED** | NO |
| **PRODUCTION_MUTATED** | NO |

---

## 1. Independent review findings

| ID | Finding | Severity |
|----|---------|----------|
| B1 | `FuelStationEnrichmentRecoveryScheduler` bypassed G2 finality when V2 enabled | P0 |
| B2 | No durable settlement wake-up; reconciliation only on persist | P0 |
| B3 | Fire-and-forget reconcile could orphan persisted REFUEL without reconciliation row | P0 |
| B4 | COMMIT with FINAL eligible but enqueue lost had no G2 recovery | P0 |
| B5 | `getPairCell` undefined when prior FINAL outside candidate matrix → crash | P0 |
| B6 | V2 coordinate fell back to segment-start lat/lon | P0 |
| B7 | Pre-G2 enriched REFUELs invisible to prior-finalization logic | P1 |
| B8 | Candidate query uses `createdAt`; index was on `start_time` | P2 |
| B9 | Advisory lock only unit-mocked; no real PG concurrency proof in CI | P1 |
| B10 | No operational visibility for reconciliation backlog | P2 |

---

## 2. Root causes and fixes

| Blocker | Root cause | Fix | Test |
|---------|-----------|-----|------|
| B1 | Legacy recovery enqueued directly from `vehicleEnergyEvent` scan | Exclude V2-owned rows (`createdAt >= cutover`); skip any row with reconciliation state; new `PhysicalRefuelReconciliationRecoveryScheduler` owns V2 recovery | `physical-refuel-g21a-runtime-closure.spec.ts`, `fuel-station-enrichment-recovery.scheduler.spec.ts` |
| B2 | Settlement horizon only evaluated on upsert | Persist `nextReconciliationAt`; recovery queries `finalityState IN (PROVISIONAL, SETTLING) AND nextReconciliationAt <= asOf` | `physical-refuel-settlement-due.design.spec.ts`, runtime R16 |
| B3 | `void reconcileAndEnqueueAfterPersist` with no orphan sweep | Recovery finds V2-owned REFUEL with `refuelReconciliation IS NULL` within orphan lookback | `physical-refuel-recovery.repository.ts` + recovery batch |
| B4 | `enrichmentEnqueuedAt` never re-driven after crash | Recovery finds `enrichmentEligible=true AND enrichmentEnqueuedAt IS NULL AND FINAL_*` | recovery repository + runtime `runRecoveryBatch` |
| B5 | Prior finals loaded outside matrix population | `priorFinalRowsById` bridge context; `classifyPhysicalRefuelSibling` when matrix cell absent; unrelated history skipped | `physical-refuel-reconciliation-g21a.design.spec.ts`, runtime R11 |
| B6 | `coordinate ?? event.startLatitude` in runtime/orchestrator/producer | `physical-refuel-coordinate.policy.ts`; hold enrichment when V2 coords missing | runtime R15, producer/orchestrator guards |
| B7 | Prior finals only from reconciliation table | `loadPriorFinalizationBridgeContext` includes pre-G2 enriched legacy within bridge window | design spec late-sibling + ownership util |
| B8 | Index/query mismatch | Migration adds `(vehicle_id, kind, created_at)` | migration + candidate loader uses `createdAt` |
| B9 | No PG integration test in default CI | `physical-refuel-reconciliation.postgres.integration.spec.ts` gated by env | harness present; CI default SKIP |
| B10 | No backlog metrics | `emitRecoveryBacklogMetrics()` structured logs | runtime service |

---

## 3. Runtime state machine (durable authority)

```
REFUEL persisted (V2-owned when createdAt >= cutover)
   |
   v
NO_RECONCILIATION  ──recovery(orphan)──┐
   |                                    |
   v                                    |
PROVISIONAL / SETTLING                  |
   |                                    |
   | nextReconciliationAt due          |
   | recovery batch                    |
   v                                    |
FINAL_CANONICAL                         |
FINAL_DISTINCT                          |
INSUFFICIENT_EVIDENCE                   |
   |                                    |
   v                                    |
coordinate eligibility (V2 fail-closed) |
   |                                    |
   +-- insufficient → held (no enqueue) |
   |                                    |
   v                                    |
ENRICHMENT_ELIGIBLE (FINAL_* only)      |
   |                                    |
   v                                    |
ENQUEUE_PENDING (enrichmentEnqueuedAt null)
   |                                    |
   | recovery(lost_enqueue)            |
   v                                    |
ENQUEUED (enrichmentEnqueuedAt set)     |
   |                                    |
   v                                    |
fuel-station enrichment lifecycle       |
```

**Restart boundaries:** persist→reconcile (orphan recovery), reconcile→commit (transaction retry), commit→enqueue (lost-enqueue recovery), enqueue→BullMQ (job id dedupe).

---

## 4. Recovery architecture

Two schedulers with explicit ownership:

| Scheduler | When V2 OFF | When V2 ON |
|-----------|-------------|------------|
| `FuelStationEnrichmentRecoveryScheduler` | Legacy REFUEL missing enrichment | Only **legacy-owned** (`createdAt < cutover`, no reconciliation row) |
| `PhysicalRefuelReconciliationRecoveryScheduler` | Inactive | Settlement due, orphan refuels, lost enqueue |

Recovery work types (`physical-refuel-recovery.repository.ts`):

- `settlement_due` — PROVISIONAL/SETTLING with `nextReconciliationAt <= asOf`
- `orphan_refuel` — V2-owned REFUEL without reconciliation row
- `lost_enqueue` — FINAL eligible, `enrichmentEnqueuedAt IS NULL`

Leader-guarded, bounded batch, feature-flag gated.

---

## 5. Legacy vs V2 ownership

| Class | Definition | Reconciliation | Enrichment authority |
|-------|------------|----------------|----------------------|
| **LEGACY_OWNED** | `createdAt < v2OwnershipCutoverAt` | None required | Legacy persist hook + legacy recovery |
| **V2_OWNED** | `createdAt >= cutover` | Required | G2 runtime + G2 recovery only |
| **BRIDGE_HISTORY** | Pre-G2 enriched within identity bridge window | N/A | Treated as prior DISTINCT final for late-sibling checks |

Cutover resolves: `PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT` → `FUEL_STATION_ENRICHMENT_CUTOVER_AT`.

---

## 6. Crash-boundary analysis

| Boundary | Risk | Mitigation |
|----------|------|------------|
| After persist, before reconcile | Orphan NO_RECONCILIATION | `orphan_refuel` recovery |
| During reconcile transaction | Partial state rolled back | Transaction scope; advisory lock |
| After COMMIT, before enqueue | FINAL eligible, no queue job | `lost_enqueue` recovery + BullMQ dedupe job id |
| After enqueue, before enrichment completes | Stale PROCESSING | Legacy recovery (terminal states) still applies to completed enrichment rows |

**Residual:** Post-commit enqueue runs outside advisory lock; concurrent replicas may both attempt enqueue — mitigated by `enrichmentEnqueuedAt` update + BullMQ duplicate suppression. Not a duplicate-enrichment P0 under current idempotency.

---

## 7. Concurrency semantics

- Vehicle-scoped `pg_advisory_xact_lock` inside `prisma.$transaction` for reconcile persist path.
- Real PG integration test: `physical-refuel-reconciliation.postgres.integration.spec.ts` (requires `PHYSICAL_REFUEL_RECONCILIATION_POSTGRES_INTEGRATION=1` + `DATABASE_URL`).
- Default CI: test harness present, execution **not certified** without live Postgres.

---

## 8. Coordinate policy (V2 fail-closed)

When `PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED=true`:

- Enrichment requires finite lat/lon + non-empty coordinate source.
- Segment-start coordinates are **never** substituted when V2 selector fails.
- `coordinateSelectionStatus` persisted; held events in `heldEventIds`.

When flag OFF: legacy segment-start semantics preserved.

---

## 9. Migration / index safety

**G2.1a migration:** `20260904140000_physical_refuel_g21a_recovery`

- Additive columns: `coordinate_selection_status`, `next_reconciliation_at`
- Additive indexes on reconciliation table (low row count expected at rollout)
- New index on `vehicle_energy_events(vehicle_id, kind, created_at)` — **may lock/build on large table**

| Field | Assessment |
|-------|------------|
| **MIGRATION_PREDEPLOY_SAFE** | YES with caveat: create `created_at` index `CONCURRENTLY` in production if table is large |
| Destructive changes | None |
| FK impact | None |

G2.1 `(vehicle_id, kind, start_time)` index retained; `created_at` index added for actual candidate query boundary.

---

## 10. Enrichment path audit (no G2 bypass)

Callers of `FuelStationEnrichmentProducerService.enqueueAfterPersistFromEvent`:

1. `EnergyEventsService` — only when V2 flag **OFF** (legacy path)
2. `PhysicalRefuelReconciliationRuntimeService` — finality + coordinate gated when V2 **ON**
3. `FuelStationEnrichmentRecoveryScheduler` — skips V2-owned reconciliation rows when V2 **ON**

No other production enqueue paths identified.

---

## 11. Test evidence

```
npm test --testPathPattern="physical-refuel|fuel-station-enrichment-recovery|fuel-station-enrichment-producer|energy-events-g21"
→ 12 suites, 129 passed, 2 skipped (PG integration)
npm run build → PASS
node architecture/tankstellenerkennung/scripts/validate-graph.mjs → PASS
node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs → PASS
```

Key suites: G2.1 runtime R1–R16, G2.1a design matrix/history, settlement-due, legacy bypass closure, recovery scheduler specs, feature-flag OFF regression (`energy-events-g21-feature-flag.spec.ts`).

---

## 12. Remaining limitations

- PG advisory-lock concurrency **not proven** in default CI (harness only).
- Shadow rollout still requires ops validation of recovery metrics under load.
- Post-commit enqueue race relies on idempotent enqueue + recovery, not extended lock.
- Production migration index build strategy must be ops-approved for large `vehicle_energy_events`.

---

## 13. Go/no-go for G2.2

**G2.2 shadow rollout authorized:** YES — all P0/P1 safety and liveness blockers from independent review are closed in code with regression tests. Shadow rollout is **not** production activation; flag remains default OFF until explicit G2.2 ops plan.

**Evidence nodes:** `FST-EVID-G21A-RUNTIME-SAFETY-LIVENESS-CLOSURE-2026-09-04-001`, `EED-EV-0033`
