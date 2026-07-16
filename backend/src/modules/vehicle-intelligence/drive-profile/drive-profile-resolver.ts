import { BatteryDriveProfile, BatteryMeasurementQuality, BatteryMeasurementType } from '../battery-health/battery-v2-domain';
import type {
  CanonicalPowertrainSpecInput,
  DriveProfile,
  DriveProfileResolverInput,
  LayerResolution,
  ProviderPowertrainInput,
  ResolvedDriveProfile,
  TelemetryPowertrainSignals,
  VehicleMasterPowertrainInput,
} from './drive-profile-resolver.types';
import {
  DriveProfileConfidence,
  DriveProfileSource,
} from './drive-profile-resolver.types';

const UNKNOWN: LayerResolution = {
  profile: BatteryDriveProfile.UNKNOWN,
  source: DriveProfileSource.UNKNOWN,
  confidence: DriveProfileConfidence.LOW,
  telemetryFallback: false,
  evidence: ['no_decisive_source'],
};

function normalizeToken(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function mapFuelTypeToProfile(fuelType: string): DriveProfile | null {
  const token = normalizeToken(fuelType);
  if (!token || token === 'OTHER') return null;
  if (token === 'ELECTRIC' || token === 'EV' || token === 'BEV' || token === 'BATTERY_ELECTRIC') {
    return BatteryDriveProfile.BEV;
  }
  if (token === 'PLUGIN_HYBRID' || token === 'PHEV' || token === 'PLUG_IN_HYBRID') {
    return BatteryDriveProfile.PHEV;
  }
  if (token === 'HYBRID' || token === 'HEV') {
    return BatteryDriveProfile.HEV;
  }
  if (
    token === 'GASOLINE' ||
    token === 'DIESEL' ||
    token === 'PETROL' ||
    token === 'GAS' ||
    token === 'CNG' ||
    token === 'LPG'
  ) {
    return BatteryDriveProfile.ICE;
  }
  return null;
}

function mapPowertrainTypeToProfile(powertrainType: string): DriveProfile | null {
  const token = normalizeToken(powertrainType);
  if (!token) return null;
  if (token.includes('BEV') || token === 'ELECTRIC' || token === 'EV') {
    return BatteryDriveProfile.BEV;
  }
  if (token.includes('PHEV') || token.includes('PLUGIN') || token.includes('PLUG_IN')) {
    return BatteryDriveProfile.PHEV;
  }
  if (token.includes('HEV') || token === 'HYBRID') {
    return BatteryDriveProfile.HEV;
  }
  if (token.includes('ICE') || token.includes('COMBUSTION') || token === 'GASOLINE' || token === 'DIESEL') {
    return BatteryDriveProfile.ICE;
  }
  return null;
}

function hasPositiveCapacity(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function countTruthy(flags: Array<boolean | undefined>): number {
  return flags.filter((v) => v === true).length;
}

export function resolveFromVehicleMaster(
  input: VehicleMasterPowertrainInput | null | undefined,
): LayerResolution {
  if (!input) return UNKNOWN;

  if (input.confirmedDriveProfile && input.confirmedDriveProfile !== BatteryDriveProfile.UNKNOWN) {
    return {
      profile: input.confirmedDriveProfile,
      source: DriveProfileSource.VEHICLE_MASTER,
      confidence: DriveProfileConfidence.HIGH,
      telemetryFallback: false,
      evidence: ['master:confirmed_drive_profile'],
    };
  }

  const fromFuel = input.fuelType ? mapFuelTypeToProfile(input.fuelType) : null;
  if (!fromFuel) {
    return UNKNOWN;
  }

  return {
    profile: fromFuel,
    source: DriveProfileSource.VEHICLE_MASTER,
    confidence: DriveProfileConfidence.HIGH,
    telemetryFallback: false,
    evidence: [`master:fuel_type:${normalizeToken(input.fuelType)}`],
  };
}

export function resolveFromProvider(
  input: ProviderPowertrainInput | null | undefined,
): LayerResolution {
  if (!input) return UNKNOWN;

  const fromPowertrain = input.providerPowertrainType
    ? mapPowertrainTypeToProfile(input.providerPowertrainType)
    : null;
  const fromFuel = input.providerFuelType
    ? mapFuelTypeToProfile(input.providerFuelType)
    : null;

  if (fromPowertrain && fromFuel && fromPowertrain !== fromFuel) {
    return {
      profile: BatteryDriveProfile.UNKNOWN,
      source: DriveProfileSource.UNKNOWN,
      confidence: DriveProfileConfidence.LOW,
      telemetryFallback: false,
      evidence: [
        'provider:conflict_fuel_vs_powertrain',
        `provider_fuel:${normalizeToken(input.providerFuelType)}`,
        `provider_powertrain:${normalizeToken(input.providerPowertrainType)}`,
      ],
    };
  }

  const profile = fromPowertrain ?? fromFuel;
  if (!profile) {
    return UNKNOWN;
  }

  const evidence = [
    input.vin ? 'provider:vin_present' : null,
    fromPowertrain ? `provider:powertrain_type:${normalizeToken(input.providerPowertrainType)}` : null,
    fromFuel ? `provider:fuel_type:${normalizeToken(input.providerFuelType)}` : null,
  ].filter((e): e is string => e != null);

  return {
    profile,
    source: DriveProfileSource.PROVIDER_VIN,
    confidence: DriveProfileConfidence.HIGH,
    telemetryFallback: false,
    evidence: evidence.length > 0 ? evidence : ['provider:resolved'],
  };
}

export function resolveFromCanonicalSpec(
  input: CanonicalPowertrainSpecInput | null | undefined,
): LayerResolution {
  if (!input) return UNKNOWN;

  const hasHv =
    input.hvBatteryPresent === true || hasPositiveCapacity(input.hvBatteryCapacityKwh);
  const hasTank = hasPositiveCapacity(input.tankCapacityLiters);

  if (hasHv && hasTank) {
    return {
      profile: BatteryDriveProfile.PHEV,
      source: DriveProfileSource.CANONICAL_SPEC,
      confidence: DriveProfileConfidence.MEDIUM,
      telemetryFallback: false,
      evidence: ['canonical:hv_and_tank_capacity'],
    };
  }

  if (hasHv) {
    return {
      profile: BatteryDriveProfile.BEV,
      source: DriveProfileSource.CANONICAL_SPEC,
      confidence: DriveProfileConfidence.MEDIUM,
      telemetryFallback: false,
      evidence: ['canonical:hv_capacity_only'],
    };
  }

  if (hasTank) {
    return {
      profile: BatteryDriveProfile.ICE,
      source: DriveProfileSource.CANONICAL_SPEC,
      confidence: DriveProfileConfidence.MEDIUM,
      telemetryFallback: false,
      evidence: ['canonical:tank_capacity_only'],
    };
  }

  return UNKNOWN;
}

export function resolveFromTelemetryHeuristic(
  input: TelemetryPowertrainSignals | null | undefined,
): LayerResolution {
  if (!input) return UNKNOWN;

  const hvSignals = countTruthy([
    input.tractionBatterySoc,
    input.tractionBatteryEnergy,
    input.tractionBatteryCharging,
  ]);
  const iceSignals = countTruthy([
    input.combustionEngineRpm,
    input.combustionEngineEct,
    input.fuelLevel,
  ]);

  if (hvSignals < 2 && iceSignals < 2) {
    return {
      profile: BatteryDriveProfile.UNKNOWN,
      source: DriveProfileSource.UNKNOWN,
      confidence: DriveProfileConfidence.LOW,
      telemetryFallback: true,
      evidence: ['telemetry:insufficient_corroboration'],
    };
  }

  if (hvSignals >= 2 && iceSignals >= 2) {
    return {
      profile: BatteryDriveProfile.PHEV,
      source: DriveProfileSource.TELEMETRY_HEURISTIC,
      confidence: DriveProfileConfidence.LOW,
      telemetryFallback: true,
      evidence: ['telemetry:hv_and_ice_signal_groups'],
    };
  }

  if (hvSignals >= 2 && iceSignals === 0) {
    return {
      profile: BatteryDriveProfile.BEV,
      source: DriveProfileSource.TELEMETRY_HEURISTIC,
      confidence: DriveProfileConfidence.LOW,
      telemetryFallback: true,
      evidence: ['telemetry:hv_only_signal_groups'],
    };
  }

  if (iceSignals >= 2 && hvSignals === 0) {
    return {
      profile: BatteryDriveProfile.ICE,
      source: DriveProfileSource.TELEMETRY_HEURISTIC,
      confidence: DriveProfileConfidence.LOW,
      telemetryFallback: true,
      evidence: ['telemetry:ice_only_signal_groups'],
    };
  }

  if (hvSignals >= 2 && iceSignals === 1) {
    return {
      profile: BatteryDriveProfile.HEV,
      source: DriveProfileSource.TELEMETRY_HEURISTIC,
      confidence: DriveProfileConfidence.LOW,
      telemetryFallback: true,
      evidence: ['telemetry:hv_dominant_single_ice_hint'],
    };
  }

  return {
    profile: BatteryDriveProfile.UNKNOWN,
    source: DriveProfileSource.UNKNOWN,
    confidence: DriveProfileConfidence.LOW,
    telemetryFallback: true,
    evidence: ['telemetry:ambiguous_signal_mix'],
  };
}

function isDecisive(layer: LayerResolution): boolean {
  return layer.profile !== BatteryDriveProfile.UNKNOWN;
}

function profilesConflict(a: DriveProfile, b: DriveProfile): boolean {
  return a !== BatteryDriveProfile.UNKNOWN && b !== BatteryDriveProfile.UNKNOWN && a !== b;
}

/**
 * Central drive-profile resolver — pure, tenant-independent domain function.
 *
 * Priority: vehicle master → provider/VIN → canonical spec → telemetry heuristic.
 */
export function resolveDriveProfile(input: DriveProfileResolverInput): ResolvedDriveProfile {
  const master = resolveFromVehicleMaster(input.master);
  const provider = resolveFromProvider(input.provider);
  const canonical = resolveFromCanonicalSpec(input.canonicalSpec);
  const telemetry = resolveFromTelemetryHeuristic(input.telemetry);

  if (
    isDecisive(master) &&
    isDecisive(provider) &&
    profilesConflict(master.profile, provider.profile)
  ) {
    return {
      profile: BatteryDriveProfile.UNKNOWN,
      source: DriveProfileSource.UNKNOWN,
      confidence: DriveProfileConfidence.LOW,
      telemetryFallback: false,
      evidence: [
        'conflict:master_vs_provider',
        ...master.evidence,
        ...provider.evidence,
      ],
    };
  }

  if (isDecisive(master)) {
    return master;
  }

  if (isDecisive(provider)) {
    return provider;
  }

  if (
    isDecisive(canonical) &&
    isDecisive(provider) &&
    profilesConflict(canonical.profile, provider.profile)
  ) {
    return {
      profile: BatteryDriveProfile.UNKNOWN,
      source: DriveProfileSource.UNKNOWN,
      confidence: DriveProfileConfidence.LOW,
      telemetryFallback: false,
      evidence: [
        'conflict:canonical_vs_provider',
        ...canonical.evidence,
        ...provider.evidence,
      ],
    };
  }

  if (isDecisive(canonical)) {
    return canonical;
  }

  if (isDecisive(telemetry)) {
    return telemetry;
  }

  return {
    profile: BatteryDriveProfile.UNKNOWN,
    source: DriveProfileSource.UNKNOWN,
    confidence: DriveProfileConfidence.LOW,
    telemetryFallback: false,
    evidence: ['unresolved'],
  };
}

/** Whether LV REST/crank measurement paths apply for this profile. */
export function isLvRestMeasurementSupported(profile: DriveProfile): boolean {
  return profile === BatteryDriveProfile.ICE || profile === BatteryDriveProfile.HEV || profile === BatteryDriveProfile.PHEV;
}

/** Whether HV traction-battery measurement paths apply. */
export function isHvMeasurementSupported(profile: DriveProfile): boolean {
  return (
    profile === BatteryDriveProfile.BEV ||
    profile === BatteryDriveProfile.PHEV ||
    profile === BatteryDriveProfile.HEV
  );
}

const BEV_ALLOWED_LV_MEASUREMENT_TYPES = new Set<BatteryMeasurementType>([
  BatteryMeasurementType.LIVE_VOLTAGE,
  BatteryMeasurementType.LIVE_LOADED_VOLTAGE,
]);

function isLvMeasurementType(type: BatteryMeasurementType): boolean {
  switch (type) {
    case BatteryMeasurementType.LIVE_HV_SOC:
    case BatteryMeasurementType.LIVE_HV_RANGE:
    case BatteryMeasurementType.LIVE_HV_CURRENT_ENERGY:
    case BatteryMeasurementType.LIVE_HV_CHARGING_POWER:
    case BatteryMeasurementType.PROVIDER_HV_SOH:
    case BatteryMeasurementType.WORKSHOP_HV_SOH:
    case BatteryMeasurementType.DOCUMENT_HV_SOH:
    case BatteryMeasurementType.CHARGE_SESSION_CAPACITY:
    case BatteryMeasurementType.DISCHARGE_SESSION_CAPACITY:
      return false;
    default:
      return true;
  }
}

/**
 * Downgrades LV REST/crank measurements for BEV to UNSUPPORTED_PROFILE.
 * Live LV reads remain allowed; MISSED/PROVIDER_ERROR pass through unchanged.
 */
export function guardLvMeasurementQualityForProfile(input: {
  profile: DriveProfile;
  measurementType: BatteryMeasurementType;
  quality: BatteryMeasurementQuality;
}): BatteryMeasurementQuality {
  if (!isLvMeasurementType(input.measurementType)) {
    return input.quality;
  }
  if (input.profile !== BatteryDriveProfile.BEV) {
    return input.quality;
  }
  if (BEV_ALLOWED_LV_MEASUREMENT_TYPES.has(input.measurementType)) {
    return input.quality;
  }
  if (
    input.quality === BatteryMeasurementQuality.MISSED ||
    input.quality === BatteryMeasurementQuality.PROVIDER_ERROR
  ) {
    return input.quality;
  }
  return BatteryMeasurementQuality.UNSUPPORTED_PROFILE;
}
