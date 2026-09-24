# M3.3D D4 — Longitudinal Integrity / Inspection Architecture Audit

**Date:** 2026-09-24  
**Status:** **ARCHITECTURE AUDIT** (read-only; **not implemented**)  
**Inspection contract (proposed):** `M3_3D_D4_INTEGRITY_INSPECTION_V1`  
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

**Secondary targets:** all C3 rows referenced from the revision’s **scientific profile JSON** (see §8).

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

**No silent coercion.** Malformed JSON → `MALFORMED_SCIENTIFIC_PROFILE` / `UNSUPPORTED_PROFILE_CONTRACT`.

Prisma `Json` must **not** be blindly cast to TypeScript types at the D4 boundary.

---

## 8. Source-evidence dimensions

### 8.1 Source row set

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

### 8.2 Source row existence

**Dimension:** `SOURCE_EVIDENCE_AVAILABILITY`

For each reference:

- row exists at `canonicalFeatureRowId`
- else `SOURCE_ROW_MISSING` for that reference (not global profile corruption)

| Decision | Value |
|----------|-------|
| `SOURCE_EVIDENCE_MISSING_IS_PROFILE_CORRUPTION` | **NO** |

Missing C3 evidence (retention purge, org cascade without D3 FK) → **availability/rebuildability** finding, not automatic `REVISION_CORRUPT`.

### 8.3 Source row identity

**Dimension:** `SOURCE_ROW_IDENTITY_INTEGRITY`

When row exists, verify:

- `organizationId`, `vehicleId`, `restSessionId` match reference context  
- `row.id === canonicalFeatureRowId`  
- `semanticRevision`, `inputDigest`, `computationPhase`, `sessionTrust` match stored reference in profile item  
- persisted version tuple on row matches profile item tuple (`featureModelVersion`, `retentionPolicyVersion`, `chargeOpportunityPolicyVersion`)  
- `inputContractVersion` resolved from persisted `inputSummary` via strict snapshot parser — **not** from runtime constants alone  

### 8.4 Source content integrity (optional scientific correspondence)

**Dimension:** `SOURCE_CONTENT_INTEGRITY`  
**Decision:** **ADOPT for D4 V1** for DEFAULT + PROVISIONAL observations (and excluded items with canonical refs).

Compare observation-copied scalars/metadata in the scientific profile against parsed C3 `inputSummary` / charge context fields (same fields D2 copied at assembly time): median rest voltage, charge opportunity class, anchor/charge/temperature metadata where present.

**Does not** recompute trends, health, or re-run D2 assembly.

Mismatch → `SOURCE_CONTENT_MISMATCH` (integrity warning class), not health signal.

### 8.5 Source temporal provenance

**Dimension:** `SOURCE_TEMPORAL_PROVENANCE_INTEGRITY`  
**Decision:** **ADOPT for D4 V1**

Invariant: referenced C3 row `createdAt` **≤** D3 revision `createdAt` (materialization time).

Use DB `createdAt` timestamps — **not** `computedAt` causality.

Violation → `SOURCE_TEMPORAL_ORDER_INVALID`.

---

## 9. Historical vs current canonical state

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

## 10. Rebuildability definition

D3 labels revisions **REBUILDABLE** meaning **traceability to original evidence**, not “always recomputable from live C3 today.”

**Orthogonal states — dimension `REBUILDABILITY`:**

| State | Meaning |
|-------|---------|
| `FULL` | Self-integrity OK; all referenced source rows exist; digest+lineage checks pass within scope |
| `PARTIAL` | Self-integrity OK; some references missing or digest coverage bounded (`INTEGRITY_PARTIAL` scope) |
| `UNAVAILABLE` | Self-integrity failed **or** majority/mandatory source paths missing such that trace chain is broken for audit purposes |

**Do not conflate:**

- `SOURCE_EVIDENCE_MISSING` ≠ `SOURCE_DIGEST_MISMATCH`  
- missing source ≠ malformed stored JSON  

Future C3 retention purge **does not** delete D3 rows (no C3 FK on revision table) — rebuildability may become `PARTIAL`/`UNAVAILABLE` while **profile self-integrity remains OK**.

---

## 11. Version authority (historical tuples)

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

D4 engineering adds **parameterized bounded batch queries** per `(organizationId, vehicleId, restSessionId, featureModelVersion, retentionPolicyVersion, chargeOpportunityPolicyVersion)`.

