# EXP-021 Live Maturation Shadow PR-M3 — Observational Analytics Evidence

**Date:** 2026-09-17  
**Starting main SHA:** `4b8c555e49d86f33af3e23ca918a3fa1349f85eb` (merged PR #1675)  
**Design authority:** `architecture/drivingintelligence/research/EXP_021_LIVE_MATURATION_SHADOW_DESIGN_2026-09-16.md`

## Phase A — Data contract audit

| Check | Result |
|-------|--------|
| `M3_DATA_CONTRACT_AUDIT` | PASS |
| `M3_SCHEMA_CHANGE_REQUIRED` | NO |
| `M3_ATTEMPT_ROWS_MUTATED` | NO |

M3 reads immutable hierarchy:

- `Exp021MaturationShadowWindowFamily`
- `Exp021MaturationShadowWindow` (stratum: lane × geometry)
- `Exp021MaturationShadowObservationSlot` (planned age)
- `Exp021MaturationShadowObservationAttempt` (immutable provenance)

Post-hoc nullable columns on attempts (`newBucketLociVsPriorAge`, `cumulativeBucketLocusUnionCount`, `bucketLocusCoverageRatioVsFinalObservedUnion`) are **derived at analysis time** and never written by M3.

## Analysis architecture

| Module | Responsibility |
|--------|----------------|
| `reference-capture-exp021-maturation-shadow-m3-bucket-locus.lib.ts` | Manifest parse, identity version gate, dedupe |
| `reference-capture-exp021-maturation-shadow-m3-attempt-selection.lib.ts` | `actualAgeMs` ordering; provider error/success classification |
| `reference-capture-exp021-maturation-shadow-m3-eligibility.lib.ts` | Family/stratum eligibility; semantic cohort blending guard |
| `reference-capture-exp021-maturation-shadow-m3-stratum-analysis.lib.ts` | Union, availability, maturation, scheduler/provider quality |
| `reference-capture-exp021-maturation-shadow-m3-paired-geometry.lib.ts` | Family-level 60s/90s paired observations |
| `reference-capture-exp021-maturation-shadow-m3-analyzer.lib.ts` | Orchestrator + aggregate counts |
| `reference-capture-exp021-maturation-shadow-m3-export.lib.ts` | Deterministic JSON/CSV serialization |
| `reference-capture-exp021-maturation-shadow-m3-fingerprint.lib.ts` | PostgreSQL read-only proof |
| `reference-capture-exp021-maturation-shadow-m3.repository.ts` | Read-only loader (explicit scope required) |

## Scientific invariants preserved

| Invariant | Value |
|-----------|-------|
| `PRIMARY_SAMPLING_UNIT` | `WINDOW_FAMILY` |
| `MATURATION_ORDER_USES_ACTUAL_AGE` | YES |
| `PROVIDER_ERROR_COUNTS_AS_ZERO` | NO |
| `ERROR_AGE_NARROWS_TRANSITION_INTERVAL` | NO |
| `FINAL_SHADOW_OBSERVED_UNION_IS_GROUND_TRUTH` | NO |
| `COVERAGE_USES_BUCKET_LOCUS_IDENTITY` | YES |
| `PAYLOAD_VALUE_IN_COVERAGE_IDENTITY` | NO |
| `PAIRED_GEOMETRY_ANALYSIS_REQUIRED` | YES |
| `SUFFICIENT_COMPLETENESS_THRESHOLD_DEFINED` | NO |

## Export schema

- Version: `EXP021_MATURATION_SHADOW_M3_EXPORT_v1`
- CLI: `npm run exp021:maturation-shadow:m3:export -- --organizationId=<uuid> --vehicleId=<uuid>`
- Outputs: JSON analysis bundle, transitions CSV, paired-geometry CSV
- Deterministic ordering: sorted keys (JSON), sorted rows (CSV)

## Read-only proof

Integration test `reference-capture-exp021-maturation-shadow-m3.postgres.integration.spec.ts` case 30:

- Captures canonical RC fingerprint + M1/M2 scientific row fingerprint before analysis
- Runs full M3 load + analyze
- Asserts fingerprints identical after (`CANONICAL_STATE_IDENTICAL=YES`)

## Remaining activation sequence (post-M3)

1. Merge M3 (draft review)
2. Deploy gate with shadow **disabled**
3. Activation gate — single KS MX 2024 token allowlist
4. Collection gate — manual enrollment only
5. Evidence freeze from live pilot data
6. THEN design actual TGR retry policy (not in M3)
