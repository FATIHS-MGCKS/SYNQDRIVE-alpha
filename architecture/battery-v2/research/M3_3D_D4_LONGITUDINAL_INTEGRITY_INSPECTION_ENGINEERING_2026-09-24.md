# M3.3D D4 — Longitudinal Integrity Inspection Engineering (V1)

**Date:** 2026-09-24  
**Status:** **ENGINEERING V1 COMPLETE ON MAIN** — merged PR #1754 @ merge `9a3e457d9eb8e38025a63bb2a2448c74f05263bf` (PR head `309da8252658d096fbbce585c2f220c4c2795080`)  
**Contract:** `M3_3D_D4_INTEGRITY_INSPECTION_V1`  
**Architecture:** `M3_3D_D4_LONGITUDINAL_INTEGRITY_INSPECTION_ARCHITECTURE_2026-09-24.md`

## Active engineering gates (unchanged post-merge)

| Gate | Value |
|------|-------|
| **`D4_ENGINEERING_IMPLEMENTED`** | **YES** |
| **`D4_INTERNAL_SERVICE_IMPLEMENTED`** | **YES** |
| **`D4_RUNTIME_REACHABLE`** | **NO** |
| **`D4_NEST_PROVIDER_REGISTERED`** | **NO** |
| **`D4_MODULE_EXPORTED`** | **NO** |
| **`D4_RUNTIME_CALL_SITES`** | **0** |
| **`D4_PERSISTENCE_ADDED`** | **NO** |
| **`D4_DB_WRITES`** | **NO** |
| **`D3_RUNTIME_REACHABLE`** | **NO** |
| **`PRODUCTION_MATERIALIZATION_READY`** | **NO** |

## Scope delivered

- Strict scientific profile parser (`parseLongitudinalScientificProfileProjectionV1`) with D2 V1 semantic invariants (no `window.profileGeneratedAt`, partition, ordering, segments, flags, derived null).
- D4 historical input-summary registry (`parseHistoricalFeatureInputSummaryForD4`) for `M3_3C_FEATURE_INPUT_V1` only — not D1 generic history.
- Materialized revision self-integrity (fingerprint + metadata mirror) aligned with D3 persistence mapper.
- Per-session source integrity (identity, scalar vs columns, snapshot vs historical parser, temporal, digest, lineage, digest coverage accounting).
- Profile overlay aggregation (overallStatus precedence, closed inspection flags, rebuildability, DEFAULT disposition accounting).
- `LongitudinalIntegrityInspectionRepository` — tenant-scoped revision lookup; `loadInspectionBatch` in `RepeatableRead` with **≤4** counted SQL round trips (revision, referenced rows, grouped aggregates via `unnest`, latest-K union in memory).
- `LongitudinalIntegrityInspectionService.inspectRevision` — plain class; no Nest module registration.
- Unit + gated PostgreSQL integration tests; CI script `test:battery:v2:longitudinal-integrity-inspection:postgres`.

## Final validation evidence (merged PR #1754)

| Suite | Result |
|-------|--------|
| **D4** (`test:battery:v2:longitudinal-integrity-inspection:postgres`) | **98/98 PASS** — 73 unit + 25 PostgreSQL PG-A..PG-Y |
| **D3 PG** | **22/22 PASS** |
| **D1 PG** | **5/5 PASS** |
| **C5A PG** | **10/10 PASS** |
| **D2 unit** | **37/37 PASS** |
| **D1 unit** | **36/36 PASS** |
| **Final PR CI (exact head `309da8252`)** | **46/46 SUCCESS** — `CI_PENDING_CHECKS=NONE`; `CI_FAILED_CHECKS=NONE` |

```bash
cd backend
npm run test:battery:v2:longitudinal-integrity-inspection:postgres
npm run test:battery:v2:longitudinal-profile-materialization:postgres
npm run test:battery:v2:longitudinal-input:postgres
npm run test:battery:v2:rest-session-feature:inspection:postgres
```

## Correctness closure (merged authority)

