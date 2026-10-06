# M3.3-HV-H4-A3.6-R0 — Derived lifecycle cache need + architecture boundary audit

**Date:** 2026-10-06  
**Status:** **ARCHITECTURE AUDIT (R0)** — need + boundary only; **no cache table, no runtime writer, no migration**  
**Main anchor:** `377e5fa20f6e685ba1deeeb9c5fedf4b10baf228` (A3.1–A3.5 complete on main)  
**Normative upstream:** `M3_3_HV_H4_A3_DURABLE_EXPOSURE_MATERIALIZATION_ARCHITECTURE_2026-10-02.md`

---

## 1. Executive decision

| Field | Result |
|-------|--------|
| **A3_6_DECISION** | **`OPTIMIZE_DURABLE_LOADER_FIRST`** |
| **A3_6_STATUS** | **`A3.6 DEFERRED`** (derived lifecycle **cache** persistence) |
| **IMPLEMENTATION_RECOMMENDED_NOW** | **NO** for A3.6 cache table; **YES** for a future **A3.3.x durable loader query optimization** slice (not this PR) |
| **CACHE_IS_REQUIRED** | **NO** at current runtime posture |

**Rationale (evidence-backed):**

1. **No automatic H4 report consumer** — `H4_AUTOMATIC_RUNTIME_REACHABLE=false`, `A3_3_DURABLE_LOADER_RUNTIME_REACHABLE=false`; A3.5 only materializes source evidence (default OFF).
2. **Durable read path loads all revision rows** before MODE_A collapse; **5000 canonical-session cap applies after collapse**, so revision row count can exceed 5000 (amplification risk **YES**).
3. **Indexes exist** for tenant + contract filter, but the loader still fetches **full revision history** + **`ACK IN (revisionIds)`** + per-row JSON verify — CPU/memory scale with revision rows, not only collapsed sessions.
4. **A simpler fix** (DB-side effective-revision selection / ACK join) can preserve MODE_A ordering + ambiguity fail-closed **without** a derived cache or invalidation graph.
5. **Cache** would require **evaluationAt-sensitive** identity, GT-boundary invalidation, and high cardinality if arbitrary historical evaluation snapshots were cached — **not justified** before loader optimization.

---

## 2. Current H4 read path — exact cost inventory

### 2.1 Entry points

| Path | Entry | Charge-session source |
|------|--------|------------------------|
| **Live A2** | `runM3_3HvH4ChargeThroughputReport` → `loadM3_3HvH4DataV1` | Paginated `HvChargeSession` (`PAGE_SIZE=500`, hard limit **5000**) |
| **Durable MODE_A A2** | `runM3_3HvH4DurableModeAA2ReportBundleV1` → `loadM3_3HvH4DataFromDurableRevisionsModeAV1` | `BatteryHvChargeSessionEvidenceRevision` + ACK + collapse + reconstruct |

Shared downstream (both paths after load): `buildM3_3HvH4CoverageReportV1` → lifecycle segmentation (`m3-3-hv-h4-lifecycle.util.ts`) → per-session A2 classification → `buildM3_3HvH4ChargeThroughputReportV1` → segment `sourceFingerprint`.

### 2.2 Durable charge-session loader (`loadM3_3HvH4DurableModeAChargeSessionsV1`)

1. **`findMany` revisions** — `where: { organizationId, vehicleId, evidenceContractVersion }` — **no `startAt` / population filter at DB layer**.
2. **`findMany` ACKs** — `where: { revisionId: { in: revisionIds } }` — one query; size = revision row count **R**.
3. **Per revision (CPU):** `verifyDurableEvidenceRevisionForModeALoaderV1` (JSON canonical verify + ACK fence).
4. **Collapse (CPU):** group by `segmentFingerprint` → `selectModeAEffectiveRevisionV1` (ordering tuple + ambiguity fail-closed).
5. **Reconstruct (CPU):** JSON → scientific row per effective revision.
6. **Population (CPU):** `applyM3_3HvH4ChargeSessionSourcePopulationV1` — filter `startAt <= evaluationAt`, sort, **slice 5000**, truncation probe semantics via loaded count vs filtered length.

Authority constants:

- `APPLY_HARD_LIMIT_AFTER_EFFECTIVE_REVISION_COLLAPSE = true`
- `REVISION_ROW_COUNT_AFFECTS_A1_SOURCE_TRUNCATION = false`
- `CANONICAL_SOURCE_SESSION_COUNT_AFFECTS_SOURCE_TRUNCATION = true`

### 2.3 Non-charge inputs (`loadM3_3HvH4NonChargeSessionDataV1`)

| Query | Model |
|-------|--------|
| 1 | `batteryGroundTruthEvent.findMany` (+ revocations, supersession includes) |
| 1 | `hvBatteryHealthSnapshot.findMany` (timestamps) |
| 3 | `batteryEvidence.findMany` (SOC, temperature, charging power) |

Live path adds **1** vehicle assert + **1–10** charge-session pages (500/page up to 5000).

### 2.4 Inventory fields (required)

