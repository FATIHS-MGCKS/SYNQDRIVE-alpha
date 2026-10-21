# VO-1 — Open question resolutions (VO-Q-001 … VO-Q-016)

**Slice:** VO-1 architecture only — no runtime implementation.

| Field | Value |
|-------|-------|
| **Anchor SHA** | `265168d3deec4175d5659ed849be5e4063f10291` |
| **Target contract** | [TARGET_ARCHITECTURE.md](../TARGET_ARCHITECTURE.md) |
| **Decision register** | [VO-DEC-1-001](../decisions/DECISION_REGISTER.md) |

---

## VO-Q-001

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-001 |
| **DECISION** | **C** — Provider-native mirrors (`DimoVehicle`, `HighMobilityVehicle`) plus durable **OnboardingCase**; candidate list = **derived projection**, not a canonical `VehicleCandidate` table. |
| **RATIONALE** | Reuse mirrors (VO-0B); projection alone fails resumability (VO-GAP-013/014); standalone candidate entity duplicates provider truth. |
| **CURRENT_EVIDENCE** | `getNonRegisteredVehicles()`, `CURRENT_STATE.md` §B |
| **REJECTED_ALTERNATIVES** | A durable neutral candidate entity; B projection-only |
| **COMPATIBILITY_IMPACT** | New case entity VO-2+; mirrors unchanged |
| **IMPLEMENTATION_IMPLICATION** | VO-2 schema for OnboardingCase |
| **GAPS_AFFECTED** | VO-GAP-014 → ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN; VO-GAP-013 → same |

## VO-Q-002

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-002 |
| **DECISION** | **Tiered identity resolution:** verified VIN auto-link within org; weak attributes require admin confirmation; platform-internal correlation for cross-tenant VIN without disclosure. |
| **RATIONALE** | Prevents plate/model silent merge; supports HM+DIMO same physical vehicle. |
| **CURRENT_EVIDENCE** | Separate `registerFromDimo` vs `registerHmOnlyVehicle` VIN checks; VO-GAP-009 |
| **REJECTED_ALTERNATIVES** | Automatic merge on plate/model; global VIN uniqueness without org scope |
| **COMPATIBILITY_IMPACT** | New correlation service VO-6+ |
| **IMPLEMENTATION_IMPLICATION** | Merge workflow + PhysicalVehicleCorrelation |
| **GAPS_AFFECTED** | VO-GAP-009 |

## VO-Q-003

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-003 |
| **DECISION** | **YES** — VIN nullable or explicit UNVERIFIED until provenance captured. |
| **RATIONALE** | Discovery often lacks VIN; synthetic fallback is harmful (VO-GAP-002). |
| **CURRENT_EVIDENCE** | `registerFromDimo` VIN fallback |
| **REJECTED_ALTERNATIVES** | Require VIN at first touch always |
| **COMPATIBILITY_IMPACT** | Schema + unique constraint semantics VO-2 |
| **IMPLEMENTATION_IMPLICATION** | Provenance + verification enum |
| **GAPS_AFFECTED** | VO-GAP-002 |

## VO-Q-004

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-004 |
| **DECISION** | Org-scoped uniqueness on verified VIN; HARD_CONFLICT on duplicate ACTIVE same org; cross-tenant = internal review only (**VO-INV-TENANT-001**). |
| **RATIONALE** | Multi-tenant isolation; `@@unique([vin, organizationId])` today |
| **CURRENT_EVIDENCE** | `schema.prisma` Vehicle |
| **REJECTED_ALTERNATIVES** | Global VIN as sole PK |
| **COMPATIBILITY_IMPACT** | Verification state before enforcing unique |
| **IMPLEMENTATION_IMPLICATION** | Conflict API responses |
| **GAPS_AFFECTED** | VO-GAP-009 |

## VO-Q-005

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-005 |
| **DECISION** | **Vehicle.registryLifecycle:** ACTIVE, OFFBOARDED, ARCHIVED only (post-activation). **Onboarding** lifecycle on **OnboardingCase** only. Separate from `VehicleStatus`. |
| **RATIONALE** | VO-1.1: no canonical `Vehicle` before activation |
| **CURRENT_EVIDENCE** | `VehicleStatus` enum only today |
| **REJECTED_ALTERNATIVES** | ONBOARDING on Vehicle; overload `VehicleStatus` |
| **COMPATIBILITY_IMPACT** | New fields VO-2 |
| **IMPLEMENTATION_IMPLICATION** | Backfill ACTIVE for existing vehicles |
| **GAPS_AFFECTED** | VO-GAP-007 |

