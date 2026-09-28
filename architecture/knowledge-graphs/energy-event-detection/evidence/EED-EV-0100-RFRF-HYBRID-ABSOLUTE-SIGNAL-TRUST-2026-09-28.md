# EED-EV-0100 — RFRF Hybrid Absolute Signal Trust Authority v1

**Date:** 2026-09-28  
**Scope:** Observation-local promotion trust for absolute-liter fallback refuel candidates.

## Change (v2 locality hardening)

- Hybrid authority bumped to `rfrf-hybrid-absolute-trust-v2` with **local** relative pre/post plateau corroboration (F3 relative thresholds: gap, tolerance, persistence, min samples).
- Durable `evidenceMeta.hybridAbsoluteSignalTrust` block persisted on READY refresh (computed classification, reason, deltas, locality assessments).
- `evaluateReadyCandidateRefreshRequirement` requires current hybrid provenance for trust resolver v2.
- Isolated localhost PostgreSQL gate creates ephemeral DB/role; rejects production-like `DATABASE_URL`.
- Bumped `RFRF_SIGNAL_TRUST_RESOLVER_VERSION` to `rfrf-signal-trust-v2` (stale READY refresh → `REFRESH_REQUIRED`).
- `resolveRawFuelSignalTrust` computes hybrid provenance but **promotion output remains UNKNOWN** while `ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE=false`.
- TRUSTED requires: admissible absolute rise coherence, **FRESH** baseline recency provenance, sufficient in-window relative sample coverage with directional corroboration, and no material contradiction.
- UNTRUSTED requires affirmative contradiction (malformed absolute, relative contradicts material absolute rise, reset pattern).
- Recovery re-resolves trust after same-observation match with rise + baseline context; stamps `hybridTrustReasonCode` into `readyEvidenceRefresh`.

## Non-effects

- No production env activation; no fleet-wide trust; no WOB/Event B special cases.
- OQ-015, EED-INV-019, EED-INV-020 ordering preserved.
- Detection admissibility remains orthogonal.

## Validation

- Unit matrix `raw-fuel-hybrid-absolute-signal-trust.spec.ts` (T1–T20 + WOB Event B read-only).
- PostgreSQL gate `raw-fuel-hybrid-trust.postgres.integration.spec.ts` (P1–P10) via `rfrf-hybrid-trust-postgres-gate.sh`.

## WOB Event B read-only classification

Fixture samples (`buildWob20260927EventBSamples`) are absolute-only → hybrid **UNKNOWN** (`RELATIVE_COVERAGE_INSUFFICIENT`); not distorted for promotion.
