# M3.3D D4 — Longitudinal Integrity / Inspection Architecture Audit

**Date:** 2026-09-24  
**Status:** **ARCHITECTURE AUDIT — D4.3 FINAL CONSISTENCY CLOSURE** (read-only; **not implemented**)  
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

## 7. Strict scientific JSON validation (D2 semantic invariants)

| Decision | Value |
|----------|-------|
| `STRICT_SCIENTIFIC_JSON_VALIDATION_REQUIRED` | **YES** |
| `STRICT_PARSER_VALIDATES_D2_SEMANTIC_INVARIANTS` | **YES** |
| `SCIENTIFIC_JSON_PROFILE_GENERATED_AT_FORBIDDEN` | **YES** |

D4 engineering **must** introduce a pure validator, e.g. `parseLongitudinalScientificProfileProjectionV1(json)`, that validates **sealed D2 V1 output semantics** — not merely JSON/TypeScript shape. This is **contract verification**, not a second scientific computation path.

Prisma `Json` must **not** be blindly cast at the D4 boundary.

### 7.1 Identity / contract

- Supported `longitudinalProfileContractVersion` and `profilePolicyVersion` (registry in engineering)  
- Non-empty `organizationId`, `vehicleId`  
- Scientific projection **must not** contain `window.profileGeneratedAt` (omitted in D3 stored scientific JSON)

### 7.2 Window

- `requestedSessionLimit` / `appliedSessionLimit`: integers in `1..LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS` (**100**)  
- `requestedSessionLimit === appliedSessionLimit`  
- `candidateRestSessionCount <= appliedSessionLimit`  
- Canonical ISO timestamps where applicable

### 7.3 Partition (coverage counts)

| Invariant | Rule |
|-----------|------|
| `PROFILE_PARTITION_INVARIANTS_DEFINED` | **YES** |
| Candidate partition | `candidateRestSessionCount === observations.length + provisionalObservations.length + excludedSessions.length` |
| Included / provisional / excluded counts | Match respective array lengths |
| Unique sessions | Every `restSessionId` appears **exactly once** across the three arrays |

### 7.4 DEFAULT / PROVISIONAL observations

- Require `canonical`, resolved four-part `versionTuple`, `features`, snapshot-derived fields  
- `perSessionInspectionStatus === 'NOT_EVALUATED'` only — no pre-embedded D4 status in D2 JSON

### 7.5 EXCLUDED sessions

- Valid recognized `exclusionReasons` only  
- No fabricated feature/snapshot fields  
- `canonical` / `version` nullability consistent with sealed D2 V1

### 7.6 Profile status

- `profileStatus === 'OK'` iff `observations.length > 0`  
- `profileStatus === 'NO_ELIGIBLE_SESSIONS'` iff `observations.length === 0`

### 7.7 Window derivations (`PROFILE_DERIVED_INVARIANTS_DEFINED=YES`)

| Observations | Rule |
|--------------|------|
| 0 | `firstIncludedAnchorAt`, `lastIncludedAnchorAt`, `validEvidenceSpanMs` all **null** |
| 1 | first/last anchors equal observation[0].anchorAt; `validEvidenceSpanMs === 0` |
| >1 | first/last anchors equal first/last DEFAULT observation; `validEvidenceSpanMs === lastAnchor - firstAnchor` |

### 7.8 Status reasons

- `stableDefaultCount === observations.length`  
- `provisionalCount === provisionalObservations.length`  
- `excludedCount === excludedSessions.length`  
- `versionSegmentCount === versionSegments.length`  
- `excludedByReason` equals recomputation from `excludedSessions[].exclusionReasons` (multi-reason per session allowed — **do not** require histogram sum == excluded session count)

### 7.9 Version segments (`VERSION_SEGMENT_INVARIANTS_DEFINED=YES`)

Must match ordered DEFAULT observations exactly:

- contiguous `segmentIndex` from 0  
- constant four-part tuple within each segment  
- correct `sessionCount`, `firstAnchorAt`, `lastAnchorAt`  
- adjacent equal tuples **not** split into two segments  
- all DEFAULT observations covered once; no PROVISIONAL/EXCLUDED in segments

