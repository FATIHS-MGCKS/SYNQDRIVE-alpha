import type { DriveProfileResolverInput, TelemetryPowertrainSignals } from './drive-profile-resolver.types';

export interface VehicleDriveProfileLoadRow {
  fuelType: string;
  hvBatteryCapacityKwh?: number | null;
  tankCapacityLiters?: number | null;
  vin?: string | null;
  dimoVehicle?: {
    vin?: string | null;
    fuelType?: string | null;
    powertrainType?: string | null;
  } | null;
  latestState?: {
    evSoc?: number | null;
    tractionBatteryCurrentEnergyKwh?: number | null;
    tractionBatteryIsCharging?: boolean | null;
    tractionBatteryChargingPowerKw?: number | null;
    lvBatteryVoltage?: number | null;
    fuelLevelRelative?: number | null;
    fuelLevelAbsolute?: number | null;
    coolantTempC?: number | null;
    engineLoad?: number | null;
  } | null;
}

function hasNumeric(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

export function buildTelemetrySignalsFromLatestState(
  state: VehicleDriveProfileLoadRow['latestState'],
): TelemetryPowertrainSignals | null {
  if (!state) return null;

  return {
    tractionBatterySoc: hasNumeric(state.evSoc),
    tractionBatteryEnergy: hasNumeric(state.tractionBatteryCurrentEnergyKwh),
    tractionBatteryCharging:
      state.tractionBatteryIsCharging === true ||
      hasNumeric(state.tractionBatteryChargingPowerKw),
    combustionEngineRpm: hasNumeric(state.engineLoad),
    combustionEngineEct: hasNumeric(state.coolantTempC),
    fuelLevel: hasNumeric(state.fuelLevelRelative) || hasNumeric(state.fuelLevelAbsolute),
    lvBatteryVoltage: hasNumeric(state.lvBatteryVoltage),
  };
}

export function buildDriveProfileResolverInput(
  vehicle: VehicleDriveProfileLoadRow,
): DriveProfileResolverInput {
  const hasHvCapacity = hasNumeric(vehicle.hvBatteryCapacityKwh);

  return {
    master: {
      fuelType: vehicle.fuelType,
    },
    provider: vehicle.dimoVehicle
      ? {
          vin: vehicle.dimoVehicle.vin ?? vehicle.vin ?? null,
          providerFuelType: vehicle.dimoVehicle.fuelType,
          providerPowertrainType: vehicle.dimoVehicle.powertrainType,
        }
      : vehicle.vin
        ? { vin: vehicle.vin }
        : null,
    canonicalSpec: {
      hvBatteryCapacityKwh: vehicle.hvBatteryCapacityKwh,
      tankCapacityLiters: vehicle.tankCapacityLiters,
      hvBatteryPresent: hasHvCapacity ? true : null,
    },
    telemetry: buildTelemetrySignalsFromLatestState(vehicle.latestState),
  };
}
