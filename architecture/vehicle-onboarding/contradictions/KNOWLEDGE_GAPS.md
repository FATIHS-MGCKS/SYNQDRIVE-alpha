# Vehicle Onboarding — Knowledge Gaps

VO-0B gap register. IDs use **`VO-GAP-*`** prefix for this authority.

**Cross-reference (do not duplicate):** [VDC-GAP-013](../../vehicle-device-connectivity/contradictions/KNOWLEDGE_GAPS.md) — telemetry integration identity vs `vehicles.hardware_type`. VO-GAP-011 and VO-GAP-010 relate but defer canonical integration identity to VDC.

| Gap ID | Topic | Epistemic | Status | Notes |
|--------|-------|-----------|--------|-------|
| **VO-GAP-001** | No unified Vehicle Onboarding / Vehicle Registry runtime authority | CONFIRMED | **STILL_OPEN** | Fragmented across `vehicles`, `dimo`, `high-mobility`; VO-0B adds documentation only |
| **VO-GAP-002** | Synthetic fallback `DIMO-{externalId}` in VIN semantic field | CONFIRMED | **STILL_OPEN** | `vehicles.service.ts` `registerFromDimo` |
| **VO-GAP-003** | Organization assignment lacks historical relationship model | CONFIRMED | **STILL_OPEN** | `Vehicle.organizationId` only; no org assignment history table |
| **VO-GAP-004** | License plate history absent | CONFIRMED | **STILL_OPEN** | `Vehicle.licensePlate` single column |
| **VO-GAP-005** | Provider mapping history incomplete | CONFIRMED | **STILL_OPEN** | `VehicleDataSourceLink.deactivatedAt`; `dimoVehicleId` on Vehicle not versioned |
| **VO-GAP-006** | Deregistration deletes canonical Vehicle + cascades vs deactivate/offboard semantics | CONFIRMED | **STILL_OPEN** | `VehiclesService.deregister` — `vehicle.delete` |
| **VO-GAP-007** | No single onboarding lifecycle/readiness authority | CONFIRMED | **STILL_OPEN** | Multiple enums + derived registration state |
| **VO-GAP-008** | DIMO / HM_ONLY / manual paths not under one provider-neutral contract | CONFIRMED | **STILL_OPEN** | Separate services/controllers |
| **VO-GAP-009** | HM_ONLY + DIMO same-physical-vehicle identity collision risk | INFERRED | **STILL_OPEN** | Separate VIN checks per path; no global physical-vehicle resolver |
| **VO-GAP-010** | Smart5 not auto-classified from provider identity | CONFIRMED | **STILL_OPEN** | Non-`R1-` aftermarket → UNKNOWN in `telemetry-source-family.ts`; `hardwareType` manual |
| **VO-GAP-011** | Tesla API synthetic identity vs manual `hardwareType` may disagree | CONFIRMED | **STILL_OPEN** | See **VDC-GAP-013**; production Tesla often `LTE_R1` |
| **VO-GAP-012** | Connectivity/freshness truth fragmented | CONFIRMED | **STILL_OPEN** | Mirror vs VLS vs resolvers vs UI — `docs/ui/master-admin-connected-vehicles-dimo-deep-audit.md` |
| **VO-GAP-013** | Abandoned/partial onboarding not resumable | CONFIRMED | **STILL_OPEN** | No persisted onboarding session/state machine |
| **VO-GAP-014** | Candidate model implicit per provider | CONFIRMED | **STILL_OPEN** | Non-registered = query over `DimoVehicle`; HM candidates separate API |
| **VO-GAP-015** | Capability profile mostly async post-register | CONFIRMED | **STILL_OPEN** | No explicit readiness contract before activation |

**Summary:** 15 **STILL_OPEN** (VO-0B bootstrap).
