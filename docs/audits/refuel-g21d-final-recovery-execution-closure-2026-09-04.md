# G2.1d Physical Refuel Final Recovery Execution Closure — Audit

**Date:** 2026-09-04  
**G2.1c head (before G2.1d):** `95909149f7154f75c987f0d0d5bc9f3c91142f73`  
**PR:** #1531 (DRAFT)  
**Branch:** `cursor/refuel-physical-event-forensics-f21f`

Independent review of G2.1c identified five execution-boundary defects. G2.1d closes them without redesigning identity, settlement, canonical selection, or late-sibling rules.

## Blocker closure summary

| ID | Finding | Fix | Proof |
|----|---------|-----|-------|
| B1 | `stale_enrichment` discovered but filtered in `enqueuePlans` | `shouldIncludeRefuelInEnqueuePlan()` + `isV2StaleEnrichmentRecoverable()` | SE1–SE5 in `physical-refuel-g21d-final-recovery-execution-closure.spec.ts` |
| B2 | Recovery scheduler used Redis `leaderGuard.shouldRun()` | Removed leader guard; every replica may scan; PG vehicle lock serializes | SR1–SR5 scheduler + runtime specs |
| B3 | `coordinateRetryCount` double increment | Single authority: `persistCoordinateHold()` only; SELECTED does not increment | RC1–RC5 in g21d spec |
| B4 | Terminal NO_DWELL on sparse route evidence | `ROUTE_EVIDENCE_STABILIZING` + bounded horizon (`routeEvidenceStabilizationMs`, default 2h INFERRED) | RE1–RE6 in route evidence policy + g21d spec |
| B5 | Failed BullMQ custom jobId not recovered | `remove()` failed job then `queue.add()` when DB lifecycle permits | BQ1–BQ6 in `fuel-station-enrichment-producer.service.spec.ts` |
| B6 | Stale PROCESSING DB misleading | Reset stale PROCESSING → PENDING before re-enqueue | SE2 in g21d spec |
| B7 | One vehicle failure aborts batch | Per-vehicle try/catch in `runRecoveryBatch` | ERROR_ISOLATION + two-work-item tests |
| B8 | Metrics / leader semantics | `physical_refuel_recovery_tick`, `physical_refuel_recovery_vehicle_failed`, `physical_refuel_route_evidence_stabilizing` | Scheduler + runtime structured logs |

## Route evidence stabilization policy

**`ROUTE_EVIDENCE_STABILIZATION_POLICY`**

| Parameter | Value | Status |
|-----------|-------|--------|
| `routeEvidenceStabilizationMs` | `PHYSICAL_REFUEL_ROUTE_EVIDENCE_STABILIZATION_MS` env, default **2h** | INFERRED operational default |
| Retry cadence | Existing coordinate retry backoff via `nextCoordinateRetryAt` | Reused |
| Inside horizon | SUCCESS + NO_DWELL/INSUFFICIENT/AMBIGUOUS → `ROUTE_EVIDENCE_STABILIZING` (retryable) | Bounded |
| After horizon | `NO_DWELL_FOUND_FOR_STABLE_EVIDENCE` (terminal) | Convergent |
| Route fingerprint | `routeEvidenceFingerprint` (sample count, first/last timestamps digest) | Change detection |
| Event fingerprint | `coordinateEvidenceFingerprint` preserved separately | Invalidation unchanged |

## Coordinate retry semantics

`coordinateRetryCount` = **number of failed retryable coordinate attempts** (not SELECTED, not stable terminal). Only `persistCoordinateHold()` increments.

## BullMQ deterministic job recovery

| Queue state | DB lifecycle | Action |
|-------------|--------------|--------|
| WAITING/DELAYED/ACTIVE/PRIORITIZED | any | DEDUPED |
| FAILED | retryable (stale PROCESSING / non-terminal) | `remove()` + `queue.add()` |
| FAILED | terminal FAILED | SKIP |
| COMPLETED | terminal COMPLETED | DEDUPED |
| missing | retryable | `queue.add()` with deterministic jobId |

**BULLMQ_FAILED_JOB_RECOVERY_INTEGRATION:** Unit-tested BullMQ API interaction (mock queue). Isolated Redis integration not available in Cloud Agent environment — **NOT_PROVEN** at integration tier; unit coverage deemed sufficient for G2.1d closure.

## Scheduler concurrency architecture

- **No Redis leader election** on `PhysicalRefuelReconciliationRecoveryScheduler`
- Every replica runs bounded recovery scan (`inProgress` guard per process only)
- **Vehicle-scoped PostgreSQL advisory transaction lock** serializes reconciliation per vehicle
- Duplicate scans of same vehicle: one semantic outcome; idempotent enqueue + deterministic jobId
- Different vehicles: parallel safe (no global scheduler lock)

## Schema

**SCHEMA_CHANGE_G21D = YES**

Migration `20260904193000_physical_refuel_g21d_route_evidence_stabilization` adds:

- `route_evidence_fingerprint`
- `route_evidence_stabilization_until`

Not executed in production.

## Test evidence

### DEFAULT_TARGETED_RUN

Pattern: `physical-refuel|fuel-station-enrichment-producer|fuel-station-enrichment-recovery|energy-events-g21`

| Metric | Result |
|--------|--------|
| Suites | 20 passed, 1 skipped |
| Tests | 206 passed, 3 skipped, 0 failed |

### POSTGRES_INTEGRATION_RUN

`PHYSICAL_REFUEL_RECONCILIATION_POSTGRES_INTEGRATION=1` — **FAIL** (no reachable `DATABASE_URL` in Cloud Agent). Harness extended with G2.1d SR4 multi-replica lock case; requires isolated Postgres to execute.

### BUILD / VALIDATORS

| Gate | Result |
|------|--------|
| TYPECHECK_OR_BUILD | PASS |
| FST_GRAPH_VALIDATOR | PASS (see below) |
| EED_GRAPH_VALIDATOR | PASS (see below) |

## Remaining production-only gaps

- Production migration execution for G2.1d route evidence fields
- Real PostgreSQL multi-replica concurrency proof on production-like DB
- BullMQ failed-job recovery under real Redis (unit mocks only)
- Feature flag remains **default OFF** — no production activation

## Final gates (G2.1d)

See PR #1531 body / agent final report for flag matrix.

**G2_1D_FINAL_RECOVERY_EXECUTION_CLOSURE = PASS** (code + unit tests)  
**G2_2_SHADOW_ROLLOUT_AUTHORIZED = NO** until Postgres integration re-run passes in CI/isolated DB and independent review completes.