| Closure | Value |
|---------|-------|
| **EXCLUDED_CANONICAL_IDENTITY_EVALUATED** | **YES** |
| **EXCLUDED_CANONICAL_DIGEST_EVALUATED** | **YES** |
| **EXCLUDED_CANONICAL_TEMPORAL_EVALUATED** | **YES** |
| **EXCLUDED_CANONICAL_LINEAGE_EVALUATED** | **YES** |
| **EXCLUDED_CONTENT_SUBDIMENSIONS** | **NOT_APPLICABLE** |
| **ZERO_MATCH_AGGREGATE_TOTAL_ROWS** | **0** (via `COUNT(f.id)` on LEFT JOIN keys) |
| **D4_DB_COUNTER_PROCESS_GLOBAL** | **NO** |
| **D4_DB_COUNTER_INSPECTION_LOCAL** | **YES** (`D4InspectionDbRoundTripBudget`) |
| **SELF_FINGERPRINT_HASHES_RAW_STORED_JSON** | **YES** |
| **STRICT_PARSER_REJECTS_UNKNOWN_V1_FIELDS** | **YES** |
| **STRICT_PARSER_COERCES_TYPES** | **NO** |
| **MATCHING_VERSION_MALFORMED_SUMMARY_IS_VERSION_MISMATCH** | **NO** |
| **MATCHING_VERSION_MALFORMED_SUMMARY_SNAPSHOT_RESULT** | **FAIL** |
| **MATCHING_VERSION_MALFORMED_SUMMARY_REASON** | **SOURCE_CONTENT_MISMATCH** |

Historical defect narrative (PR #1754 amendments) preserved below.

## Database contract (merged)

| Field | Value |
|-------|-------|
| **`D4_INSPECTION_TRANSACTION`** | **RepeatableRead** |
| **`D4_DB_ROUND_TRIPS_MAX`** | **4** |
| **`D4_DB_ROUND_TRIPS_SCALE_WITH_SESSION_COUNT`** | **NO** |
| **`D4_DB_ROUND_TRIPS_SCALE_WITH_VERSION_TRIPLE_COUNT`** | **NO** |
| **`N_PLUS_ONE_INSPECTION_USED`** | **NO** |
| **`UNBOUNDED_REVISION_READ_USED`** | **NO** |
| **`D4_UNIQUE_C3_ROW_ID_BOUND`** | **10100** |
| **`D4_FOUR_STEP_C3_RESULT_INSTANCE_BOUND`** | **10200** |
| **`D4_AGGREGATE_RESULT_ROW_BOUND`** | **100** |

## Scientific boundaries (unchanged)

- **`D4_MUTATES_D2_PROFILE=NO`**
- **`D4_MUTATES_D3_SCIENTIFIC_JSON=NO`**
- **`CURRENT_CANONICAL_CONTEXT_INCLUDED_IN_D4_V1=NO`**

D4 does **not** compute: SOH, battery health score, degradation score, risk, failure probability, diagnosis, maintenance recommendation, customer recommendation. D4 remains **evidence integrity / traceability only**.

## Golden authorities (unchanged)

| Authority | SHA-256 (lowercase hex) |
|-----------|-------------------------|
| **C3 golden vector** | `e7b6e05a14a7bece2b8568b716d7dfc2ff360507b7a9f308c5771f648fd8dff3` |
| **D3 profile fingerprint golden** | `e2d39c602370c92a7b4304d01ee0f0d102aa4ce033c38a03f72187a3afbcaecb` |

## M3.3F boundary (explicit)

D4 engineering V1 completion on main does **not** authorize:

- D3 Nest registration
- D3 materialization feature flag
- C3→D3 lifecycle hook
- scheduler / worker / queue
- production profile writes
- production longitudinal materialization
- production data mutation

**M3.3F** remains a separate authorization gate.

## Next slice

**M3.3E E0/E0.1/E0.2** — **COMPLETE ON MAIN** PR #1761 @ merge `658b804d7` (see `M3_3E_E0_LONGITUDINAL_ASSESSMENT_CONSUMPTION_ARCHITECTURE_2026-09-25.md`). **M3.3E E1** — pure input adapter (**NEXT**). **M3.3E health model NOT IMPLEMENTED.**

---

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
