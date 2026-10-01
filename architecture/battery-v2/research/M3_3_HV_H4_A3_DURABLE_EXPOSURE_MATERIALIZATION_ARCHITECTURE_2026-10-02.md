# M3.3-HV-H4-A3-R0 — Durable bounded charge throughput materialization architecture audit

**Date:** 2026-10-02  
**Mode:** Architecture / research only (no schema, migrations, runtime, retention behavior changes)  
**Main anchor (A2 complete):** `9bd4a142b1d931cc135953f11b8a2ca6fff8effe` (PR #1869 merge)  
**Audit branch baseline:** `ffe5f415447b23b6dbbed4ac05c14ae9de6d2f5a` (main +1 unrelated VO commit)  
**Normative A2 contract:** `M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1` — read-only composition from eligible native DIMO `HvChargeSession.energyAddedKwh` per HV lifecycle segment with fail-closed overlap, duplicate `metadata.providerSegmentId`, knowledge-as-of, Neumaier sum, SHA-256 segment fingerprints.

---

## 1. Executive summary

After `HvChargeSession` rows are pruned (~1095d default by `startAt`), **today’s repository cannot reconstruct A2 bounded observed charge throughput** with the same scientific guarantees. Existing `BatteryRetentionAggregate` rollups target **battery measurement sessions**, not HV charge sessions, and carry **no charge-throughput scientific fields**.

**Recommended architecture (R0):** **`HYBRID_CONTRIBUTION_PLUS_DERIVED_TOTAL`** where:

1. **SOURCE_EVIDENCE:** append-only **immutable HV charge throughput contribution** records (one scientific identity per `(vehicleId, segmentFingerprint)` with optional **append-only revisions** when the live `HvChargeSession` mutates before prune-ACK).
2. **DERIVED_REBUILDABLE:** lifecycle-segment totals (and optional read caches) computed from contributions + **current** replacement GT-as-of — **never** stored as immutable physical truth.
3. **Future retention contract:** **`DURABLE_H4_CONTRIBUTION_ACK_REQUIRED_BEFORE_HV_CHARGE_SESSION_PRUNE`** (design only in R0).

---

## 2. Current retention reality (code audit)

### 2.1 Configuration

| Setting | Source | Default |
|---------|--------|---------|
| `RETENTION_HV_CHARGE_SESSIONS_DAYS` | `backend/src/config/battery-v2-retention.config.ts` | **1095** |
| Master switch | `BATTERY_V2_RETENTION_ENABLED` | **false** |
| Destructive deletes | `BATTERY_V2_RETENTION_DRY_RUN` | **true** (counts only until explicitly disabled) |

**`HV_CHARGE_SESSION_DEFAULT_RETENTION_DAYS=1095`**

### 2.2 Can `HvChargeSession` be deleted today?

**Yes**, when Battery V2 retention runs with enabled + dry-run off:

- Phase: `prune_hv_charge_sessions` (`battery-v2-retention.service.ts`)
- Cutoff: `startAt < now - hvChargeSessions days`
- **Guards:** skip if any `HvCapacityObservation.chargeSessionId` references the session
- **No guard** for H4 durable contribution, materialization ACK, or A2 fingerprint completeness

**`HV_CHARGE_SESSION_PRUNABLE=YES`** (under enabled retention; default deployment remains dry-run / disabled)

**`CURRENT_PRUNE_REQUIRES_H4_DURABLE_ACK=NO`**

### 2.3 `phasePrepareAggregates` and charge throughput

`prepare_aggregates` only processes **`batteryMeasurement`** rows tied to **`batteryMeasurementSession`**, building:

- `BatteryRetentionAggregateBucket.SESSION` — measurement counts, quality/type histograms
- `BatteryRetentionAggregateBucket.DAILY` — per UTC day measurement rollups

It does **not** read `HvChargeSession`, `energyAddedKwh`, DIMO metadata, or HV-H4 composition fields.

### 2.4 `BatteryRetentionAggregate` vs H4 needs

| Field / concept | In aggregate summary JSON? |
|-----------------|----------------------------|
| `HvChargeSession.id` | **No** (uses `batteryMeasurementSession.id` only) |
| `segmentFingerprint` | **No** |
| `metadata.providerSegmentId` | **No** |
| `startAt` / `endAt` (charge episode) | **No** (measurement session `startedAt`/`endedAt` only) |
| `energyAddedKwh` | **No** |
| `addedEnergyProvenance` | **No** |
| `source` (DIMO vs fallback) | **No** |
| `qualityStatus` | **Partial** (measurement quality counts, not session QUALIFIED gate) |
| `createdAt` / `receivedAt` / `updatedAt` | **No** |

Authority flag on main: `EXISTING_RETENTION_AGGREGATES_PRESERVE_CHARGE_THROUGHPUT = false` (`m3-3-hv-h4.constants.ts`).

**Audit conclusions:**

- **`EXISTING_RETENTION_AGGREGATES_PRESERVE_ENERGY_ADDED_KWH=NO`**
- **`EXISTING_RETENTION_AGGREGATES_PRESERVE_SESSION_IDENTITY=NO`**
- **`EXISTING_RETENTION_AGGREGATES_SUITABLE_FOR_H4_DURABILITY=NO`**

---

## 3. Durability requirement (what must survive prune)

Durable H4 evidence must support **full A2 recomposition** (not a single cumulative kWh):

| Capability | Why |
|------------|-----|
| A2 charge-only semantic | `PROVIDER_REPORTED_CHARGING_ADDED_ENERGY_DELTA` on native DIMO only |
| Late replacement GT resegmentation | Physical intervals + GT-as-of re-run |
| Source provenance | `SEGMENT_EXTREMA`, QUALIFIED, native source |
| Duplicate provider identity | `metadata.providerSegmentId` |
| Overlap detection | `startAt`/`endAt` pairs |
| Knowledge-as-of | Envelope timestamps known ≤ evaluationAt |
| Segment fingerprinting | Same canonical payload rules as A2 |
| Tenant isolation | `organizationId` + `vehicleId` |
| Retention-safe recompute | Rebuild segment sums after prune |

---

## 4. Primary design test — late replacement GT

**Scenario:**

| Session | Interval | Energy |
|---------|----------|--------|
| A | 2026-01-01 10:00–11:00 | 20 kWh |
| B | 2026-01-10 10:00–11:00 | 25 kWh |

**GT recorded later:** `BATTERY_REPLACEMENT` `effectiveAt=2026-01-05`, `createdAt=2027-02-01`.

| Evaluation | Expected segments |
|------------|-------------------|
| Before GT knowable | One segment: A+B = 45 kWh |
| After GT knowable @ same wall clock | HV_SEGMENT_0=A (20), HV_SEGMENT_1=B (25) |

**Requirement:** durable store must keep **physical episode facts** (interval + energy + identities), **not** a frozen lifecycle segment assignment.

**`LATE_GT_RESEGMENTATION_REQUIRED=YES`**

Any architecture storing only `lifecycleSegmentId → totalKwh` without per-episode intervals **fails** this test unless totals are explicitly **MATERIALIZED_CACHE** rebuildable from preserved episodes.

---

## 5. Option evaluation

### OPTION_A — Per-lifecycle cumulative total only

**Verdict:** **`REJECT`**

- Lifecycle segment is **derived** from replacement GT + session `startAt`.
- Late GT makes prior segment labels **wrong** as source identity.
- Cannot detect overlap or duplicate provider ID without episode list.
- No audit trail for SOURCE_CONFLICT / SOURCE_TRUNCATED semantics.

### OPTION_B — Daily / time-bucketed energy

**Verdict:** **`REJECT_FOR_EXACT_A2`** (may serve **MATERIALIZED_CACHE** only)

- Replacement **intra-day** splits bucket incorrectly.
- Session **crossing midnight** splits energy across buckets incorrectly vs A2 session grain.
- Overlap and duplicate provider checks **across buckets** require rehydrating sessions anyway.
- Minimum bucket for exact A2 is **per charge session episode**, not calendar day.

### OPTION_C — Immutable per-session contribution ledger

**Verdict:** **`ACCEPT_AS_CORE_SOURCE_EVIDENCE`** with capture/finality rules (§8)

Preserves: interval, energy, fingerprints, provider IDs, provenance, supersession flags, tenant scope.

**Gap vs A2 knowledge-as-of:** live row mutability (`mergeHvChargeSessionUpdate`) means a **single snapshot at prune** may be too late for historical evaluations that occurred **before** final field values — see Option D.

### OPTION_D — Append-only contribution revisions

**Verdict:** **`REQUIRED_MINIMUM_FOR_HISTORICAL_KNOWLEDGE`** while raw row still exists; **frozen revision** becomes SOURCE_EVIDENCE after prune ACK

When `HvChargeSession.updatedAt` advances after a prior capture, append revision with:

- monotonic `revisionSeq` or content fingerprint
- `sourceUpdatedAt` / reconcile metadata
- full scientific payload snapshot

After raw delete, **latest ACKed revision** (or explicit revision pinned by evaluation policy) is the durable authority.

### OPTION_E — Hybrid

**Verdict:** **`RECOMMENDED`**

- **SOURCE_EVIDENCE:** Option C + D revision stream per `(vehicleId, segmentFingerprint)`
- **DERIVED_REBUILDABLE:** lifecycle segment throughput reports recomputed via existing A2 builder logic over durable rows + GT
- **MATERIALIZED_CACHE (optional):** segment totals for read efficiency — must be rebuildable and **not** used for scientific audit identity

---

## 6. Source-of-truth classification (target state)

| Artifact | Class |
|----------|--------|
| Durable contribution scientific payload | **SOURCE_EVIDENCE** |
| Contribution revision rows | **AUDIT_REVISION** (also SOURCE_EVIDENCE when pinned for evaluation) |
| A2 report / segment throughput at `evaluationAt` | **DERIVED_REBUILDABLE** |
| Lifecycle segment totals table (if added) | **MATERIALIZED_CACHE** |
| Customer-facing exposure publication | **CUSTOMER_PUBLICATION** (out of A3 scope) |
| `BatteryGroundTruthEvent` replacement boundaries | **Separate GT authority** (already on main) |

**Ground rule:** physical charging episode ≠ lifecycle assignment ≠ accumulated exposure.

---

## 7. Knowledge-as-of after raw delete

A2 today: `sessionKnowledgeAsOfPolicy=CURRENT_ROW_MUST_NOT_POSTDATE_EVALUATION_AT` because **mutable** `HvChargeSession` cannot reconstruct historical row state.

| Approach | After prune | Historical evaluation while raw existed |
|----------|-------------|----------------------------------------|
| A) Final immutable contribution only | **Supported** if envelope timestamps frozen at capture | **Weak** if session mutated after evaluation but before capture |
| B) Revision history | **Supported** — select max revision with all envelope fields ≤ evaluationAt | **Supported** |