### 7.10 Profile flags (`PROFILE_FLAG_INVARIANTS_DEFINED=YES`)

Deterministic D2 flags only — no unknown flags, no duplicates:

| Flag | Rule |
|------|------|
| `VERSION_SEGMENTED` | iff `versionSegments.length > 1` |
| `PROVISIONAL_SESSIONS_PRESENT` | iff `provisionalObservations.length > 0` |
| `INPUT_CONTRACT_UNRESOLVED_PRESENT` | iff any excluded candidate includes `INPUT_CONTRACT_VERSION_UNRESOLVED` |

### 7.11 Derived / ordering

- `derived === null` for D2 V1  
- Each of observations / provisionalObservations / excludedSessions: sort **anchorAt ASC**, then `restSessionId` **UTF-16 code-unit lexical** (no `localeCompare`)

### 7.12 Parse failure outcome (no fake full overlay)

| Decision | Value |
|----------|-------|
| `UNPARSEABLE_PROFILE_RETURNS_FULL_INSPECTION` | **NO** |
| `UNPARSEABLE_PROFILE_HAS_DISTINCT_FAILURE_OUTCOME` | **YES** |

If strict parse / unsupported profile contract or policy fails → return top-level `{ status: 'REVISION_SELF_INTEGRITY_FAILED', failure: D4RevisionSelfIntegrityFailureV1 }` — **not** `{ status: 'OK', inspection }` with fabricated `perSession[]`, rebuildability, or digest coverage.

Reason codes on failure envelope: `MALFORMED_SCIENTIFIC_PROFILE`, `UNSUPPORTED_PROFILE_CONTRACT`, `UNSUPPORTED_PROFILE_POLICY_VERSION`, etc.

Architecture requires **unit tests for each invariant family** in §7.1–§7.11.

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

Sessions with `canonical = null`: `sourceEvidenceAvailability = NO_SOURCE_REFERENCE_EXPECTED`; nullable `versionTuple` (see §24).

**Note:** `perSession[]` exists only on `{ status: 'OK', inspection }`. Unparseable revisions return `D4RevisionSelfIntegrityFailureV1` without `perSession[]`.

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

### 9.4 Source content subdimensions (D1/D2 provenance — frozen)

| Decision | Value |
|----------|-------|
| `SOURCE_CONTENT_SINGLE_AMBIGUOUS_FIELD_REMOVED` | **YES** |
| `SOURCE_FEATURE_SCALAR_DIMENSION` | **`sourceFeatureScalarIntegrity`** |
| `SOURCE_SNAPSHOT_CONTEXT_DIMENSION` | **`sourceSnapshotContextIntegrity`** |

V1 contract exposes **two** explicit `DimensionResult` fields — **not** a single ambiguous `sourceContentIntegrity`.

| Authority key | Value |
|---------------|-------|
| `SOURCE_FEATURE_SCALAR_AUTHORITY` | **`C3_ROW_COLUMNS`** |
| `SOURCE_SNAPSHOT_CONTEXT_AUTHORITY` | **`C3_INPUT_SUMMARY`** (D4 historical parser when registered) |
| `EXCLUDED_CONTENT_RESULT` | **`NOT_APPLICABLE`** (both subdimensions) |

**Applicability matrix:**

| Profile slice | `sourceFeatureScalarIntegrity` | `sourceSnapshotContextIntegrity` |
|---------------|-------------------------------|----------------------------------|
| DEFAULT / PROVISIONAL (canonical present) | PASS \| FAIL \| NOT_EVALUATED | PASS \| FAIL \| NOT_EVALUATED |
| EXCLUDED (with canonical ref) | **NOT_APPLICABLE** | **NOT_APPLICABLE** |
| `NO_SOURCE_REFERENCE_EXPECTED` | **NOT_APPLICABLE** | **NOT_APPLICABLE** |
| Missing referenced source row | **NOT_EVALUATED** | **NOT_EVALUATED** |

| Decision | Value |
|----------|-------|
| `NO_SOURCE_EXPECTED_CONTENT_RESULT` | **NOT_APPLICABLE** |
| `MISSING_SOURCE_CONTENT_RESULT` | **NOT_EVALUATED** |