## VO-Q-006

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-006 |
| **DECISION** | **Persist:** OnboardingCase (incl. onboarding phase), Vehicle.registryLifecycle (3 states), org/plate/link history. **Derive:** discovered, disconnected, inactive-ops. **Events:** transfer, hard-delete. |
| **RATIONALE** | VO-1.1 minimal durable set §4 |
| **CURRENT_EVIDENCE** | No case table; VO-GAP-007 |
| **REJECTED_ALTERNATIVES** | Draft Vehicle row pre-activation; persist all nouns as Vehicle enums |
| **COMPATIBILITY_IMPACT** | VO-2 tables |
| **IMPLEMENTATION_IMPLICATION** | Case state machine + registry state machine |
| **GAPS_AFFECTED** | VO-GAP-007, VO-GAP-013 |

## VO-Q-007

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-007 |
| **DECISION** | `VehicleOrganizationAssignment` history; `Vehicle.id` may transfer **only** via **FAIL_CLOSED** workflow: every tenant-private domain must prove **event-time org ownership** before transfer is enabled; else block. Destination never inherits prior-tenant private history. `Vehicle.organizationId` = current projection only. |
| **RATIONALE** | VO-1.1 VO-INV-TRANSFER-ISOLATION-001; B2-06-026 external ref |
| **CURRENT_EVIDENCE** | Many domains key on `vehicleId` + current org — VO-GAP-003 |
| **REJECTED_ALTERNATIVES** | Transfer by updating `organizationId` alone |
| **COMPATIBILITY_IMPACT** | Per-domain audit + history table VO-5+ |
| **IMPLEMENTATION_IMPLICATION** | Transfer gate checklist; optional OFFBOARD+RE_ONBOARD path |
| **GAPS_AFFECTED** | VO-GAP-003 |

## VO-Q-008

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-008 |
| **DECISION** | Temporal `VehicleLicensePlateAssignment`; `Vehicle.licensePlate` = current projection. |
| **RATIONALE** | Plate mutable; not canonical identity |
| **CURRENT_EVIDENCE** | Single column — VO-GAP-004 |
| **REJECTED_ALTERNATIVES** | Plate in VIN slot; no history |
| **COMPATIBILITY_IMPACT** | VO-2 schema |
| **IMPLEMENTATION_IMPLICATION** | Migration backfill current plate |
| **GAPS_AFFECTED** | VO-GAP-004 |

## VO-Q-009

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-009 |
| **DECISION** | Version via `VehicleDataSourceLink` episodes (activate/deactivate/supersede); consent tied to link. |
| **RATIONALE** | Reuse-first; VO-GAP-005 |
| **CURRENT_EVIDENCE** | `deactivatedAt` partial |
| **REJECTED_ALTERNATIVES** | Overwrite `dimoVehicleId` only |
| **COMPATIBILITY_IMPACT** | Link columns VO-2 |
| **IMPLEMENTATION_IMPLICATION** | Hardware swap flows |
| **GAPS_AFFECTED** | VO-GAP-005, VO-GAP-010 |

## VO-Q-010

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-010 |
| **DECISION** | Readiness = versioned **checklist profile** by product/jurisdiction/powertrain/provider mode; classes MANDATORY_* / OPTIONAL / CAPABILITY_UNKNOWN_ALLOWED. |
| **RATIONALE** | Context-aware activation §10 TARGET_ARCHITECTURE |
| **CURRENT_EVIDENCE** | Implicit register validation only — VO-GAP-007/015 |
| **REJECTED_ALTERNATIVES** | Single global gate |
| **COMPATIBILITY_IMPACT** | Readiness engine VO-4 |
| **IMPLEMENTATION_IMPLICATION** | Product matrix config |
| **GAPS_AFFECTED** | VO-GAP-007, VO-GAP-015 |

## VO-Q-011

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-011 |
| **DECISION** | Baselines mandatory per **readiness profile** (e.g. BEV rental requires HV reference; telematics-only may defer tire/brake). |
| **RATIONALE** | Separates reference spec from health |
| **CURRENT_EVIDENCE** | `manualSpecs` on register paths |
| **REJECTED_ALTERNATIVES** | All baselines always mandatory |
| **COMPATIBILITY_IMPACT** | Profile tables VO-4 |
| **IMPLEMENTATION_IMPLICATION** | UI wizard gating |
| **GAPS_AFFECTED** | VO-GAP-015 |