**R0 recommendation:** **B minimal** — append revision on scientifically meaningful merge (`mergeHvChargeSessionUpdate` changeKind ≠ `no_op`) until prune ACK; evaluation uses same rules as A2 on **revision payload**, not live row.

**`HISTORICAL_KNOWLEDGE_ASOF_AFTER_RAW_DELETE_SUPPORTED=YES`** (with revision or frozen capture envelope)

**`REVISION_HISTORY_REQUIRED=YES_FOR_EQUIVALENCE_TO_A2`** (final-only capture is strictly weaker for mid-life historical reports)

---

## 8. Session finality / capture eligibility

Repository evidence (`hv-charge-session.merge.ts`):

- Start anchors **immutable**; completed sessions accept **better provider data** (energy, end times, metadata, provenance).
- Ongoing sessions (`isOngoing` / missing `endAt`) are **ineligible** in A2 already.
- Fallback supersession via `metadata.supersededBySegmentFingerprint` is A2 exclusion.
- Native/fallback convergence can **update** rows in place.

**Do not use:** `endAt != null ⇒ immediately immutable`.

**Recommended capture model (future):**

| State | Policy |
|-------|--------|
| `TERMINAL_CAPTURE_CANDIDATE` | Completed native session passing A2 eligibility on live row |
| `REVISION_ON_MERGE` | Any merge changing scientific fields → new contribution revision |
| `PRUNE_ACK` | Retention may delete raw session only after durable ACK for `(vehicleId, segmentFingerprint)` |

