# ERD-E5-4A — Shadow Parity Physical-Episode Topology

**Workstream:** Energy Event Detection (EED) → EV Recharge Detection (ERD) → E5.4 shadow parity  
**Date:** 2026-09-27  
**Status:** PROPOSED (architecture closure; **no runtime change** in this ADR)  
**Production baseline SHA:** `1b5a7f6cd91d175e82f9ee0df111d4df015b3555`  
**Decision node:** `EED-DEC-ERD-002`  
**Evidence:** EED-EV-0090 (cohort NULL fix), EED-EV-0091 (Production fragment/topology closure)

---

## 1. Problem statement

Post–E5.4 cohort fix, Production dry-run (`evaluateVehicleWindow`, `persist=false`) on the audited candidate vehicle reports:

| Metric | Value |
|--------|------|
| Canonical native sessions | 6 |
| Exact `EXACT_NATIVE_DIMO_ID` pairs | 6 |
| Authority-critical / SOC / location mismatches | 0 each |
| Energy field mismatches (primary pairs) | 6 (semantic — see energy ADR) |
| Unique legacy rows in audited windows | 70 |
| Exact-anchor legacy rows | 6 |
| Additional contained historical fragments | 64 |
| Topology class | `ONE_CANONICAL_MULTI_LEGACY_FRAGMENTS` |

The **current** comparator emits **64** additional observations as **`LEGACY_ONLY`**, because each legacy row is consumed independently **after** the canonical session’s primary legacy row is paired via **`EXACT_NATIVE_DIMO_ID`**.

Official aggregator output therefore shows:

- `SETTLED_PARITY_DENOMINATOR=70`
- `SETTLED_PARITY_RATE=0`

That denominator counts **raw historical `VehicleEnergyEvent` rows**, not **physical recharge episodes**. It is **not physically meaningful** and must **not** be interpreted as canonical coverage failure.

**Physical reality:** 6 canonical physical sessions, 6 corresponding legacy physical clusters (1 anchor + contained sub-rows each), **0** true orphan legacy physical clusters.

---

## 2. Architecture decision A — physical-episode parity authority

**SHADOW_PARITY_AUTHORITY_LEVEL=PHYSICAL_RECHARGE_EPISODE**

E5.4 settled parity authority operates at the level of **physical recharge episodes**, not raw legacy row cardinality.

- Raw legacy rows remain **forensic evidence**.
- Multiple historical VEE rows inside one physical charge are **not** automatically independent parity opportunities.

---

## 3. Decision A1 — primary pair (unchanged)

Each canonical physical session has **at most one PRIMARY** legacy pairing responsible for **field parity**:

- time, SOC, energy, odometer, confidence, coordinates

**Pairing priority (unchanged):**

1. `EXACT_NATIVE_DIMO_ID`
2. `LEGACY_COALESCED_LINEAGE`
3. `UNIQUE_PHYSICAL_WINDOW_OVERLAP`

Ambiguous multi-match remains **`AMBIGUOUS_MATCH`** (fail closed).

**PRIMARY_PAIR_PRESERVED=YES** — exact identity and pairing strength are **not** weakened.

---

## 4. Decision A2 — legacy fragment siblings

After a canonical session obtains its **primary** legacy pair, scan **remaining unpaired** legacy cohort rows that overlap the **same canonical physical episode**.

A row may be classified as a **legacy fragment sibling** only when **all** required predicates hold (deterministic, fail closed):

| Predicate | Requirement |
|-----------|-------------|
| Same vehicle | `vehicleId` matches canonical scope |
| Legacy cohort | Row satisfies `LEGACY_DIRECT_DIMO_RECHARGE` (positive whitelist) |
| Window overlap | Row interval overlaps canonical physical window |
| Containment | Row is contained by or materially bounded within the canonical physical episode (not merely weak touch at boundary) |
| Identity isolation | Row lacks strong identity proof to a **different** canonical session |
| Ownership | Assignment does not create ambiguous cross-canonical ownership |

**Fail closed:** arbitrary time overlap without containment + identity isolation → **not** a fragment.

