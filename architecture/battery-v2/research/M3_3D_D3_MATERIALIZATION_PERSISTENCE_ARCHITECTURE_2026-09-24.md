# M3.3D D3 — Longitudinal Profile Materialization & Persistence Architecture Audit

**Date:** 2026-09-24  
**Status:** **ARCHITECTURE COMPLETE ON MAIN** · **D3.1 PERSISTENCE CONTRACT COMPLETE ON MAIN** — merged PR #1744 @ `7919bdd5ce9f9128810c83627b0bc9995d99a16b` (PR head `0e7ea2884c4d0a016bdcc92f4d54b262014d8109`)  
**Main anchor:** `7919bdd5ce9f9128810c83627b0bc9995d99a16b`  
**Next slice:** **M3.3D D4 Integrity / Inspection** — digest/revision/source-evidence integrity + bounded inspection (**NOT** production D3 materialization; M3.3F remains later)  
**Foundation status:** **D3 foundation engineering COMPLETE ON MAIN** — PR #1746 @ merge `c5c1129f62e11eb68c8fc6566fd7fecef376743b` (head `944a6839ed18dd57244897924d72ac49b9a968a2`); **`D3_RUNTIME_REACHABLE=NO`**
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

**Multi-replica insert precedent:** C3 uses **database-enforced uniqueness** as part of correctness (pre-read by input digest, Serializable transaction, rest-session lock, semantic revision allocation, append-only create, conflict retry). C3 does **not** implement the D3 `INSERT … ON CONFLICT DO NOTHING` idempotent materialization algorithm. D3 follows the same **principle** of DB unique authority with a **D3-specific** insert/verify contract (§12).

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

1. Read D1 inventory (same service/contract as today).
2. `assembleLongitudinalProfileV1({ inventory, profileGeneratedAt })` (envelope for assembly only; not stored inside scientific JSON).
3. Build **scientific projection** (omit `window.profileGeneratedAt` by property removal — §4.1 / D3.1 §6).
4. Compute `canonicalProfileFingerprint` from projection (§4).
5. Idempotent persist via PostgreSQL-safe algorithm (§12).

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
2. Build **scientific projection** by **omitting** `window.profileGeneratedAt` (do not set `undefined` — serializer rejects undefined; see D3.1 §6).
3. `canonicalUtf8 = canonicalFeatureInputUtf8(scientificProjection)` (same primitives as C3).
4. `canonicalProfileFingerprint = sha256HexLowercaseUtf8(canonicalUtf8)`.

### 4.1 Scientific projection construction (normative)

Conceptual shape (no mutation of assembled D2 profile):

```typescript
const { profileGeneratedAt: _envelope, ...scientificWindow } = profile.window;
const scientificProjection = {
  ...profile,
  window: scientificWindow,
};
```

**`PROFILE_GENERATED_AT_PROPERTY_OMITTED=YES`**  
**`UNDEFINED_INSERTED_IN_PROJECTION=NO`**

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

On unique `(org, vehicle, contractVersion, policyVersion, fingerprint)` conflict after `ON CONFLICT DO NOTHING`:

1. Load existing row by exact scientific unique key.
2. Compute `storedCanonicalUtf8 = canonicalFeatureInputUtf8(existing.scientificProfileJson)`.
3. Compute `newCanonicalUtf8 = canonicalFeatureInputUtf8(newScientificProjection)`.
4. If equal → return **EXISTING** revision.
5. If fingerprint matches unique key but canonical UTF-8 differs → **`PROFILE_FINGERPRINT_COLLISION_OR_CANONICALIZATION_DRIFT`** (fail closed).

**`JSONB_RAW_BYTES_ARE_CANONICAL_AUTHORITY=NO`** — PostgreSQL JSONB is not a canonical byte representation.

**`CANONICAL_RESERIALIZATION_IS_COMPARISON_AUTHORITY=YES`**

For fixed scientific semantics:

`canonicalFeatureInputUtf8(storedJson) === canonicalFeatureInputUtf8(newProjection)`

**`CANONICAL_SCIENTIFIC_UTF8_STORED=NO` (D3 V1)** — persist `scientificProfileJson` + fingerprint only; recompute canonical UTF-8 on the rare conflict path. A future additive migration may introduce a stored UTF-8 column if profiling proves need.

**`CANONICAL_PAYLOAD_STORED=YES`** — `scientificProfileJson` holds the **semantic** scientific projection (property omission of `profileGeneratedAt`).

---

## 7. Persisted payload (Decision 3)

**Recommendation: B + D hybrid**

| Store | Content |
|-------|---------|
| `scientificProfileJson` | Semantic scientific projection (JSONB storage; **not** canonical bytes) |
| `materializedAt` / `createdAt` | DB envelope timestamps |
| Indexed metadata | Small query fields duplicated from JSON (see schema) |

**Do not** store `profileGeneratedAt` inside `scientificProfileJson`.

**Invariant:** for a fixed scientific projection, **`canonicalFeatureInputUtf8(storedJson)`** is stable — not raw JSONB octets.

---

