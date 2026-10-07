# M3.3-HV-H4-A3-R0 — Durable bounded charge throughput materialization architecture

**Date:** 2026-10-02  
**Status:** **ARCHITECTURE AUTHORITY (RESEARCH)** — R0.3 population vs knowledge A2 parity closure (docs only)  
**Main anchor (A2 complete):** `9bd4a142b1d931cc135953f11b8a2ca6fff8effe` (PR #1869)  
**Audit baseline main:** `ffe5f415447b23b6dbbed4ac05c14ae9de6d2f5a`  
**Normative upstream:** `M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1` (A2 read-only composition)

---

## 1. Purpose

A2 computes `boundedObservedChargeThroughputKwh` from eligible native DIMO `HvChargeSession.energyAddedKwh` per HV lifecycle segment while raw sessions exist.

**A3 question:** What durable persistence architecture preserves enough **source evidence** to reconstruct A2 scientific behavior after `HvChargeSession` rows are pruned?

This document is **architecture authority only** — not implementation.

---

## 2. Repository audit — retention reality

### 2.1 HV charge session retention

| Item | Evidence | Value |
|------|----------|-------|
| Default retention window | `backend/src/config/battery-v2-retention.config.ts` → `days.hvChargeSessions` | **1095 days** (`RETENTION_HV_CHARGE_SESSIONS_DAYS`) |
| Prune phase | `battery-v2-retention.service.ts` → `phasePruneHvChargeSessions` | `startAt < cutoff`; keyset scan `(startAt ASC, id ASC)` — cursor advances on **last fetched** row per page |
| Scan invariant | A3.4 closure | **`BLOCKED_RETENTION_ROWS_DO_NOT_STARVE_LATER_CANDIDATES = YES`** — fail-closed rows are not re-scanned in the same run |
| H4 durable ACK | `m3-3-hv-h4-a3-retention-gate.v1.ts` | Exact V1 revision + revision-scoped ACK; incompatible contract versions resolve as **no authorized current revision** (`BLOCKED_CURRENT_REVISION_MISSING`), not a separate prune path |
| Master switch | `BATTERY_V2_RETENTION_ENABLED` | default **false** |
| Destructive delete | `BATTERY_V2_RETENTION_DRY_RUN` | default **true** |
| Prune guard | Same phase | Skip if `hvCapacityObservation.chargeSessionId` references session |

**Conclusion:** Sessions are prunable only when retention is enabled, dry-run off, capacity guard passes, **and** the A3.4 gate authorizes delete for the locked current row.

### 2.2 `phasePrepareAggregates` vs H4

`prepare_aggregates` (`battery-v2-retention.service.ts`) aggregates **`batteryMeasurement`** tied to **`batteryMeasurementSession`**, via `battery-v2-retention-aggregate.service.ts`.

It does **not** read `HvChargeSession` or charge-throughput fields.

### 2.3 `BatteryRetentionAggregate` vs H4 needs

Session/DAILY rollup JSON (`SessionAggregateSummary`, `DailyAggregateSummary`) stores measurement counts and quality/type histograms — **not**:

- `energyAddedKwh`
- `segmentFingerprint`
- `metadata.providerSegmentId`
- DIMO native source / `SEGMENT_EXTREMA` provenance
- Charge session `startAt`/`endAt` as H4 episode inputs

Authority constant on main: `EXISTING_RETENTION_AGGREGATES_PRESERVE_CHARGE_THROUGHPUT = false` (`m3-3-hv-h4.constants.ts`).

**Conclusion:** Existing aggregates **cannot** preserve A2 charge-throughput authority.

---

## 3. Identity and terminology (R0.1 + R0.2)

| Concept | Authority | Notes |
|---------|-----------|-------|
| **CANONICAL_SOURCE_SESSION_IDENTITY** | `(organizationId, vehicleId, segmentFingerprint)` | DB core: `@@unique([vehicleId, segmentFingerprint])`; `organizationId` retained for tenant defense |
| **PROVIDER_SESSION_IDENTITY** | `metadata.providerSegmentId` | Nullable; duplicate detection in A2 |
| **DATABASE_ROW_ID / `sourceHvChargeSessionId`** | `HvChargeSession.id` | Raw-row provenance + current A1 `orderBy id ASC` tie-break — **not** canonical source-session identity |
| **PHYSICAL_CHARGE_EPISODE_IDENTITY_PROVEN** | **NO** | Overlapping eligible native sessions → fail-closed; fingerprint ≠ proven physical episode |

**Invariant:** **`SAME_SOURCE_SESSION_ACROSS_H4_CONTRACT_VERSIONS = YES`** — the canonical source session exists **independently** of any H4 persistence contract version.

**Do not use:** `ONE_PHYSICAL_CHARGE_EPISODE_PER_SEGMENT_FINGERPRINT`.  
**Use:** **`ONE_CANONICAL_CHARGE_SESSION_SOURCE_IDENTITY_PER_SEGMENT_FINGERPRINT`**.

**`lifecycleSegmentId` is derived** — never immutable source identity.

**`H4_CONTRACT_VERSION_PART_OF_CANONICAL_SOURCE_SESSION_IDENTITY = NO`**

**`SOURCE_HV_CHARGE_SESSION_ID_IS_CANONICAL_IDENTITY = NO`** — do not treat raw DB UUID as physical/logical session identity.

**`RAW_ROW_ID_STABILITY_ACROSS_PRUNE_REINGESTION_PROVEN = NO`** — A3.1/A3.3 must audit whether `sourceHvChargeSessionId` remains stable if sessions are re-ingested after prune before relying on it as permanent cross-retention ordering authority (see **OQ-A3-5**).

---

## 4. Source evidence vs derived eligibility

### 4.1 Durable artifact is not “eligible contributions only”

Eligibility is **derived** and changes with:

- late replacement GT knowability / resegmentation
- GT revocation or supersession
- replacement-boundary intersection under new GT-as-of
- future A1/A2 contract version changes

**`CURRENT_ELIGIBILITY_IS_DURABLE_SOURCE_FILTER = NO`**

The durable layer must preserve **H4-relevant source facts** for observed charge sessions (including ineligible, conflict, and context-only rows needed for diagnostics), not only rows that are `ELIGIBLE_CONTRIBUTOR` at capture time.

### 4.2 Projection pipeline (conceptual)

```
SOURCE EVIDENCE REVISION (immutable append)
  + current A1/A2/H4 contract
  + replacement GT as-of at evaluationAt
  => per-session eligibility classification
  => lifecycle segment assignment
  => bounded observed charge throughput + compositionStatus + fingerprints
```

**Preferred name:** **H4 charge session evidence revision ledger** (not “contribution-only ledger”).

Capture-time eligibility may appear only as **diagnostic envelope** — not immutable scientific truth.

---

## 5. Minimum durable source payload (post-delete reclassification)

Fields consumed by A1/A2 classifiers on main (audit: `m3-3-hv-h4-charge-session-source-authority.ts`, `m3-3-hv-h4-charge-throughput-session.v1.ts`, A2 fingerprint builder):

| Field | A1/A2 use |
|-------|-----------|
| `organizationId`, `vehicleId` | Tenant isolation |
| `sourceHvChargeSessionId` (`HvChargeSession.id`) | Classification row identity, overlap sets |
| `segmentFingerprint` | Canonical source session identity |
| `metadata.providerSegmentId` | Duplicate provider conflict |
| `source` | Native vs fallback vs unknown |
| `startAt`, `endAt`, `isOngoing` | Overlap, replacement crossing, ongoing |
| `energyAddedKwh` | Throughput semantic (only allowed energy field) |
| `providerObservedAt` | Provenance / fingerprint |
| `metadata.addedEnergyProvenance` | Must be `SEGMENT_EXTREMA` for A2 native path |
| `metadata.qualityStatus` | QUALIFIED gate |
| `metadata.supersededBySegmentFingerprint` | Superseded exclusion |
| `metadata.startedBeforeRange` | A1 reason (observed in classifier) |
| `sourceCreatedAt`, `sourceReceivedAt`, `sourceUpdatedAt` | A2 `CURRENT_ROW_MUST_NOT_POSTDATE_EVALUATION_AT` |

**Do not persist:** `lifecycleSegmentId`, `contributionEligibility` as immutable source truth.

Optional envelope (non-authoritative): capture worker id, materialization attempt id — **excluded from scientific fingerprint**.

---

## 6. A2 equivalence vs true historical as-of

### 6.1 Two targets

| Target | Requirement |
|--------|-------------|
| **TARGET_1 — A2 current-policy equivalence after raw delete** | Final durable revision preserves final scientific payload + `createdAt`/`receivedAt`/`updatedAt` so evaluation with `evaluationAt` before envelope timestamps remains fail-closed / excluded — matching live A2 without row-version replay |
| **TARGET_2 — true historical source state at T** | Know exactly what SynqDrive knew at `evaluationAt=T` after later mutations and raw delete |

### 6.2 Revision history requirements

| Question | Answer |
|----------|--------|
| `REVISION_HISTORY_REQUIRED_FOR_CURRENT_A2_FAIL_CLOSED_EQUIVALENCE` | **NO** — one **effective** durable revision per canonical session (final envelope + payload) suffices for TARGET_1 |
| `REVISION_HISTORY_REQUIRED_FOR_TRUE_HISTORICAL_KNOWLEDGE_ASOF` | **YES** — but **prospective only** (see §6.3) |
| `RECOMMENDED_A3_ARCHITECTURE_USES_REVISION_HISTORY` | **YES** — auditability, mutable-source capture, future true-as-of from capture authority start |

Live A2 **does not** reconstruct historical row versions — only current-row envelope vs `evaluationAt`.

### 6.3 True historical knowledge-as-of is prospective

**`TRUE_HISTORICAL_KNOWLEDGE_ASOF_SUPPORT = PROSPECTIVE_FROM_REVISION_CAPTURE_AUTHORITY_START`**

Repository today stores **current** `HvChargeSession` row state only (`updatedAt` via Prisma `@updatedAt`, merge updates). No durable store of prior mutation history exists pre-A3.

| Claim | Authority |
|-------|-----------|
| `PRE_A3_TRUE_HISTORICAL_SOURCE_RECONSTRUCTION` | **NO** unless separate durable evidence already exists |
| `BACKFILL_CREATES_HISTORICAL_REVISIONS` | **NO** — must not fabricate prior mutation history |
| `BACKFILL_CAN_CAPTURE_CURRENT_STATE` | **YES** — single current-state revision for surviving rows before cutoff |

### 6.4 Live A2 pipeline — population selection vs knowledge classification (R0.3)

Live path: `loadM3_3HvH4DataV1` → `HvChargeSession` rows → A2 composition.

| Stage | Authority |
|-------|-----------|
| **SOURCE_POPULATION_SELECTION** | `organizationId`, `vehicleId`, **`startAt <= evaluationAt`** only |
| **A1 ordering / hard limit** | `startAt ASC`, `id ASC`; **5000** canonical sessions |
| **SESSION_KNOWLEDGE_CLASSIFICATION** | A2 checks **`createdAt` / `receivedAt` / `updatedAt`** vs `evaluationAt` **after** source load |

**`POPULATION_SELECTION_PRECEDES_KNOWLEDGE_GATE = YES`**

**`KNOWLEDGE_TIMESTAMP_FILTER_IS_A1_DB_LOAD_FILTER = NO`**

**`KNOWLEDGE_GATE_OCCURS_AFTER_SOURCE_LOAD = YES`**

**Hard-limit consequence (current A2 V1):**

**`KNOWLEDGE_INELIGIBLE_SESSION_COUNTS_TOWARD_A1_SOURCE_LOAD = YES`**

**`KNOWLEDGE_INELIGIBLE_SESSION_CAN_AFFECT_SOURCE_TRUNCATION = YES`**

**`APPLY_5000_LIMIT_BEFORE_A2_KNOWLEDGE_CLASSIFICATION = YES`**

Do **not** build the 5000-session population from knowable-only sessions.

### 6.5 Parity example — late `createdAt` (TARGET_1 / MODE_A)

| Field | Value |
|-------|-------|
| `evaluationAt` | 2026-08-01 |
| Session `startAt` | 2026-07-05 (`startAt <= evaluationAt`) |
| Session `createdAt` | 2026-08-02 (after `evaluationAt`) |

**Live A2:**

- A1 source population **includes** the session.
- A2 classifies **`INELIGIBLE_NOT_KNOWABLE_AT_EVALUATION`** (not an eligible contributor).

**Required durable TARGET_1 (MODE_A) parity:**

| Check | Value |
|-------|-------|
| `SESSION_PRESENT_IN_SOURCE_POPULATION` | **YES** |
| `SESSION_ELIGIBLE_CONTRIBUTOR` | **NO** |
| `SESSION_CLASSIFICATION` | **`INELIGIBLE_NOT_KNOWABLE_AT_EVALUATION`** |

Same pattern applies when **`updatedAt` / `receivedAt`** postdate `evaluationAt` while `startAt <= evaluationAt`.

### 6.6 TARGET_1 vs TARGET_2 resolution modes

| Constant | TARGET_1 (A2 V1 parity) | TARGET_2 (future historical) |
|----------|-------------------------|------------------------------|
| **`TARGET_2_HISTORICAL_REVISION_SELECTION`** | N/A | **YES** |
| **`TARGET_2_IS_CURRENT_A2_V1_PARITY_MODE`** | N/A | **NO** |
| **`TRUE_HISTORICAL_MODE_SEPARATE_FROM_A2_V1_PARITY`** | — | **YES** |

**MODE_A — `A2_V1_PARITY`:** canonical sessions → **current/final** durable source state → A1 population / order / 5000 limit → A2 **current-row** knowledge gate → A2 composition.

**MODE_B — `TRUE_HISTORICAL_ASOF`:** canonical sessions → **historical** revision at `evaluationAt` → future historical interpretation contract (separately versioned/authorized). **Do not** silently replace MODE_A.

**`A3_3_TARGET_MODE = MODE_A (A2_V1_PARITY)`** — equivalence proof targets MODE_A first.

---

## 7. Source revision model (conceptual, no schema)

### 7.1 Canonical session vs versioned revision identity

| Identity | Definition |
|----------|------------|
| **CANONICAL_SOURCE_SESSION_IDENTITY** | `(organizationId, vehicleId, segmentFingerprint)` — **unchanged** across H4 contract versions |
| **VERSIONED_SOURCE_REVISION_SCIENTIFIC_IDENTITY** | `organizationId` + `vehicleId` + `segmentFingerprint` + `h4SourceEvidenceContractVersion` + **`sourceRevisionFingerprint`** |

Exact future DB unique key shape is **A3.1** work. Invariant: many revisions may share one canonical session; contract version scopes revision semantics without redefining the session.

### 7.2 Fingerprint vs database unique identity

**Do not equate** revision identity with fingerprint alone.

| Term | Meaning |
|------|---------|
| **`SOURCE_REVISION_FINGERPRINT`** | `SHA256_CANONICAL_ORDERED_JSON_V1` over H4-relevant source-state projection |
| **`SOURCE_REVISION_DATABASE_IDENTITY`** | Tenant + canonical session scope + contract version + fingerprint (future unique constraint) |

**`FINGERPRINT_ALONE_IS_DATABASE_UNIQUE_IDENTITY = NO`**

Future persistence must fail closed on fingerprint/canonicalization drift (D3 precedent): same versioned scientific unique identity, different canonical payload ⇒ **conflict** (`ProfileFingerprintPayloadMismatchError`-class behavior — pattern only).

### 7.2B. Scientific energy authority vs DB float mirror (A3.1.2)

| Constant | Value |
|----------|-------|
| **`SCIENTIFIC_ENERGY_IDENTITY_AUTHORITY`** | `TAGGED_CANONICAL_EVIDENCE_JSON` (`NULL` / `FINITE` / `NAN` / `POSITIVE_INFINITY` / `NEGATIVE_INFINITY`) |
| **`DB_FLOAT_MIRROR_POLICY`** | `FINITE_ONLY_NON_FINITE_TO_NULL_V1` |
| **`DB_FLOAT_MIRROR_IS_FINGERPRINT_AUTHORITY`** | `false` |

The nullable `energy_added_kwh DOUBLE PRECISION` column is a **convenience mirror** for finite throughput queries only. Non-finite scientific tags mirror to SQL `NULL`; mirror `NULL` does **not** imply scientific `NULL`. Lossless special-value identity and fingerprint authority remain on tagged `scientificEvidenceJson` only. Prisma/Postgres float columns must **not** be relied on for NaN/±Infinity round-trip.

**A3 observability boundary:** A3 captures the HvChargeSession state presented to the H4 application contract. Tagged JSON can represent non-finite JS values when supplied at the projection boundary; A3 does not recover values normalized or lost before that boundary.

### 7.3 When to append a revision

Append when any **H4-relevant** fact changes, including:

`startAt`, `endAt`, `isOngoing`, `source`, `energyAddedKwh`, `providerObservedAt`, `providerSegmentId`, `addedEnergyProvenance`, `qualityStatus`, supersession fields, `startedBeforeRange`, and knowledge envelope **`sourceCreatedAt` / `sourceReceivedAt` / `sourceUpdatedAt`**.

**Knowledge timestamps:** if a change alters A2 knowability at any `evaluationAt`, it **must** change `sourceRevisionFingerprint`.

**`H4_RELEVANT_REVISION_DETECTION_REQUIRED = YES`** — not energy-only deltas. Prisma `updatedAt` moves on merge even when classification-relevant fields change.

**`RECONCILIATION_REQUIRED_AS_SAFETY_NET = YES`** (future scheduler; default OFF).

---

## 7A. Effective revision selection (future A3 loader)

**`ONE_EFFECTIVE_SOURCE_STATE_PER_CANONICAL_SESSION_PER_EVALUATION = YES`**

**`REVISION_ROWS_FED_DIRECTLY_TO_A2_AS_SEPARATE_SESSIONS = NO`**

Pipeline (MODE_A — must match live ordering):

```
revision ledger
  → group by CANONICAL_SOURCE_SESSION_IDENTITY
  → MODE_A: current/final durable source state per session (TARGET_1)
  → MODE_B: historical revision at evaluationAt (TARGET_2 — not A2 V1 parity)
  → reconstruct HvChargeSession-equivalent scientific input (preserve sourceHvChargeSessionId)
  → A1 population: startAt <= evaluationAt; order; 5000 hard limit
  → A2 knowledge gate + classification/composition
```

**TARGET_1 — `CURRENT_A2_FAIL_CLOSED_EQUIVALENCE` (MODE_A):**

| Constant | Value |
|----------|-------|
| **`TARGET_1_REVISION_RESOLUTION`** | **`CURRENT_DURABLE_SOURCE_STATE_PER_CANONICAL_SESSION`** |
| **`TARGET_1_PRELOAD_KNOWLEDGE_FILTER`** | **NO** — do **not** drop sessions because durable `createdAt`/`receivedAt`/`updatedAt` postdate `evaluationAt` |
| **`TARGET_1_A2_KNOWLEDGE_GATE_AFTER_LOAD`** | **YES** — A2 applies `INELIGIBLE_NOT_KNOWABLE_AT_EVALUATION` after load (§6.5) |

**TARGET_2 (MODE_B — true historical, prospective):** select latest revision whose source knowledge state is valid/known at `evaluationAt` per future revision ordering contract (§7B). **Not** identical to current A2 V1 behavior.

---

## 7B. Revision ordering authority (A3.1 requirement)

Deterministic revision selection **must not** rely on DB row return order.

**`REVISION_SELECTION_TIE_MUST_FAIL_CLOSED_OR_HAVE_EXPLICIT_DETERMINISTIC_AUTHORITY = YES`**

Candidate ordering inputs (conceptual — exact schema in A3.1):

- `sourceUpdatedAt`, `sourceReceivedAt`, `sourceCreatedAt`
- capture envelope (`capturedAt` / `materializedAt`)
- `sourceRevisionFingerprint`
- optional explicit **`revisionSequence`** (not invented in R0 — audit whether required)

---

## 7C. A1 load semantics after revision collapse

Live loader (`m3-3-hv-h4-data.loader.ts`):

- `where`: `organizationId`, `vehicleId`, `startAt <= evaluationAt`
- `orderBy`: `startAt ASC`, `id ASC`
- hard limit: **5000** canonical sessions (`M3_3_HV_H4_CHARGE_SESSION_LOAD_HARD_LIMIT`)

After raw delete, durable path must:

1. Collapse revisions → **one effective row per canonical session** (MODE_A: current/final state)  
2. **Then** apply the same population filter, ordering, and **5000 hard-limit probe** (includes knowledge-ineligible sessions)  
3. **Then** A2 knowledge classification (same as live)

**`APPLY_HARD_LIMIT_AFTER_EFFECTIVE_REVISION_COLLAPSE = YES`**  
**`HARD_LIMIT_APPLIED_BEFORE_KNOWLEDGE_CLASSIFICATION = YES`**  
**`REVISION_ROW_COUNT_AFFECTS_A1_SOURCE_TRUNCATION = NO`**  
**`CANONICAL_SOURCE_SESSION_COUNT_AFFECTS_SOURCE_TRUNCATION = YES`**

**`SOURCE_HV_CHARGE_SESSION_ID_ORDERING_PRESERVED = YES`** — retain `sourceHvChargeSessionId` for `id ASC` tie-break unless A3.3 defines an equivalent deterministic ordering authority.

**`A1_ORDER_AFTER_REVISION_COLLAPSE = startAt ASC, sourceHvChargeSessionId ASC`** (equivalent to live A1)

---

## 8. Source revision fingerprint

**`SOURCE_REVISION_FINGERPRINT_ALGORITHM = SHA256_CANONICAL_ORDERED_JSON_V1`**

- Deterministic key order, stable array ordering, SHA-256 hex.
- Payload = H4-relevant source-state projection only.
- Recompute-on-insert verification (pattern: D3 `longitudinal-profile-materialization.repository.ts` fingerprint verify — **pattern only**, not D3 payload).

Segment **composition** fingerprint remains A2 `buildM3_3HvH4SegmentSourceFingerprintV1` over classifications + composition status (full report scope).

---

## 9. Revision-scoped retention ACK (future — not on main)

Session-level `materialized=true` is **insufficient** — `mergeHvChargeSessionUpdate` (`hv-charge-session.merge.ts`) mutates completed sessions.

**Future invariant:**

**`DURABLE_H4_SOURCE_REVISION_ACK_REQUIRED_BEFORE_HV_CHARGE_SESSION_PRUNE`**

ACK binds:

- `organizationId`, `vehicleId`, `segmentFingerprint`
- `sourceRevisionFingerprint`
- H4 durable evidence contract version

**Prune algorithm (conceptual):**

1. Load / lock current `HvChargeSession` row  
2. Compute current `sourceRevisionFingerprint` from live state  
3. Verify durable revision + ACK match **exact** fingerprint  
4. Only then allow delete  

**`STALE_ACK_PERMITS_PRUNE = NO`** — if live fingerprint ≠ ACK fingerprint → **fail closed** (no delete).

**Contract version mismatch:** **`CONTRACT_VERSION_MISMATCH_PERMITS_PRUNE = NO`** unless a future migration/compatibility authority explicitly proves equivalence between contract versions.

**`RETENTION_ACK_SCOPE = REVISION_SCOPED`**

---

## 10. Retention race analysis (future)

Materialize → ACK → prune cannot be a loose boolean flag.

Required invariant:

**`NO_HV_CHARGE_SESSION_DELETE_WITHOUT_MATCHING_CURRENT_SOURCE_REVISION_DURABILITY`**

Future safe patterns (evaluate in A3.4):

- **A)** Transaction coupling row verification + prune gate  
- **B)** Row/advisory lock + exact fingerprint match  
- **C)** DB-enforced uniqueness + ACK table keyed by revision fingerprint  