**FRAGMENT_SIBLING_DIAGNOSTIC_DEFINED=YES**

---

## 5. Decision A3 — reuse `MULTIPLE_LEGACY_ONE_CANONICAL`

**EXISTING_MULTIPLE_LEGACY_CLASS_REUSED=YES**  
**NEW_PARITY_CLASS_REQUIRED=NO**

Existing parity taxonomy and `fieldDiff.relatedLegacyVehicleEnergyEventIds` are **semantically sufficient** for:

- 1 primary legacy anchor (separate primary-pair observation)
- 1..N **additional proven** legacy fragment siblings (topology diagnostic)

No new enum value is required before implementation.

---

## 6. Decision A4 — observation shape

### Observation 1 — primary pair (field parity)

| Field | Value |
|-------|--------|
| `canonicalChargeSessionId` | Canonical session id |
| `legacyVehicleEnergyEventId` | Primary row (exact / coalesced / unique-window winner) |
| `pairingEvidence` | Actual strong evidence (`EXACT_NATIVE_DIMO_ID`, etc.) |
| `parityClass` | `EXACT_MATCH` / `SEMANTIC_MATCH` / `FIELD_MISMATCH` |
| `fieldDiff` | Normal dimensional comparison |

### Observation 2 — topology diagnostic (only when fragment siblings exist)

| Field | Value |
|-------|--------|
| `canonicalChargeSessionId` | Same canonical session |
| `legacyVehicleEnergyEventId` | **`null`** |
| `pairingEvidence` | **`NONE`** |
| `parityClass` | **`MULTIPLE_LEGACY_ONE_CANONICAL`** |
| `fieldDiff.relatedLegacyVehicleEnergyEventIds` | Deterministically **sorted** fragment sibling ids (**extra fragments only**) |

**Do not** emit each fragment as independent **`LEGACY_ONLY`**.

**Primary anchor inclusion in `relatedLegacyVehicleEnergyEventIds`:** **NO** — the primary pair observation already represents the anchor.

---

## 7. Decision A5 — true `LEGACY_ONLY`

**TRUE_LEGACY_ONLY_DEFINITION:**

A **legacy physical episode / cluster** with **no** corresponding canonical physical episode.

**Invariant:** **`LEGACY_ONLY` must NOT mean** a historical sub-fragment of an already-paired canonical episode.

---

## 8. Decision A6 — true `CANONICAL_ONLY`

**TRUE_CANONICAL_ONLY_DEFINITION:**

A **settled** native canonical physical episode with **no** legitimate legacy physical counterpart.

`PENDING_SETTLEMENT` semantics for fallback-only lateness remain **unchanged**.

---

## 9. Decision A7 — settled parity denominator

**SETTLED_PARITY_PHYSICAL_EPISODE_SEMANTIC_DEFINED=YES**

`SETTLED_PARITY_DENOMINATOR` counts **one entry per settled physical parity comparison opportunity**:

- Primary paired physical episode (field parity observation)
- True **`CANONICAL_ONLY`** physical episode
- True **`LEGACY_ONLY`** physical cluster
- Genuine unresolved cardinality / structural episode failure where appropriate

It **must not** increase because one physical legacy charge produced several historical VEE fragments.

**MULTIPLICITY_DIAGNOSTIC_IN_SETTLED_DENOMINATOR=NO** for proven contained historical fragments.

Topology diagnostics (`MULTIPLE_LEGACY_ONE_CANONICAL` for fragment siblings) are tracked **separately** (metrics / multiplicity counters), not as additional settled field-parity denominator slots.

---

## 10. Decision A8 — raw vs physical report fields

**RAW_ROW_COUNT_SEPARATED_FROM_PHYSICAL_CLUSTER_COUNT=YES**

| Report field | Meaning |
|--------------|---------|
| `legacyRowCount` | Unique legacy cohort rows in scope/window |
| `legacyPhysicalClusterCount` | Distinct legacy **physical** clusters |
| `canonicalPhysicalEpisodeCount` | Eligible canonical sessions compared |
| `pairedPhysicalEpisodeCount` | Canonical sessions with primary legacy pair |
| `legacyFragmentRowCount` | Rows classified as fragment siblings (not primary) |
| `trueLegacyOnlyPhysicalClusterCount` | True orphan legacy clusters |