---

## 12. C5A reuse (relation)

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

## 13. Bounded database acquisition plan

| Guard | Value |
|-------|-------|
| `N_PLUS_ONE_INSPECTION_ALLOWED` | **NO** |
| `UNBOUNDED_REVISION_READ_ALLOWED` | **NO** |

**Profile session bound:** ≤ **100** distinct `restSessionId` references (aligned with `LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS`).

**Per-session revision bound:** latest **K=100** semantic revisions (same as C5A) via window query + **union** referenced `canonicalFeatureRowId` even if outside latest-K window.

**Conceptual round-trip bound (not performance SLA):**

```
≤ 100 sessions × (K latest rows + 1 referenced canonical union + aggregate counts)
```

Grouped by persisted version triple — **O(number of distinct triples among references)**, not O(all revisions ever).

**Forbidden:** `listFeatureRowsForSession()` unbounded; N× full C5A inspection workflows.

**Engineering note (open detail):** exact SQL/window-function shape for parameterized triple — implement in D4 repository module; architecture requires boundedness, not a specific query name.

---

## 14. Transaction isolation

| Decision | Value |
|----------|-------|
| `D4_INSPECTION_TRANSACTION` | **`RepeatableRead`** (single read-only interactive transaction for D3 row + batch C3 reads + aggregates) |

Matches C5A snapshot semantics. Digest verification on union(latest-K, referenced row) runs **inside** consistent snapshot after loads.

---

## 15. Tenant isolation

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

## 16. Digest integrity

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

## 17. Revision lineage integrity

**Dimension:** `REVISION_LINEAGE_INTEGRITY`

Use aggregate counts per session+version triple → `deriveSemanticRevisionIntegrityFromAggregate()`.

Non-zero `semanticRevisionGapCount` or `duplicateSemanticRevisionCount` → lineage warning (C5A-equivalent **`INTEGRITY_WARNING`** class).

---

## 18. Integrity-qualified eligibility (overlay)

D4 **does not** rewrite D2/D3 JSON. Disposition applies to **DEFAULT observations** (and reporting counts) on the overlay:

| Condition | Default observation disposition |
|-----------|----------------------------------|
| Digest mismatch on referenced canonical row | `QUARANTINED_INTEGRITY_WARNING` |
| Revision lineage warning (gap/duplicate) | `QUARANTINED_INTEGRITY_WARNING` (preserve C5A overall semantics) |
| Digest coverage partial only | **`ELIGIBLE`** (metadata: bounded coverage — not quarantine) |
| Missing historical source row | `SOURCE_EVIDENCE_LIMITED` (not auto-labeled corruption) |
| Self-integrity OK + source OK | `ELIGIBLE` |

Overlay may expose:

- `integrityQualifiedDefaultObservationIds[]`  
- `quarantinedDefaultObservationCount`  
- per-session `integrityQualifiedDisposition`

**Profile flags:** do **not** inject into `LongitudinalProfileV1.profileFlags`. Use overlay `inspectionFlags` only, e.g.:

- `INTEGRITY_LIMITED`  
- `SOURCE_EVIDENCE_LIMITED`  
- `REBUILDABILITY_LIMITED`  

---

## 19. Orthogonal dimensions + overall status

Dimensions remain **visible** (no single collapsed boolean):

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

**Overall status enum (minimal, non-overlapping):**

| `overallStatus` | Meaning |
|-----------------|--------|
| `OK` | Self-integrity OK; no integrity warnings in checked scope |
| `INTEGRITY_PARTIAL` | Self-integrity OK; bounded digest coverage only |
| `INTEGRITY_WARNING` | Digest mismatch, lineage gap/duplicate, identity/content/temporal failures in checked rows |
| `SOURCE_EVIDENCE_LIMITED` | Self-integrity OK but one or more referenced rows missing (retention/purge) |
| `REVISION_SELF_INTEGRITY_FAILED` | Stored revision fails §6 before meaningful source trust |
| `INSPECTION_EXECUTION_FAILED` | Parser/unsupported contract/tenant not found/unexpected execution error |

**Precedence (deterministic):**

