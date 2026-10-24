# Vehicle Onboarding — Knowledge Gaps

VO-0B gap register · **VO-1 disposition** (2026-09-30). IDs use **`VO-GAP-*`** prefix.

**Cross-reference (do not duplicate):** [VDC-GAP-013](../../vehicle-device-connectivity/contradictions/KNOWLEDGE_GAPS.md) — telemetry integration identity vs `vehicles.hardware_type`.

**Disposition legend**

| Code | Meaning |
|------|---------|
| **ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN** | Target contract in [TARGET_ARCHITECTURE.md](../TARGET_ARCHITECTURE.md); runtime still open |
| **STILL_ARCHITECTURALLY_OPEN** | Not fully decided or cross-module unresolved |
| **CROSS_MODULE** | Primary owner another authority |
| **BLOCKED** | Waiting on evidence or external decision |

| Gap ID | Topic | Epistemic | Runtime status | VO-1 disposition | Notes |
|--------|-------|-----------|----------------|------------------|-------|
| **VO-GAP-001** | No unified Vehicle Onboarding runtime authority | CONFIRMED | **STILL_OPEN** | **ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN** | Orchestrator + case model defined VO-1 |
| **VO-GAP-002** | Synthetic `DIMO-{externalId}` in VIN field | CONFIRMED | **STILL_OPEN** | **ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN** | Target: no synthetic VIN; VO-Q-003 |
| **VO-GAP-003** | Organization assignment history | CONFIRMED | **STILL_OPEN** | **ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN** | `VehicleOrganizationAssignment` target |
| **VO-GAP-004** | License plate history absent | CONFIRMED | **STILL_OPEN** | **ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN** | Temporal plate assignments |
| **VO-GAP-005** | Provider mapping history incomplete | CONFIRMED | **STILL_OPEN** | **ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN** | Link episodes VO-Q-009 |
| **VO-GAP-006** | Deregistration deletes Vehicle | CONFIRMED | **STILL_OPEN** | **ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN** | OFFBOARD semantics VO-Q-016 |
| **VO-GAP-007** | No onboarding lifecycle/readiness authority | CONFIRMED | **PARTIAL** | **ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN** | Readiness + case on **Master DIMO (P2 prod)**; no unified lifecycle enum; HM/manual bypass |
| **VO-GAP-008** | Split DIMO/HM/manual paths | CONFIRMED | **PARTIAL** | **ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN** | **Master DIMO** on OnboardingCase (P2 prod); **HM_ONLY** + **manual create** still legacy — [VO_NEXT_PHASE_REGISTRATION_PATH_AUDIT.md](../research/VO_NEXT_PHASE_REGISTRATION_PATH_AUDIT.md) |
| **VO-GAP-009** | HM_ONLY + DIMO collision risk | INFERRED | **STILL_OPEN** | **ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN** | Tiered resolution VO-Q-002/004 |
| **VO-GAP-010** | Smart5 classification | CONFIRMED | **STILL_OPEN** | **CROSS_MODULE** | Device family → VDC + link swap; VO maps hardware changes |
| **VO-GAP-011** | Tesla vs hardwareType | CONFIRMED | **STILL_OPEN** | **CROSS_MODULE** | **VDC-GAP-013**; onboarding seeds only |
| **VO-GAP-012** | Connectivity/freshness fragmented | CONFIRMED | **STILL_OPEN** | **CROSS_MODULE** | VDC/UI; VO separates registry vs link state |
| **VO-GAP-013** | Non-resumable onboarding | CONFIRMED | **PARTIAL** | **ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN** | Idempotent resume for **Master DIMO** completed cases; HM/manual + re-onboard workflow still open |
| **VO-GAP-014** | Implicit candidate model | CONFIRMED | **STILL_OPEN** | **ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN** | Projection + case VO-Q-001 |
| **VO-GAP-015** | Async capability vs readiness | CONFIRMED | **STILL_OPEN** | **ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN** | Readiness contract VO-Q-010/012 |
| **VO-GAP-016** | Motion physics stammdaten for DI shadow | CONFIRMED | **STILL_OPEN** | **ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN** | No structured VIN decode service; no `motionPhysicsReference` on Technical Baseline V2; AI-Spec lacks `systemMotorPowerKw` — [VEHICLE_PHYSICS_PHASE2_ENRICHMENT_BINDING.md](../research/VEHICLE_PHYSICS_PHASE2_ENRICHMENT_BINDING.md) |

**Summary:** 13 runtime **STILL_OPEN** · 3 **PARTIAL** (VO-GAP-007, 008, 013 — P2 DIMO progress only) · 12 **ARCHITECTURE_RESOLVED_IMPLEMENTATION_OPEN** · 3 **CROSS_MODULE** · 0 falsely closed

**Production evidence gap (not a VO-GAP row):** natural E2E Master DIMO registration on production **pending** — [VO_SIG_01_P2_PRODUCTION_DEPLOYMENT_CLOSURE.md](../evidence/VO_SIG_01_P2_PRODUCTION_DEPLOYMENT_CLOSURE.md).
