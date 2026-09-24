# M3.3D D3 — Longitudinal Profile Materialization & Persistence Architecture Audit

**Date:** 2026-09-24  
**Status:** Architecture / persistence decision audit — **DRAFT PR** (not on `main` until merged)  
**Main anchor (D2 seal):** `d37a8714f4e4ee80e2dda8882d95003bb7285fd7`  
**Scope:** **Audit only** — no Prisma schema, no migration, no runtime writer, no flag, no deploy  
**Normative inputs:** D0/D0.1, D1, D2 research docs; `assembleLongitudinalProfileV1()` on main

---

## 1. Current-state audit

### 1.1 Authoritative computation path (on main)

```
BatteryRestSessionFeature (C3, append-only)
  → D1 LongitudinalInputReaderService → M3_3D_D1_LONGITUDINAL_INPUT_V1
  → D2 assembleLongitudinalProfileV1() → M3_3D_LONGITUDINAL_PROFILE_V1
```

D2 is **pure**: no DB, no network, no assembler clock. D2.1 validates malformed D1, detaches output, and fingerprints must reflect **full** profile semantics (not DEFAULT-only).

### 1.2 Production baseline

| Gate | Value |
|------|-------|
| `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED` | **false** (production) |
| Natural fleet C3 longitudinal evidence | **not** production-authoritative today |
| M3.3F | Explicit authorization required before production shadow/materialization |

**Distinction:** `SCHEMA/ENGINEERING_READY` ≠ `PRODUCTION_MATERIALIZATION_READY`.

### 1.3 Existing persistence patterns (repository audit)

| Model | Pattern | Relevance to D3 |
|-------|---------|-----------------|
| `BatteryRestSessionFeature` | Append-only rows; uniqueness on `(org, restSessionId, featureModelVersion, inputDigest)` and semantic-revision tuple | Source evidence; **not** profile revision |
| `BatteryRestSession` | Idempotent open via `(org, vehicle, idempotencyKey)`; cascade delete with vehicle/org | Session anchor; D1 window input |
| `BatteryAssessment` | Append-only; `(vehicleId, idempotencyKey)` unique; supersede chain | **M3.3E** domain — D3 must **not** write here |
| `BatteryPublication` | Append-only publication history | Customer/ops read path — **M3.3E+** |
| `BatteryRetentionAggregate` | Bucket summaries (legacy retention) | Unrelated rollup — not M3.3C profile |
| `BatteryFeatures` | **Upsert** single row per vehicle | Operational LV/SOH store — not longitudinal profile |

**Multi-replica insert precedent:** C3 uses DB unique constraints + conflict handling (input digest / semantic revision). D3 should follow **database unique authority**, not Redis mutex.

### 1.4 Canonical JSON / SHA-256 utilities

`feature-input-canonical.serializer.ts` exports:

- UTF-16 code-unit key sorting
- `canonicalizeFeatureInputValue` / `serializeCanonicalJsonValue` / `canonicalFeatureInputUtf8`
- `sha256HexLowercaseUtf8`
- Fixed C3 digest test vector (`FEATURE_INPUT_CANONICAL_KEY_ORDER_SHA256_LITERAL`)

**Audit conclusion:** D3 should use **option B** — a thin D3 wrapper calling the **same generic primitives** without altering C3 snapshot digest behavior. Any future extraction to a shared module must preserve C3 byte-for-byte vectors.

---

## 2. Alternatives considered (Decision 1)

| Option | Summary | Verdict |
|--------|---------|---------|
| **A. On-demand only** | D1+D2 every read; no table | Correctness maximal; repeated assembly cost; weak audit trail for M3.3E |
| **B. Append-only materialized revision** | Persist immutable D2 scientific snapshots | Enables audit, bounded reads, idempotent writers — **requires strict fingerprint** |
| **C. Hybrid** | D1+D2 remain truth; optional immutable revisions as cache + audit | **Recommended** — aligns with D0 direction but **not** auto-ready without D2-correct fingerprint |

### Materialization decision

**`MATERIALIZATION_DECISION=HYBRID_IMPLEMENT`**

Meaning:

