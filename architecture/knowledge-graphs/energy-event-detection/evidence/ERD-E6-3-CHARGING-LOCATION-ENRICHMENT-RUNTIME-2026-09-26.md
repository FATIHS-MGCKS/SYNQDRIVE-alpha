# ERD E6.3 — Charging location enrichment runtime (2026-09-26)

**Evidence ID:** EED-EV-0089  
**Stage:** `ERD_E6_3_CHARGING_LOCATION_ENRICHMENT_RUNTIME`

## Scope

E6.3 durably attaches E6.2 charging-station reference resolution to **canonical ERD RECHARGE** `VehicleEnergyEvent` rows via:

- `VehicleEnergyEventChargingStationEnrichment` (separate from fuel enrichment)
- Coordinate selector `erd-recharge-charging-enrichment-coordinate-v1`
- Queue `energy.recharge.station.enrich` / job `recharge.station.enrich`
- Post-projection enqueue in `ErdRechargeCanonicalProjectionRuntimeService` (CREATED, RECONCILED, HANDOFF_COMPLETED, NO_OP)
- Recovery scheduler with leader guard
- Read API `chargingStationEnrichment` on `EnergyEventDto` (RECHARGE only)

## Authority boundaries

| Layer | Question |
|-------|----------|
| E6.1 | WHERE did charging occur? (canonical coordinates) |
| E6.2 | WHICH station matches a coordinate? (reference resolver) |
| E6.3 | WHEN/HOW is resolution persisted on the product VEE? (async runtime + API) |

**Invariants:** charging enrichment does not affect physical identity, VEE identity, or E5.6 write authority.

## Feature flags (default OFF)

- `CHARGING_STATION_ENRICHMENT_ENABLED`
- `CHARGING_STATION_ENRICHMENT_CUTOVER_AT` (boundary: `VehicleEnergyEvent.endTime`)
- `CHARGING_STATION_ENRICHMENT_RECOVERY_*`

No production activation, no historical backfill, no dataset import in this stage.

## Validation

- Unit: coordinate selector C1–C10, cutover T*, orchestrator O*, projection hook H*
- Ephemeral migration gate: `scripts/test/erd-e6-3-migration-ephemeral-gate.sh`
- PostgreSQL: `erd-e6-3-charging-station-enrichment.postgres.integration.spec.ts` (boundary step 16/16)

`AUTOMATIC_DATASET_REFRESH_REENRICHMENT=NO` in V1 — fingerprint changes on coordinate/resolver version only.