**`TERMINAL_ONLY` alone is insufficient** — must be **`REVISIONED`** until ACK.

---

## 9. A2 scientific firewall (materialization constraints)

Durable contributions **must** materialize only:

- **Energy:** `energyAddedKwh` (not SOC/start/end delta, not `VehicleEnergyEvent.energyDeltaKwh`)
- **Semantic:** `PROVIDER_REPORTED_CHARGING_ADDED_ENERGY_DELTA`
- **Direction:** `CHARGE_ONLY`
- **Source:** eligible native DIMO recharge (`HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE`)
- **Provenance:** `addedEnergyProvenance = SEGMENT_EXTREMA`
- **Quality:** QUALIFIED (as A2)

Never substitute ClickHouse, trip energy, or fallback energy as native-equivalent throughput.

---

## 10. Retention integration (future contract)

Proposed invariant ( **not implemented in R0** ):

**`DURABLE_H4_CONTRIBUTION_ACK_REQUIRED_BEFORE_HV_CHARGE_SESSION_PRUNE`**

| Concern | Design direction |
|---------|------------------|
| Ordering | Materialize (or bump revision) **before** `phasePruneHvChargeSessions` selects row |
| Fail-closed delete | Skip prune when ACK missing; metric + log |
| Idempotency | Unique key on scientific identity; ON CONFLICT verify fingerprint (D3 precedent) |
| Races | Transaction: ACK write + prune in separate phases; ACK must commit first |
| Multi-replica | DB uniqueness authority + reconciliation sweep (D3 reconciliation pattern) |
| Partial failure | Row remains; prune skipped; retry materialization job |

