# Vehicle Physics Phase 2 — VO enrichment binding (pointer)

**Canonical plan:** [`research/driving-intelligence/VEHICLE_PHYSICS_PHASE2_IMPLEMENTATION_PLAN.md`](../../../research/driving-intelligence/VEHICLE_PHYSICS_PHASE2_IMPLEMENTATION_PLAN.md)

## VO-specific commitments

- Motion physics fields enter only via **Master `extraData` / AI-Spec stream** and **`VehicleTechnicalBaselineDraftV2.motionPhysicsReference`** — not a separate onboarding wizard.
- **Technical Baseline V2** remains the activation gate; materialization extends `technical-baseline-materialization.ts` with a versioned JSON snapshot on `Vehicle`.
- Operator confirmation reuses Master registration / baseline review patterns (HV reference analogue).
- Legacy vehicles: same enrichment path via Master edit + optional VO case update; no bypass of provenance tiers.

## Registry

Vehicle Onboarding registry status unchanged by this design document (`AUDIT_IN_PROGRESS`). Promote implementation evidence in the same PR that ships P2-4/P2-6.