| Field | Value |
|-------|--------|
| **CURRENT_REPORT_QUERY_COUNT** | **Live:** 6 + ceil(chargeSessions/500) (min 6, max **16** at 5000 sessions). **Durable bundle:** **7** fixed (2 charge + 5 non-charge) regardless of revision count |
| **CURRENT_DURABLE_REVISION_QUERY_SHAPE** | `BatteryHvChargeSessionEvidenceRevision.findMany({ organizationId, vehicleId, evidenceContractVersion })` — full history for contract |
| **CURRENT_ACK_QUERY_SHAPE** | `BatteryHvChargeSessionEvidenceAck.findMany({ revisionId: { in: revisionIds } })` |
| **CURRENT_REVISION_COLLAPSE_COMPLEXITY** | **O(R)** group + per-group select; **O(R)** verify + reconstruct |
| **CURRENT_SESSION_CLASSIFICATION_COMPLEXITY** | **O(S)** sessions after population cap **S ≤ 5000**; lifecycle + A2 per session |

---

## 3. Scaling audit — revision amplification

| Question | Answer |
|----------|--------|
| **REVISION_ROW_COUNT_BOUNDED_BY_5000** | **NO** |
| **REVISION_AMPLIFICATION_RISK** | **YES** — **R ≈ canonicalSessions × revisionsPerSession** loaded before collapse; example **5000 × 2 = 10 000** revision rows |
| **ACK_QUERY_SCALING_RISK** | **MODERATE** — single `IN` list length **R**; practical Postgres limits usually above A3 fleet per-vehicle scale today, but **R doubles with reconciliation churn** |
| **Index support** | `@@index([organizationId, vehicleId, segmentFingerprint, evidenceContractVersion])`, `@@index([organizationId, vehicleId, startAt])` — help selective queries but **current loader does not use them** for effective-only fetch |
| **Memory / JSON** | Each revision carries `scientificEvidenceJson`; verify parses/canonicalizes **all R rows** every report |

**In-memory collapse characterization (repository-local, no DB):**

- Harness: `m3-3-hv-h4-a3-6-r0-collapse-scale.spec.ts`
- **5000 canonical × 2 revisions → 10 000 rows collapsed to 5000 effective** in ~**63 ms** (collapse only; excludes DB I/O and verify)

---

## 4. Benchmark harness (repository-local)

| Item | Detail |
|------|--------|
| **Files** | `m3-3-hv-h4-a3-6-r0-benchmark.harness.v1.ts`, `m3-3-hv-h4-a3-6-r0-benchmark.postgres.integration.spec.ts`, `m3-3-hv-h4-a3-6-r0-benchmark.stats.v1.ts` |
| **Activation** | `BATTERY_HV_H4_REPORT_INTEGRATION=1` **and** `M3_3_HV_H4_A3_6_R0_BENCHMARK=1`; optional S6 via `M3_3_HV_H4_A3_6_R0_BENCHMARK_S6=1` |
| **Not registered** in Nest / schedulers / production |
| **CI** | Collapse scale unit test only; **no wall-clock perf gates** |

**Benchmark environment (this audit run):** Cloud agent — **no Docker/Postgres** (`infra:up` unavailable). **Postgres scenario timings NOT_EXECUTED locally.** Re-run on dev/CI postgres for S1–S6 numbers.

---

## 5. Query optimization before cache

| Option | Assessment |
|--------|------------|
| **A. PostgreSQL DISTINCT ON / window** per `segmentFingerprint` with MODE_A ordering | **Promising** — must preserve `(sourceUpdatedAt, capturedAt, createdAt)` + **ambiguity fail-closed** (no fingerprint lex tie-break) |
| **B. Fetch effective revisions only** | Same as A — reduces **R → S** |
| **C. Join ACK in SQL** | **Promising** — inner join on exact ACK fence instead of `IN` + map |
| **D. Bounded canonical-session query before JSON** | **Partial** — population still needs evaluationAt filter; could keyset `startAt` **after** effective selection |
| **E. Indexes** | Present; **loader must use narrower query** to benefit |

| Field | Value |
|-------|--------|
| **QUERY_OPTIMIZATION_CAN_AVOID_CACHE** | **YES** (for per-vehicle report latency at projected scale) |
| **QUERY_OPTIMIZATION_RECOMMENDATION** | **Next slice:** durable loader **effective-revision SQL + ACK join** with parity harness (`runM3_3HvH4LiveDurableModeAParityV1`) — **not** A3.6 cache |

---

## 6. What A3.6 would cache (if ever implemented)

**Unit:** one **derived H4 lifecycle segment** throughput/coverage snapshot (not full report).

