# KG-EED Decision History

Canonical decision nodes: `graph/nodes.yaml` (`EED-DEC-001` … `EED-DEC-012`, `EED-DEC-PHYSICAL-REFUEL-IDENTITY-001`).  
Detail below follows governance: decision, rationale, alternatives, consequences, evidence, status.

---

## EED-DEC-001 — Preserve durationSeconds backward compatibility

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-001 |
| **Status** | PRODUCTION_VALIDATED |
| **Date** | 2026-08-30 |
| **Question** | Should SynqDrive rename or reinterpret `durationSeconds` after KS MX UI mislabeling? |
| **Decision** | Keep `durationSeconds` as provider detection envelope in API/DTO. Semantic correction via additive fields only. |
| **Why** | Breaking API rename would harm existing clients and DB rows. Envelope value is still useful as detection window. |
| **Alternatives** | Rename to `detectionWindowSeconds` (rejected — breaking); overwrite with rise duration (rejected — loses envelope) |
| **Evidence** | EED-EV-0010, EED-EV-0016 |
| **Consequences** | Clients must read `fuelLevelRiseDurationSeconds` for observed rise; UI must not imply pump time from envelope |
| **Known limitations** | Historical UI may have cached envelope-as-duration perception |
| **Would invalidate** | Explicit approved API v2 semantic breaking change |
| **Related nodes** | EED-COMP-006, EED-DB-001 |
| **Related invariants** | EED-INV-001 |

---

## EED-DEC-002 — Introduce additive fuelLevelRise* fields

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-002 |
| **Status** | PRODUCTION_VALIDATED |
| **Date** | 2026-08-30 |
| **Question** | How to represent observed fuel-level transition separately from DIMO envelope? |
| **Decision** | Add nullable `fuelLevelRiseStart`, `fuelLevelRiseEnd`, `fuelLevelRiseDurationSeconds` on VehicleEnergyEvent (REFUEL only). |
| **Why** | KS MX proved envelope (~80 min) ≠ observed rise (~5 min). Additive migration avoids row rewrite. |
| **Alternatives** | Store only in rawDetectionMeta Json (rejected — poor API/UI ergonomics) |
| **Evidence** | EED-EV-0008, EED-EV-0016, EED-MIG-001 |
| **Consequences** | UI can show "Signal change ~N min"; NULL when insufficient telemetry |
| **Known limitations** | Historical rows may have NULL rise fields |
| **Would invalidate** | Decision to require non-null rise for all REFUEL rows |
| **Related nodes** | EED-COMP-003, EED-MIG-001 |
| **Related invariants** | EED-INV-002, EED-INV-008, EED-INV-009 |

---

## EED-DEC-003 — Refuse to call observed fuel-level rise "pump duration"

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-003 |
| **Status** | PRODUCTION_VALIDATED |
| **Date** | 2026-08-30 |
| **Question** | Can telemetry-derived rise duration represent physical nozzle time? |
| **Decision** | No. Document and label as "observed fuel-level rise" / "signal change" only. |
| **Why** | No authoritative pump/nozzle signal exists. Fabrication would mislead operators. |
| **Alternatives** | Label rise as "tank duration" (rejected after KS MX incident) |
| **Evidence** | EED-EV-0008, EED-EV-0015 |
| **Consequences** | Conservative derivation; null when evidence insufficient |
| **Known limitations** | Rise may still differ from true pump time even when derived |
| **Would invalidate** | Proven authoritative pump-duration signal integrated |
| **Related nodes** | EED-COMP-003, EED-UI-001 |
| **Related invariants** | EED-INV-003 |

---

## EED-DEC-004 — Preserve independent RECHARGE duration semantics

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-004 |
| **Status** | PRODUCTION_VALIDATED |
| **Date** | 2026-08-30 |
| **Question** | Should RECHARGE adopt fuelLevelRise* fields? |
| **Decision** | No. RECHARGE continues using `durationSeconds` as charging/detection envelope. fuelLevelRise* always null. |
| **Why** | REFUEL mislabeling incident does not apply to SOC-based charging semantics. |
| **Alternatives** | Unified "signal change" model across kinds (rejected — different physics) |
| **Evidence** | EED-EV-0009, EED-EV-0010 |
| **Consequences** | UI uses durationSeconds for RECHARGE minutes display |
| **Known limitations** | Coalesced multi-hour sessions may need UI copy review (EED-OQ-011) |
| **Would invalidate** | Explicit RECHARGE semantic redesign approved |
| **Related nodes** | EED-SIG-006, EED-UI-002 |
| **Related invariants** | EED-INV-004 |

---