## 8. Schema candidate (Decision 4) — **proposal only**

**`PROPOSED_TABLE=`** `BatteryLongitudinalProfileRevision` (conceptual name)

| Field | Classification | Notes |
|-------|----------------|-------|
| `id` | REQUIRED_IDENTITY | UUID PK |
| `organizationId`, `vehicleId` | REQUIRED_IDENTITY + FK | **onDelete: Cascade** with Organization/Vehicle (§18) |
| `longitudinalProfileContractVersion` | REQUIRED_IDENTITY | Part of unique key |
| `profilePolicyVersion` | REQUIRED_IDENTITY | Part of unique key |
| `canonicalProfileFingerprint` | REQUIRED_IDENTITY | **SHA-256 lowercase hex, fixed 64 chars** — see §10.1 |
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

### 10.1 Fingerprint column contract (D3 V1)

| Rule | Value |
|------|-------|
| Algorithm | SHA-256 over `canonicalFeatureInputUtf8(scientificProjection)` |
| Encoding | Lowercase hexadecimal |
| Length | **64** characters |
| Prisma (proposed) | `String @db.Char(64)` or equivalent strict 64-char DB type |
| Writer validation | Must match `/^[0-9a-f]{64}$/` before INSERT |
| DB guard (migration) | Prefer PostgreSQL `CHECK (canonical_profile_fingerprint ~ '^[0-9a-f]{64}$')` if consistent with repo migration conventions; otherwise enforce in writer + integration tests only |

**`FINGERPRINT_FIXED_LENGTH=64`**  
**`FINGERPRINT_ENCODING=LOWERCASE_HEX`**  
**`FINGERPRINT_DB_CONTRACT_DEFINED=YES`**  
**`FINGERPRINT_WRITER_VALIDATION_DEFINED=YES`**

---

## 11. Revision number (Decision 6)

**`SEQUENTIAL_REVISION_NUMBER_REQUIRED=NO`**

Per-vehicle `max(revision)+1` introduces unnecessary contention under multi-replica writers. **UUID + fingerprint + immutable `createdAt`** suffices for audit ordering.

---

## 12. Multi-replica write safety (Decision 7)

**`POSTGRES_CONFLICT_ALGORITHM=INSERT_ON_CONFLICT_DO_NOTHING_THEN_VERIFY`**

**`MULTI_REPLICA_IDEMPOTENCY=`** same as above (supersedes informal “INSERT then catch unique violation in same tx” wording)

**`DB_UNIQUE_AUTHORITY=YES`**

**`SAME_ABORTED_TX_USED_AFTER_UNIQUE_ERROR=NO`**

A PostgreSQL transaction that hits a normal unique-violation error enters **aborted** state unless a savepoint rolls back. D3 must **not** specify “INSERT; on unique violation SELECT in the same transaction” without savepoints.

### Normative algorithm (READ COMMITTED)

```
BEGIN;  -- READ COMMITTED (default) is sufficient: ON CONFLICT is atomic at statement level

INSERT INTO battery_longitudinal_profile_revisions (...)
VALUES (...)
ON CONFLICT (
  organization_id,
  vehicle_id,
  longitudinal_profile_contract_version,
  profile_policy_version,
  canonical_profile_fingerprint
) DO NOTHING
RETURNING ...;

IF RETURNING row present:
  outcome = CREATED
ELSE:
  SELECT existing row BY exact scientific unique key
  ASSERT canonicalFeatureInputUtf8(existing.scientific_profile_json)
       === canonicalFeatureInputUtf8(new_scientific_projection)
  IF equal: outcome = EXISTING
  ELSE: FAIL CLOSED PROFILE_FINGERPRINT_COLLISION_OR_CANONICALIZATION_DRIFT

COMMIT;
```

**Why READ COMMITTED suffices:** uniqueness is enforced by the **single INSERT … ON CONFLICT** statement; the follow-up SELECT runs only when no row was inserted, in a still-valid transaction (no prior aborted statement).

**`READ_COMMITTED_SUFFICIENT_DOCUMENTED=YES`**

**Alternative (allowed):** Prisma `create` outside a long transaction → catch `P2002` → **new** read/verify transaction with payload equality check. Equally rigorous; still **`SAME_ABORTED_TX_USED_AFTER_UNIQUE_ERROR=NO`**.

**`UNIQUE_CONFLICT_TRANSACTION_RECOVERY_VALID_FOR_POSTGRES=YES`**

No Redis mutex as correctness authority.

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

**`DELETE_CASCADE_POLICY=ORG_AND_VEHICLE_CASCADE__NO_C3_ROW_CASCADE`**

| Relation | D3 V1 semantics |
|----------|-----------------|
| **Organization deleted** | **CASCADE** delete profile revision rows |
| **Vehicle deleted** | **CASCADE** delete profile revision rows |
| **C3 `BatteryRestSessionFeature` rows** | **No direct FK** from profile revision to individual feature rows |
| **Future C3 retention/purge** | Does **not** cascade-delete D3 revisions |

`scientificProfileJson` may retain canonical source IDs/digests as **historical lineage** after source rows disappear.

