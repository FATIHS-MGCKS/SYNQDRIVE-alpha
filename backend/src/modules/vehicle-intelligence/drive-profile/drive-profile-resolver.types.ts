import type { BatteryDriveProfile } from '../battery-health/battery-v2-domain';

/** Canonical drive profile output — aligned with `BatteryDriveProfile`. */
export type DriveProfile = BatteryDriveProfile;

export const DriveProfileSource = {
  VEHICLE_MASTER: 'VEHICLE_MASTER',
  PROVIDER_VIN: 'PROVIDER_VIN',
  CANONICAL_SPEC: 'CANONICAL_SPEC',
  TELEMETRY_HEURISTIC: 'TELEMETRY_HEURISTIC',
  UNKNOWN: 'UNKNOWN',
} as const;

export type DriveProfileSource =
  (typeof DriveProfileSource)[keyof typeof DriveProfileSource];

export const DriveProfileConfidence = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;

export type DriveProfileConfidence =
  (typeof DriveProfileConfidence)[keyof typeof DriveProfileConfidence];

/** Confirmed vehicle master data (priority 1). */
export interface VehicleMasterPowertrainInput {
  /** Prisma `FuelType` or equivalent string. */
  fuelType?: string | null;
  /** Explicit operator-confirmed drive profile override, when present. */
  confirmedDriveProfile?: DriveProfile | null;
}

/** Verified VIN / provider mirror data (priority 2). */
export interface ProviderPowertrainInput {
  vin?: string | null;
  providerFuelType?: string | null;
  providerPowertrainType?: string | null;
}

/** Canonical powertrain spec derived from vehicle master capacities (priority 3). */
export interface CanonicalPowertrainSpecInput {
  hvBatteryCapacityKwh?: number | null;
  tankCapacityLiters?: number | null;
  /** From `VehicleBatterySpec` — HV present when gross capacity known. */
  hvBatteryPresent?: boolean | null;
}

/**
 * Telemetry signal presence — heuristic fallback only (priority 4).
 * Requires corroboration across groups; never infer from a single flag.
 */
export interface TelemetryPowertrainSignals {
  tractionBatterySoc?: boolean;
  tractionBatteryEnergy?: boolean;
  tractionBatteryCharging?: boolean;
  combustionEngineRpm?: boolean;
  combustionEngineEct?: boolean;
  fuelLevel?: boolean;
  lvBatteryVoltage?: boolean;
}

export interface DriveProfileResolverInput {
  master?: VehicleMasterPowertrainInput | null;
  provider?: ProviderPowertrainInput | null;
  canonicalSpec?: CanonicalPowertrainSpecInput | null;
  telemetry?: TelemetryPowertrainSignals | null;
}

export interface ResolvedDriveProfile {
  profile: DriveProfile;
  source: DriveProfileSource;
  confidence: DriveProfileConfidence;
  /** True when profile came from telemetry heuristic layer. */
  telemetryFallback: boolean;
  /** Machine-readable resolution audit trail (no UI labels). */
  evidence: string[];
}

export interface LayerResolution {
  profile: DriveProfile;
  source: DriveProfileSource;
  confidence: DriveProfileConfidence;
  telemetryFallback: boolean;
  evidence: string[];
}