## EED-DEC-005 — 5-minute REFUEL coalescing gap

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-005 |
| **Status** | VALIDATED |
| **Date** | 2026-08 (coalesce introduction) |
| **Question** | What gap threshold merges adjacent REFUEL sub-segments? |
| **Decision** | `COALESCE_GAP_SECONDS_REFUEL = 300` (5 min) + geo ≤250 m. |
| **Why** | DIMO may split single logical refuel into nearby sub-segments. |
| **Alternatives** | No coalescing (rejected — duplicate cards); longer gap (risk of merging distinct sessions) |
| **Evidence** | EED-EV-0006 |
| **Consequences** | Outer envelope on merge; single-segment pass-through unchanged (KS MX) |
| **Known limitations** | Chained coalescing possible; very long envelopes if DIMO emits one segment |
| **Would invalidate** | Production evidence that 300s merges independent sessions |
| **Related nodes** | EED-CFG-002, EED-COMP-002 |
| **Related invariants** | EED-INV-013 |

---

## EED-DEC-006 — 30-minute RECHARGE coalescing gap

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-006 |
| **Status** | VALIDATED |
| **Date** | 2026-08 |
| **Question** | What gap for RECHARGE AC pause / reconnect patterns? |
| **Decision** | `COALESCE_GAP_SECONDS_RECHARGE = 1800` (30 min). |
| **Why** | AC charging pauses exceed REFUEL gap budgets. |
| **Alternatives** | Same 5 min as REFUEL (rejected — fragment recharge cards) |
| **Evidence** | EED-EV-0006 |
| **Consequences** | Fewer duplicate recharge cards per physical plug-in |
| **Known limitations** | Multi-hour coalesced envelope UI semantics open (EED-OQ-011) |
| **Would invalidate** | Evidence of incorrect session merging at 30 min |
| **Related nodes** | EED-CFG-003 |
| **Related invariants** | — |

---

## EED-DEC-007 — Stale REFUEL sibling reconciliation

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-007 |
| **Status** | PRODUCTION_VALIDATED |
| **Date** | 2026-08-30 |
| **Question** | How to remove overlapping partial refuel rows without unsafe deletes? |
| **Decision** | Token-scoped `shouldSupersedeRefuelSibling` guard; vehicle-scoped deleteMany; REFUEL-only. |
| **Why** | KS MX had 685s partial inside 4818s canonical. Blind overlap delete unsafe. |
| **Alternatives** | Delete all overlapping refuels (rejected); manual-only cleanup (insufficient at scale) |
| **Evidence** | EED-EV-0011 |
| **Consequences** | Idempotent reconcile on reprocess; RECHARGE never deleted |
| **Known limitations** | ~3 fleet pairs may need policy (EED-OQ-007) |
| **Would invalidate** | Cross-vehicle delete or RECHARGE deletion observed |
| **Related nodes** | EED-COMP-004 |
| **Related invariants** | EED-INV-005, EED-INV-006 |

---

## EED-DEC-008 — KS MX 2024 interpretation

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-008 |
| **Status** | PRODUCTION_VALIDATED |
| **Date** | 2026-08-28 (incident) / 2026-08-30 (decision) |
| **Question** | What caused ~80 min "refuel duration" in UI for KS MX 2024? |
| **Decision** | DIMO detection envelope `durationSeconds=4818`. Parser/coalesce preserved upstream. UI mislabeled envelope as pump time. Rise ~280–330s from telemetry. |
| **Why** | Production DB, fixture, and reprocess evidence align. |
| **Alternatives** | Blame SynqDrive parser expansion (disproven); blame coalescing (disproven for single segment) |
| **Evidence** | EED-EV-0018, EED-EV-0011, EED-HI-001 |
| **Consequences** | fuelLevelRise* additive fields; UI semantic split |
| **Known limitations** | Physical pump duration still not directly observable |
| **Would invalidate** | New evidence that SynqDrive expanded envelope |
| **Related nodes** | EED-HI-001, EED-COMP-001, EED-COMP-002 |
| **Related invariants** | EED-INV-001, EED-INV-013 |

---

## EED-DEC-009 — No historical backfill policy

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-009 |
| **Status** | VALIDATED |
| **Date** | 2026-08-30 |
| **Question** | Must fleet-wide historical rows be rewritten for fuelLevelRise*? |
| **Decision** | No. Forward-correct behavior only. NULL historical rise fields acceptable. |
| **Why** | Product owner explicit: "from now on, future events must behave correctly." |
| **Alternatives** | Fleet-wide backfill (rejected); rewrite durationSeconds (rejected) |
| **Evidence** | EED-EV-0017 |
| **Consequences** | Ops scripts available for targeted reprocess; not mandatory fleet mutation |
| **Known limitations** | ~13 NULL rise rows remain as historical evidence |
| **Would invalidate** | Product decision requiring fleet backfill |
| **Related nodes** | EED-SYS-001 |
| **Related invariants** | EED-INV-009 |

---