Multi-replica workers: **DB uniqueness authority + reconciliation sweep** (D3 precedent — not D3 domain payload).

---

## 11. Late GT, revocation, supersession

Durable evidence stores **source interval** (`startAt`, `endAt`) — not lifecycle segment.

At report time:

```
durable source revisions
+ GT knowable/active at evaluationAt (H2/H4 replacement boundaries)
=> lifecycle segmentation + A2 composition
```

- **Late replacement GT:** deterministic resegmentation (A2 tests on main).  
- **GT revocation/supersession:** recompute boundaries; do not discard source revisions that were previously ineligible due to boundary intersection.

---

## 12. Full A2 reproducibility scope

| Scope | Meaning |
|-------|---------|
| **NUMERIC_THROUGHPUT_REPRODUCIBILITY** | Sum of eligible energies only |
| **FULL_A2_REPORT_REPRODUCIBILITY** | Includes `compositionStatus`, conflict/truncation, per-session classifications, excluded counts, segment `sourceFingerprint` |

A2 segment fingerprint hashes **all segment session classifications** for fail-closed statuses (`m3-3-hv-h4-charge-throughput-fingerprint.v1.ts`).

**Architecture target:** **`FULL_A2_REPORT_REPRODUCIBILITY_TARGET = YES`**

**Classification:** **`ARCHITECTURE_TARGET_NOT_YET_IMPLEMENTATION_PROOF`** — R0/R0.3 do not prove parity.

