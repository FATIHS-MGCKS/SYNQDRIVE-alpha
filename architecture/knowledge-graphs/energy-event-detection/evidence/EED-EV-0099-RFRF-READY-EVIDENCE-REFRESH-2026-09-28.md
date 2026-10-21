# EED-EV-0099 — RFRF READY candidate evidence/trust refresh (pre-promotion)

**Date:** 2026-09-28  
**Scope:** F10.6.8-B READY recovery path — refresh machinery only; trust authority **not** implemented.

## Gap (EED-OQ-018)

Legacy `READY_FOR_PERSIST` rows could enter `recoverReadyCandidate()` and proceed toward convergence/promotion **without** reloading historical DIMO evidence, leaving stale detector/trust/baseline provenance frozen at first maturity time.

## Change

- Versioned policy `evaluateReadyCandidateRefreshRequirement()` (`rfrf-ready-evidence-refresh-v1`).
- Versioned trust resolver stamp `RFRF_SIGNAL_TRUST_RESOLVER_VERSION` (`rfrf-signal-trust-v1`) — semantics still **UNKNOWN** (`ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE=false`).
- Durable `evidenceMeta.readyEvidenceRefresh` block (no wall-clock churn fields).
- READY recovery ordering: **refresh → readiness → convergence → promotion**; bounded `computeRawRefuelCandidateRecoveryWindow`; same-observation reconcile only (no second candidate insert).
- Idempotent provider calls: second recovery pass with current refresh metadata does **not** refetch solely because trust remains UNKNOWN.
- Future trust bump: increment `RFRF_SIGNAL_TRUST_RESOLVER_VERSION` → prior READY refresh proofs become `REFRESH_REQUIRED`.
- **Pre-merge hardening (PR #1828):** recovery readiness/convergence/promotion use **persisted** `qualityMeta.absoluteDetectionAdmissibility` (no fuel-capability ADMISSIBLE synthesis); evidence reconcile persists current `detectorVersion`/`detectionVersion`; fingerprint includes `detectorVersion`; PG proof for READY→SETTLING regression without convergence/promotion.

## Validation

- Unit: `raw-refuel-ready-evidence-refresh.policy.spec.ts`, `raw-refuel-ready-recovery-admissibility.spec.ts`
- Postgres (Stage-4 CI): `rfrf-ready-evidence-refresh-postgres-gate.sh` → `raw-refuel-ready-evidence-refresh.postgres.integration.spec.ts` (R1–R12 + legacy detector idempotency + R7 SETTLING)
- Production read-only anchor: WOB Event B candidate `96cf018d-50fa-4bc5-9fba-e676c08c4eef` (READY, 4→13 L, trust UNKNOWN, baseline recency missing in `evidenceMeta`)

## Non-effects

- No `TRUSTED` promotion path enabled.
- No Prisma schema migration.
- No Production mutation or deploy.
- Baseline recency guard (EED-EV-0098) and OQ-015 convergence unchanged.
