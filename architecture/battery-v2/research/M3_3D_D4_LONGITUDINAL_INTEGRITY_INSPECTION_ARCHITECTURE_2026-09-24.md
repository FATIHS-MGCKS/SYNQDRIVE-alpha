# M3.3D D4 — Longitudinal Integrity / Inspection Architecture Audit

**Date:** 2026-09-24  
**Status:** **ARCHITECTURE AUDIT — D4.1 CONTRACT CLOSURE** (read-only; **not implemented**)  
**Inspection contract (frozen):** `M3_3D_D4_INTEGRITY_INSPECTION_V1`  
**Draft PR:** #1751  
**Main anchor (audit start):** `989d560f57ee4785e0d12fc518e2a204dfa5f826`  
**Upstream complete on main:** D0/D0.1, D1, D2, D3 architecture/D3.1, D3 foundation (PR #1746 @ `c5c1129f`; seal PR #1748 @ `989d560f5`)  
**Runtime gates (unchanged):** **`D3_RUNTIME_REACHABLE=NO`** · **`PRODUCTION_MATERIALIZATION_READY=NO`**

**Normative inputs:** D0–D3 research docs; C5A `M3_3_C5A_SHADOW_OBSERVABILITY_INSPECTION_2026-09-23.md`; C5A inspection code; D1/D2/D3 longitudinal code; Prisma `BatteryRestSession`, `BatteryRestSessionFeature`, `BatteryLongitudinalProfileRevision`.

---

## 1. Scope

D4 defines **read-only** verification of **materialized longitudinal profile revisions** (`BatteryLongitudinalProfileRevision`) and their **C3 source evidence**, without:

- mutating D2 scientific profiles or persisted `scientificProfileJson`
- inventing a second integrity policy incompatible with D0/C5A
- activating D3 production materialization (M3.3F remains separate)
- health / SOH / risk / customer conclusions (M3.3E+)

D4 answers: **“Can this materialized scientific evidence be trusted, traced, and bounded-verified?”** — not **“What does it mean for battery health?”**

---

## 2. Authority chain

```
C3 BatteryRestSessionFeature (append-only source rows)
  → D1 canonical longitudinal input (CANONICAL_SELECTION_INTEGRITY)
  → D2 assembleLongitudinalProfileV1() (scientific profile contract)
  → D3 scientific projection + fingerprint + append-only revision row
  → D4 read-only integrity inspection overlay (this audit)
  → M3.3E+ (future consumer of profile + overlay; not D4)
```

D4 **does not** become a second scientific computation authority. It **reuses** D3 canonicalization for self-checks and **reuses C5A digest/lineage/coverage semantics** for C3 batch checks.

---

## 3. Non-goals

Forbidden in D4 architecture and future D4 engineering:

| Category | Forbidden |
|----------|-----------|
| Scientific mutation | UPDATE `scientificProfileJson`, repair revisions, inject `profileFlags` into stored D2 payload |
| Health semantics | SOH, degradation, failure probability, risk level, diagnosis, customer/maintenance recommendations |
| Production activation | D3 Nest registration, materialization flag, C3 hook, scheduler, queue/worker, production deploy |
| Persistence (V1 default) | D4 result tables/columns; writing inspection outcomes to Postgres |
| N× C5A workflows | `N × RestSessionFeatureShadowInspectionService.inspectSession()` |
| Unbounded reads | `listFeatureRowsForSession()` full history; unbounded revision loads |

---

## 4. Inspection target

**Primary target:** one tenant-scoped `BatteryLongitudinalProfileRevision` identified by:

- `organizationId`
- `vehicleId`
- `revisionId` (UUID)

**Secondary targets:** all C3 rows referenced from the revision’s **scientific profile JSON** (see §9).

---

## 5. D4 overlay decision (critical)

### 5.1 Must D4 mutate D2/D3 scientific identity?

**Audit conclusion:** **NO.**

| Decision | Value | Rationale |
|----------|-------|-----------|
| `D4_MUTATES_D2_PROFILE` | **NO** | `LongitudinalProfileV1` / stored scientific JSON is sealed; D3 fingerprint covers full scientific projection. |
| `D4_MUTATES_D3_SCIENTIFIC_JSON` | **NO** | Immutability + fingerprint contract; repairs belong outside D4 (operational/data ops), not silent rewrite. |
| `D4_USES_SEPARATE_INSPECTION_OVERLAY` | **YES** | D4 output is **`M3_3D_D4_INTEGRITY_INSPECTION_V1`** — read-only overlay referencing revision id, fingerprint, `restSessionId`, `canonicalFeatureRowId`, per-dimension results, eligibility disposition. |

Mutating `perSessionInspectionStatus`, `profileFlags`, `observations`, or `excludedSessions` inside stored scientific JSON would change the D3 fingerprint namespace and invalidate golden vectors — **rejected**.

---

## 6. Materialized revision self-integrity

**Dimension:** `MATERIALIZED_REVISION_SELF_INTEGRITY`

Checks (fail-closed, D3-equivalent semantics):

1. Row exists under **tenant scope** (`organizationId`, `vehicleId`, `revisionId`).
2. `scientificProfileJson` parses via **strict** scientific profile parser (§7) — supported contract/policy versions only.
3. `canonicalFeatureInputUtf8(scientificProfileJson)` → SHA-256 lowercase hex **equals** `canonicalProfileFingerprint`.
4. Fingerprint format: 64-char lowercase hex (`Char(64)` CHECK).
5. Relational mirror columns match projection-derived metadata (same rules as D3 `assertRevisionMetadataMirrorsPersistenceInput`).
6. Supported `longitudinalProfileContractVersion` + `profilePolicyVersion`.

**Statuses (proposed):**

| Status | Meaning |
|--------|---------|
| `SELF_INTEGRITY_OK` | All checks pass |
| `SELF_INTEGRITY_FAILED` | Any check fails (malformed JSON, fingerprint mismatch, mirror drift, unsupported version) |

Self-failure **does not** imply C3 corruption; it implies **stored revision row inconsistency** or unsupported contract.

---

## 7. Strict scientific JSON validation

| Decision | Value |
|----------|-------|
| `STRICT_SCIENTIFIC_JSON_VALIDATION_REQUIRED` | **YES** |

D4 engineering **must** introduce a pure parser/validator, e.g. `parseLongitudinalScientificProfileProjectionV1(json)`, that validates:

- identity, window, coverage, status, flags, statusReasons, trendReadiness  
- observations, provisionalObservations, excludedSessions (with canonical refs)  
- version segments, derived field rules, canonical contexts, version tuples  

**No silent coercion.**

| Failure | `overallStatus` (inside inspection) | Reason code |
|---------|-------------------------------------|-------------|
| Malformed scientific JSON | `REVISION_SELF_INTEGRITY_FAILED` | `MALFORMED_SCIENTIFIC_PROFILE` |
| Unsupported profile contract | `REVISION_SELF_INTEGRITY_FAILED` | `UNSUPPORTED_PROFILE_CONTRACT` |
| Unsupported profile policy | `REVISION_SELF_INTEGRITY_FAILED` | `UNSUPPORTED_PROFILE_POLICY_VERSION` |

These are **stored revision self-integrity / compatibility failures**, not infrastructure execution failures.

Prisma `Json` must **not** be blindly cast to TypeScript types at the D4 boundary.

---

## 8. Per-session cardinality (`perSession[]`)

| Decision | Value |
|----------|-------|
| `D4_PER_SESSION_COVERS_ALL_PROFILE_CANDIDATES` | **YES** |
| `D4_PER_SESSION_COUNT_EQUALS_CANDIDATE_COUNT` | **YES** |

`perSession[]` contains **every** candidate session from the stored scientific profile **exactly once** (DEFAULT observation, PROVISIONAL observation, or EXCLUDED session entry).

**Testable invariant:**

```text
perSession.length === coverage.candidateRestSessionCount
```

Sessions with `canonical = null`: `sourceEvidenceAvailability = NO_SOURCE_REFERENCE_EXPECTED`; nullable `versionTuple` (see §23).

---

## 9. Source-evidence dimensions

### 9.1 Source reference set (for batch + rebuildability counts)

Collect **every** profile item with `canonicalFeatureRowId != null` from:

- `observations[]` (DEFAULT)
- `provisionalObservations[]`
- `excludedSessions[]` (when canonical row id present)

| Decision | Value |
|----------|-------|
| `SOURCE_AUDIT_INCLUDES_PROVISIONAL` | **YES** |
| `SOURCE_AUDIT_INCLUDES_EXCLUDED_WITH_CANONICAL` | **YES** |

Sessions with **no** canonical reference: auditable as `NO_SOURCE_REFERENCE_EXPECTED` — do not fabricate IDs.

Maximum distinct sessions in a profile remains bounded by D1 safety (**100** candidates in window metadata).

### 9.2 Source row existence

**Dimension:** `SOURCE_EVIDENCE_AVAILABILITY`

For each reference:

- row exists at `canonicalFeatureRowId`
- else `SOURCE_ROW_MISSING` for that reference (not global profile corruption)

| Decision | Value |
|----------|-------|
| `SOURCE_EVIDENCE_MISSING_IS_PROFILE_CORRUPTION` | **NO** |

Missing C3 evidence (retention purge, org cascade without D3 FK) → **availability/rebuildability** finding, not automatic `REVISION_CORRUPT`.

### 9.3 Source row identity

**Dimension:** `SOURCE_ROW_IDENTITY_INTEGRITY`

When row exists, verify:

- `organizationId`, `vehicleId`, `restSessionId` match reference context  
- `row.id === canonicalFeatureRowId`  
- `semanticRevision`, `inputDigest`, `computationPhase`, `sessionTrust` match stored reference in profile item  
- persisted version triple on row matches profile item (`featureModelVersion`, `retentionPolicyVersion`, `chargeOpportunityPolicyVersion`)  
- for **DEFAULT / PROVISIONAL**: `inputContractVersion` on profile must match value extracted from persisted row `inputSummary` using the **D4 historical input-summary validator** for that contract version (see §9.6) — **not** `parseLongitudinalInputSnapshotSummary()` as-is for arbitrary history  

For **EXCLUDED** with `INPUT_CONTRACT_VERSION_UNRESOLVED`: see §9.6 — do **not** emit `SOURCE_VERSION_MISMATCH` merely because D1’s current parser rejects the summary.

### 9.4 Source content integrity (D1/D2 provenance — frozen)

**Dimension:** `SOURCE_CONTENT_INTEGRITY`  

| Authority key | Value |
|---------------|-------|
| `SOURCE_FEATURE_SCALAR_AUTHORITY` | **`C3_ROW_COLUMNS`** |
| `SOURCE_SNAPSHOT_CONTEXT_AUTHORITY` | **`C3_INPUT_SUMMARY`** (strict historical parser) |
| `EXCLUDED_SOURCE_CONTENT_INTEGRITY` | **`NOT_APPLICABLE`** |

D2 copies **feature scalars** from persisted `BatteryRestSessionFeature` **column fields** (`LongitudinalInputReaderService.buildInventoryItem()` → `assembleLongitudinalProfileV1()` → `mapObservation()`). They are **not** stored inside `inputSummary`.

**Applicability:**

| Profile slice | Feature scalar ↔ row columns | Snapshot context ↔ parsed `inputSummary` |
|---------------|------------------------------|------------------------------------------|
| DEFAULT | **EVALUATED** | **EVALUATED** |
| PROVISIONAL | **EVALUATED** | **EVALUATED** |
| EXCLUDED (with canonical ref) | **NOT_APPLICABLE** | **NOT_APPLICABLE** |

Excluded sessions persist only: `restSessionId`, `anchorAt`, `sessionStatus`, `endReason`, `exclusionReasons`, `canonical`, `version`, `inputDigest` — **no** `features` or snapshot fields. Do **not** fabricate content comparisons.

**Session metadata** (`anchorAt`, `sessionStatus`, `endReason`) on observations originates from **`BatteryRestSession`** via D1 — **not** C3 row scalars. D4 V1 **does not** treat these as C3 source-content checks unless a future spec defines a separate D1-session provenance dimension (out of scope for V1).

Mismatch on evaluated fields → `SOURCE_CONTENT_MISMATCH` (integrity-warning class), not health signal.

See **§9.7** field map table.

### 9.5 Source temporal provenance

**Dimension:** `SOURCE_TEMPORAL_PROVENANCE_INTEGRITY`  
**Decision:** **ADOPT for D4 V1**

Invariant: referenced C3 row `createdAt` **≤** D3 revision `createdAt` (materialization time).

Use DB `createdAt` timestamps — **not** `computedAt` causality.

Violation → `SOURCE_TEMPORAL_ORDER_INVALID`.

### 9.6 Historical input contract version

Existing `parseLongitudinalInputSnapshotSummary()` requires `inputContractVersion === REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION` — it is **not** a generic historical parser.

| Decision | Value |
|----------|-------|
| `REUSE_D1_CURRENT_INPUT_CONTRACT_PARSER_AS_IS_FOR_HISTORY` | **NO** |
| `UNRESOLVED_EXCLUDED_INPUT_CONTRACT_IS_INTEGRITY_WARNING` | **NO** |

**Rules:**

**A. DEFAULT / PROVISIONAL** — D2 `versionTuple.inputContractVersion` is **RESOLVED**. D4 verifies persisted row/`inputSummary` against the **resolved** contract version stored on the D3 observation using a **separate D4 historical validator** that:

- structurally validates identity/version fields in persisted `inputSummary`  
- extracts persisted `inputContractVersion` without substituting runtime constants  
- delegates version-specific parsing **only** when that contract version is supported  

Do **not** mutate D1 parser semantics.

**B. EXCLUDED with `INPUT_CONTRACT_VERSION_UNRESOLVED`** — profile may carry `version.inputContractVersion = null` and `inputContractResolution = UNRESOLVED` while a canonical C3 row still exists. Emit explicit non-corruption reason, e.g. **`SOURCE_INPUT_CONTRACT_VERSION_UNRESOLVED`** or **`INPUT_CONTRACT_UNRESOLVED_EXPECTED`** — **not** `SOURCE_VERSION_MISMATCH` and **not** `INTEGRITY_WARNING` by unresolved state alone.

**C. Identity/digest/lineage/temporal** checks on excluded canonical refs still apply when row exists.

| Decision | Value |
|----------|-------|
| `UNRESOLVED_INPUT_CONTRACT_REPRESENTABLE` | **YES** |
| `NO_SOURCE_REFERENCE_VERSION_TUPLE_NULLABLE` | **YES** |

### 9.7 Source content field map (V1)

| D3 scientific field | Source authority | Applicability |
|---------------------|------------------|---------------|
| `canonical.canonicalFeatureRowId` | `BatteryRestSessionFeature.id` | DEFAULT / PROVISIONAL / EXCLUDED-with-canonical |
| `canonical.semanticRevision` | row.`semanticRevision` | all canonical refs |
| `canonical.computationPhase` | row.`computationPhase` | all canonical refs |
| `canonical.sessionTrust` | row.`sessionTrust` | all canonical refs |
| `canonical.inputDigest` | row.`inputDigest` | all canonical refs |
| `versionTuple.*` (triple + inputContractVersion) | row version columns + extracted summary contract | DEFAULT/PROVISIONAL resolved; EXCLUDED per §9.6 |
| `features.shutdownToFirstRestDeltaMv` | row.`shutdownToFirstRestDeltaMv` | DEFAULT / PROVISIONAL |
| `features.robustRestSlopeMvPerHour` | row.`robustRestSlopeMvPerHour` | DEFAULT / PROVISIONAL |
| `features.minimumRestVoltageMv` | row.`minimumRestVoltageMv` | DEFAULT / PROVISIONAL |
| `features.maximumRestVoltageMv` | row.`maximumRestVoltageMv` | DEFAULT / PROVISIONAL |
| `features.medianRestVoltageMv` | row.`medianRestVoltageMv` | DEFAULT / PROVISIONAL |
| `features.restVoltageVarianceMv2` | row.`restVoltageVarianceMv2` | DEFAULT / PROVISIONAL |
| `features.numberOfValidRestPoints` | row.`numberOfValidRestPoints` | DEFAULT / PROVISIONAL |
| `features.maxActualRestAgeMs` | row.`maxActualRestAgeMs` | DEFAULT / PROVISIONAL |
| `features.maxInterObservationGapMs` | row.`maxInterObservationGapMs` | DEFAULT / PROVISIONAL |
| `features.observationSpanMs` | row.`observationSpanMs` | DEFAULT / PROVISIONAL |
| `features.missingRungCount` | row.`missingRungCount` | DEFAULT / PROVISIONAL |
| `features.chargeOpportunityClass` | row.`chargeOpportunityClass` | DEFAULT / PROVISIONAL |
| `anchorResolutionStatus` | parsed `inputSummary` anchor resolution | DEFAULT / PROVISIONAL |
| `chargeContextCompleteness` | parsed `inputSummary` charge context | DEFAULT / PROVISIONAL |
| `temperatureC` | parsed `inputSummary` charge opportunity raw | DEFAULT / PROVISIONAL |
| `temperatureSource` | parsed `inputSummary` charge opportunity raw | DEFAULT / PROVISIONAL |
| `anchorAt`, `sessionStatus`, `endReason` (observation) | D1 `BatteryRestSession` (not C3 content check in V1) | — |
| Excluded `features` / snapshot fields | **not persisted** | **NOT_APPLICABLE** |

| Decision | Value |
|----------|-------|
| `SOURCE_CONTENT_FIELD_MAP_DOCUMENTED` | **YES** |

---

## 10. Historical vs current canonical state

A materialized revision is an **immutable historical snapshot**. After materialization:

- newer C3 semantic revisions may appear  
- another row may become **current** canonical  
- live D1→D2 fingerprint may differ  

| Decision | Value |
|----------|-------|
| `CURRENT_CANONICAL_DRIFT_IS_INTEGRITY_FAILURE` | **NO** |
| `CURRENT_LIVE_D2_MISMATCH_IS_CORRUPTION` | **NO** |

**Concepts:**

- **`HISTORICAL_SOURCE_INTEGRITY`** — referenced row at materialization time matches stored refs + C5A checks.  
- **`CURRENT_LIVE_EQUIVALENCE`** — optional contextual comparison to today’s canonical row / fresh assembly — **descriptive only**.

Optional V1 context enum (if implemented later): `UNCHANGED` | `SUPERSEDED_BY_LATER_REVISION` | `NO_CURRENT_CANONICAL` | `NOT_EVALUATED`.

| Decision | Value |
|----------|-------|
| `CURRENT_CANONICAL_CONTEXT_INCLUDED_IN_D4_V1` | **NO** (defer; no audit requirement in V1) |

Supersession is **not** corruption.

---

## 11. Rebuildability definition (deterministic — orthogonal)

D3 labels revisions **REBUILDABLE** meaning **traceability to referenced C3 evidence**, not “always recomputable from live C3 today.”

| Decision | Value |
|----------|-------|
| `REBUILDABILITY_DETERMINISTIC` | **YES** |
| `REBUILDABILITY_USES_UNDEFINED_THRESHOLD` | **NO** |
| `DIGEST_COVERAGE_PARTIAL_DOWNGRADES_REBUILDABILITY` | **NO** |

**`DIGEST_COVERAGE`** (bounded check of non-referenced historical revisions) is **orthogonal** to **`REBUILDABILITY`**. `BOUNDED_LATEST_WINDOW` alone must **not** downgrade rebuildability.

**`MATERIALIZED_REVISION_SELF_INTEGRITY`** is **orthogonal** to **`REBUILDABILITY`**. Fingerprint/mirror self-failure does **not** automatically force `UNAVAILABLE` if the scientific projection is structurally parseable and referenced sources remain verifiable.

Define **`VERIFIABLE_SOURCE_REFERENCE`** (per expected canonical reference):

- referenced source row **exists**  
- source **identity/version** checks pass (per §9.3 / §9.6)  
- referenced-row **digest** passes  
- applicable **source-content** check passes (DEFAULT/PROVISIONAL only)  
- **temporal provenance** passes  

**States — dimension `REBUILDABILITY`:**

| State | Rule |
|-------|------|
| **`FULL`** | Scientific reference set extractable; **every** expected canonical reference is verifiable; if `sourceReferencesExpected === 0`, **FULL** is allowed (no canonical source expected). |
| **`PARTIAL`** | Reference set extractable; `sourceReferencesExpected > 0`; **at least one but fewer than all** expected refs verifiable. |
| **`UNAVAILABLE`** | Reference set **cannot** be safely extracted (malformed / unsupported scientific projection), **OR** `sourceReferencesExpected > 0` and **zero** expected refs verifiable. |

**Do not conflate:** `SOURCE_EVIDENCE_MISSING` ≠ `SOURCE_DIGEST_MISMATCH`; missing source ≠ malformed stored JSON.

Future C3 retention purge does not delete D3 rows — rebuildability may be `PARTIAL`/`UNAVAILABLE` while self-integrity on stored JSON/fingerprint can still be evaluated separately.

---

## 12. Version authority (historical tuples)

| Decision | Value |
|----------|-------|
| `D4_HISTORICAL_VERSION_AWARE` | **YES** |

D4 batch acquisition **must** group work by **persisted version triple** per referenced session (from profile items), not assume current `REST_SESSION_FEATURE_*` constants.

`inputContractVersion` authority lives in each row’s `inputSummary`.

C5A repository helpers today filter via `sessionVersionWhere()` using **runtime constants** — **insufficient for D4 historical inspection**.

| Decision | Value |
|----------|-------|
| `REUSE_C5A_SEMANTICS` | **YES** (digest, lineage derivation, coverage accounting) |
| `REUSE_C5A_CURRENT_VERSION_QUERY_AS_IS` | **NO** |

D4 engineering adds **set-based parameterized batch queries** (§13) — not per-triple round trips.

---

## 13. C5A reuse (relation)

| Layer | Role |
|-------|------|
| **C5A** | Per-session C3 shadow inspection (`inspectSession`) — ops CLI, C5B UI |
| **D4** | Longitudinal **materialized revision** inspection — batch across profile references |

D4 **reuses:**

- `verifyPersistedFeatureRowDigest()` / `computeFeatureInputDigestFromSnapshot`  
- `deriveSemanticRevisionIntegrityFromAggregate()`  
- `computeDigestVerificationAccounting()` semantics (FULL vs `BOUNDED_LATEST_WINDOW`)  
- `REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS` (**K = 100**)

D4 **does not:**

- call `inspectSession()` in a loop  
- replace C5A  
- fork digest serialization  

---

## 14. Bounded database acquisition plan (constant round trips)

| Guard | Value |
|-------|-------|
| `N_PLUS_ONE_INSPECTION_ALLOWED` | **NO** |
| `UNBOUNDED_REVISION_READ_ALLOWED` | **NO** |

**Profile session bound:** ≤ **100** distinct `restSessionId` references (aligned with `LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS`).

**Per-session revision bound:** latest **K=100** semantic revisions (same as C5A) via window query + **union** referenced `canonicalFeatureRowId` even if outside latest-K window.

**Per-session revision materialization bound:** latest **K=100** semantic revisions (C5A) via set-based window query + **union** each referenced `canonicalFeatureRowId` if not already in latest-K.

| Guard | Value |
|-------|-------|
| `D4_DB_ROUND_TRIPS_SCALE_WITH_SESSION_COUNT` | **NO** |
| `D4_DB_ROUND_TRIPS_SCALE_WITH_VERSION_TRIPLE_COUNT` | **NO** |
| `N_PLUS_ONE_INSPECTION_ALLOWED` | **NO** |
| `UNBOUNDED_REVISION_READ_ALLOWED` | **NO** |

**Set-based batch design (frozen):** build one bounded input relation (≤ **100** rows) via `VALUES` / `UNNEST` / `json_to_recordset` (or equivalent) with columns:

`organizationId`, `vehicleId`, `restSessionId`, `canonicalFeatureRowId`, `featureModelVersion`, `retentionPolicyVersion`, `chargeOpportunityPolicyVersion`

Then execute a **fixed** number of SQL statements inside one **`RepeatableRead`** read-only transaction:

| Step | Statement purpose |
|------|-------------------|
| 1 | Tenant-scoped D3 revision read |
| 2 | Referenced C3 source-row batch read by id + tenant keys |
| 3 | Grouped revision-lineage **aggregates** for all session/version keys in the input set |
| 4 | Latest-**K**-per-session/version batch window + referenced-row union |

Combined SQL is acceptable if statement count remains constant.

**`D4_DB_ROUND_TRIP_BOUND`:** **≤ 4** SQL round trips (or **1** combined statement design) — **independent of session count (≤100) and independent of distinct version triple count**.

**Result row bound (materialized rows returned to application):**

```text
≤ 100 session references × (K=100 latest rows + at most 1 referenced-row union)
→ ≤ 10,100 materialized C3 revision rows
+ ≤ 100 aggregate result rows
```

| Decision | Value |
|----------|-------|
| `D4_RESULT_ROW_BOUND_EXPLICIT` | **YES** |
| `D4_SERVER_SIDE_AGGREGATE_SCAN_CLAIMED_K_BOUNDED` | **NO** |

Server-side aggregate/index scans may touch **>K** historical rows; architecture caps **materialized result rows**, not physical index scan depth.

**Forbidden:** `listFeatureRowsForSession()` unbounded; N× `inspectSession()`; DB round trips scaling with session or triple count.

---

## 15. Transaction isolation

| Decision | Value |
|----------|-------|
| `D4_INSPECTION_TRANSACTION` | **`RepeatableRead`** (single read-only interactive transaction for D3 row + batch C3 reads + aggregates) |

Matches C5A snapshot semantics. Digest verification on union(latest-K, referenced row) runs **inside** consistent snapshot after loads.

---

## 16. Tenant isolation

D3 `findById(id)` is **not** tenant-scoped — **must not** be exposed as D4 entrypoint.

| Decision | Value |
|----------|-------|
| `D4_REVISION_LOOKUP_TENANT_SCOPED` | **YES** |

Required lookup:

```text
findRevisionForInspection({ organizationId, vehicleId, revisionId })
```

DB `WHERE` must constrain all three. Authorization alone is insufficient.

**This audit does not change D3 repository** — defines D4 requirement only.

---

## 17. Digest integrity

For each checked C3 row in the bounded set:

- recompute digest from parsed `inputSummary`  
- compare to persisted `inputDigest`  

Referenced canonical row for D3 profile item **always** included in checked set even if outside latest-K window.

Mismatch → digest integrity warning (C5A-equivalent).

**Coverage dimension:** `DIGEST_COVERAGE`

- `FULL` when ≤ K rows and all checked  
- `BOUNDED_LATEST_WINDOW` when older rows exist unchecked  

`INTEGRITY_PARTIAL` disposition: **bounded verification only** — **not** quarantine by coverage alone (D0 rule preserved).

---

## 18. Revision lineage integrity

**Dimension:** `REVISION_LINEAGE_INTEGRITY`

Use aggregate counts per session+version triple → `deriveSemanticRevisionIntegrityFromAggregate()`.

Non-zero `semanticRevisionGapCount` or `duplicateSemanticRevisionCount` → lineage warning (C5A-equivalent **`INTEGRITY_WARNING`** class).

---

## 19. Integrity-qualified eligibility (overlay)

D4 **does not** rewrite D2/D3 JSON. Disposition applies to **DEFAULT observations** (and reporting counts) on the overlay:

| Condition | Default observation disposition |
|-----------|----------------------------------|
| Digest mismatch on referenced canonical row | `QUARANTINED_INTEGRITY_WARNING` |
| Revision lineage warning (gap/duplicate) | `QUARANTINED_INTEGRITY_WARNING` (preserve C5A overall semantics) |
| Digest coverage partial only | **`ELIGIBLE`** (metadata: bounded coverage — not quarantine) |
| Missing historical source row | `SOURCE_EVIDENCE_LIMITED` (not auto-labeled corruption) |
| Self-integrity OK + source OK | `ELIGIBLE` |
| Self-integrity failed (parseable projection) | **`NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED`** for all DEFAULT observations — forensic source findings only |

Overlay may expose:

- `integrityQualifiedDefaultObservationIds[]`  
- `quarantinedDefaultObservationCount`  
- per-session `integrityQualifiedDisposition`

**Profile flags:** do **not** inject into `LongitudinalProfileV1.profileFlags`. Use overlay `inspectionFlags` only, e.g.:

- `INTEGRITY_LIMITED`  
- `SOURCE_EVIDENCE_LIMITED`  
- `REBUILDABILITY_LIMITED`  

---

## 20. Service outcome vs inspection `overallStatus`

### 20.1 Top-level service result

```typescript
type D4InspectionOutcome =
  | { status: 'REVISION_NOT_FOUND' }
  | { status: 'OK'; inspection: M3_3D_D4_INTEGRITY_INSPECTION_V1 };
```

| Decision | Value |
|----------|-------|
| `REVISION_NOT_FOUND_IS_TOP_LEVEL_OUTCOME` | **YES** |
| `TECHNICAL_EXECUTION_FAILURE_IS_SCIENTIFIC_INTEGRITY_STATUS` | **NO** |

Unexpected DB / internal failures: **throw / fail closed** (or repository-layer technical error) — **not** represented as `inspection.profile.overallStatus`.

`REVISION_NOT_FOUND` is **not** a reason code inside `overallStatus`.

### 20.2 Inspection `overallStatus` (evidence / integrity only)

| `overallStatus` | Meaning |
|-----------------|--------|
| `OK` | Self-integrity OK; no integrity warnings in checked scope |
| `INTEGRITY_PARTIAL` | Self-integrity OK; bounded digest coverage only |
| `INTEGRITY_WARNING` | Digest mismatch, lineage gap/duplicate, identity/content/temporal failures in checked rows |
| `SOURCE_EVIDENCE_LIMITED` | Self-integrity OK; one or more referenced rows missing |
| `REVISION_SELF_INTEGRITY_FAILED` | Malformed/unsupported stored profile **or** fingerprint/mirror self-failure |

**Removed from `overallStatus`:** `INSPECTION_EXECUTION_FAILED`.

| Semantic failure | Maps to |
|------------------|---------|
| `MALFORMED_SCIENTIFIC_PROFILE` | `REVISION_SELF_INTEGRITY_FAILED` |
| `UNSUPPORTED_PROFILE_CONTRACT` | `REVISION_SELF_INTEGRITY_FAILED` |
| `UNSUPPORTED_PROFILE_POLICY_VERSION` | `REVISION_SELF_INTEGRITY_FAILED` |

**Precedence (deterministic):**

1. If strict parse fails / contract unsupported → return inspection with `overallStatus = REVISION_SELF_INTEGRITY_FAILED` (**no source batch**)  
2. Else if fingerprint or mirror fails → **forensic source batch allowed**; `overallStatus = REVISION_SELF_INTEGRITY_FAILED`; **zero** `ELIGIBLE` defaults  
3. Else if any source integrity warning → `INTEGRITY_WARNING`  
4. Else if missing sources → `SOURCE_EVIDENCE_LIMITED`  
5. Else if digest coverage partial only → `INTEGRITY_PARTIAL`  
6. Else `OK`  

| Decision | Value |
|----------|-------|
| `SOURCE_BATCH_AFTER_PARSE_FAILURE` | **NO** |
| `SOURCE_BATCH_AFTER_PARSEABLE_FINGERPRINT_OR_MIRROR_FAILURE` | **FORENSIC_ALLOWED** |
| `SELF_FAILED_PROFILE_CAN_REPORT_ELIGIBLE_DEFAULT` | **NO** |

### 20.3 Orthogonal dimensions (unchanged visibility)

1. `MATERIALIZED_REVISION_SELF_INTEGRITY`  
2. `SOURCE_EVIDENCE_AVAILABILITY`  
3. `SOURCE_ROW_IDENTITY_INTEGRITY`  
4. `SOURCE_CONTENT_INTEGRITY`  
5. `SOURCE_TEMPORAL_PROVENANCE_INTEGRITY`  
6. `DIGEST_INTEGRITY`  
7. `REVISION_LINEAGE_INTEGRITY`  
8. `DIGEST_COVERAGE`  
9. `REBUILDABILITY`  
10. `INTEGRITY_QUALIFIED_ELIGIBILITY`  

**`DimensionResult` (frozen enum):** `PASS` | `FAIL` | `NOT_EVALUATED` | `NOT_APPLICABLE`

When source row missing: identity, digest, content, temporal → **`NOT_EVALUATED`**; lineage → evaluate from aggregate if session/version aggregate available, else **`NOT_EVALUATED`**.

---

## 21. Machine-readable reason codes

Separate codes (no health terminology):

| Code | Condition |
|------|-----------|
| `UNSUPPORTED_PROFILE_CONTRACT` | Unknown longitudinal profile contract version |
| `UNSUPPORTED_PROFILE_POLICY_VERSION` | Unknown profile policy version |
| `MALFORMED_SCIENTIFIC_PROFILE` | Strict parse failure |
| `PROFILE_FINGERPRINT_MISMATCH` | Recomputed ≠ stored fingerprint |
| `PROFILE_METADATA_MIRROR_MISMATCH` | Mirror columns ≠ projection |
| `SOURCE_ROW_MISSING` | Referenced id absent |
| `SOURCE_IDENTITY_MISMATCH` | Row exists but identity fields mismatch |
| `SOURCE_VERSION_MISMATCH` | Version tuple mismatch |
| `SOURCE_DIGEST_MISMATCH` | Digest recompute failure |
| `SOURCE_CONTENT_MISMATCH` | Observation copy ≠ C3 parsed content |
| `SOURCE_TEMPORAL_ORDER_INVALID` | C3 `createdAt` > revision `createdAt` |
| `SEMANTIC_REVISION_GAP` | Lineage gap count > 0 |
| `SEMANTIC_REVISION_DUPLICATE` | Duplicate semantic revision count > 0 |
| `SOURCE_INPUT_CONTRACT_VERSION_UNRESOLVED` | Excluded / expected unresolved input contract (non-warning) |
| `DIGEST_COVERAGE_PARTIAL` | Unchecked rows remain in session history |
| `INSPECTION_INTERNAL_ERROR` | Unexpected failure (service layer — not `overallStatus`) |

---

## 22. Processing order (deterministic)

**CASE A — revision not found:** return `{ status: 'REVISION_NOT_FOUND' }` — **no** source inspection.

**CASE B — strict scientific parse fails / contract unsupported:** return `{ status: 'OK', inspection }` with `overallStatus = REVISION_SELF_INTEGRITY_FAILED` — **no** source batch (trusted reference set not extractable).

**CASE C — parse succeeds but fingerprint or mirror fails:** source batch **may** run for forensic reporting; `overallStatus = REVISION_SELF_INTEGRITY_FAILED`; no DEFAULT `ELIGIBLE`.

**CASE D — self-integrity OK:** full source batch + eligibility overlay.

Steps:

1. Tenant-scoped D3 revision load  
2. Strict scientific JSON parse → CASE B if fail  
3. Fingerprint self-verification  
4. Mirror metadata self-verification → CASE C if fail after parse OK  
5. Build `perSession[]` + source reference set (all candidates)  
6. Bounded set-based C3 acquisition (RR snapshot) — CASE D or forensic C  
7. Per-session dimensions + aggregate `overallStatus` + rebuildability + eligibility  

---

## 23. Timestamp authority

| Field | Authority |
|-------|-----------|
| `inspectionGeneratedAt` | **Service wall clock (B)** — observability only; **not** part of D3 fingerprint |
| D3 scientific times | From stored profile / revision `createdAt` only |

Optional caller-provided envelope timestamp deferred (open for deterministic replay tests in engineering).

---

## 24. D4 V1 contract sketch (`M3_3D_D4_INTEGRITY_INSPECTION_V1`)

```typescript
type DimensionResult = 'PASS' | 'FAIL' | 'NOT_EVALUATED' | 'NOT_APPLICABLE';

type D4InspectionOutcome =
  | { status: 'REVISION_NOT_FOUND' }
  | { status: 'OK'; inspection: M3_3D_D4_INTEGRITY_INSPECTION_V1 };

type M3_3D_D4_INTEGRITY_INSPECTION_V1 = {
  inspectionContractVersion: 'M3_3D_D4_INTEGRITY_INSPECTION_V1';
  inspectionGeneratedAt: string; // ISO-8601, service wall clock
  snapshotIsolation: 'REPEATABLE_READ';

  identity: {
    organizationId: string;
    vehicleId: string;
    revisionId: string;
    canonicalProfileFingerprint: string;
  };

  materializedRevision: {
    selfIntegrity: 'SELF_INTEGRITY_OK' | 'SELF_INTEGRITY_FAILED';
    selfIntegrityReasons: ReasonCode[];
  };

  coverage: {
    candidateRestSessionCount: number;
    sourceReferencesExpected: number;
    sourceRowsFound: number;
    sourceRowsMissing: number;
    verifiableSourceReferenceCount: number;
    digestRowsChecked: number;
    digestRowsUnchecked: number;
    digestVerificationScope: 'FULL' | 'BOUNDED_LATEST_WINDOW';
  };

  perSession: Array<{
    restSessionId: string;
    profileSlice: 'DEFAULT' | 'PROVISIONAL' | 'EXCLUDED';
    versionTuple:
      | {
          featureModelVersion: string;
          retentionPolicyVersion: string;
          chargeOpportunityPolicyVersion: string;
          inputContractVersion: string | null;
          inputContractResolution: 'RESOLVED' | 'UNRESOLVED';
        }
      | null;
    canonicalFeatureRowId: string | null;
    sourceEvidenceAvailability: 'FOUND' | 'MISSING' | 'NO_SOURCE_REFERENCE_EXPECTED';
    sourceIdentity: DimensionResult;
    sourceContentIntegrity: DimensionResult;
    sourceTemporalProvenance: DimensionResult;
    digestIntegrity: DimensionResult;
    revisionLineage: DimensionResult;
    digestCoverage: DimensionResult;
    integrityQualifiedDisposition:
      | 'ELIGIBLE'
      | 'QUARANTINED_INTEGRITY_WARNING'
      | 'SOURCE_EVIDENCE_LIMITED'
      | 'NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED'
      | 'NOT_APPLICABLE';
    reasons: ReasonCode[];
  }>;

  profile: {
    overallStatus:
      | 'OK'
      | 'INTEGRITY_PARTIAL'
      | 'INTEGRITY_WARNING'
      | 'SOURCE_EVIDENCE_LIMITED'
      | 'REVISION_SELF_INTEGRITY_FAILED';
    inspectionFlags: string[];
    rebuildability: 'FULL' | 'PARTIAL' | 'UNAVAILABLE';
    integrityQualifiedDefaultCount: number;
    quarantinedDefaultCount: number;
  };
};
```

| Decision | Value |
|----------|-------|
| `SOURCE_CONTENT_DIMENSION_IN_CONTRACT` | **YES** |
| `SOURCE_TEMPORAL_DIMENSION_IN_CONTRACT` | **YES** |

---

## 25. Persistence decision

| Decision | Value |
|----------|-------|
| `D4_PERSISTENCE_REQUIRED` | **NO** (V1) |

Inspection results are **computed read-only** and returned to caller. No D4 columns on `BatteryLongitudinalProfileRevision`; no inspection-results table in V1.

Future persistence (if ever required) is a **separate decision** — not implied by this audit.

---

## 26. Operational surface decision

| Decision | Value |
|----------|-------|
| `D4_V1_SURFACE_DECISION` | **A — pure internal service only (V1)** |

Justification:

- D3 writer remains unreachable; production may have **zero** longitudinal revisions to inspect.  
- C5B already covers per-session C3 inspection.  
- D4 engineering can add **optional** ops CLI / Master Admin read-only extension **after** internal service + tests, without blocking V1 contract freeze.  

Customer UI: **forbidden**. Metrics-only surface: **deferred** (optional later).

---

## 27. D4 → M3.3E boundary

M3.3E may consume:

- D3 scientific profile (immutable JSON)  
- D4 integrity overlay (eligibility + evidence-quality dimensions)

M3.3E **must not** treat `INTEGRITY_PARTIAL`, `SOURCE_EVIDENCE_MISSING`, or digest coverage as health degradation.

D4 **must not** write `BatteryAssessment` / publication tables.

---

## 28. D4 → M3.3F boundary

D4 completion **does not** authorize:

- D3 Nest registration  
- materialization feature flag  
- production writer / C3 hook / scheduler  

M3.3F remains explicit authorization for production shadow materialization.

D4 tests may insert isolated revisions in **ephemeral PostgreSQL** only.

---

## 29. Test matrix (design only — not implemented in this audit)

### Unit

- Valid revision self-integrity  
- Malformed JSON → `REVISION_SELF_INTEGRITY_FAILED`, **no** source batch  
- Unsupported contract/policy → `REVISION_SELF_INTEGRITY_FAILED`  
- Fingerprint mismatch after valid parse → forensic source batch; **zero** eligible defaults  
- Metadata mirror mismatch (same as fingerprint case)  
- DEFAULT feature scalar copy equals C3 **row columns**  
- PROVISIONAL feature scalar copy equals C3 row columns  
- Snapshot context equality uses D4 historical `inputSummary` parser (not D1 parser for wrong contract)  
- Excluded canonical: source content **`NOT_APPLICABLE`**; identity/digest/lineage/temporal still evaluated  
- Unresolved excluded input contract → expected reason, **not** integrity warning  
- Missing source ≠ profile corruption; rebuildability **FULL/PARTIAL/UNAVAILABLE** deterministic  
- Partial digest coverage alone does **not** downgrade rebuildability  
- Integrity warning → quarantine DEFAULT; partial coverage does not auto-quarantine  
- `perSession.length === candidateRestSessionCount`; nullable version tuple for no-source candidates  
- `REVISION_NOT_FOUND` top-level outcome  

### PostgreSQL (ephemeral)

- Tenant-scoped revision lookup; cross-tenant source ids cannot leak rows  
- RepeatableRead snapshot behavior  
- **Fixed SQL statement count** for 1, 10, and 100 sessions (same count)  
- **Fixed SQL statement count** with 1 vs many persisted version triples  
- Latest K + referenced union output bound (≤ 10,100 materialized rows)  
- Aggregate may scan >K server-side without materializing all rows  
- Historical version tuples in one set-based batch  
- Source row delete → `SOURCE_EVIDENCE_LIMITED`  
- D3 revision survives C3 purge simulation  
- **Zero D4 writes**  

---

## 30. Open decisions (non-blocking for D4.1 closure)

| Item | Status |
|------|--------|
| Exact combined SQL shape for 4-step batch | **ENGINEERING_DETAIL** |
| Caller-provided `inspectionGeneratedAt` for deterministic tests | **OPTIONAL** |
| Ops CLI / C5B longitudinal tab timing | **POST_V1** |
| `RETENTION_POLICY` vs rebuildability product labeling | **DECISION_REQUIRED** (product/ops) |
| D1-session metadata provenance dimension (`anchorAt` etc.) | **OUT_OF_V1** |

---

## 31. Implementation readiness gate (D4.1)

| Gate | Result |
|------|--------|
| Source content authority (row columns vs inputSummary) | **CLOSED** (D4.1) |
| Excluded content applicability | **CLOSED** (D4.1) |
| Historical input contract semantics | **CLOSED** (D4.1) |
| Deterministic rebuildability | **CLOSED** (D4.1) |
| Outcome vs overallStatus taxonomy | **CLOSED** (D4.1) |
| Self-failure processing order | **CLOSED** (D4.1) |
| Complete V1 contract dimensions | **CLOSED** (D4.1) |
| Constant round-trip batch plan | **CLOSED** (D4.1) |
| perSession cardinality + nullable tuples | **CLOSED** (D4.1) |
| Overlay vs mutation | **CLOSED** |
| Tenant scoping / RepeatableRead | **CLOSED** |
| Test matrix | **CLOSED** (design) |

**`D4_IMPLEMENTATION_READY=YES`**

Engineering may proceed on a **separate PR** after this architecture audit merges. **No D4 code in PR #1751.**

---

## Appendix — audit decision summary (incl. D4.1)

| Key | Value |
|-----|-------|
| `D4_MUTATES_D2_PROFILE` | NO |
| `D4_MUTATES_D3_SCIENTIFIC_JSON` | NO |
| `D4_USES_SEPARATE_INSPECTION_OVERLAY` | YES |
| `D4_PERSISTENCE_REQUIRED` | NO |
| `D4_INSPECTION_CONTRACT_VERSION` | `M3_3D_D4_INTEGRITY_INSPECTION_V1` |
| `D4_DB_ROUND_TRIP_BOUND` | ≤4 (constant; not scaling with sessions/triples) |
| `D4_RESULT_ROW_BOUND` | ≤10,100 materialized C3 rows + ≤100 aggregates |
| `D4_INSPECTION_TRANSACTION` | RepeatableRead |
| `REBUILDABILITY_STATES` | FULL \| PARTIAL \| UNAVAILABLE |
| `SOURCE_FEATURE_SCALAR_AUTHORITY` | C3_ROW_COLUMNS |
| `SOURCE_SNAPSHOT_CONTEXT_AUTHORITY` | C3_INPUT_SUMMARY |
| `EXCLUDED_SOURCE_CONTENT_INTEGRITY` | NOT_APPLICABLE |
| `MALFORMED_PROFILE_STATUS` | REVISION_SELF_INTEGRITY_FAILED |
| `UNSUPPORTED_CONTRACT_STATUS` | REVISION_SELF_INTEGRITY_FAILED |
| `DIMENSION_RESULT_ENUM` | PASS \| FAIL \| NOT_EVALUATED \| NOT_APPLICABLE |