Full parity requires reconstructed effective source-session set preserving:

- `loadedCount`, `hardLimit`, `hardLimitReached`, `sourceTruncated`
- canonical `startAt` / `id` ordering after collapse
- session classifications, excluded counts
- overlap / duplicate provider / NO_TRUSTED_SESSIONS / SOURCE_CONFLICT
- segment `sourceFingerprint`, lifecycle segmentation under GT-as-of

**`A3_3_EQUIVALENCE_TEST_REQUIRED = YES`** — live A2 vs durable loader on **MODE_A (`A2_V1_PARITY`)**.

**Required fixture corpus (minimum):**

| ID | Scenario |
|----|----------|
| **A** | `startAt <= evaluationAt`, **`createdAt > evaluationAt`** → in source population; **`INELIGIBLE_NOT_KNOWABLE_AT_EVALUATION`** |
| **B** | `startAt <= evaluationAt`, **`updatedAt > evaluationAt`** → same |
| **C** | Both A and B must preserve population presence + classification (not dropped at load) |
| **D** | Near-hard-limit: knowability-ineligible sessions occupy slots in the **5000 canonical-session** source population and can affect `sourceTruncated` |

Prove parity for: `loadedCount`, `hardLimitReached`, `sourceTruncated`, `sessionClassifications`, `excludedCounts`, `compositionStatus`, `sourceFingerprint`.