**Production evidence (audited windows, candidate vehicle):**

| Field | Value |
|-------|-------|
| `legacyRowCount` | 70 |
| `legacyPhysicalClusterCount` | 6 |
| `canonicalPhysicalEpisodeCount` | 6 |
| `pairedPhysicalEpisodeCount` | 6 |
| `legacyFragmentRowCount` | 64 |
| `trueLegacyOnlyPhysicalClusterCount` | 0 |

Do **not** describe 70 rows as 70 physical clusters.

---

## 11. Decision A9 — current Production interpretation

| Flag | Value |
|------|-------|
| `CANONICAL_COVERAGE_FAILURE` | **NO** |
| `LEGACY_FRAGMENTATION_PRESENT` | **YES** |
| `PHYSICAL_PAIR_COVERAGE` | **6/6** |
| `RAW_ROW_PARITY_RATE_NOT_AUTHORITATIVE` | **YES** |

`SETTLED_PARITY_RATE=0` with denominator 70 is evidence of **pre-fix comparator topology**, not canonical identity/boundary/SOC/location/coverage failure.

---

## 12. Decision A10 — schema impact

Audit target: `ErdRechargeProjectionShadowObservation` (`parityClass`, `pairingEvidence`, `fieldDiff` JSON).

| Question | Answer |
|----------|--------|
| `COMPARATOR_PRISMA_SCHEMA_CHANGE_REQUIRED` | **NO** |
| `COMPARATOR_DATABASE_MIGRATION_REQUIRED` | **NO** |

Existing `MULTIPLE_LEGACY_ONE_CANONICAL` + `relatedLegacyVehicleEnergyEventIds` suffice.

---

## 13. Future test design (not implemented in this ADR)

| ID | Scenario | Expected |
|----|----------|----------|
| **T1** | 1 canonical + 1 exact legacy | One normal primary pair |
| **T2** | 1 canonical + exact anchor + 1 contained sibling | Primary pair + `MULTIPLE_LEGACY_ONE_CANONICAL` diagnostic; sibling **not** `LEGACY_ONLY` |
| **T3** | 1 canonical + anchor + N contained siblings | One topology diagnostic; deterministic sorted related ids |
| **T4** | Contained sibling overlapping two canonicals | Fail closed / ambiguous |
| **T5** | Unrelated legacy episode | True `LEGACY_ONLY` |
| **T6** | Canonical with no legacy | `CANONICAL_ONLY` |
| **T7** | Fragment order permutation | Deterministic identical fingerprint/result |
| **T8** | Production-shaped 64-fragment fixture | Physical denominator = one canonical episode, not 65 rows |

---

## 14. Implementation sequencing (topology slice)

**Step 1:** Comparator topology implementation only (this ADR).  
**Step 3 (after Step 2 energy mapper — see energy ADR):** Full E5.4 dry-run `persist=false` expecting 6 primary comparisons, 0 true `LEGACY_ONLY` clusters, 64 fragment siblings diagnostic, 0 authority-critical/SOC/location mismatches, 0 stored-energy semantic mismatches on `energyDeltaKwh`.  
**Step 4:** Persisted shadow parity only after clean dry-run.

---

## 15. Readiness (conceptual, post-ADR)

| Gate | Status |
|------|--------|
| `SHADOW_MEASUREMENT_READINESS` | **BLOCKED_PENDING_TOPOLOGY_IMPLEMENTATION** |
| `CANONICAL_COVERAGE_READINESS` | **PASS** (physical pair coverage 6/6) |

---

## 16. Related artifacts

- Evidence: `evidence/ERD-E5-4-FRAGMENT-TOPOLOGY-PRODUCTION-CLOSURE-2026-09-27.md`
- Energy semantics (orthogonal): `ERD-RECHARGE-ENERGY-PRODUCT-SEMANTICS-2026-09-27.md`
- Runtime baseline: `evidence/ERD-E5-4-SHADOW-PARITY-2026-09-25.md`
