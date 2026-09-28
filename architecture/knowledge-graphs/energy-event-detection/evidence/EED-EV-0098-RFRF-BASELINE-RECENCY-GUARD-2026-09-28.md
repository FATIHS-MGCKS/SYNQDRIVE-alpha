# EED-EV-0098 — RFRF pre-fill baseline recency safety guard

**Date:** 2026-09-28  
**Scope:** F3 detector + F4 promotion firewall — not trust authority.

## Production defect (KS MX 2024, 2026-09-16)

- True immediate pre-fill ≈5 L → post ≈27 L (≈22 L physical fill; native ≈22 L).
- Historical READY candidates reused stale pre plateaus (10/17/14 L) hours before the rise → false deltas (17/10/13 L).
- Sparse PRE→RISE bridges alone did not reject stale plateaus when intervening channel state had materially changed.

## Change

- `evaluateRawFuelPrePlateauRecency()` — temporal bound from `RAW_FUEL_RISE_DETECTOR_CONFIG_V1.absolute.maxSampleGapMs` (360s); semantic invalidation on intervening material state change; **silent** PRE→RISE bridges longer than the bound with zero intervening samples → `INSUFFICIENT_EVIDENCE` (fail closed — no material-rise inference after long silence). WOB 09-19 uses observed DIMO pre plateau ending 2026-09-19T16:07:45Z (210s before rise) → `FRESH` via ordinary recency.
- `detectChannelRises()` skips stale pre↔rise pairings and searches for fresher pre plateaus.
- Baseline provenance persisted under `evidenceMeta.baselineRecency` (no Prisma migration).
- Promotion eligibility: `BLOCKED_BASELINE_RECENCY` unless classification is explicitly `FRESH` (EED-INV-019).

## Validation

- Unit: `raw-fuel-pre-plateau-baseline-recency.policy.spec.ts` (B1–B16, S1–S8 silent-bridge matrix, KS MX, WOB regressions).
- Postgres (Stage-4 CI): `rfrf-baseline-recency-postgres-gate.sh` → `raw-refuel-baseline-recency.postgres.integration.spec.ts`.

## Non-effects

- `ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE` remains `false`.
- OQ-015 stretched-end policy unchanged.
- No Production mutation.
