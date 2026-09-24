# ERD-E1 — Canonical Physical Charge Authority + Projection Contract

**Workstream:** Energy Event Detection (EED) → EV Recharge Detection (ERD)  
**Date:** 2026-09-24  
**Status:** PROPOSED (architecture closure; no runtime cutover)  
**Baseline main:** `9d0dbc7d3db0b5a3137356fc5c50b732bfd7fe3f`  
**Evidence:** E0 read-only audit; Production forensics (151 legacy VEE RECHARGE, 0 HvChargeSession; HV flags unset → false)

---

## 1. Decision summary

| Field | Value |
|-------|-------|
| **ERD_CANONICAL_PHYSICAL_SESSION_AUTHORITY** | `HV_CHARGE_SESSION_SEMANTIC_MODEL` |
| **ERD_PHYSICAL_AUTHORITY_OWNER** | EED / ERD |
| **BATTERY_V2_ROLE** | CONSUMER |
| **VEE_RECHARGE_ROLE** | PRODUCT_PROJECTION (after ERD cutover; legacy direct writer until E5) |
| **RECOMMENDED_CANONICAL_MODEL** | A |

One physical EV/PHEV charging episode maps to **one canonical charge-session row** (lifecycle-aware). `VehicleEnergyEvent.RECHARGE` is **not** an independent physical authority after ERD cutover; it becomes an idempotent **product projection** for trips timeline, energy-event lists, and future charging-location enrichment.

Battery V2 may consume canonical session evidence (capacity shadow, M3 methods) but **does not own** physical charging episode semantics.

---

## 2. Transitional code location (no file moves in E1)

| Field | Value |
|-------|-------|
| **CODE_LOCATION_CURRENT** | `backend/src/modules/vehicle-intelligence/battery-health/hv-charge-session/*` |
| **SEMANTIC_AUTHORITY_AFTER_E1** | EED / ERD |

Future implementation may **reuse** `HvChargeSession` storage (preferred) or introduce an ERD-named successor table only if reuse proves insufficient.

### Structural sufficiency review

| Field | Assessment |
|-------|------------|
| **HV_CHARGE_SESSION_STRUCTURALLY_SUFFICIENT** | **YES** (with ERD-owned semantics and projection link in E5) |
| **NEW_ERD_SESSION_TABLE_REQUIRED** | **NO** |

Existing columns cover organization/vehicle scope, provider provenance (`segmentFingerprint`, `dimoSegmentId`, `source`), lifecycle (`startAt`, `endAt`, `isOngoing`), SOC/energy deltas, quality, idempotency, provider time, and extensible `metadata` (supersede, fallback tiers, cable/charging flags). Gaps (explicit lifecycle enum, projection FK on VEE) are **E5 schema design**, not a mandate for a new physical table in E1.

---

## 3. Physical identity contract

**ERD_PHYSICAL_CHARGE_IDENTITY_VERSION=v1**

### 3.1 Two-layer identity

| Layer | Purpose | Native segment | Telemetry fallback |
|-------|---------|----------------|-------------------|
| **Provider identity** | Provenance + idempotent ingest | `providerSegmentId` when present; else deterministic `segmentFingerprint` (`dimo-recharge-{tokenId}-{startMs}`) | Deterministic `poll-charge:{vehicleId}:{startAtMs}` fingerprint |
| **Canonical physical episode identity** | One session per real charge | Stable per vehicle: `(vehicleId, segmentFingerprint)` unique + `(vehicleId, idempotencyKey)` unique | Same store; match late native to fallback via temporal/evidence overlap (existing supersede helpers) |

**NATIVE_PROVIDER_IDENTITY_PRESERVED=YES** — provider ids and fingerprints remain on session rows and metadata; never replaced by OEM labels.

**FALLBACK_IDENTITY_CONTRACT_DEFINED=YES** — fallback sessions use deterministic fingerprints from physical start anchor; supersession records `supersededBySegmentFingerprint` without row deletion.

**OEM_NAME_IN_IDENTITY=NO** — matching uses capability signals and time/evidence overlap only.

### 3.2 Minimum matching inputs (thresholds deferred to E2/E3)

For converging fallback → native or deduplicating duplicates:

