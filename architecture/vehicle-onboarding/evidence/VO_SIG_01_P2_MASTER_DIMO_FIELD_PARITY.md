# VO-SIG-01 P2 — Master Admin register-from-dimo field parity matrix

Source form builders: `frontend/src/master/connected-vehicles/master-vehicle-registration.ts`  
Canonical path: `MasterDimoCanonicalRegistrationService` + activation extensions.

| Master form field | HTTP payload | Persistence target | Notes |
|-------------------|--------------|-------------------|--------|
| `stationId` (body) | `stationId` | Admin baseline `stationId` → activation `vehicles.station_id` / `current_station_id` | Same as legacy station connect |
| `vehicleName` | `extraData.vehicleName` | Admin baseline → activation `vehicle_name` | |
| `licensePlate` | `extraData.licensePlate` | Admin baseline → activation + plate assignment | |
| `notes` | `extraData.notes` | Admin baseline → activation `notes` | |
| `mileage` | `extraData.mileageKm` | Activation TX SQL `mileage_km` | |
| `fuelType` | `extraData.fuelType` | Identity draft override + activation `fuel_type` | No synthetic `DIMO-*` VIN |
| `vehicleType` | `extraData.vehicleType` | Activation TX SQL `vehicle_type` | Parsed enum |
| `hardwareType` | `extraData.hardwareType` | Activation TX SQL `hardware_type` | Form value preserved; connection modality from provider evidence |
| `drivetrain` | `extraData.drivetrain` | Activation TX SQL `drive_type` (`DriveType` enum) | Form strings mapped via `mapMasterFormDrivetrainToDriveType` |
| `curbWeight` | `extraData.curbWeightKg` | Activation TX SQL `curb_weight_kg` | |
| `idleRpm` / `maxRpm` | `extraData.idleRpm` / `maxRpm` | Activation TX SQL | |
| `brakeForceDistribution` | `extraData.brakeForceFrontPercent` | Activation TX SQL | |
| `frontToRearWeightDistribution` | `extraData.frontToRearWeightDistribution` | Activation TX SQL `front_weight_distribution_pct` | |
| `tankCapacityLiters` | `extraData.tankCapacityLiters` | Activation TX SQL | |
| `engineDisplacementCc` | — (stripped in Master `buildVehicleExtraData`) | **Not supported** on register-from-dimo | Backend `UNSUPPORTED_MASTER_REGISTRATION_FIELDS` if sent; update vehicle after registration |
| `cylinderCount` | — (stripped in Master `buildVehicleExtraData`) | **Not supported** on register-from-dimo | Same as engine displacement |
| `serviceIntervalManufacturerKm/Months` | `extraData.*` | Activation TX SQL `service_interval_manufacturer_*` | |
| `oilChangeIntervalKm/Months` | `extraData.*` | Activation TX SQL `oil_change_interval_*` | |
| `manualSpecs.battery` | `manualSpecs.battery` | Activation TX `vehicle_battery_specs` (idempotent) | 12V LV spec |
| `manualSpecs.brakes` | `manualSpecs.brakes` | Technical baseline → `vehicle_brake_reference_specs` via activation materialization | Includes rotor width |
| `manualSpecs.tires` (dims, brand, load/speed) | `manualSpecs.tires` | Technical baseline tire reference + installed config | |
| `treadDepth*`, `tireCondition`, `dotCode*`, `aiTireSpec` | `manualSpecs.tires` | Idempotent `VehiclesService` tire lifecycle post-step | Same as legacy register-from-dimo |
| `serviceHistory` / `highMobilityActivation` | — | **Not supported** on DIMO register path | Documented `MANUAL_CREATE_UNSUPPORTED_REGISTERED_VEHICLE_FIELDS` |
| Provider consent | — | Activation `materializeDimoConsentIdempotent` | Parity with canonical activation (replaces legacy fire-and-forget `recordDimoConsent`) |
| Billing | — | Registry `VEHICLE_ACTIVATED` outbox only | Legacy `onVehicleProvisioned` removed from this path |
| `createdByUserId` | actor | Activation TX SQL `created_by_user_id` | |

**Intentional non-parity removed:** legacy synthetic VIN `DIMO-${externalId}` — blocked by canonical activation identity rules.