- Approve **hybrid architecture** for the **next engineering slice** (schema + idempotent writer **after** this audit merges).
- **Do not** interpret as production-ready or flag-on.
- On-demand D1+D2 remains authoritative for scientific equivalence tests.

**`SOURCE_OF_TRUTH=`** persisted C3 rows + D1 reader + D2 assembler code path. Materialized rows are **DERIVED · REPRODUCIBLE · APPEND-ONLY · REBUILDABLE**.

---

## 3. Scientific authority model

Materialization **must never**:

- select C3 rows independently
- reclassify D1 inclusion
- rebuild version segments with different rules
- emit different `profileStatus` / trends / health

**Writer algorithm (normative):**

1. Read D1 inventory (same service/contract as today).
2. `assembleLongitudinalProfileV1({ inventory, profileGeneratedAt: FIXED_ENVELOPE_OR_OMIT_FROM_STORED_JSON })`.
3. Compute scientific projection + fingerprint (below).
4. INSERT revision; on unique conflict verify payload equality.

---

## 4. Fingerprint authority — D0 correction

D0 conceptual fingerprint emphasizing **included canonical observations only** is **insufficient** after D2.1.

**Collision example (must reject DEFAULT-only hashing):**

| Profile | DEFAULT | PROVISIONAL | EXCLUDED |
|---------|---------|-------------|----------|
| A | 10 identical | 0 | 0 |
| B | 10 identical | 1 | 2 |

Same DEFAULT canonical ids/digests → **different** `M3_3D_LONGITUDINAL_PROFILE_V1`.

### Preferred fingerprint (authoritative)

**`FINGERPRINT_AUTHORITY=CANONICAL_SCIENTIFIC_PROFILE_PROJECTION`**

**`FINGERPRINT_ALGORITHM=`**

1. Start from successful D2 `LongitudinalProfileV1`.
2. Build **scientific projection** = profile with **`window.profileGeneratedAt` removed** (envelope only).
3. `canonicalUtf8 = canonicalFeatureInputUtf8(scientificProjection)` (same primitives as C3).
4. `canonicalProfileFingerprint = sha256HexLowercaseUtf8(canonicalUtf8)`.

**Rejected for D3 authority:** manual tuple of `(canonicalFeatureRowId, inputDigest)` for DEFAULT rows only.

**`FINGERPRINT_CANONICALIZATION=`** reuse `canonicalizeFeatureInputValue` + `serializeCanonicalJsonValue` + `sha256HexLowercaseUtf8` via D3 wrapper (no C3 behavior change in this audit).

Compare to manual tuple: manual tuples **will drift** when D2 contract adds fields (flags, excluded audit, segments). Projection fingerprint **tracks D2 contract evolution** automatically when projection definition is updated in lockstep with contract version bumps.

---

## 5. Fingerprint include / exclude matrix

Classification: **IDENTITY_INCLUDED** | **IDENTITY_EXCLUDED**

