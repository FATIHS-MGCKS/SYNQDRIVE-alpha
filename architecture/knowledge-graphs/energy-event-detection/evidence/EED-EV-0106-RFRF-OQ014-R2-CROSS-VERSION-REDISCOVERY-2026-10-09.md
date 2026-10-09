# EED-EV-0106 — RFRF OQ-014 R2 cross-version candidate rediscovery closure

**Classification:** CODE+TEST (matcher/resolver integration — activation still OFF)  
**Date:** 2026-10-09  
**Status:** R2 wired — **no settled-post F3 detector runtime**, **no numeric calibration**, **no Production activation**

## Scope

- `classifyRawRefuelCandidateOverlap` — version gate + preserved same-version semantics + authorized `rfrf-rise-v2` → `rfrf-rise-v1` path
- `resolveOrCreateCandidate` — fail-closed precedence for `VERSIONED_TERMINAL_CONFLICT` and cross-version `INSUFFICIENT_EVIDENCE`
- Post-fuel authority bridge: legacy v1 missing metadata → effective `PEAK_INSTANTANEOUS`; incoming v2 requires explicit `SETTLED_MEDIAN`
- Identity assignment: v1 legacy builder; new v2 rows use `rfrf-candidate-physical-identity-v1` (no `detectionVersion` in preimage)
- KS MS 661 canonical PostgreSQL replay (`b27124fb-64c3-478d-8077-200751af2863`)

## Explicit non-effects

- Active runtime `RFRF_RISE_DETECTION_VERSION=rfrf-rise-v1`, `RFRF_RISE_DETECTOR_VERSION=rfrf-rise-detector-v1`
- No phase scanner / `scanPhysicalRiseNeighborhood` changes
- No Production numeric caps; no imports from `backend/scripts/ops/rfrf-settled-post/`
- Settled F3 activation env not wired into runtime
- OQ-014 **OPEN**; OQ-019 **PARTIALLY_RESOLVED**

## Validation

- `raw-refuel-candidate-cross-version.matcher.spec.ts` (M1–M12)
- `raw-refuel-candidate-r2-cross-version.postgres.integration.spec.ts` (PG1–PG10, `RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION=1`)
- Existing same-version matcher + candidate unit suites