1. `INSPECTION_EXECUTION_FAILED` (hard failures)  
2. `REVISION_SELF_INTEGRITY_FAILED`  
3. Else if any integrity warning class in source checks → `INTEGRITY_WARNING`  
4. Else if missing sources → `SOURCE_EVIDENCE_LIMITED` (may coexist with partial coverage metadata)  
5. Else if digest coverage partial → `INTEGRITY_PARTIAL`  
6. Else `OK`  

When self-integrity fails: **continue** source batch for **forensic reporting**, but `overallStatus` remains **`REVISION_SELF_INTEGRITY_FAILED`** (downstream eligibility not trusted).

---

## 20. Machine-readable reason codes

Separate codes (no health terminology):

| Code | Condition |
|------|-----------|
| `REVISION_NOT_FOUND` | Tenant-scoped revision missing |
| `UNSUPPORTED_PROFILE_CONTRACT` | Unknown contract/policy version |
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
| `DIGEST_COVERAGE_PARTIAL` | Unchecked rows remain in session history |
| `INSPECTION_INTERNAL_ERROR` | Unexpected failure |

---

## 21. Processing order

1. Tenant-scoped D3 revision load  
2. Strict scientific JSON parse  
3. Fingerprint self-verification (D3 canonicalization)  
4. Mirror metadata self-verification  
5. Build source reference set (DEFAULT + provisional + excluded w/ ids)  
6. Bounded batch C3 acquisition (RR snapshot)  
7. Per-reference existence → identity → digest → lineage → content → temporal  
8. Aggregate dimensions + overall status + eligibility overlay  

---

## 22. Timestamp authority

| Field | Authority |
|-------|-----------|
| `inspectionGeneratedAt` | **Service wall clock (B)** — observability only; **not** part of D3 fingerprint |
| D3 scientific times | From stored profile / revision `createdAt` only |

Optional caller-provided envelope timestamp deferred (open for deterministic replay tests in engineering).

---

## 23. D4 V1 contract sketch (`M3_3D_D4_INTEGRITY_INSPECTION_V1`)

```typescript
// Conceptual — names may adjust in engineering PR
type M3_3D_D4_INTEGRITY_INSPECTION_V1 = {
  inspectionContractVersion: 'M3_3D_D4_INTEGRITY_INSPECTION_V1';
  inspectionGeneratedAt: string; // ISO-8601, service clock
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
    digestRowsChecked: number;
    digestRowsUnchecked: number;
    digestVerificationScope: 'FULL' | 'BOUNDED_LATEST_WINDOW';
  };

  perSession: Array<{
    restSessionId: string;
    versionTuple: { featureModelVersion; retentionPolicyVersion; chargeOpportunityPolicyVersion };
    canonicalFeatureRowId: string | null;
    sourceEvidenceAvailability: 'FOUND' | 'MISSING' | 'NO_SOURCE_REFERENCE_EXPECTED';
    sourceIdentity: DimensionResult;
    digestIntegrity: DimensionResult;
    revisionLineage: DimensionResult;
    digestCoverage: DimensionResult;
    integrityQualifiedDisposition: 'ELIGIBLE' | 'QUARANTINED_INTEGRITY_WARNING' | 'SOURCE_EVIDENCE_LIMITED';
    reasons: ReasonCode[];
  }>;

  profile: {
    overallStatus: OverallStatus;
    inspectionFlags: string[];
    rebuildability: 'FULL' | 'PARTIAL' | 'UNAVAILABLE';
    integrityQualifiedDefaultCount: number;
    quarantinedDefaultCount: number;
  };
};
```

---

## 24. Persistence decision

| Decision | Value |
|----------|-------|
| `D4_PERSISTENCE_REQUIRED` | **NO** (V1) |

Inspection results are **computed read-only** and returned to caller. No D4 columns on `BatteryLongitudinalProfileRevision`; no inspection-results table in V1.

Future persistence (if ever required) is a **separate decision** — not implied by this audit.

---

## 25. Operational surface decision

| Decision | Value |
|----------|-------|
| `D4_V1_SURFACE_DECISION` | **A — pure internal service only (V1)** |

Justification:

- D3 writer remains unreachable; production may have **zero** longitudinal revisions to inspect.  
- C5B already covers per-session C3 inspection.  
- D4 engineering can add **optional** ops CLI / Master Admin read-only extension **after** internal service + tests, without blocking V1 contract freeze.  