Mismatch on an evaluated subdimension → **`SOURCE_CONTENT_MISMATCH`** (integrity-warning class). Documentation must record **which subdimension** failed (scalar vs snapshot); optional future split to `SOURCE_FEATURE_SCALAR_MISMATCH` / `SOURCE_SNAPSHOT_CONTEXT_MISMATCH` is **not required** for V1 if `SOURCE_CONTENT_MISMATCH` + subdimension FAIL is sufficient.

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

### 9.8 Unsupported but matching historical input contract (D4.2)

Profile `inputContractVersion = X` and persisted C3 `inputSummary.inputContractVersion = X` (no version mismatch), but **no** D4 snapshot parser registered for `X`.

| Decision | Value |
|----------|-------|
| `UNSUPPORTED_MATCHING_SOURCE_INPUT_CONTRACT_IS_VERSION_MISMATCH` | **NO** |
| `UNSUPPORTED_SOURCE_INPUT_CONTRACT_REASON_DEFINED` | **YES** |
| `UNSUPPORTED_SOURCE_INPUT_CONTRACT_IS_INTEGRITY_WARNING` | **NO** |
| `UNSUPPORTED_SOURCE_INPUT_CONTRACT_DISPOSITION` | **`SOURCE_EVIDENCE_LIMITED`** |

Reason code: **`UNSUPPORTED_SOURCE_INPUT_CONTRACT`**.

| Decision | Value |
|----------|-------|
| `UNSUPPORTED_INPUT_CONTRACT_SNAPSHOT_RESULT` | **`NOT_EVALUATED`** |

**V1 semantics (DEFAULT/PROVISIONAL with canonical row):**

| Check | Result |
|-------|--------|
| `sourceIdentity` | **PASS** if persisted version strings match |
| `digestIntegrity` | Evaluate normally (canonical digest) |
| `sourceFeatureScalarIntegrity` | Compare C3 **row columns** (`UNSUPPORTED_INPUT_CONTRACT_SCALAR_CHECKED=YES`) |
| `sourceSnapshotContextIntegrity` | **PASS/FAIL** when parser registered; else **`NOT_EVALUATED`** + `UNSUPPORTED_SOURCE_INPUT_CONTRACT` |
| DEFAULT disposition precedence | **`sourceFeatureScalarIntegrity=FAIL`** → **`INTEGRITY_WARNING`** / `QUARANTINED_INTEGRITY_WARNING` (**`SCALAR_MISMATCH_OUTRANKS_UNSUPPORTED_PARSER=YES`**) |
| Else unsupported snapshot parser only | **`SOURCE_EVIDENCE_LIMITED`** |
| Rebuildability | Reference **not** `VERIFIABLE_SOURCE_REFERENCE` when snapshot subdimension not PASS where applicable |

**D4 V1 historical input parser registry (architecture time):**

| Registered contract | Parser |
|---------------------|--------|
| `M3_3C_FEATURE_INPUT_V1` | D4 historical snapshot parser (engineering; not D1 parser reuse) |

Future contracts: **additive explicit registration only** — do not invent parsers in architecture.

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
- where applicable: `sourceFeatureScalarIntegrity === PASS` **and** `sourceSnapshotContextIntegrity === PASS` (EXCLUDED canonical refs: content subdimensions **NOT_APPLICABLE** — do not block verifiability)  
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

**Result row bounds (four-step design — D4.3):**

| Bound | Value |
|-------|-------|
| `D4_UNIQUE_C3_ROW_ID_BOUND` | **≤ 10,100** unique C3 row ids materialized across the inspection snapshot |
| `D4_FOUR_STEP_C3_RESULT_INSTANCE_BOUND` | **≤ 10,200** total C3 row **result instances** returned across SQL responses in the 4-step design (step 2 ≤100 referenced rows + step 4 ≤10,100 window/union rows; overlap allowed) |
| `D4_AGGREGATE_RESULT_ROW_BOUND` | **≤ 100** aggregate result rows |

A **combined** SQL design that merges referenced lookup with step 4 may prove a **tighter** transfer bound (≤10,100 instances) but must not weaken the architecture maximum above.