**`A3_3_LATE_CREATED_PARITY_TEST_REQUIRED = YES`**

**`A3_3_LATE_UPDATED_PARITY_TEST_REQUIRED = YES`**

**`A3_3_HARD_LIMIT_PARITY_TEST_REQUIRED = YES`**

**`FULL_A2_PARITY_PROVEN_IN_R0 = NO`**

**`ELIGIBLE_ONLY_LEDGER_SUFFICIENT = NO`**

---

## 13. Option verdicts (R0)

| Option | Verdict |
|--------|---------|
| **PER_LIFECYCLE_TOTAL** | **REJECT** |
| **TIME_BUCKET_ONLY** | **REJECT_FOR_EXACT_A2** |
| **SESSION_SOURCE_EVIDENCE** | **REQUIRED CORE** |
| **REVISIONED_SOURCE_EVIDENCE** | **RECOMMENDED** (required for true historical knowledge-as-of; optional count=1 for TARGET_1) |
| **HYBRID** | **RECOMMENDED** |

---

## 14. Derived lifecycle total (optional future)

Optional materialized lifecycle totals:

**Classification:** **`DERIVED_REBUILDABLE` / `MATERIALIZED_CACHE`**

**Never:** `SOURCE_EVIDENCE`.

Rebuild from: durable source revisions + GT-as-of + H4 composition contract.

