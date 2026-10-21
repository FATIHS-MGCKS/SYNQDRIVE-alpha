# VO — HV reference capacity Master registration field flow (2026-10-21)

**Scope:** Local fix — Master `register-from-dimo` path only (no production mutation).

## Root cause

`VehicleRegistrationModal` collected `hvBatteryUsableCapacityKwh` / `hvBatteryGrossCapacityKwh` (and legacy `hvBatteryCapacityKwh`), but `buildVehicleExtraData()` omitted them. Backend `tryHvBatteryFromExtra()` only read `extraData.hvBatteryCapacityKwh`, so canonical Master DIMO onboarding never captured an `hvBatteryReference` draft → activation materialized **0** `vehicle_battery_reference_capacities` rows for operators who filled the UI.

## Fix (repository)

- Frontend: `buildMasterHvCapacityExtraFields()` → merged into `buildVehicleExtraData()`.
- Backend: `resolveHvBatteryCapacityFromMasterExtra()` — USABLE reference from usable (or legacy alias); gross-only does not create SOH reference; rejects usable > gross.

## Unchanged governance

- RENTAL BEV: `hvBatteryByPowertrain.REQUIRED` (readiness blocks activation without materializable USABLE draft).
- FLEET BEV: `hvBatteryByPowertrain.REQUIRED` (2026-10-21 owner decision — aligned with RENTAL for **new** activations only).
- Materialization: `UNVERIFIED` initial status; no auto-verify for `MANUAL_VERIFIED`.
- Existing active reference: materialization no-op (no overwrite).