| Decision | Value |
|-------|-------|
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

**Coverage dimension:** `DIGEST_COVERAGE` — **not** a `DimensionResult` PASS/FAIL.

| Decision | Value |
|----------|-------|
| `DIGEST_COVERAGE_HAS_DEDICATED_SCOPE_ENUM` | **YES** |
| `DIGEST_SCOPE_ENUM` | `FULL` \| `BOUNDED_LATEST_WINDOW` \| `NOT_EVALUATED` |

Per session (minimum):

- `digestRowsChecked: number`  
- `digestRowsUnchecked: number`  
- `digestVerificationScope: DigestVerificationScope`  

When scope is `BOUNDED_LATEST_WINDOW`, include reason **`DIGEST_COVERAGE_PARTIAL`** — this is **not** FAIL.

No-source / no evaluable revision history: `digestVerificationScope = NOT_EVALUATED`.

**Profile-level aggregation (`PROFILE_DIGEST_SCOPE_AGGREGATION_DEFINED=YES`):**

| Condition | Profile `digestVerificationScope` |
|-----------|-----------------------------------|
| Zero sessions with evaluated digest coverage | **`NOT_EVALUATED`** (`ZERO_EVALUATED_DIGEST_SCOPE=NOT_EVALUATED`) |
| Any evaluated session is `BOUNDED_LATEST_WINDOW` | **`BOUNDED_LATEST_WINDOW`** |
| Else | **`FULL`** |

- `digestRowsChecked` = sum of per-session checked (no double-count referenced canonical union)  
- `digestRowsUnchecked` = sum of per-session unchecked  

`INTEGRITY_PARTIAL` **overallStatus** when profile scope is `BOUNDED_LATEST_WINDOW` and no higher-precedence warning — coverage partial alone does **not** quarantine DEFAULT observations.

---

## 18. Revision lineage integrity

**Dimension:** `REVISION_LINEAGE_INTEGRITY`

Use aggregate counts per session+version triple → `deriveSemanticRevisionIntegrityFromAggregate()`.

Non-zero `semanticRevisionGapCount` or `duplicateSemanticRevisionCount` → lineage warning (C5A-equivalent **`INTEGRITY_WARNING`** class).

---

## 19. Integrity-qualified eligibility (overlay)

| Decision | Value |
|----------|-------|
| `DEFAULT_DISPOSITION_PARTITION_DEFINED` | **YES** |
| `PROVISIONAL_DISPOSITION` | **`NOT_APPLICABLE`** |
| `EXCLUDED_DISPOSITION` | **`NOT_APPLICABLE`** |
| `DEFAULT_DISPOSITION_COUNTS_SUM_TO_INCLUDED_COUNT` | **YES** |

D4 **does not** rewrite D2/D3 JSON. Disposition applies to **DEFAULT** observations only.

**DEFAULT** — exactly one of: `ELIGIBLE` | `QUARANTINED_INTEGRITY_WARNING` | `SOURCE_EVIDENCE_LIMITED` | `NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED`.

**PROVISIONAL / EXCLUDED:** `integrityQualifiedDisposition = NOT_APPLICABLE`.

| Condition | DEFAULT disposition |
|-----------|---------------------|
| Digest mismatch / lineage warning / content mismatch / temporal invalid | `QUARANTINED_INTEGRITY_WARNING` |
| Digest coverage partial only | **`ELIGIBLE`** |
| Missing historical source row | `SOURCE_EVIDENCE_LIMITED` |
| Unsupported matching input contract (§9.8) | `SOURCE_EVIDENCE_LIMITED` |
| Self-integrity OK + source OK | `ELIGIBLE` |
| Parseable fingerprint/mirror self-failure (forensic) | `NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED` |

**Profile accounting (required):**

```text
defaultObservationCount
=== integrityQualifiedDefaultCount
 + quarantinedIntegrityWarningDefaultCount
 + sourceEvidenceLimitedDefaultCount
 + notEligibleRevisionSelfIntegrityFailedDefaultCount

defaultObservationCount === scientificProfile.coverage.includedSessionCount
```

