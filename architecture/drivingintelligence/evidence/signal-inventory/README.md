# Signal inventory evidence contract

**Purpose:** Catalog DIMO signals consumed by Driving Intelligence with units, availability, and provider source.

**Primary sources:**
- `backend/src/modules/vehicle-intelligence/driving-signals/canonical-driving-signal-mapper.ts`
- `docs/audits/dimo-phase-2c-current-schema-signal-expansion-audit-2026-08-31.md`
- `docs/audits/dimo-phase-2d-signal-value-physics-matrix-2026-08-31.md`

**Epistemic rule:** Capability per vehicle is resolved via `VehicleDrivingCapability` — not assumed fleet-wide.