| Field / group | Classification | Rationale |
|---------------|----------------|-----------|
| `organizationId` | INCLUDED | Tenant scope |
| `vehicleId` | INCLUDED | Vehicle scope |
| `longitudinalProfileContractVersion` | INCLUDED | Shape/version axis |
| `profilePolicyVersion` | INCLUDED | Assembly semantics axis |
| `window.requestedSessionLimit` | INCLUDED | D1 window semantics in profile |
| `window.appliedSessionLimit` | INCLUDED | D1 window semantics in profile |
| `window.firstIncludedAnchorAt` | INCLUDED | Stable series envelope |
| `window.lastIncludedAnchorAt` | INCLUDED | Stable series envelope |
| **`window.profileGeneratedAt`** | **EXCLUDED** | Envelope only (D0 #13, D2 invariant) |
| `coverage.*` (all counts, `excludedByReason`, `validEvidenceSpanMs`) | INCLUDED | Part of scientific state |
| `profileStatus` | INCLUDED | Descriptive operational state |
| `profileFlags` | INCLUDED | Evidence-derived flags |
| `statusReasons` | INCLUDED | Aggregate reasons |
| `trendReadiness` | INCLUDED | Explicit NOT_EVALUATED state |
| `observations[]` (full DEFAULT payload) | INCLUDED | Stable series |
| `provisionalObservations[]` | INCLUDED | **Required** post-D2.1 |
| `excludedSessions[]` + reasons | INCLUDED | **Required** post-D2.1 |
| Per-observation canonical ids, digests, version tuples, features, snapshot context | INCLUDED | Via arrays above |
| `versionSegments[]` | INCLUDED | Contiguous DEFAULT segmentation |
| `derived` | INCLUDED | Must remain `null` in V1; still part of contract |
| DB `materializedAt` / row `createdAt` | EXCLUDED | Storage envelope |
| Request id, worker id, retry count | EXCLUDED | Non-scientific |

**`PROFILE_GENERATED_AT_IN_FINGERPRINT=NO`**

---

## 6. Hash collision / drift defense

**`FINGERPRINT_COLLISION_DEFENSE=FAIL_CLOSED_PAYLOAD_VERIFY`**

On unique `(org, vehicle, contractVersion, policyVersion, fingerprint)` conflict:

1. Load existing row.
2. Re-canonicalize **stored** `scientificProfileJson` and compare to newly computed canonical UTF-8 (or compare stored precomputed canonical UTF-8 if persisted).
3. If fingerprint equal but canonical payload differs → **`PROFILE_FINGERPRINT_COLLISION_OR_CANONICALIZATION_DRIFT`** (fail closed; do not return existing row silently).

**`CANONICAL_PAYLOAD_STORED=YES`** — persist **`scientificProfileJson`** (projection without `profileGeneratedAt`) plus **`canonicalProfileFingerprint`**. Optionally persist `canonicalScientificUtf8` for cheap equality checks (DERIVABLE but useful operationally).

---

## 7. Persisted payload (Decision 3)

**Recommendation: B + D hybrid**

| Store | Content |
|-------|---------|
| `scientificProfileJson` | Deterministic D2 projection **without** `profileGeneratedAt` |
| `materializedAt` / `createdAt` | DB envelope timestamps |
| Indexed metadata | Small query fields duplicated from JSON (see schema) |

**Do not** store full profile JSON with varying `profileGeneratedAt` as the scientific blob — that breaks byte stability for identical science.

**Property:** for a fixed fingerprint, `scientificProfileJson` bytes are stable regardless of materialization time.

---

## 8. Schema candidate (Decision 4) — **proposal only**

**`PROPOSED_TABLE=`** `BatteryLongitudinalProfileRevision` (conceptual name)

| Field | Classification | Notes |
|-------|----------------|-------|
| `id` | REQUIRED_IDENTITY | UUID PK |
| `organizationId`, `vehicleId` | REQUIRED_IDENTITY + FK | Cascade policy §16 |
| `longitudinalProfileContractVersion` | REQUIRED_IDENTITY | Part of unique key |
| `profilePolicyVersion` | REQUIRED_IDENTITY | Part of unique key |
| `canonicalProfileFingerprint` | REQUIRED_IDENTITY | SHA-256 hex, part of unique key |
| `scientificProfileJson` | REQUIRED_IDENTITY | Bounded JSONB (≤100 sessions in D1 window) |
| `requestedSessionLimit`, `appliedSessionLimit` | REQUIRED_QUERY_METADATA | List/filter revisions by window |
| `candidateRestSessionCount`, `includedSessionCount`, `provisionalSessionCount`, `excludedSessionCount` | REQUIRED_QUERY_METADATA | Ops/audit dashboards |
| `firstIncludedAnchorAt`, `lastIncludedAnchorAt` | REQUIRED_QUERY_METADATA | Time bounds |
| `profileStatus` | REQUIRED_QUERY_METADATA | Filter OK vs NO_ELIGIBLE |
| `materializedAt` | REQUIRED_QUERY_METADATA | Envelope ordering (not scientific truth) |
| `createdAt` | REQUIRED_QUERY_METADATA | Insert audit |
| Normalized child tables | **NOT_REQUIRED** | See §9 |

**`PERSISTENCE_SHAPE=`** single append-only parent + JSONB scientific snapshot + selective indexed columns.

**`NORMALIZED_CHILD_TABLES_REQUIRED=NO`**

---

## 9. Normalized child tables

Authoritative per-session evidence remains in **`BatteryRestSessionFeature`**. D2 profile is bounded (≤100 sessions). Expected D4/M3.3E queries in near term:

- list revisions for vehicle ordered by `materializedAt`
- fetch revision by fingerprint
- compare revision to live D2 assembly (equivalence test)

**No demonstrated need** for `profile_revision_observation` child tables in D3. Revisit only if M3.3E proves relational query requirements.

---

## 10. Unique / idempotency contract (Decision 5)

**`PROPOSED_UNIQUE_KEY=`**

```prisma
@@unique(
  [organizationId, vehicleId, longitudinalProfileContractVersion, profilePolicyVersion, canonicalProfileFingerprint],
  map: "battery_longitudinal_profile_revision_scientific_identity"
)
```

**`PROPOSED_INDEXES=`**

- `@@index([vehicleId, materializedAt(sort: Desc)])`
- `@@index([organizationId, createdAt(sort: Desc)])`
- Optional: `@@index([vehicleId, profileStatus])`

Do **not** use `(vehicleId, createdAt)` alone as scientific identity.

---

## 11. Revision number (Decision 6)

**`SEQUENTIAL_REVISION_NUMBER_REQUIRED=NO`**

Per-vehicle `max(revision)+1` introduces unnecessary contention under multi-replica writers. **UUID + fingerprint + immutable `createdAt`** suffices for audit ordering.

---

## 12. Multi-replica write safety (Decision 7)

**`MULTI_REPLICA_IDEMPOTENCY=INSERT_THEN_VERIFY_ON_CONFLICT`**

**`DB_UNIQUE_AUTHORITY=YES`**

```
BEGIN (Read Committed default acceptable)
  INSERT revision
  IF unique violation:
    SELECT existing BY unique key
    ASSERT canonicalScientificUtf8(existing) == canonicalScientificUtf8(new)
    RETURN EXISTING
  ELSE RETURN CREATED
COMMIT
```

No Redis mutex as correctness authority. Optional Redis **cache** only after DB truth established.

---

## 13. Changed profile / concurrent snapshots (Decision 8)

Two writers with **different fingerprints** (e.g. new C3 row between D1 reads) → **two valid revisions** coexist. Not a duplicate error.

Ordering for audit: **`materializedAt DESC, createdAt DESC, id DESC`** as **operational convenience**, not “latest scientific truth” for M3.3E without explicit policy.

Late replay may insert “older” science with newer `materializedAt` — document in M3.3E consumption rules.

---

## 14. “Latest” / current pointer (Decision 9)

**`CURRENT_POINTER_REQUIRED=NO`**

No `currentProfileRevisionId` on `Vehicle` in D3. M3.3G owns customer authority cutover. Readers query revisions explicitly or recompute D2 on demand.

---

## 15. Materialization trigger (Decision 10)

| Trigger | Risk | Audit verdict |
|---------|------|---------------|
| A. Every C3 append | Extreme write amplification (INCREMENTAL churn) | **Reject** for default |
| B. Terminal FINAL only | Lower churn; still couples to shadow hooks | **Defer** wiring to M3.3F slice |
| C. Scheduled reconciliation | Ops complexity | Optional later |
| D. On-demand + optional persist | Controlled | **Preferred runtime API shape** when enabled |
| E. Schema/service foundation only; no reachable trigger | Safest for D3 engineering entry | **Required for D3 PR scope** |

**`MATERIALIZATION_TRIGGER=`** **E now** (audit); **D** when M3.3F authorizes runtime. **Not** automatic on C3 shadow flag alone.

---

## 16. Feature flag / activation (Decision 11)

**`SEPARATE_ACTIVATION_GATE_REQUIRED=YES`**

Proposed future gate (name TBD in implementation PR): e.g. `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED` default **OFF**.

**Must not** inherit activation from `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED` alone.

**M3.3F** remains explicit production-shadow authorization stage before any production materialization.

---

## 17. Retention (Decision 12)

**`RETENTION_POLICY=DECISION_REQUIRED`**

Append-only revisions can grow without bound. Options (product/legal not audited here):

- indefinite retention
- bounded count per vehicle
- time-based archival

**No deletion policy** in this audit.

---

## 18. Source row deletion / cascade (Decision 13)

**`DELETE_CASCADE_POLICY=DECISION_REQUIRED_WITH_DEFAULT_RECOMMENDATION`**

| Event | Recommendation |
|-------|----------------|
| Vehicle deleted | **Cascade** delete revisions (derived cache; rebuild impossible) |
| Organization deleted | **Cascade** |
| C3 rows purged by future retention | Revisions may become **historical orphans** referencing stale digests — mark **rebuildability lost**; D4 may flag `SOURCE_EVIDENCE_MISSING` later |

Do **not** silently inherit C3 cascade onto revision semantics without explicit decision. Default: revisions are **rebuildable cache + audit**, not a substitute for C3 retention.

---

## 19. Reader equivalence (Decision 14)

**`READER_EQUIVALENCE_DEFINED=YES`**

Future invariant (implementation slice):

```
profile = assembleLongitudinalProfileV1({ inventory, profileGeneratedAt: ENVELOPE })
projection = stripProfileGeneratedAt(profile)
materialize(projection) → row
read(row) → deserialize scientificProfileJson
assert canonicalFeatureInputUtf8(read) === canonicalFeatureInputUtf8(projection)
```

No second mapper with alternate semantics.

---

## 20. Contract / policy evolution (Decision 15)

**`POLICY_VERSION_APPEND_ONLY=YES`**  
**`CONTRACT_VERSION_APPEND_ONLY=YES`**

New `M3_3D_PROFILE_POLICY_V2` or `M3_3D_LONGITUDINAL_PROFILE_V2` → distinct unique key dimension + distinct fingerprint namespace. Never overwrite prior revisions.

---

## 21. Fingerprint case analysis (Decision 16)

| Case | Change | Fingerprint |
|------|--------|-------------|
| **A** | Same DEFAULT; PROVISIONAL changes | **DIFFERENT** (`CASE_A_PROVISIONAL_CHANGE_FINGERPRINT=DIFFERENT`) |
| **B** | Same DEFAULT; EXCLUDED reasons change | **DIFFERENT** |
| **C** | Same observations; window limits change | **DIFFERENT** (requested/applied in projection) |
| **D** | Same science; only `profileGeneratedAt` changes | **SAME** |
| **E** | Same evidence; policy version changes | **DIFFERENT** (unique key + projection includes `profilePolicyVersion`) |

---

## 22. Boundaries

| Slice | D3 relationship |
|-------|-----------------|
| **D4** | Digest/revision/coverage integrity — **not in D3**; persisted rows may still show `perSessionInspectionStatus=NOT_EVALUATED` |
| **M3.3E** | May **read** descriptive revisions; must not treat D3 as health authority |
| **M3.3F** | Production materialization authorization — **no production materialization before explicit M3.3F** |

**`D4_BOUNDARY_PRESERVED=YES`**  
**`M3_3E_BOUNDARY_PRESERVED=YES`**  
**`M3_3F_BOUNDARY_PRESERVED=YES`**

---

## 23. Implementation readiness

| Gate | Status |
|------|--------|
| **`SCHEMA_IMPLEMENTATION_READY=`** **CONDITIONAL** — proceed to D3 engineering PR (schema+migration+writer) **after** this audit merges |
| **`PRODUCTION_MATERIALIZATION_READY=`** **NO** — shadow flag off; M3.3F not authorized |

---

## 24. Open decisions (explicit)

1. Retention/compaction policy  
2. Long-term audit vs rebuildable-cache classification when C3 source purged  
3. Exact materialization flag name and M3.3F wiring schedule  
4. Whether to persist `canonicalScientificUtf8` column vs recompute on conflict  
5. DEC-M3.3D-001 minimum sessions (unchanged; unrelated to D3 idempotency)

---

## 25. Non-effects (this audit)

`SCHEMA_CHANGE=NO`, `MIGRATION_CREATED=NO`, `RUNTIME_WRITER_ADDED=NO`, `FEATURE_FLAG_ADDED=NO`, `PRODUCTION_DEPLOY=NO`, `PRODUCTION_DATA_MUTATION=NO`.

---

## 26. Validation

Local: `validate-module-registry.sh`, `validate-graph.sh` on documentation PR.