Overlay **`inspectionFlags`:** closed enum `D4InspectionFlagV1` (§24) — **`INSPECTION_FLAGS_OPEN_STRING_ARRAY=NO`**.

Do **not** inject into `LongitudinalProfileV1.profileFlags`.

---

## 20. Service outcome vs inspection `overallStatus`

### 20.1 Top-level service result (frozen union)

```typescript
type D4RevisionSelfIntegrityFailureV1 = {
  inspectionContractVersion: 'M3_3D_D4_INTEGRITY_INSPECTION_V1';
  inspectionGeneratedAt: string;
  snapshotIsolation: 'REPEATABLE_READ';
  identity: { organizationId: string; vehicleId: string; revisionId: string };
  storedRevisionEnvelope?: {
    canonicalProfileFingerprint: string;
    longitudinalProfileContractVersion: string;
    profilePolicyVersion: string;
  };
  selfIntegrity: 'SELF_INTEGRITY_FAILED';
  reasons: ReasonCode[]; // MALFORMED_SCIENTIFIC_PROFILE | UNSUPPORTED_* | ...
};

type D4InspectionOutcome =
  | { status: 'REVISION_NOT_FOUND' }
  | { status: 'REVISION_SELF_INTEGRITY_FAILED'; failure: D4RevisionSelfIntegrityFailureV1 }
  | { status: 'OK'; inspection: M3_3D_D4_INTEGRITY_INSPECTION_V1 };
```

| Decision | Value |
|----------|-------|
| `REVISION_NOT_FOUND_IS_TOP_LEVEL_OUTCOME` | **YES** |
| `UNPARSEABLE_PROFILE_RETURNS_FULL_INSPECTION` | **NO** |
| `UNPARSEABLE_PROFILE_HAS_DISTINCT_FAILURE_OUTCOME` | **YES** |
| `PARSEABLE_SELF_FAILURE_FORENSIC_OVERLAY_ALLOWED` | **YES** |
| `TECHNICAL_EXECUTION_FAILURE_IS_SCIENTIFIC_INTEGRITY_STATUS` | **NO** |

**CASE B (unparseable / unsupported profile):** `{ status: 'REVISION_SELF_INTEGRITY_FAILED', failure }` — **no** `perSession[]`, rebuildability, digest coverage, or source batch.

**CASE C (parse OK, fingerprint/mirror fail):** `{ status: 'OK', inspection }` with `overallStatus = REVISION_SELF_INTEGRITY_FAILED` and forensic source batch; all DEFAULT dispositions `NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED`.

Unexpected DB failures: **throw** — not `overallStatus`.

### 20.2 Inspection `overallStatus` (only when `status='OK'`)

| `overallStatus` | Meaning |
|-----------------|--------|
| `OK` | Self-integrity OK; no integrity warnings in checked scope |
| `INTEGRITY_PARTIAL` | Self-integrity OK; profile digest scope `BOUNDED_LATEST_WINDOW` only |
| `INTEGRITY_WARNING` | Digest mismatch, lineage gap/duplicate, identity/content/temporal failures |
| `SOURCE_EVIDENCE_LIMITED` | Self-integrity OK; missing sources and/or unsupported matching input contract limits |
| `REVISION_SELF_INTEGRITY_FAILED` | **Parseable** projection but fingerprint/mirror self-failure (forensic overlay) |

**Not in `overallStatus`:** unparseable failures (top-level failure outcome); execution errors.

| Semantic failure (parse phase) | Top-level outcome |
|-------------------------------|-------------------|
| `MALFORMED_SCIENTIFIC_PROFILE` | `REVISION_SELF_INTEGRITY_FAILED` failure envelope |
| `UNSUPPORTED_PROFILE_CONTRACT` | same |
| `UNSUPPORTED_PROFILE_POLICY_VERSION` | same |

**Precedence (when `status='OK'`):**

1. If fingerprint/mirror self-failure → `overallStatus = REVISION_SELF_INTEGRITY_FAILED` (forensic batch allowed)  
2. Else if any source integrity warning → `INTEGRITY_WARNING`  
3. Else if missing sources or unsupported matching input contract disposition → `SOURCE_EVIDENCE_LIMITED`  
4. Else if profile digest scope `BOUNDED_LATEST_WINDOW` → `INTEGRITY_PARTIAL`  
5. Else `OK`  