**`RETENTION_DELETE_ACK_REQUIRED=YES`** (future)  
**`RETENTION_MATERIALIZATION_ORDERING=MATERIALIZE_THEN_ACK_THEN_PRUNE`**

---

## 11. Concurrency / idempotency precedents (D3)

Reuse **patterns**, not payloads, from `longitudinal-profile-materialization.repository.ts`:

| Pattern | Apply to H4? |
|---------|--------------|
| Canonical UTF-8 + SHA-256 fingerprint verify on insert | **YES** |
| `ON CONFLICT DO NOTHING` + fingerprint collision errors | **YES** |
| Append-only revisions | **YES** (contributions, not profiles) |
| Reconciliation scheduler + fleet cursor | **YES** (flag default OFF) |
| Scientific identity separate from DB UUID | **YES** — use `segmentFingerprint` + contract version |

Do **not** copy D3 profile JSON — H4 source evidence is **charge session scientific facts**, not assembled longitudinal profiles.

**`IDEMPOTENCY_AUTHORITY=DATABASE_UNIQUE_SCIENTIFIC_IDENTITY`**  
**`MULTI_REPLICA_CONCURRENCY_STRATEGY=DB_UNIQUENESS_PLUS_RECONCILIATION_SWEEP`**

---

## 12. Canonical identity (distinct fields)

| Role | Field |
|------|--------|
| **CANONICAL_SESSION_IDENTITY** | `segmentFingerprint` (unique per vehicle in DB) |
| **PROVIDER_SESSION_IDENTITY** | `metadata.providerSegmentId` (nullable; duplicate detection) |
| **DATABASE_ROW_ID** | `HvChargeSession.id` (provenance pointer, not scientific primary key) |

**Unique key (proposed):** `(organizationId, vehicleId, segmentFingerprint, contractVersion)` for contribution HEAD; revisions keyed by `(contributionId, revisionFingerprint)` or monotonic seq.

**Do not** use `lifecycleSegmentId` in immutable contribution identity.

**`LIFECYCLE_SEGMENT_ID_STORED_AS_IMMUTABLE_SOURCE_IDENTITY=NO`**  
**`PHYSICAL_SESSION_INTERVAL_PRESERVED=YES`** (required)  
**`PROVIDER_SEGMENT_ID_PRESERVED=YES`**  
**`CANONICAL_SEGMENT_FINGERPRINT_PRESERVED=YES`**

---

## 13. Fingerprint authority (contribution-level)

Proposed **`H4_CONTRIBUTION_EVIDENCE_FINGERPRINT_V1`** (SHA-256 over canonical ordered payload):

Include: `contractVersion`, `organizationId`, `vehicleId`, `segmentFingerprint`, `providerSegmentId`, `source`, `startAt`, `endAt`, `energyAddedKwh`, `addedEnergyProvenance`, `qualityStatus`, `providerObservedAt`, supersession markers, **`sourceCreatedAt`**, **`sourceReceivedAt`**, **`sourceUpdatedAt`** (envelope at capture).

Exclude from **identity** (provenance-only): materialization `capturedAt`, worker idempotency keys.

Segment **composition** fingerprint remains A2 builder authority over **sets** of contributions + GT + load metadata.

**`FINGERPRINT_ALGORITHM=SHA256_CANONICAL_ORDERED_JSON_V1`**

---

## 14. Replacement boundary intersection

Store **physical** `startAt`/`endAt` only. Do **not** persist lifecycle segment membership.

At compose time (A2 logic): crossing a **known** replacement boundary at `evaluationAt` → exclude / fail-closed same as today.

When **new** GT appears: previously included episode may become `INELIGIBLE_REPLACEMENT_INTERSECTION` — durable row **unchanged**, derived composition **changes**.

---

## 15. Post-delete capability matrix

Assuming **Option E** with revision ACK at prune:

| Check | After raw delete |
|-------|------------------|
| Positive finite energy | **PRESERVED** |
| Native source | **PRESERVED** |
| Qualified quality | **PRESERVED** |
| SEGMENT_EXTREMA provenance | **PRESERVED** |
| Superseded status | **PRESERVED** |
| Overlap detection | **PRESERVED** (intervals) |
| Duplicate provider id | **PRESERVED** |
| Replacement crossing | **PRESERVED** (interval + GT re-run) |
| Knowledge-as-of | **PRESERVED** via revision envelope timestamps |
| Tenant ownership | **PRESERVED** |
| Source / segment fingerprint | **PRESERVED** |