## VO-Q-012

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-012 |
| **DECISION** | **CONDITIONAL** — UNKNOWN allowed at activation unless selected product module requires capability; post-activation refresh continues. |
| **RATIONALE** | VO-INV-READINESS-001 |
| **CURRENT_EVIDENCE** | Async capability refresh post-register |
| **REJECTED_ALTERNATIVES** | Block all activation until full probe |
| **COMPATIBILITY_IMPACT** | Module gates unchanged |
| **IMPLEMENTATION_IMPLICATION** | Readiness matrix |
| **GAPS_AFFECTED** | VO-GAP-015 |

## VO-Q-013

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-013 |
| **DECISION** | Billable quantity changes via **idempotent consumer** of durable **`vehicle.activated`** / **`vehicle.offboarded`** outbox facts (same DB tx as registry change; Billing **not** inside that tx). Not on discovery or case open. |
| **RATIONALE** | VO-1.1 VO-INV-ACTIVATION-EVENT-001 |
| **CURRENT_EVIDENCE** | `vehicles.service.ts` `onVehicleProvisioned` inline post-commit |
| **REJECTED_ALTERNATIVES** | Bill on DIMO mirror sync; Billing in Vehicle DB transaction |
| **COMPATIBILITY_IMPACT** | Outbox + consumer VO-4 |
| **IMPLEMENTATION_IMPLICATION** | Document Billing fact contract |
| **GAPS_AFFECTED** | none (boundary only) |

## VO-Q-014

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-014 |
| **DECISION** | All paths submit `OnboardingSourceSnapshot` to future orchestrator; DIMO/HM/manual adapters only. |
| **RATIONALE** | VO-GAP-008 |
| **CURRENT_EVIDENCE** | Separate controllers/services |
| **REJECTED_ALTERNATIVES** | Continue parallel registration services without contract |
| **COMPATIBILITY_IMPACT** | VO-3 refactor |
| **IMPLEMENTATION_IMPLICATION** | Adapter layer |
| **GAPS_AFFECTED** | VO-GAP-008 |

## VO-Q-015

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-015 |
| **DECISION** | **DISCONNECT_PROVIDER** = link only. **DEACTIVATE_VEHICLE** = ops/`VehicleStatus` only; registry stays **ACTIVE**. **OFFBOARD_VEHICLE** = `registryLifecycle` OFFBOARDED + `vehicle.offboarded` fact. Never conflate with delete. |
| **RATIONALE** | VO-1.1; VO-INV-PROVIDER-001 |
| **CURRENT_EVIDENCE** | `deregister` deletes Vehicle — VO-GAP-006 |
| **REJECTED_ALTERNATIVES** | DEACTIVATE meaning OFFBOARDED |
| **COMPATIBILITY_IMPACT** | Separate APIs VO-5 |
| **IMPLEMENTATION_IMPLICATION** | Deprecate delete deregister |
| **GAPS_AFFECTED** | VO-GAP-006, VO-GAP-012 (presentation) |

## VO-Q-016

| Field | Value |
|-------|-------|
| **QUESTION_ID** | VO-Q-016 |
| **DECISION** | OFFBOARD/ARCHIVE retain `Vehicle.id` and historical facts; hard-delete compliance-only. **Offboarded/archived mirrors do not auto-reappear as normal candidates** — **RE_ONBOARD** requires explicit authorized workflow (VO-INV-CANDIDATE-001). DISCONNECT may reconnect to same ACTIVE vehicle. |
| **RATIONALE** | VO-1.1 sold/retired safety; VO-INV-OFFBOARD-001 |
| **CURRENT_EVIDENCE** | `getNonRegisteredVehicles()` ignores offboard history |
| **REJECTED_ALTERNATIVES** | Passive rediscovery after OFFBOARD_SOLD |
| **COMPATIBILITY_IMPACT** | Suppression rules in candidate projection VO-3 |
| **IMPLEMENTATION_IMPLICATION** | Stop `vehicle.delete` for normal offboard |
| **GAPS_AFFECTED** | VO-GAP-006, VO-GAP-014 |