| Decision | Value |
|----------|-------|
| `SOURCE_BATCH_AFTER_PARSE_FAILURE` | **NO** |
| `SOURCE_BATCH_AFTER_PARSEABLE_FINGERPRINT_OR_MIRROR_FAILURE` | **FORENSIC_ALLOWED** |
| `SELF_FAILED_PROFILE_CAN_REPORT_ELIGIBLE_DEFAULT` | **NO** |
| `MALFORMED_PROFILE_STATUS` | Top-level **`REVISION_SELF_INTEGRITY_FAILED`** (not full inspection) |
| `UNSUPPORTED_CONTRACT_STATUS` | Top-level **`REVISION_SELF_INTEGRITY_FAILED`** (not full inspection) |

### 20.3 Orthogonal dimensions (unchanged visibility)

1. `MATERIALIZED_REVISION_SELF_INTEGRITY`  
2. `SOURCE_EVIDENCE_AVAILABILITY`  
3. `SOURCE_ROW_IDENTITY_INTEGRITY`  
4. `SOURCE_FEATURE_SCALAR_INTEGRITY`  
5. `SOURCE_SNAPSHOT_CONTEXT_INTEGRITY`  
6. `SOURCE_TEMPORAL_PROVENANCE_INTEGRITY`  
7. `DIGEST_INTEGRITY`  
8. `REVISION_LINEAGE_INTEGRITY`  
9. `DIGEST_COVERAGE`  
10. `REBUILDABILITY`  
11. `INTEGRITY_QUALIFIED_ELIGIBILITY`  

**`DimensionResult` (frozen enum):** `PASS` | `FAIL` | `NOT_EVALUATED` | `NOT_APPLICABLE`

When source row missing: identity, digest, both content subdimensions, temporal → **`NOT_EVALUATED`**; lineage → evaluate from aggregate if available, else **`NOT_EVALUATED`**.

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
| `SOURCE_CONTENT_MISMATCH` | Feature scalar and/or snapshot context subdimension mismatch (record which failed) |
| `SOURCE_TEMPORAL_ORDER_INVALID` | C3 `createdAt` > revision `createdAt` |
| `SEMANTIC_REVISION_GAP` | Lineage gap count > 0 |
| `SEMANTIC_REVISION_DUPLICATE` | Duplicate semantic revision count > 0 |
| `SOURCE_INPUT_CONTRACT_VERSION_UNRESOLVED` | Excluded / expected unresolved input contract (non-warning) |
| `UNSUPPORTED_SOURCE_INPUT_CONTRACT` | Matching version strings but no registered snapshot parser (§9.8) |
| `DIGEST_COVERAGE_PARTIAL` | Session/profile scope `BOUNDED_LATEST_WINDOW` (not FAIL) |
| `INSPECTION_INTERNAL_ERROR` | Unexpected failure (service layer — not `overallStatus`) |

---

## 22. Processing order (deterministic)

**CASE A — revision not found:** return `{ status: 'REVISION_NOT_FOUND' }` — **no** source inspection.

**CASE B — strict parse fails / unsupported profile contract or policy:** return `{ status: 'REVISION_SELF_INTEGRITY_FAILED', failure }` — **no** source batch; **no** fake full inspection overlay.

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

type DigestVerificationScope =
  | 'FULL'
  | 'BOUNDED_LATEST_WINDOW'
  | 'NOT_EVALUATED';

type D4InspectionFlagV1 =
  | 'INTEGRITY_LIMITED'
  | 'SOURCE_EVIDENCE_LIMITED'
  | 'REBUILDABILITY_LIMITED';

type D4RevisionSelfIntegrityFailureV1 = {
  inspectionContractVersion: 'M3_3D_D4_INTEGRITY_INSPECTION_V1';
  inspectionGeneratedAt: string;
  snapshotIsolation: 'REPEATABLE_READ';
  identity: { organizationId: string; vehicleId: string; revisionId: string };
  storedRevisionEnvelope?: {
    canonicalProfileFingerprint: string;
    longitudinalProfileContractVersion: string;
    profilePolicyVersion: string;
  };
  selfIntegrity: 'SELF_INTEGRITY_FAILED';
  reasons: ReasonCode[];
};