Customer UI: **forbidden**. Metrics-only surface: **deferred** (optional later).

---

## 26. D4 → M3.3E boundary

M3.3E may consume:

- D3 scientific profile (immutable JSON)  
- D4 integrity overlay (eligibility + evidence-quality dimensions)

M3.3E **must not** treat `INTEGRITY_PARTIAL`, `SOURCE_EVIDENCE_MISSING`, or digest coverage as health degradation.

D4 **must not** write `BatteryAssessment` / publication tables.

---

## 27. D4 → M3.3F boundary

D4 completion **does not** authorize:

- D3 Nest registration  
- materialization feature flag  
- production writer / C3 hook / scheduler  

M3.3F remains explicit authorization for production shadow materialization.

D4 tests may insert isolated revisions in **ephemeral PostgreSQL** only.

---

## 28. Test matrix (design only — not implemented in this audit)

### Unit

- Valid revision self-integrity  
- Malformed JSON; fingerprint mismatch; mirror mismatch  
- Source identity match/mismatch; digest match/mismatch  
- Content match/mismatch; temporal order  
- Full vs partial digest coverage; semantic gap/duplicate  
- Missing source ≠ profile corruption  
- Current canonical supersession ≠ corruption (when context tested)  
- Integrity warning → quarantine DEFAULT; partial coverage does not auto-quarantine  
- Provisional + excluded canonical refs audited  
- Historical version triple respected  

### PostgreSQL (ephemeral)

- Tenant-scoped revision lookup (reject cross-tenant id)  
- RepeatableRead snapshot behavior  
- Bounded row counts / no N+1 pattern  
- Latest-K + referenced-outside-K digest union  
- Multi-version triple grouping  
- Source row delete simulation → `SOURCE_EVIDENCE_LIMITED`  
- D3 revision survives C3 purge simulation (no FK cascade)  
- **Zero D4 writes** (statement-level proof in tests)

---

## 29. Open decisions (explicit — not blockers for architecture freeze)

| Item | Status |
|------|--------|
| Parameterized batch repository API naming/SQL | **ENGINEERING_DETAIL** |
| Caller-provided `inspectionGeneratedAt` for deterministic tests | **OPTIONAL** |
| Ops CLI / C5B longitudinal tab timing | **POST_V1** |
| `RETENTION_POLICY` interaction with rebuildability labeling | **DECISION_REQUIRED** (product/ops) |
| Persist inspection snapshots for audit trail | **NO for V1** |

---

## 30. Implementation readiness gate

| Gate | Result |
|------|--------|
| Overlay vs mutation | **CLOSED** |
| Self-integrity contract | **CLOSED** |
| Source-evidence contract | **CLOSED** |
| Missing-source semantics | **CLOSED** |
| Historical vs current canonical | **CLOSED** |
| Version-aware queries | **CLOSED** (semantics; SQL detail deferred) |
| Bounded query strategy | **CLOSED** |
| Transaction isolation | **CLOSED** |
| Tenant scoping | **CLOSED** |
| Status/reason taxonomy | **CLOSED** |
| Test matrix | **CLOSED** (design) |
| Operational surface | **CLOSED** (V1 = internal service) |

**`D4_IMPLEMENTATION_READY=YES`**

Engineering may proceed on a **separate PR** after this architecture audit merges. **No D4 code in this audit PR.**

---

## Appendix — audit decision summary

| Key | Value |
|-----|-------|
| `D4_MUTATES_D2_PROFILE` | NO |
| `D4_MUTATES_D3_SCIENTIFIC_JSON` | NO |
| `D4_USES_SEPARATE_INSPECTION_OVERLAY` | YES |
| `D4_PERSISTENCE_REQUIRED` | NO |
| `D4_INSPECTION_CONTRACT_VERSION` | `M3_3D_D4_INTEGRITY_INSPECTION_V1` |
| `D4_BATCH_BOUND` | ≤100 sessions × (K=100 + referenced union) per architecture |
| `D4_INSPECTION_TRANSACTION` | RepeatableRead |
| `REBUILDABILITY_STATES` | FULL \| PARTIAL \| UNAVAILABLE |
| `SOURCE_CONTENT_INTEGRITY_DECISION` | ADOPT V1 |
| `SOURCE_TEMPORAL_PROVENANCE_DECISION` | ADOPT V1 |
