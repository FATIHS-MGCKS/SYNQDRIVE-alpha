# EED-EV-0105 — RFRF OQ-014 R1 physical identity + cross-version authority foundation

**Classification:** CODE+TEST (foundation only — unwired)  
**Date:** 2026-10-01  
**Status:** R1 foundation — **no runtime settled F3**, **no numeric calibration**, **no Production activation**

## Scope

Pure TypeScript authorities for future settled-post F3 cross-version candidate reconciliation:

| Authority | Version constant |
|-----------|------------------|
| Physical candidate identity (future keys) | `rfrf-candidate-physical-identity-v1` |
| Cross-version detection compatibility | `rfrf-candidate-cross-version-compatibility-v1` |
| Settled F3 activation parser | `rfrf-settled-post-f3-activation-v1` |
| Production calibration bundle (types only) | `rfrf-settled-post-production-calibration-v1` |

## Explicit non-effects (R1)

- `classifyRawRefuelCandidateOverlap` unchanged
- `resolveOrCreateCandidate` unchanged
- Legacy `candidateIdentityKey` assignment unchanged
- `RFRF_RISE_DETECTION_VERSION=rfrf-rise-v1`, `RFRF_RISE_DETECTOR_VERSION=rfrf-rise-detector-v1` unchanged
- No import from `backend/scripts/ops/rfrf-settled-post/`
- No Production numeric caps selected
- OQ-014 **OPEN**; OQ-019 **PARTIALLY_RESOLVED**

## R2 prerequisites documented

- Cross-version SAME requires explicit compatibility pair + `preCompatible === true`
- `VERSIONED_TERMINAL_CONFLICT` distinct from ordinary DISTINCT
- Immutable legacy identity key may encode origin `detectionVersion` while row versions advance on reconcile

## Validation

- `raw-refuel-candidate-r1-foundation.spec.ts` (P1–P8, V1–V5, A1–A3, T1–T4, M1–M8)
