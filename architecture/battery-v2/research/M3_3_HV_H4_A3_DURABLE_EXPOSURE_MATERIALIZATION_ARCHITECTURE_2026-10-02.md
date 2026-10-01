# M3.3-HV-H4-A3-R0 — Durable bounded charge throughput materialization architecture

**Date:** 2026-10-02  
**Status:** **ARCHITECTURE AUTHORITY (RESEARCH)** — no schema, migrations, runtime, or retention behavior on main  
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
| Prune phase | `battery-v2-retention.service.ts` → `phasePruneHvChargeSessions` | `startAt < cutoff` |
| Master switch | `BATTERY_V2_RETENTION_ENABLED` | default **false** |
| Destructive delete | `BATTERY_V2_RETENTION_DRY_RUN` | default **true** |
| Prune guard | Same phase | Skip if `hvCapacityObservation.chargeSessionId` references session |
| H4 durable ACK | Code search | **None** |

**Conclusion:** Sessions **are prunable** when retention is enabled, dry-run off, and capacity-observation guard passes. **No** `DURABLE_H4_*` acknowledgement exists today.

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

## 3. Identity and terminology (corrected)

| Concept | Authority field | Notes |
|---------|-----------------|-------|
| **CANONICAL_SOURCE_SESSION_IDENTITY** | `segmentFingerprint` | Unique per vehicle (`@@unique([vehicleId, segmentFingerprint])`) |
| **PROVIDER_SESSION_IDENTITY** | `metadata.providerSegmentId` | Nullable; duplicate detection in A2 |
| **DATABASE_ROW_ID** | `HvChargeSession.id` | Provenance pointer only |
| **PHYSICAL_CHARGE_EPISODE_IDENTITY_PROVEN** | **NO** | A2 fail-closes on **overlapping** eligible native sessions → fingerprints are not proven mutually exclusive physical episodes |

**Do not use:** `ONE_PHYSICAL_CHARGE_EPISODE_PER_SEGMENT_FINGERPRINT`.

**Use:** **`ONE_CANONICAL_CHARGE_SESSION_SOURCE_IDENTITY_PER_SEGMENT_FINGERPRINT`**.

**`lifecycleSegmentId` is derived** (H2 replacement GT + session `startAt`) — **never** immutable source identity.

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
| `REVISION_HISTORY_REQUIRED_FOR_CURRENT_A2_FAIL_CLOSED_EQUIVALENCE` | **NO** — single final revision with envelope timestamps suffices |
| `REVISION_HISTORY_REQUIRED_FOR_TRUE_HISTORICAL_KNOWLEDGE_ASOF` | **YES** |
| `RECOMMENDED_A3_ARCHITECTURE_USES_REVISION_HISTORY` | **YES** — auditability, safe mutable capture, future true-as-of |

Live A2 **does not** reconstruct historical row versions — only current-row envelope vs `evaluationAt`.

---

## 7. Source revision model (conceptual, no schema)

- **SOURCE_SESSION_IDENTITY:** `(organizationId, vehicleId, segmentFingerprint, h4SourceEvidenceContractVersion)`
- **SOURCE_REVISION_IDENTITY:** `sourceRevisionFingerprint` = SHA-256 over canonical H4-relevant source-state projection

Append a **new immutable revision** when any H4-relevant fact changes, including:

`startAt`, `endAt`, `isOngoing`, `source`, `energyAddedKwh`, `providerObservedAt`, `providerSegmentId`, `addedEnergyProvenance`, `qualityStatus`, supersession fields, `startedBeforeRange`, and **knowledge envelope** `sourceCreatedAt` / `sourceReceivedAt` / `sourceUpdatedAt`.

**Knowledge timestamps and revision identity:** If a timestamp change alters A2 knowability at some `evaluationAt`, it **must** change `sourceRevisionFingerprint` (included in scientific projection — **not** worker metadata).

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

**Architecture target:** **`FULL_A2_REPORT_REPRODUCIBILITY = YES`**

**`ELIGIBLE_ONLY_LEDGER_SUFFICIENT = NO`** — must durable-capture observed sessions needed for NO_TRUSTED_SESSIONS, SOURCE_CONFLICT, overlap, duplicate provider ID, and exclusion diagnostics.

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

## 16. Proposed slices (not started)

| Slice | Scope |
|-------|--------|
| **A3.1** | Persistence **contract** + schema for evidence revision ledger + ACK contract (flags OFF) |
| **A3.2** | Idempotent revision writer |
| **A3.3** | Loader equivalence: durable revisions → existing A2 builder |
| **A3.4** | Revision-scoped prune ACK + retention gate |
| **A3.5** | Reconciliation scheduler (leader-guarded, default OFF) |
| **A3.6** | Optional derived lifecycle cache |

**`RECOMMENDED_A3_1_SLICE = A3.1 H4 charge session evidence revision persistence contract + schema (no runtime, no prune hook)`**

---

## 17. Non-goals

No FEC, degradation model, customer publication, automatic runtime, provider calls, or retention behavior changes in R0/R0.1.

---

## 18. Open questions

| ID | Topic |
|----|--------|
| OQ-A3-1 | Minimum observed-session set for FULL_A2 parity (all pruned candidates vs only sessions loaded under A1 pagination window) |
| OQ-A3-2 | Revision trigger: mirror `mergeHvChargeSessionUpdate` changeKind vs field-level diff |
| OQ-A3-3 | Backfill before first ACK when sessions already past retention cutoff |
| OQ-A3-4 | Ordering vs `hvCapacityObservation` FK blocking prune |

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
