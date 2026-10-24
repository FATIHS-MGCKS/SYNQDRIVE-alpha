# Vehicle Physics Phase 2 — VO enrichment binding (Fable-remediated)

**Canonical plan:** [`research/driving-intelligence/VEHICLE_PHYSICS_PHASE2_IMPLEMENTATION_PLAN.md`](../../../research/driving-intelligence/VEHICLE_PHYSICS_PHASE2_IMPLEMENTATION_PLAN.md)

**Supersedes:** PR #2158 (branch `cursor/vehicle-physics-phase2-plan-192d` on `cursor/exp021-ev-ground-truth-7d78`) — use the **main-based** replacement PR only.

## VO commitments

- Motion reference data uses **`VehicleMotionPhysicsReference`** (HV reference pattern): `organizationId`, `vehicleId`, identity fingerprint, append-only `isActive` / `supersededById`, evidence tiers `ESTIMATED` | `CONFIRMED` | `VERIFIED`.
- **No** JSON physics snapshot on `Vehicle`.
- Technical Baseline V2 may carry a **draft** section during onboarding; activation TX creates the active reference row. **Post-activation API** serves existing fleet — same service, no second profile system.
- Mistral AI-Spec adds **`systemMotorPowerKw`** and optional **`accel0To100S`** only. No AI longitudinal max accel/decel fields.
- Identity from DIMO definition / HM / registered `Vehicle` — **no** mandatory external VIN decoder. Variant unknown → nullable fields + `variantAssumption`.
- Operator UI confirmation → at most **CONFIRMED**. **VERIFIED** only via server `verify` with validated document/manufacturer evidence (Phase C: ZB Teil I via existing AI Upload pipeline).
- Master `VehicleRegistrationModal` + VO review reused; merge policy must not overwrite confirmed/manual values when AI streams.

## Registry

Vehicle Onboarding stays `AUDIT_IN_PROGRESS` until Phase A ships. Gap **VO-GAP-016** tracks design + implementation.
