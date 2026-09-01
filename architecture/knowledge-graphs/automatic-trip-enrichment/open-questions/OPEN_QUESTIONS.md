# KG-ATE Open Questions — Classification (Phase B)

All 12 discovery open questions classified. **Do not force-close without evidence.**

| ID | Original question | Classification | Answer | Evidence | Confidence | Canonical fact? |
|----|-------------------|----------------|--------|----------|------------|-----------------|
| ATE-OQ-01 | When does V2 fully supersede `trip.behavior.enrichment`? | **INTENTIONALLY_OPEN** | No cutover date in code. `TripPostFinalizeAnalysisProducer` comment: legacy queues remain until fully replaced. V2 init runs in parallel. | ATE-EV-0004, ATE-EV-0001 | MEDIUM | NO — remains `ATE-OQ-001` node |
| ATE-OQ-02 | Should `onEnrichmentFailure` cold-tier re-enqueue `FAILED_PERMANENT`? | **INTENTIONALLY_OPEN** | `onEnrichmentFailure` is log-only stub; comment proposes future quality_check flag. No cold-tier re-enqueue implemented. | ATE-EV-0027 | HIGH | NO — policy undecided |
| ATE-OQ-03 | Multi-pod `DimoSnapshotScheduler` without leader — acceptable? | **RESOLVED_FROM_CODE** | **Leader-gated** at main SHA: `shouldRun('dimo_snapshot_tick')` and `dimo_snapshot_janitor`. Discovery risk disproven. | ATE-EV-0021 | HIGH | YES — invariant ATE-INV-LEADER-001 covers |
| ATE-OQ-04 | Should HTTP expose `force` re-enrichment for ops? | **INTENTIONALLY_OPEN** | `enqueueBehaviorEnrichment` accepts `opts.force` internally; HTTP `POST behavior-enrich` does not expose it. | ATE-EV-0023, ATE-EV-0005 | HIGH | NO — product/ops decision pending |
| ATE-OQ-05 | Route enrich on GET `/trips/:id/route` — idempotent read-only? | **RESOLVED_FROM_CODE** | `GET trips/:tripId/route` calls `getRouteForTrip` (read). Writes occur via `POST trips/:tripId/enrich` or automatic orchestrator path. | ATE-EV-0026 | HIGH | YES — GET is read-only |
| ATE-OQ-06 | DI reconciliation vs behavior status null — intentional split? | **RESOLVED_FROM_CODE** | Separate schedulers: `DrivingAnalysisReconciliationScheduler` vs behavior queue. Independent status fields (`behaviorEnrichmentStatus` vs V2 run state). | ATE-EV-0019, ATE-EV-0012 | HIGH | YES — intentional parallel tracks |
| ATE-OQ-07 | 24h single-replica soak completion criteria for scale-to-2 | **NEEDS_PRODUCTION_EVIDENCE** | Gate active per P1.3-S6 deploy doc; explicit pass/fail criteria not encoded in repo as machine-checkable gate. | ATE-EV-0032 | MEDIUM | NO — operational gate |
| ATE-OQ-08 | CH evidence mirror production adoption | **OUT_OF_SCOPE_EXTERNAL_AUTHORITY** | ClickHouse analytics/evidence mirror not owned by ATE orchestration graph. ATE may reference CH fallback in repair only. | ATE-EV-0010 (repair context) | LOW | NO — not ATE canonical fact |
| ATE-OQ-09 | Backfill enqueue storm limits under fleet growth | **RESOLVED_FROM_CODE** | `BACKFILL_CUTOFF_DAYS=90`, `BACKFILL_DEFAULT_LIMIT=200` in orchestrator. May be insufficient at extreme fleet scale — monitoring not proven. | ATE-EV-0024 | HIGH | YES — limits exist; sufficiency open for ops |
| ATE-OQ-10 | Energy step 5 coupling — schedule ownership split? | **OUT_OF_SCOPE_EXTERNAL_AUTHORITY** | Detect cadence tied to reconcile today; **EED** should own future independent scheduler. ATE documents MAY_TRIGGER only. | ATE-EV-0011, ATE-EV-0034 | HIGH | NO — EED canonicalization will decide |
| ATE-OQ-11 | Permanent trip loss proof limits under mutex skip | **NEEDS_PRODUCTION_EVIDENCE** | Code skips reconcile on mutex contention; no trip deletion. Formal proof artifact for all deferral patterns not in repo. | ATE-EV-0017 | MEDIUM | NO — ATE-INV-TRIP-LOSS-001 is CONDITIONAL |
| ATE-OQ-12 | UI fallback removal once backlog cleared | **INTENTIONALLY_OPEN** | `useTripBehaviorEvents` still auto-POSTs when status null. No feature flag or removal commit. | ATE-EV-0025 | HIGH | NO — proposed future cleanup |

## Summary

| Metric | Count |
|--------|------:|
| Total discovery questions | 12 |
| RESOLVED_FROM_CODE | 4 (OQ-03, 05, 06, 09) |
| RESOLVED_FROM_TESTS | 0 |
| RESOLVED_FROM_HISTORY | 0 |
| RESOLVED_FROM_PRODUCTION_EVIDENCE | 0 |
| INTENTIONALLY_OPEN | 4 (OQ-01, 02, 04, 12) |
| NEEDS_PRODUCTION_EVIDENCE | 2 (OQ-07, 11) |
| OUT_OF_SCOPE_EXTERNAL_AUTHORITY | 2 (OQ-08, 10) |

**OPEN_QUESTIONS_RESOLVED (classified closed):** 6  
**OPEN_QUESTIONS_REMAINING (explicit open nodes):** 6  

Remaining open question nodes in graph: `ATE-OQ-001`, `ATE-OQ-002`, `ATE-OQ-004`, `ATE-OQ-007`, `ATE-OQ-011`, `ATE-OQ-012`.