Without durable contributions: **NOT_PRESERVED** for all rows.

**`DUPLICATE_PROVIDER_DETECTION_AFTER_RAW_DELETE=YES`** (hybrid)  
**`OVERLAP_DETECTION_AFTER_RAW_DELETE=YES`**  
**`REPLACEMENT_CROSSING_DETECTION_AFTER_RAW_DELETE=YES`**  
**`ENERGY_SEMANTIC_FIREWALL_AFTER_RAW_DELETE=YES`**

---

## 16. Privacy / deletion

`HvChargeSession` uses `onDelete: Cascade` from `Organization` and `Vehicle`.

Future contribution tables **must** cascade on org/vehicle delete — no orphaned throughput ledger.

Design FK paths explicitly in A3.1 — **no implementation in R0**.

---

## 17. Storage scale (asymptotic)

| Strategy | Growth |
|----------|--------|
| Per charge session contribution | **O(sessions)** — dominant term |
| Per merge revision | **O(updates)** per session until ACK |
| Daily buckets | **O(days)** — insufficient alone |
| Per lifecycle total only | **O(segments × vehicles)** — insufficient scientifically |

Fleet magnitude **not estimated** (no invented production counts).

---

## 18. Architectural decision

**`MATERIALIZATION_DECISION=HYBRID_CONTRIBUTION_PLUS_DERIVED_TOTAL`**

**`RECOMMENDED_ARCHITECTURE=HYBRID_CONTRIBUTION_PLUS_DERIVED_TOTAL`**

**`RECOMMENDED_SOURCE_EVIDENCE_GRANULARITY=ONE_PHYSICAL_CHARGE_EPISODE_PER_SEGMENT_FINGERPRINT_WITH_OPTIONAL_REVISIONS`**

Justification: only grain matching A2 session composition supports overlap, provider duplicate, replacement resegmentation, and energy firewall; lifecycle totals alone fail late-GT test; existing retention aggregates do not help.

---

## 19. Proposed implementation slices (future — not R0)

| Slice | Scope |
|-------|--------|
| **A3.1** | Persistence contract + Prisma schema + validators (no runtime) |
| **A3.2** | Idempotent contribution + revision writer (flag OFF) |
| **A3.3** | Read-path equivalence: durable loader → same A2 builder |
| **A3.4** | Retention prune ACK gate + metrics |
| **A3.5** | Controlled reconciliation scheduler (leader-guarded) |
| **A3.6** | Optional derived lifecycle cache (rebuildable) |

**`RECOMMENDED_A3_1_SLICE=A3.1 persistence contract + schema (flag OFF, no prune hook)`**

---

## 20. Non-goals (confirmed out of scope)

FEC, degradation normalization, SOH, health scores, odometer normalization, thermal/SOC integration, fast-charge classifiers, customer publication, automatic runtime activation — **unchanged from A2**.

---

## 21. Open questions / blockers

| ID | Question |
|----|----------|
| OQ-A3-1 | Exact revision trigger set: all merges vs only scientific field deltas? |
| OQ-A3-2 | Whether historical reports pin **latest revision ≤ evaluationAt** or **first capture ≤ evaluationAt** when multiple exist |
| OQ-A3-3 | Backfill strategy for sessions already older than retention cutoff before A3 goes live |
| OQ-A3-4 | Interaction with `hvCapacityObservation` FK blocking prune — materialization must not depend on capacity shadow rows |

**`BLOCKERS=NONE_FOR_R0_RESEARCH`** — engineering blocked on A3.1+ approval.

---

## 22. Evidence references

- `backend/src/config/battery-v2-retention.config.ts`
- `backend/src/modules/vehicle-intelligence/battery-health/retention/battery-v2-retention.service.ts`
- `backend/src/modules/vehicle-intelligence/battery-health/retention/battery-v2-retention-aggregate.service.ts`
- `docs/architecture/battery-v2-retention.md`
- `backend/prisma/schema.prisma` — `HvChargeSession`, `BatteryRetentionAggregate`
- `backend/src/modules/vehicle-intelligence/battery-health/hv-h4/*` — A2 composition
- `architecture/battery-v2/research/M3_3D_D3_MATERIALIZATION_PERSISTENCE_ARCHITECTURE_2026-09-24.md`
- `backend/src/modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.merge.ts`
