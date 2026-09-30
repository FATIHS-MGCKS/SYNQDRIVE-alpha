# Onboarding process boundaries (semantic only)

**VO-0B — not database state requirements.**

These eight stages describe **process boundaries** for VO-1 architecture. They **must not** automatically become eight persisted database states.

| Stage | Intent | Current repo touchpoints (illustrative) |
|-------|--------|----------------------------------------|
| 1. Provider Discovery | Mirror/clearance rows without canonical Vehicle | `DimoApiSyncService`, `DimoVehicle`; HM clearance tables |
| 2. Identity Resolution | VIN/token/HM VIN alignment, conflict policy | `registerFromDimo`, VIN fallback; **gaps** VO-GAP-002, VO-GAP-009 |
| 3. Administrative Enrichment | Org, plate, name, rental category | `VehicleRegistrationModal` SECTION 1; `extraData` |
| 4. Technical Baseline | Tires, brakes, battery spec, service dates | `manualSpecs`; `Vehicle` columns |
| 5. Organization / Station Assignment | `organizationId`, `homeStationId`, `currentStationId` | `registerFromDimo`; `VehicleStationTransfer` for later moves |
| 6. Capability Profiling | Hardware type, async capability refresh | `hardwareType`; `capabilityLifecycle`, Battery refresh |
| 7. Readiness Validation | Gate before “active” telemetry/booking | **Not explicit** — VO-GAP-007, VO-GAP-015 |
| 8. Activation | Operational Vehicle consumable by downstream | Implicit on successful register; snapshot poll eligibility |

VO-1 must determine the **minimum durable lifecycle model** for correctness, concurrency, resumability, and auditability.
