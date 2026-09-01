# KG-ATE Evidence Registry

Stable IDs: `ATE-EV-####`. Each item: source, path, what it proves, what it does NOT prove, maturity, last verified.

| ID | Class | Source | Path / locator | Proves | Does NOT prove | Maturity | Verified |
|----|-------|--------|----------------|--------|----------------|----------|----------|
| ATE-EV-0001 | CODE | Orchestrator | `trip-enrichment-orchestrator.service.ts` | Single canonical entry; status FSM | V2 supersede timeline | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0002 | ARCHITECTURE_DOC | Discovery | `discovery/AUTOMATIC_TRIP_ENRICHMENT_DISCOVERY_2026-09-01.md` | Initial hypothesis inventory | Current main behavior without re-verify | INFERRED | 2026-09-01 |
| ATE-EV-0003 | CODE | FSM finalize | `trip-detection-orchestration.service.ts` | Auto enqueue on finalize | All edge finalize paths in prod | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0004 | CODE | Post-finalize producer | `trip-post-finalize-analysis.producer.ts` | V2 init parallel; legacy queue comment | Full V2 replacement date | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0005 | CODE | Enqueue | `trip-enrichment-orchestrator.service.ts` | jobId dedup; terminal guards; revert on fail | Multi-replica queue race under all loads | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0006 | CODE | SMART5 path | `trip-behavior-enrichment.service.ts` | HF routing for SMART5 | Production HF availability per vehicle | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0007 | CODE | LTE_R1 path | `lte-r1-behavior-enrichment.service.ts` | Native + abuse dual path | All LTE firmware variants | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0008 | CODE | Route stage | `trip-enrichment-orchestrator.service.ts` | Route after behavior COMPLETED | Mapbox SLA | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0009 | CODE | Misuse trigger | `trip-enrichment-orchestrator.service.ts` | Misuse scheduled post-behavior | Misuse recovery completeness | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0010 | CODE | Reconciliation | `trip-reconciliation.service.ts` | Repair pipeline; decision engine | Zero trip loss under mutex skip | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0011 | CODE | Energy step 5 | `trip-reconciliation.service.ts` | MAY_TRIGGER detectEnergyEvents | REFUEL/RECHARGE semantics | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0012 | CODE | Coordinator | `trip-analysis-coordinator.service.ts` | Stage tracking independent of behavior status | UI display of all stages | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0013 | CODE | Processor | `trip-behavior-enrichment.processor.ts` | Worker delegates to orchestrator | Processor isolation under crash | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0014 | CODE | DIMO context | `trip-behavior-enrichment.processor.ts` | runWithDimoRequestContext wrap | Budget algorithm correctness | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0015 | CODE | Driving impact | `trip-enrichment-orchestrator.service.ts` | Enqueue after behavior | Scoring model accuracy | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0016 | CODE | Leader guard | `trip-reconciliation.scheduler.ts` + peers | Reconcile schedulers leader-gated | All schedulers in repo gated | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0017 | CODE | Mutex | `reconciliation-execution-mutex.service.ts` | Per-vehicle lock; skip on contention | Formal liveness proof | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0018 | CODE | Analysis recovery | `trip-analysis-recovery.scheduler.ts` | Stuck misuse recovery path | Recovery SLA | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0019 | CODE | DI reconcile | `driving-analysis-reconciliation.scheduler.ts` | Separate V2 reconciliation track | V2 job completion rates | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0020 | CODE | Tracking recovery | `trip-tracking-recovery.scheduler.ts` | FSM recovery leader-gated | Recovery coverage % | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0021 | CODE | Dimo snapshot | `dimo-snapshot.scheduler.ts` | dimo_snapshot_* leader-gated | Snapshot enrichment coupling | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0022 | ARCHITECTURE_DOC | Scaling Process | `scaling-process/DIMO_GLOBAL_PROVIDER_BUDGET.md` | Budget is external authority | Per-tenant budget policy | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0023 | CODE | HTTP manual | `vehicle-intelligence.controller.ts` | POST behavior-enrich sync; no force param | Ops force workflow | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0024 | CODE | Backfill limits | `trip-enrichment-orchestrator.service.ts` | 90d / 200 limits | Fleet-wide storm under growth | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0025 | CODE | UI fallback | `useTripBehaviorEvents.ts` | Null-status auto POST once | Backlog size in prod | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0026 | CODE | Route API | `vehicle-intelligence.controller.ts` | GET /route read-only | POST /enrich idempotency semantics | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0027 | CODE | Enrichment failure hook | `trip-reconciliation.service.ts` | onEnrichmentFailure log-only | Cold-tier re-enqueue policy | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0028 | CODE | Metrics | `trip-metrics.service.ts` | enrichmentPending/Failed gauges | Alert routing | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0029 | TEST | Repair chain | `trip-repair-enrichment-chain.spec.ts` | Repair → enqueueBehaviorEnrichment | Full integration E2E | PROVEN_BY_TEST | 2026-09-01 |
| ATE-EV-0030 | ARCHITECTURE_DOC | Trip audit | `TRIP_SYSTEM_AUDIT_2026-04-10.md` | Historical fragmentation finding | Current code state alone | HISTORICAL | 2026-09-01 |
| ATE-EV-0031 | ARCHITECTURE_DOC | Enrichment audit | `trip-enrichment-driver-score-energy-events-audit-2026-08.md` | Click-only was fallback | Post-deploy backlog cleared | PROVEN_IN_CODE | 2026-09-01 |
| ATE-EV-0032 | PRODUCTION | Deploy doc | `P1_3_S6_PRODUCTION_DEPLOY_SINGLE_REPLICA_2026-08-30.md` | Single-replica deploy PASS | 24h soak completion | PROVEN_IN_PRODUCTION | 2026-09-01 |
| ATE-EV-0033 | HISTORICAL_PR | Hotfix | commit `3874360e0` via deploy doc | Metric collision fix | No future metric collisions | PROVEN_IN_PRODUCTION | 2026-09-01 |
| ATE-EV-0038 | CODE | Mutex disable | `reconciliation-execution-mutex.service.ts` | Mutex off allows overlap | Safe multi-replica without mutex | PROVEN_IN_CODE | 2026-09-01 |

## Negative results (first-class)

| ID | Finding | Evidence |
|----|---------|----------|
| NEG-001 | Discovery claimed DimoSnapshotScheduler might lack leader — **disproven** at `4843a4ebc` | ATE-EV-0021 |
| NEG-002 | Deploy `85c3cd8e0` failed startup due to Prometheus gauge collision | ATE-EV-0033 |
| NEG-003 | Initial KG claimed orchestrator owns `enqueueRepairEnrichment` — **disproven** (TripReconciliationService private method) | Authority review 2A.1 |
