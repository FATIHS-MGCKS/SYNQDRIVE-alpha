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

## Correctness closure (PR #1754 amendments)

Independent review defects closed in this workstream:

| Fix | Summary |
|-----|---------|
| **EXCLUDED canonical flow** | CASE A–D ordering: EXCLUDED rows with `canonicalFeatureRowId` evaluate identity, digest, temporal, lineage; content subdimensions stay `NOT_APPLICABLE`. |
| **Zero-row aggregate SQL** | `COUNT(f.id)` (not `COUNT(*)`) on LEFT JOIN keys so `totalRows=0` when no C3 rows match. |
| **DB round trips** | `D4InspectionDbRoundTripBudget` per `inspectRevision`; no process-global counter; increment only on executed statements. |
| **Self-integrity fingerprint** | `sha256HexLowercaseUtf8(canonicalFeatureInputUtf8(revision.scientificProfileJson))` — raw stored JSON authority. |
| **Strict V1 parser** | Exact allowed key sets; finite domain vocabularies; no excluded-version coercion. |
| **Historical input taxonomy** | Distinct outcomes: version mismatch vs identity vs malformed supported summary vs unsupported contract. |
| **Frontend scope** | D4 Master Admin runtime entries removed (architecture docs only). |
| **PostgreSQL proof** | PG-A–PG-Y gated integration (25 scenarios) + regression PG for D3/D1/C5A on ephemeral DB. |

**Execution evidence (local ephemeral):**

- D4 unit + integration: **93** tests (68 unit + 25 PG) via `npm run test:battery:v2:longitudinal-integrity-inspection:postgres`
- D3 materialization postgres: **22/22 PASS**
- D1 longitudinal input postgres: **5/5 PASS**
- C5A shadow inspection postgres: **10/10 PASS**

**Goldens unchanged:** C3 `e7b6e05a…`; D3 profile `e2d39c602370c92a…`.