type D4InspectionOutcome =
  | { status: 'REVISION_NOT_FOUND' }
  | { status: 'REVISION_SELF_INTEGRITY_FAILED'; failure: D4RevisionSelfIntegrityFailureV1 }
  | { status: 'OK'; inspection: M3_3D_D4_INTEGRITY_INSPECTION_V1 };

type M3_3D_D4_INTEGRITY_INSPECTION_V1 = {
  inspectionContractVersion: 'M3_3D_D4_INTEGRITY_INSPECTION_V1';
  inspectionGeneratedAt: string;
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
    digestVerificationScope: DigestVerificationScope;
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
    sourceFeatureScalarIntegrity: DimensionResult;
    sourceSnapshotContextIntegrity: DimensionResult;
    sourceTemporalProvenance: DimensionResult;
    digestIntegrity: DimensionResult;
    revisionLineage: DimensionResult;
    digestRowsChecked: number;
    digestRowsUnchecked: number;
    digestVerificationScope: DigestVerificationScope;
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
    inspectionFlags: D4InspectionFlagV1[]; // deterministic order, no duplicates
    rebuildability: 'FULL' | 'PARTIAL' | 'UNAVAILABLE';
    defaultObservationCount: number;
    integrityQualifiedDefaultCount: number;
    quarantinedIntegrityWarningDefaultCount: number;
    sourceEvidenceLimitedDefaultCount: number;
    notEligibleRevisionSelfIntegrityFailedDefaultCount: number;
  };
};
```

**`D4InspectionFlagV1` emission (`INSPECTION_FLAG_ORDER` — deterministic, no duplicates):**

| Order | Flag | Rule |
|-------|------|------|
| 1 | `INTEGRITY_LIMITED` | `overallStatus` is `INTEGRITY_PARTIAL` or `INTEGRITY_WARNING`, **or** bounded digest coverage applies as defined for integrity-limited reporting |
| 2 | `SOURCE_EVIDENCE_LIMITED` | **`SOURCE_EVIDENCE_LIMITED_FLAG_SCOPE=ALL_AUDITED_PROFILE_REFERENCES`**: any inspected profile candidate/reference has a source-evidence verification limitation (missing referenced row in DEFAULT/PROVISIONAL/EXCLUDED, unsupported matching input contract, etc.) — **not** DEFAULT disposition counts alone. If `overallStatus=SOURCE_EVIDENCE_LIMITED`, this flag **must** be present. **`SOURCE_LIMITATION_UNDER_HIGHER_OVERALL_STATUS_PRESERVED=YES`**: retain when `INTEGRITY_WARNING` or forensic `REVISION_SELF_INTEGRITY_FAILED` masks `SOURCE_EVIDENCE_LIMITED` at overallStatus but a limitation still exists. |
| 3 | `REBUILDABILITY_LIMITED` | `rebuildability !== 'FULL'` |

| Decision | Value |
|----------|-------|
| `INSPECTION_FLAGS_OPEN_STRING_ARRAY` | **NO** |
| `INSPECTION_FLAG_ENUM_FROZEN` | **YES** |
| `SOURCE_FEATURE_SCALAR_DIMENSION_IN_CONTRACT` | **YES** |
| `SOURCE_SNAPSHOT_CONTEXT_DIMENSION_IN_CONTRACT` | **YES** |
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

### Source content subdimensions + flags + bounds (D4.3)

- Feature scalar PASS + snapshot PASS; scalar FAIL + snapshot PASS; scalar PASS + snapshot FAIL  
- Unsupported parser: scalar PASS + snapshot NOT_EVALUATED; scalar FAIL → INTEGRITY_WARNING (outranks limitation)  
- EXCLUDED: both NOT_APPLICABLE; missing source: both NOT_EVALUATED; no source expected: NOT_APPLICABLE  
- Missing source only in PROVISIONAL or EXCLUDED → `SOURCE_EVIDENCE_LIMITED` flag present  
- Integrity warning + source limitation → both flags retained  
- Four-step max ≤10,200 C3 result instances; unique row ids ≤10,100; aggregates ≤100  

### Strict profile / unparseable / digest / eligibility (carry-forward)

- `profileGeneratedAt` present in scientific JSON → parse failure / distinct self-integrity outcome  
- Candidate / included / provisional / excluded count mismatches  
- Duplicate `restSessionId` across slices  
- Bad `profileStatus`; anchor / `validEvidenceSpanMs` derivations  
- `statusReasons` / `excludedByReason` mismatches  
- Broken version segments (index, split equal tuples, coverage)  
- Profile flag missing/extra/duplicate; `derived !== null`  
- Non-deterministic ordering rejected  

### Unparseable result

- Malformed profile → `{ status: 'REVISION_SELF_INTEGRITY_FAILED', failure }` — no fake `perSession`, rebuildability, or source batch  

### Unsupported source input contract (§9.8)

- Profile version == `inputSummary` version; parser not registered  
- Not `SOURCE_VERSION_MISMATCH`; digest + scalars still checked; snapshot `NOT_EVALUATED`  
- `SOURCE_EVIDENCE_LIMITED` disposition; not integrity warning  

### Digest coverage

- Profile scope aggregation: all FULL → FULL; one BOUNDED → BOUNDED; zero evaluated → NOT_EVALUATED  
- Checked/unchecked sums exact; referenced union not double-counted  

### Eligibility

- PROVISIONAL/EXCLUDED → `NOT_APPLICABLE`  
- Four DEFAULT disposition buckets sum to `includedSessionCount`  

### Unit / PostgreSQL (carry-forward from D4.1)

- Parseable fingerprint mismatch → forensic overlay; zero eligible defaults  
- Rebuildability deterministic; fixed SQL statement count vs 1/10/100 sessions and vs version triple count  
- Tenant isolation; zero D4 writes  

---

## 30. Open decisions (non-blocking for D4.2 seal)

| Item | Status |
|------|--------|
| Exact combined SQL shape for 4-step batch | **ENGINEERING_DETAIL** |
| Caller-provided `inspectionGeneratedAt` for deterministic tests | **OPTIONAL** |
| Ops CLI / C5B longitudinal tab timing | **POST_V1** |
| `RETENTION_POLICY` vs rebuildability product labeling | **DECISION_REQUIRED** (product/ops) |
| D1-session metadata provenance dimension (`anchorAt` etc.) | **OUT_OF_V1** |

---

## 31. Implementation readiness gate (D4.3 final consistency)

| Gate | Result |
|------|--------|
| Source content subdimensions (D4.3) | **CLOSED** |
| SOURCE_EVIDENCE_LIMITED flag scope (D4.3) | **CLOSED** |
| Four-step result instance bounds (D4.3) | **CLOSED** |
| D4.2 / D4.1 contract | **CLOSED** |

**`D4_IMPLEMENTATION_READY=YES`**

---

## Appendix — audit decision summary (incl. D4.3)

| Key | Value |
|-----|-------|
| `D4_MUTATES_D2_PROFILE` | NO |
| `D4_MUTATES_D3_SCIENTIFIC_JSON` | NO |
| `D4_USES_SEPARATE_INSPECTION_OVERLAY` | YES |
| `D4_PERSISTENCE_REQUIRED` | NO |
| `D4_INSPECTION_CONTRACT_VERSION` | `M3_3D_D4_INTEGRITY_INSPECTION_V1` |
| `D4_DB_ROUND_TRIP_BOUND` | ≤4 (constant) |
| `D4_UNIQUE_C3_ROW_ID_BOUND` | ≤10,100 |
| `D4_FOUR_STEP_C3_RESULT_INSTANCE_BOUND` | ≤10,200 |
| `D4_AGGREGATE_RESULT_ROW_BOUND` | ≤100 |
| `SOURCE_EVIDENCE_LIMITED_FLAG_SCOPE` | ALL_AUDITED_PROFILE_REFERENCES |
| `INSPECTION_FLAG_ORDER` | INTEGRITY_LIMITED → SOURCE_EVIDENCE_LIMITED → REBUILDABILITY_LIMITED |