## EED-DEC-010 — ATE/EED authority separation

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-010 |
| **Status** | PRODUCTION_VALIDATED |
| **Date** | 2026-09-01 |
| **Question** | Where does trip enrichment end and energy detection authority begin? |
| **Decision** | KG-ATE MAY_TRIGGER only. KG-EED owns all detection semantics. Document cross-graph edges explicitly. |
| **Why** | Prevents silent duplication and semantic drift in KG-ATE. |
| **Alternatives** | Document energy semantics in ATE graph (rejected) |
| **Evidence** | EED-EV-0001, EED-EV-0019 |
| **Consequences** | ATE-EXT-006 + EED-EXT-001 reciprocal references |
| **Known limitations** | Detect cadence still coupled to reconcile (EED-OQ-001) |
| **Would invalidate** | Merger of KG-ATE and KG-EED |
| **Related nodes** | EED-EXT-001 |
| **Related invariants** | EED-INV-010 |

---

## EED-DEC-011 — Production minIncreasePercent 5

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-011 |
| **Status** | PRODUCTION_VALIDATED |
| **Date** | 2026-08-27 |
| **Question** | What REFUEL detector sensitivity fixes KS MX default-blind case? |
| **Decision** | `minIncreasePercent: 5` in production refuel config. |
| **Why** | Live sweep: 2–10% identical segments on tested windows; 5% conservative margin. |
| **Alternatives** | Default DIMO config (rejected — missed KS MX); 2% (no benefit vs 5% in sweep) |
| **Evidence** | EED-EV-0013 |
| **Consequences** | `DIMO_ENERGY_DETECTOR_CONFIG_VERSION = e2-2026-08` in logs/meta |
| **Known limitations** | OEM-dependent detector behavior |
| **Would invalidate** | Systematic false negatives/positives at 5% in production |
| **Related nodes** | EED-CFG-001, EED-SIG-001 |
| **Related invariants** | — |

---

## EED-DEC-012 — Mechanism fetch isolation (E1)

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-012 |
| **Status** | PRODUCTION_VALIDATED |
| **Date** | 2026-08-27 |
| **Question** | Should recharge GraphQL 422 block all energy detection? |
| **Decision** | Decouple per-mechanism fetch outcomes. REFUEL and RECHARGE isolated. |
| **Why** | E1 incident: recharge failure blocked refuel persistence entirely. |
| **Alternatives** | Single combined fetch (rejected) |
| **Evidence** | EED-EV-0003 |
| **Consequences** | `mechanismOutcomes` in detect result; partial_failure metric path |
| **Known limitations** | Both mechanisms can still fail independently |
| **Would invalidate** | Reintroduction of blocking combined fetch |
| **Related nodes** | EED-SVC-002 |
| **Related invariants** | EED-INV-011 |

---

## EED-DEC-PHYSICAL-REFUEL-IDENTITY-001 — Two-stage physical refuel identity

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-PHYSICAL-REFUEL-IDENTITY-001 |
| **Status** | PROPOSED |
| **Date** | 2026-09-04 |
| **Question** | How to dedupe overlapping provider REFUEL segments for one physical fill without `dimoSegmentId` equality? |
| **Decision** | Stage 1: coarse deterministic scope / advisory xact lock key. Stage 2: semantic sibling matcher (terminal fuel/odometer/end-time, nested windows, suffix-compatible transitions). Canonical = most complete consistent transition superset. |
| **Why** | KS MX 2026-09-04: A (7→28 L) and B (21→28 L) are same physical refuel; duration-first reconcile + 20% fuel-% guard failed. |
| **Alternatives** | Single rounded hash (rejected — bucket boundary splits); global max fuelDelta (rejected — insufficient evidence); UI dedupe (rejected) |
| **Evidence** | EED-EV-0027 |
| **Consequences** | G2 must reconcile before enrichment enqueue; one physical refuel → one authoritative row → one enrichment |
| **Known limitations** | Tolerances calibrated on single incident + limited historical dry-run corpus |
| **Would invalidate** | Counterexample where semantic matcher false-merges distinct refuels at fleet scale |
| **Related nodes** | EED-OQ-013, EED-EV-0026 |
| **Related invariants** | — |

---

## EED-DEC-RFRF-001 — Raw-fuel REFUEL fallback authority (F1)

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-RFRF-001 |
| **Status** | PROPOSED |
| **Date** | 2026-09-12 |
| **Question** | How to prevent DIMO native RefuelDetector from being single point of failure? |
| **Decision** | Add parallel `SYNQDRIVE_RAW_FUEL_FALLBACK` path producing `VehicleEnergyEvent` before G2; fail closed. |
| **Evidence** | EED-EV-0040, EED-EV-0041 |
| **Related nodes** | EED-DEC-RFRF-002, EED-DEC-RFRF-003, EED-DEC-RFRF-004 |

---