---

## 15. Architectural decision

**`MATERIALIZATION_DECISION = REVISIONED_CHARGE_SESSION_EVIDENCE_LEDGER_PLUS_DERIVED_LIFECYCLE_CACHE`**

**`RECOMMENDED_ARCHITECTURE = REVISIONED_CHARGE_SESSION_EVIDENCE_LEDGER_PLUS_DERIVED_LIFECYCLE_CACHE`**

| Layer | Class |
|-------|--------|
| Append-only H4-relevant `HvChargeSession` evidence revisions | **SOURCE_EVIDENCE** (+ **AUDIT_REVISION** rows) |
| Lifecycle throughput totals / caches | **DERIVED_REBUILDABLE** |
| `BatteryGroundTruthEvent` replacement | Existing **GT authority** (unchanged) |

---

## 16. Proposed slices

| Slice | Scope |
|-------|--------|
| **A3.1** | **IMPLEMENTED (schema + pure contract + A3.1.2 mirror policy)** — evidence revision + ACK tables, fingerprint/mirror helpers, postgres schema tests |
| **A3.2** | **IMPLEMENTED (writer, no automatic runtime)** — idempotent append-only revision + revision-scoped ACK writer; concurrency-safe verify; **flags OFF** |
| **A3.3** | **IMPLEMENTED** — MODE_A / A2_V1_PARITY durable loader; full postgres parity corpus (PR #1887) |
| **A3.4** | **IMPLEMENTED** — revision-scoped retention ACK gate on `prune_hv_charge_sessions` (race-safe `FOR UPDATE` per row) |
| **A3.5** | **IMPLEMENTED** — leader-guarded bounded current-state reconciliation (`BATTERY_HV_H4_A3_RECONCILIATION_ENABLED` default **false**); Redis fleet cursor; reuses A3.2 writer only |
| **A3.6** | **DEFERRED (R0 2026-10-06/07)** — optional derived lifecycle cache **not justified now**; see `M3_3_HV_H4_A3_6_DERIVED_LIFECYCLE_CACHE_NEED_AUDIT_2026-10-06.md` — **next: `A3.3-O1_MODE_A_EFFECTIVE_REVISION_QUERY_OPTIMIZATION`** |
| **A3.3-O1** | **ARCHITECTURE COMPLETE (2026-10-07)** — MODE_A SQL optimization audit + semantics freeze tests + test-only SQL prototype; see `M3_3_HV_H4_A3_3_O1_MODE_A_EFFECTIVE_REVISION_QUERY_OPTIMIZATION_2026-10-07.md` — **decision: NEEDS_INTEGRITY_ATTESTATION_BEFORE_MEANINGFUL_OPTIMIZATION**; production loader unchanged |
| **A3.3-O2** | **ARCHITECTURE COMPLETE (2026-10-07)** — historical integrity attestation design + mutability audit + pure validity model; see `M3_3_HV_H4_A3_3_O2_HISTORY_INTEGRITY_ATTESTATION_ARCHITECTURE_2026-10-07.md` — **decision: ATTESTATION_ARCHITECTURE_FEASIBLE** (invalidation trigger + full-verify fallback); **no migration / no loader change** |

**`RECOMMENDED_A3_1_SLICE = A3.1 H4 charge session evidence revision persistence contract + schema (no runtime, no prune hook)`**

---

## 17. Non-goals

No FEC, degradation model, customer publication, automatic runtime, provider calls, or retention behavior changes in R0/R0.1.

---

## 18. Open questions (R0.2 refined)

| ID | Topic |
|----|--------|
| **OQ-A3-1** | Effective source-session reconstruction + **full A2 5000-load / sourceTruncated parity** after revision collapse |
| **OQ-A3-2** | Revision **ordering**, tie-break authority, and capture granularity vs `mergeHvChargeSessionUpdate` |
| **OQ-A3-3** | **PARTIALLY RESOLVED (A3.5)** — prospective current-state reconciliation when explicitly enabled; no fabricated historical revisions; no production sweep by default |
| **OQ-A3-4** | **RESOLVED (A3.4)** — `HvCapacityObservation` reference guard runs before destructive prune; exact current fingerprint revision + ACK is an additional mandatory gate (`evaluateCurrentHvChargeSessionPruneDurabilityV1` / `deleteHvChargeSessionIfDurablyAcknowledgedV1`) |
| **OQ-A3-5** | **`sourceHvChargeSessionId` stability** across prune + re-ingestion vs durable A1 `id ASC` ordering authority |

---

## 19. Evidence index

- `backend/src/config/battery-v2-retention.config.ts`
- `backend/src/modules/vehicle-intelligence/battery-health/retention/battery-v2-retention.service.ts`
- `backend/src/modules/vehicle-intelligence/battery-health/retention/battery-v2-retention-aggregate.service.ts`
- `docs/architecture/battery-v2-retention.md`
- `backend/prisma/schema.prisma` — `HvChargeSession`, `BatteryRetentionAggregate`
- `backend/src/modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.merge.ts`
- `backend/src/modules/vehicle-intelligence/battery-health/hv-h4/m3-3-hv-h4-*`
- `architecture/battery-v2/research/M3_3D_D3_MATERIALIZATION_PERSISTENCE_ARCHITECTURE_2026-09-24.md`
