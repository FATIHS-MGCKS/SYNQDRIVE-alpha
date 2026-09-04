# G2.1c Physical Refuel Final Recovery Semantics Closure — Audit

**Date:** 2026-09-04  
**Branch:** `cursor/refuel-physical-event-forensics-f21f`  
**PR:** #1531 (DRAFT)  
**G2.1b head (before G2.1c):** `471571baedeff7ce067d6cfdaa1538967e28c6d9`

## Executive verdict

| Gate | Value |
|------|-------|
| **G2_1C_FINAL_RECOVERY_SEMANTICS_CLOSURE** | PASS |
| **G2_2_SHADOW_ROLLOUT_AUTHORIZED** | YES (shadow only; flag default OFF; await independent review) |

## Blockers closed

| ID | Root cause | Fix | Tests |
|----|------------|-----|-------|
| B1 | Recovery scheduler gated on `canEnqueueQueue` | Semantic recovery always runs; queue check only at enqueue | S1–S4 |
| B2 | Provider failure mapped to `[]` → false NO_DWELL | `fetchRouteEnrichmentOutcome` with SUCCESS/UNAVAILABLE/FAILED | D1–D4 |
| B3 | Missing-token path skipped retry count increment | `persistCoordinateHold` increments on retryable holds | M1 |
| B4 | Terminal holds selected every tick (`nextCoordinateRetryAt IS NULL`) | Split `coordinate_initial` / `coordinate_retry`; terminal excluded | H1–H4 |
| B5 | Terminal hold never reopened on new evidence | `coordinateEvidenceFingerprint` invalidation | E1–E3 |
| B6 | Divergent V2 cutover between runtime and producer | Producer requires `eventObservedAt` + `v2OwnershipCutoverAt` | C1–C4 |
| B7 | V2 stale PENDING/PROCESSING not recovered | `stale_enrichment` recovery reason | P1–P5 |
| B8 | Ambiguous null enqueue returns | `enqueueAfterPersistOutcome` typed result | S3, B8 |
| B9 | New recovery categories could starve others | Fair quotas for 6 active categories | R3/R4 quotas |
| B10 | Inconsistent test reporting | Normalized evidence sections below | this doc |

## Final recovery architecture

```
RECOVERY TICK (always, no Redis gate)
  → settlement_due
  → orphan_refuel
  → stale_enrichment (V2-owned)
  → lost_enqueue (coords ready)
  → coordinate_initial (status null)
  → coordinate_retry (retryable + due)

SEMANTIC RECONCILE (DB-only, token-independent)
  → PROVISIONAL / SETTLING → FINAL_*

COORDINATE (token + route required)
  → COORDINATE_INITIAL
  → SELECTED | RETRYABLE_HOLD | TERMINAL_HOLD_FOR_EVIDENCE

ENQUEUE (queue availability checked here only)
  → ENQUEUED | DEDUPED | DEFERRED_QUEUE_UNAVAILABLE | TERMINAL_SKIP
```

## Route evidence epistemic model

| Outcome | Coordinate status | Retry |
|---------|-------------------|-------|
| JWT/provider unavailable | ROUTE_UNAVAILABLE / PROVIDER_ERROR | Yes (backoff) |
| SUCCESS + no dwell | NO_DWELL_FOUND | Terminal for evidence |
| SUCCESS + dwell | SELECTED | Enqueue path |

## Coordinate retry state machine

- **Initial:** `coordinateSelectionStatus IS NULL` → `coordinate_initial` recovery
- **Retryable:** `RETRYABLE_COORDINATE_STATUS_LIST` + `nextCoordinateRetryAt <= now`
- **Terminal:** `MISSING_FUEL_RISE_ONSET`, `NO_DWELL_FOUND`, etc. — not reselected
- **Invalidation:** evidence fingerprint change clears terminal hold → fresh initial attempt

## V2 cutover authority

Single authority: `PhysicalRefuelReconciliationRuntimeService.resolveV2OwnershipCutoverAt()`  
→ passed to producer as `v2OwnershipCutoverAt`  
→ V2 requires `eventObservedAt` (fail-closed if missing)

## Migration

`20260904180000_physical_refuel_g21c_evidence_fingerprint` — additive `coordinate_evidence_fingerprint`. Not executed in production.

## Test evidence (normalized)

### DEFAULT_TARGETED_RUN

```
suites: 16 passed, 1 skipped (postgres integration)
passed: 150
failed: 0
skipped: 2
```

Pattern: `physical-refuel|fuel-station-enrichment-producer|fuel-station-enrichment-recovery`

### POSTGRES_INTEGRATION_RUN

```
Not re-executed this turn — advisory-lock code path unchanged since G2.1b proof.
Previous proof retained: isolated PostgreSQL 16 `synqdrive_g21b_test`, 2 passed.
```

### BUILD

PASS

### FST

PASS (`validate-graph.mjs`)

### EED

PASS (`validate-graph.mjs`)

## Remaining production-only gaps

- Production flag activation not performed
- Migration not executed in production
- G2.2 shadow rollout not started (by design)

## Production status

PRODUCTION_ACTIVATED = NO  
PRODUCTION_DEPLOYED = NO  
PRODUCTION_MUTATED = NO  
PRODUCTION_VALIDATED = NO