| State | Meaning |
|-------|---------|
| **SOURCE_RECONSTRUCTABILITY** | May be **lost** after C3 purge |
| **Revision row** | Remains immutable **derived historical artifact** until a separately authorized D3 **retention** policy deletes it (retention still `DECISION_REQUIRED`) |
| **D4** | May later detect/report missing source evidence — **no D4 fields in D3 schema** |

**`DIRECT_C3_SOURCE_ROW_FK=NO`**  
**`C3_PURGE_CASCADES_PROFILE_REVISION=NO`**

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
| **`SCHEMA_IMPLEMENTATION_READY=`** **YES_FOR_FOUNDATION** — schema-critical contracts closed in D3.1 (§12, fingerprint column, JSONB semantics, FK/cascade); separate **D3 foundation engineering PR** may propose Prisma model + migration + internal idempotent service (**architecture on main @ `7919bdd5c`**) |
| **`PRODUCTION_MATERIALIZATION_READY=`** **NO** — shadow flag off; M3.3F not authorized; no reachable production trigger in foundation PR |

## 24. Open decisions (non-blocking for foundation schema)

1. **`RETENTION_POLICY=DECISION_REQUIRED`** — long-term compaction/archival  
2. **`MATERIALIZATION_FLAG_NAME=DECISION_REQUIRED`** — exact env flag string (default OFF)  
3. **`M3_3F_WIRING_STATUS=PENDING`** — runtime trigger schedule  
4. **DEC-M3.3D-001** — minimum sessions (unchanged; unrelated to D3 idempotency)

Closed in D3.1 (no longer open): Postgres conflict algorithm; fingerprint DB representation; canonical UTF-8 column choice; org/vehicle/C3 FK semantics.

---

## 25. Non-effects (this audit)

`SCHEMA_CHANGE=NO`, `MIGRATION_CREATED=NO`, `RUNTIME_WRITER_ADDED=NO`, `FEATURE_FLAG_ADDED=NO`, `PRODUCTION_DEPLOY=NO`, `PRODUCTION_DATA_MUTATION=NO`.

---

## 26. Validation

Local: `validate-module-registry.sh`, `validate-graph.sh` on documentation PR.

---

## 27. D3.1 architecture closure (2026-09-24)

Persistence-contract decisions merged on main via PR #1744 @ `7919bdd5c` (required **before** foundation schema/migration engineering):

| Fix | Closure |
|-----|---------|
| **1** | PostgreSQL-safe **`INSERT … ON CONFLICT DO NOTHING RETURNING`** + verify path; **no** same aborted tx after unique error |
| **2** | JSONB = semantic storage; **canonical UTF-8 reserialization** = comparison authority |
| **3** | **`CANONICAL_SCIENTIFIC_UTF8_STORED=NO`** for D3 V1 |
| **4** | **`DELETE_CASCADE_POLICY=ORG_AND_VEHICLE_CASCADE__NO_C3_ROW_CASCADE`** |
| **5** | Fingerprint **`Char(64)`** lowercase hex + writer regex validation |
| **6** | **`profileGeneratedAt` omitted** from projection (not `undefined`) |
| **7** | C3 precedent wording corrected (principle shared; algorithm differs) |
| **8** | **`SCHEMA_IMPLEMENTATION_READY=YES_FOR_FOUNDATION`** |

### D3 engineering boundary (post-audit merge)

A **separate** D3 engineering PR may add: Prisma model, migration, fingerprint wrapper, repository, idempotent materialization service, payload-equivalence tests.

Foundation engineering **must still have**:

- **NO** reachable production trigger  
- **NO** C3 lifecycle hook  
- **NO** scheduled writer  
- **NO** API/customer path  
- **NO** production flag enable  

Internal/unreachable service only until M3.3F.

---

## 28. Post-merge documentation seal (2026-09-24)

| Field | Value |
|-------|-------|
| **PR** | #1744 merged @ `7919bdd5ce9f9128810c83627b0bc9995d99a16b` |
| **D3 architecture audit** | **COMPLETE ON MAIN** |
| **D3.1 persistence contract** | **COMPLETE ON MAIN** |
| **D3 foundation engineering** | **COMPLETE ON MAIN** — PR #1746 @ `c5c1129f`; see `M3_3D_D3_FOUNDATION_ENGINEERING_2026-09-24.md` |
| **D4 integrity / inspection** | **NEXT** |
| **`PRODUCTION_MATERIALIZATION_READY`** | **NO** — M3.3F authorization required |

**Authority chain (unchanged):** persisted C3 → D1 → D2; materialized D3 revisions are **DERIVED**, **REPRODUCIBLE**, **APPEND_ONLY**, **REBUILDABLE** — not a second scientific authority.

**Open (non-blocking):** `RETENTION_POLICY=DECISION_REQUIRED`; `MATERIALIZATION_FLAG_NAME=DECISION_REQUIRED`; `M3_3F_WIRING_STATUS=PENDING`; `DEC-M3.3D-001=DECISION_REQUIRED`.