| Field | Classification |
|-------|----------------|
| organizationId, vehicleId, lifecycleSegmentId | **CACHE_ENVELOPE** |
| H4 / coverage / exposure contract versions | **SCIENTIFIC_DERIVED** (identity) |
| compositionStatus, boundedObservedChargeThroughputKwh, unit, summationMethod | **SCIENTIFIC_DERIVED** |
| included/excluded/withheld counts + eligibility breakdown | **SCIENTIFIC_DERIVED** |
| coverageClass, segmentEvidenceState, gapSummary | **SCIENTIFIC_DERIVED** |
| first/last included session timestamps | **SCIENTIFIC_DERIVED** |
| segment `sourceFingerprint` (A2 builder) | **SCIENTIFIC_DERIVED** (verification) |
| derivedAt / materializedAt | **CACHE_ENVELOPE** |
| Full nested session lists / raw JSON evidence | **DO_NOT_CACHE** |

---

## 7. Cache identity & evaluationAt

Segment `sourceFingerprint` **already includes** `evaluationAt`, composition status, segment reason codes, included/conflict session identities, classifications, and **chargeSessionSourceLoad truncation flags** (`buildM3_3HvH4SegmentSourceFingerprintV1`).

| Field | Value |
|-------|--------|
| **CACHE_SCIENTIFIC_IDENTITY** | `(organizationId, vehicleId, lifecycleSegmentId, coverageReportVersion, chargeThroughputReportVersion, exposureSourceAuthorityVersion, segmentSourceFingerprint)` |
| **SOURCE_FINGERPRINT_SUFFICIENT_FOR_CACHE_IDENTITY** | **YES** for **one** evaluationAt snapshot **if** all upstream inputs at compute time are reflected in fingerprint inputs |
| **GT_BOUNDARY_CHANGE_INVALIDATION_REQUIRED** | **YES** — replacement / revocation / supersession changes lifecycle segmentation |
| **ARBITRARY_EVALUATION_AT_CACHE_SAFE** | **NO** — unbounded historical `(segment × evaluationAt)` cardinality |
| **RECOMMENDED_CACHE_TIME_SEMANTIC** | **None persisted now**; if ever: **latest evaluationAt only** or **on-demand memoization** with fingerprint key — **not** arbitrary historical cache |
| **CLOSED_SEGMENT_IMMUTABLE** | **NO** — late revisions, GT knowability, revocations can change closed segments |

**Policy if cache were built:** **`NO_CACHE_CURRENTLY`** → future optional **`CACHE_ON_DEMAND_ONLY`** with fingerprint verification.

---

## 8. Invalidation model (scientific vs durability)

| Event | Invalidates derived segment total? |
|-------|-------------------------------------|
| New source evidence revision (scientific change) | **YES** |
| Source revision with no scientific delta | **Maybe** — fingerprint may unchanged; still recompute |
| ACK repair / new ACK same revision | **Durability-only** if scientific payload unchanged — **prove via fingerprint** |
| GT replacement / revocation / supersession | **YES** |
| H4 contract version bump | **YES** |
| Coverage evidence arrival | **YES** (segment evidence state) |
| evaluationAt change | **YES** (explicit in fingerprint) |
| Source truncation / 5000 cap change | **YES** |

---

## 9. Miss / corruption / correctness

| Field | Policy |
|-------|--------|
| **CACHE_REQUIRED_FOR_CORRECTNESS** | **NO** |
| **CACHE_MISS_POLICY** | Recompute from durable A3 source evidence |
| **CACHE_CORRUPTION_POLICY** | Verify fingerprint → ignore row → recompute |
| **CACHE_STALE** | Never publish stale as authority |

---

## 10. Storage cost model (illustrative)

Assume **L = 3** lifecycle segments/vehicle, **P ≈ 2 KB** JSON payload, **C = 1** current row per segment identity (upsert), **not** append-only history.

| Fleet | Rows (V×L×C) | Payload (approx) |
|-------|----------------|------------------|
| 100 vehicles | 300 | ~0.6 MB |
| 1 000 vehicles | 3 000 | ~6 MB |
| 10 000 vehicles | 30 000 | ~60 MB |

Storage is **cheap** vs **invalidation complexity** and **zero current consumer**.

---

## 11. Runtime need

| Field | Value |
|-------|--------|
| **CURRENT_RUNTIME_CACHE_CONSUMER** | **NONE** (no Nest module, no scheduler, no API reads durable MODE_A loader in production runtime) |
| **H4_AUTOMATIC_RUNTIME_REACHABLE** | **false** |

A3.5 reconciliation **does not** compute or serve H4 lifecycle segment totals.

---

## 12. Validation artifacts (this PR)

- `m3-3-hv-h4-a3-6-r0-collapse-scale.spec.ts` — correctness: 10 000 revisions → 5000 effective
- Opt-in postgres benchmark spec (manual)
- Architecture doc + CHANGE_LEDGER + A3 authority note (A3.6 status)

**No migration. No runtime writer. No production deploy.**

---

## 13. Next recommended slice

**A3.3-B or A3.7 (naming TBD):** Durable MODE_A loader **query optimization** with full live/durable parity corpus — **before** revisiting A3.6 cache.

---

**Audit author:** Cursor Cloud Agent (R0)  
**Evidence:** repository code audit @ `377e5fa20f6e685ba1deeeb9c5fedf4b10baf228` + in-memory collapse benchmark