## EED-DEC-RFRF-002 — VehicleEnergyEvent identity Option C (F1)

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-RFRF-002 |
| **Status** | **SUPERSEDED** by EED-DEC-RFRF-005 (F1.1) |
| **Date** | 2026-09-12 |
| **Decision** | Add `detectionSource` + `sourceEventKey`; retain `dimoSegmentId` unique with namespaced fallback IDs. |
| **Evidence** | EED-EV-0041 |

---

## EED-DEC-RFRF-005 — RawRefuelCandidate lifecycle + Option D identity (F1.1–F2)

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-RFRF-005 |
| **Status** | PROPOSED |
| **Date** | 2026-09-12 |
| **Question** | How to keep fallback candidate identity stable under delayed telemetry without conflating evidence revision? |
| **Decision** | `RawRefuelCandidate` staging table with lifecycle (INSUFFICIENT→OBSERVED→SETTLING→READY_FOR_PERSIST→REJECTED/PROMOTED). Four-way separation: `id` (DB surrogate), `candidateIdentityKey` (immutable after assignment), `evidenceRevisionFingerprint` (mutable), physical candidate matcher (semantic rediscovery). Under per-vehicle `pg_advisory_xact_lock64` on `raw_refuel_candidate:{vehicleId}`: search non-terminal rows by vehicle/channel/detector/temporal neighborhood/pre-plateau; reuse row on overlap; insert only when no overlap. Promote to `VehicleEnergyEvent` with `sourceEventKey = candidateIdentityKey` (promotion runtime F4). Supersedes Option C. |
| **Why** | Hash-only identity fails when delayed telemetry shifts rise-onset bucket; semantic rediscovery required (F1.2 case C). |
| **Alternatives** | Option C hybrid (rejected F1.1); hash-only upsert (rejected F1.2) |
| **Evidence** | EED-EV-0042, EED-EV-0043 |
| **Consequences** | F2 **complete** for candidate persistence+rediscovery (`F2_IMPLEMENTATION_COMPLETE=YES`); `IMPLEMENTATION_IDEMPOTENCY_PROOF=PARTIAL` (7 unit tests PASS; 8 opt-in Postgres integration tests). F3 detector, F4 runtime wiring, F5 G2 native↔fallback proof remain. `dimoSegmentId` compatibility NOT_PROVEN. Does **not** detect KS MS 661 or enable production fallback. |
| **Related nodes** | EED-DEC-RFRF-002, EED-OQ-013, EED-OQ-014 |

---

## EED-DEC-RFRF-003 — STABLE_PRE→RISING→STABLE_POST detector (F1)

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-RFRF-003 |
| **Status** | PROPOSED |
| **Date** | 2026-09-12 |
| **Decision** | Local plateau rise detector; absolute-only supported with capability gating. |
| **Evidence** | EED-EV-0041 |
| **Related nodes** | EED-OQ-014 |

---

## EED-DEC-RFRF-004 — Native/fallback convergence via G2 matcher (F1)

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-RFRF-004 |
| **Status** | PROPOSED |
| **Date** | 2026-09-12 |
| **Decision** | Per-candidate SAME/DISTINCT/INSUFFICIENT; no global fallback disable on unrelated native segments. |
| **Evidence** | EED-EV-0041 |
| **Related nodes** | EED-OQ-013 |

---

## EED-DEC-RFRF-006 — F4 Option B phase boundary (2026-09-13)

| Field | Value |
|-------|-------|
| **ID** | EED-DEC-RFRF-006 |
| **Status** | **PROPOSED** (pending human review) |
| **Date** | 2026-09-13 |
| **Question** | Where does F4 end and F5 begin given promotion/convergence ordering hazard? |
| **Decision** | **Option B (F4.0 hardened):** F4 implements dark runtime through candidate staging + promotion **substrate**. `F4_VEE_UPSERT_REACHABLE=NO`. F5 owns first reachable fallback VEE execution via separate promotion gate (not substitutable by persist flag). `fuelCapability` (Vehicle metadata) separate from `absoluteSignalTrust` (NOT_YET_AVAILABLE — fail closed). `RawRefuelPromotionEligibility` orthogonal to F2 lifecycle — no terminal REJECTED solely for F5 absence. Native overlap advisory-only in F4. `detectionSource=NULL` = legacy native-era only. `sourceEventKey=candidateIdentityKey` canonical. |
| **Evidence** | EED-EV-0045 |
| **Alternatives rejected** | Option A; Option C; cutover filtering in F4; deriving trust from fuelType/sample presence; F4 terminal overlap rejection |
| **Consequences** | F4-PR1..4 plan; F2_MATCHER_F3_TOLERANCE_BOUNDARY hard gate; PR #1628 draft for final review |
| **Related nodes** | EED-DEC-RFRF-004, EED-DEC-RFRF-005, EED-EV-0044, EED-EV-0043 |
