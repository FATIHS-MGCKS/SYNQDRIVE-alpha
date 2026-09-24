# M3.3D D4 — Longitudinal Integrity Inspection Engineering (V1)

**Date:** 2026-09-24  
**Status:** **ENGINEERING V1 ON DRAFT PR** (read-only inspection service; no Nest registration)  
**Contract:** `M3_3D_D4_INTEGRITY_INSPECTION_V1`  
**Architecture:** `M3_3D_D4_LONGITUDINAL_INTEGRITY_INSPECTION_ARCHITECTURE_2026-09-24.md`

## Scope delivered

- Strict scientific profile parser (`parseLongitudinalScientificProfileProjectionV1`) with D2 V1 semantic invariants (no `window.profileGeneratedAt`, partition, ordering, segments, flags, derived null).
- D4 historical input-summary registry (`parseHistoricalFeatureInputSummaryForD4`) for `M3_3C_FEATURE_INPUT_V1` only — not D1 generic history.
- Materialized revision self-integrity (fingerprint + metadata mirror) aligned with D3 persistence mapper.
- Per-session source integrity (identity, scalar vs columns, snapshot vs historical parser, temporal, digest, lineage, digest coverage accounting).
- Profile overlay aggregation (overallStatus precedence, closed inspection flags, rebuildability, DEFAULT disposition accounting).
- `LongitudinalIntegrityInspectionRepository` — tenant-scoped revision lookup; `loadInspectionBatch` in `RepeatableRead` with **≤4** counted SQL round trips (revision, referenced rows, grouped aggregates via `unnest`, latest-K union in memory).
- `LongitudinalIntegrityInspectionService.inspectRevision` — plain class; no Nest module registration.
- Unit + gated PostgreSQL integration tests; CI script `test:battery:v2:longitudinal-integrity-inspection:postgres`.

## Runtime gates (unchanged)

- **`D3_RUNTIME_REACHABLE=NO`**
- **`PRODUCTION_MATERIALIZATION_READY=NO`**
- No schema/migration/API/CLI/flags in this slice.

## Validation

```bash
cd backend
npx jest longitudinal-integrity-inspection longitudinal-scientific-profile.parser.spec --runInBand
BATTERY_V2_LONGITUDINAL_INTEGRITY_INSPECTION_INTEGRATION=1 npx jest longitudinal-integrity-inspection.integration --runInBand
npm run test:battery:v2:longitudinal-integrity-inspection:postgres
```