- `vehicleId` (hard scope)
- Temporal overlap of `[startAt, endAt|ongoing]` (tolerance policy in E3)
- Compatible SOC rise / energy-added direction (when present)
- Charging-state evidence (`isCharging`, cable) when present
- Location proximity when coordinates exist

Exact numeric thresholds **must not** be invented in E1; repository evidence: `sessionsOverlap` 15-minute tolerance in HV fallback supersede; coalesce gaps for VEE are product-level only and must not define physical identity post-cutover.

**PHYSICAL_IDENTITY_CONTRACT_DEFINED=YES**

---

## 4. Central invariant

**ONE_PHYSICAL_CHARGE_ONE_CANONICAL_SESSION=YES**

- Exactly one **canonical** charge session per physical episode in the physical store.
- Superseded fallback rows remain as **historical evidence**; they must not be product-counted as separate recharge episodes once native canonical session supersedes them (projection policy E5).
- Multiple read models (Battery analytics, trips timeline) are allowed; only one **physical authority** row per episode.

---

## 5. Native > fallback authority

| Rule | Definition |
|------|------------|
| **NATIVE_OVER_FALLBACK_CANONICAL_RULE_DEFINED** | YES — DIMO native recharge segment is authoritative over `TELEMETRY_POLL_FALLBACK` for the same physical episode (already implemented in `HvChargeSessionPersistService.supersedeOverlappingFallbackSessions`). |
| **LATE_NATIVE_CONVERGENCE_RULE_DEFINED** | YES — late native ingest matches overlapping fallback, updates canonical fields via merge policy, marks fallback superseded in metadata; no second canonical session. |
| **FALLBACK_EVIDENCE_RETENTION_DEFINED** | YES — no delete of superseded fallback rows; metadata + `changeHistory` retain audit trail. |

Post-cutover, **EnergyEventsService must not** create a second physical RECHARGE authority parallel to this path.

---

## 6. Session lifecycle contract

Conceptual states (no new DB enum in E1):

| State | Meaning |
|-------|---------|
| **ONGOING** | `isOngoing=true`; provider or fallback detector still accumulating evidence |
| **COMPLETED** | `isOngoing=false` and `endAt` set (or provider-complete semantics) |
| **SUPERSEDED** | Fallback row linked to native fingerprint; not canonical for product count |
| **INVALIDATED** | Reserved for explicit rejection / quality fail-closed (future E3/E4) |

Transitions:

- detected start → ongoing updates → completed
- fallback ongoing → native arrival → fallback superseded → native row canonical ongoing/completed

**ONGOING_SESSION_FIRST_CLASS=YES**  
**COMPLETION_SEMANTICS_DEFINED=YES**  
**SUPERSESSION_SEMANTICS_DEFINED=YES**

---

## 7. Product projection contract (ERD v1)

**Canonical physical session → `VehicleEnergyEvent.RECHARGE`**

| Projection field | Source session |
|------------------|----------------|
| Identity | Deterministic `dimoSegmentId` / `sourceEventKey` derived from canonical session id + fingerprint (E5 spec) |
| startTime / endTime / durationSeconds | Session `startAt`, `endAt`, computed duration |
| socDeltaPercent / energyDeltaKwh | Session deltas |
| Coordinates / odometer | Session metadata / segment fields |
| confidence | Mapped from session quality + evidence tiers |
| provenance | `rawDetectionMeta` includes canonicalSessionId, source, projectionVersion |

**PROJECTION_IDEMPOTENCY_CONTRACT_DEFINED=YES** — upsert on stable projection key; re-project updates in place.

### Ongoing product visibility

| Option | Evaluation |
|--------|------------|
| **Option 1:** Do not project until completed | Aligns with current VEE persist gate (`isSegmentPersistable` rejects ongoing). **No schema change.** |
| **Option 2:** Ongoing VEE rows | Requires schema/UX contract change for open-ended `endTime`. |

**ERD_V1_ONGOING_PRODUCT_PROJECTION_POLICY=OPTION_1_DO_NOT_PROJECT_UNTIL_COMPLETED**

**COMPLETED_SESSION_PROJECTION_DEFINED=YES**

---

