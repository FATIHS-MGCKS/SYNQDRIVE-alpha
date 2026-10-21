# EED-EV-0097 — RFRF stretched-end native↔fallback convergence (OQ-015)

**Date:** 2026-09-28  
**Scope:** F5 authoritative convergence only — not trust authority (EED-DEC-RFRF-011 remains proposed).

## Production defect (read-only forensic)

- Vehicle WOB L 7503 (`19fedd4b-c4e8-4de8-a125-dab293326e7e`)
- Physical refuel 2026-09-19 — one fill
- RFRF candidate `e4c7f4bc…` READY_FOR_PERSIST
- Authoritative native canonical row temporally stretched (segment end ~16:54 vs rise end ~16:15)
- Strict `classifyPhysicalRefuelSibling` → `DISTINCT_PHYSICAL_REFUEL` / `end_time_mismatch`
- Trust-enabled promotion would duplicate Product REFUEL without this fix

## Change

- `classifyFallbackAgainstAuthoritativeNativeRefuel()` in `raw-refuel-native-fallback-stretched-end.policy.ts`
- Canonical G2 matcher unchanged (`DEFAULT_PHYSICAL_REFUEL_MATCHER_TOLERANCES.endTimeSec` still 60)
- Bounded override only when:
  - canonical failure reason is **only** `end_time_mismatch` (after hard-contradiction pre-check)
  - **explicit telemetry-gap evidence**: persisted `maxSampleGapSeconds` **strictly exceeds** F3 detector normal continuity (`RAW_FUEL_RISE_DETECTOR_CONFIG_V1.absolute.maxSampleGapMs` → 360s), or optional persisted `evidenceMeta.telemetryGapStretchAuthorized === true` — **not** healthy post-plateau extension alone (`physicalEvidenceEnd` past `riseEndAt` is expected for READY events with ≥2 min post-plateau persistence)
  - native episode bracketed within candidate `physicalEvidenceStart`/`physicalEvidenceEnd` envelope (with bounded slack)
  - rise onset compatible with native episode
  - terminal fuel + transition start/delta compatible
- `evaluateRawRefuelNativeFallbackConvergence` uses fallback-specific classifier
- `nativePhysicalRelationshipImpliesPendingReconciliation` aligned to same classifier

## Validation

- Unit: `raw-refuel-native-fallback-stretched-end.policy.spec.ts` (WOB 09-19, H1–H8 matrix, Event B, KS MX stale baseline negative)
- Postgres (Stage-4 CI): `rfrf-oq015-stretched-end-postgres-gate.sh` → `raw-refuel-oq015-stretched-end.postgres.integration.spec.ts` (`RAW_FUEL_REFUEL_OQ015_INTEGRATION=1`)
- Existing F5/F9/F10.6.6 regression suites unchanged semantics for non-stretched pairs

## Non-effects

- `ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE` remains `false`
- No Production mutation in evidence collection
- KS MX 2024 stale pre-fill baseline remains out of scope (baseline-recency guard — next stage)