## 8. Legacy VEE bridge

Production (~151 rows, 1 vehicle) are **LEGACY_PRODUCT_HISTORY** — pre-ERD direct DIMO→VEE writes. E1 performs **no backfill** and no automatic reinterpretation as new physical sessions.

**LEGACY_VEE_POLICY_DEFINED=YES**

Future projected rows must prove origin from canonical session via **E5** mechanism (evaluate, do not implement in E1):

- Preferred: explicit `canonicalChargeSessionId` FK on `VehicleEnergyEvent` (nullable; RECHARGE-only)
- Interim-compatible: deterministic `sourceEventKey` + `rawDetectionMeta.projection` block
- Must not collide with legacy `dimoSegmentId`-only upsert keys without migration plan

**FUTURE_VEE_TO_SESSION_LINK_CONTRACT_DEFINED=YES**

---

## 9. Writer inventory summary

See `evidence/ERD-E1-WRITER-INVENTORY-2026-09-24.md`.

**FUTURE_SINGLE_PHYSICAL_WRITER_MODEL_DEFINED=YES**

After ERD cutover (E5+): only **canonical session persist path** (native ingest + fallback detector under ERD flags) writes physical state; VEE writer becomes **projection-only** for RECHARGE.

**LEGACY_DIRECT_RECHARGE_WRITER_DEPRECATION_DEFINED=YES** — `EnergyEventsService` RECHARGE upsert: unchanged until cutover; disposition **DEPRECATE_AFTER_CUTOVER** → **BECOME_PROJECTION_WRITER**.

**NO_RUNTIME_DEPRECATION_IN_E1=YES**

**ALL_RECHARGE_WRITERS_INVENTORIED=YES**

---

## 10. Provider-agnostic authority

**TESLA_SPECIFIC_AUTHORITY=NO**  
**LTE_R1_SPECIFIC_AUTHORITY=NO**  
**CAPABILITY_DRIVEN_AUTHORITY=YES**

Routing uses `VehicleBatteryCapability` + `HvMethodProfile` (`dimo.segments.recharge`, `hv.*` signals), not hardware OEM name.

---

## 11. Powertrain applicability

**BEV_ELIGIBLE=YES**  
**PHEV_ELIGIBLE=YES** (traction-battery charging evidence)  
**ICE_ONLY_ELIGIBLE=NO**

Gate aligns with `energy-events-recovery-capability` / recharge applicability (RECHARGE_CANDIDATE vs REFUEL_CANDIDATE); ERD must not run fallback on ICE-only vehicles without traction charging evidence.

**POWERTRAIN_CAPABILITY_GATE_DEFINED=YES**

---

## 12. E2–E8 roadmap (post-E1)

| Stage | Objective | E1 adjustment |
|-------|-----------|----------------|
| **E2** | Native recharge normalization hardening (ongoing segments, provider id stability) | Unchanged |
| **E3** | Telemetry fallback convergence thresholds + INVALIDATED semantics | Unchanged |
| **E4** | Recovery / liveness under ERD flags | Unchanged |
| **E5** | VEE projection cutover + legacy bridge | Unchanged |
| **E6** | Charging-location enrichment on projected RECHARGE | Unchanged |
| **E7** | Staged production rollout (ERD flags separate from Battery V2 defaults) | Unchanged |
| **E8** | Natural E2E (LTE R1 + Tesla-capable token) | Unchanged |

**FINAL_RECOMMENDED_ERD_STAGE_COUNT=6** (E2–E7; E8 validation gate collapses into E7 exit criteria where evidence allows)  
**NEXT_STAGE_AFTER_E1=E2**

---

## 13. E1 non-goals

No native parser changes, fallback detector runtime changes, convergence jobs, VEE projection runtime, station enrichment, production flags, backfill, Battery health scoring, SOH, longitudinal profile behavior, customer UI/API changes, schema migrations, or file moves.

---

## 14. Related graph artifacts

- Decision node: `EED-DEC-ERD-001`
- Evidence: `EED-EV-0076`, `EED-EV-0077`
- Invariants: `EED-INV-014` … `EED-INV-017`
- Supersedes open question: `EED-OQ-004` (link policy — now ERD-owned)
