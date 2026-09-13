import { FuelType } from '@prisma/client';
import type { RawFuelCapability, RawFuelCapabilityInput } from './raw-fuel-refuel-fallback.types';

const FUEL_CAPABLE_FUEL_TYPES: ReadonlySet<FuelType> = new Set([
  FuelType.GASOLINE,
  FuelType.DIESEL,
  FuelType.HYBRID,
  FuelType.PLUGIN_HYBRID,
]);

type PowertrainClass = 'BEV' | 'FUEL_CAPABLE' | 'UNKNOWN';

function normalizePowertrainToken(value: string | null | undefined): PowertrainClass {
  if (value == null || value.trim() === '') return 'UNKNOWN';
  const token = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (['BEV', 'EV', 'ELECTRIC', 'BATTERY_ELECTRIC'].includes(token)) return 'BEV';
  if (
    ['ICE', 'GAS', 'GASOLINE', 'DIESEL', 'HEV', 'HYBRID', 'PHEV', 'PLUGIN_HYBRID', 'MHEV'].includes(
      token,
    )
  ) {
    return 'FUEL_CAPABLE';
  }
  return 'UNKNOWN';
}

function classifyFuelType(fuelType: FuelType | null | undefined): RawFuelCapability {
  if (fuelType == null) return 'UNKNOWN';
  if (fuelType === FuelType.ELECTRIC) return 'NON_FUEL_CAPABLE';
  if (FUEL_CAPABLE_FUEL_TYPES.has(fuelType)) return 'FUEL_CAPABLE';
  if (fuelType === FuelType.OTHER) return 'UNKNOWN';
  return 'UNKNOWN';
}

function hasContradictoryPowertrainMetadata(
  fuelCapability: RawFuelCapability,
  dimoPowertrainType: string | null | undefined,
  dimoFuelType: string | null | undefined,
): boolean {
  const powertrainClass = normalizePowertrainToken(dimoPowertrainType);
  const dimoFuelClass = normalizePowertrainToken(dimoFuelType);

  if (fuelCapability === 'NON_FUEL_CAPABLE') {
    return powertrainClass === 'FUEL_CAPABLE' || dimoFuelClass === 'FUEL_CAPABLE';
  }
  if (fuelCapability === 'FUEL_CAPABLE') {
    return powertrainClass === 'BEV' || dimoFuelClass === 'BEV';
  }
  return false;
}

/**
 * Answers whether the vehicle class may legitimately have fuel telemetry.
 * Does not infer from sample presence, DIMO segments, or fleet identifiers.
 */
export function resolveRawFuelCapability(input: RawFuelCapabilityInput): RawFuelCapability {
  const fromFuelType = classifyFuelType(input.fuelType);
  if (fromFuelType === 'UNKNOWN') return 'UNKNOWN';

  if (
    hasContradictoryPowertrainMetadata(
      fromFuelType,
      input.dimoPowertrainType,
      input.dimoFuelType,
    )
  ) {
    return 'UNKNOWN';
  }

  return fromFuelType;
}

/** Exhaustive matrix helper for tests — all repository FuelType enum values. */
export const ALL_FUEL_TYPE_ENUM_VALUES: FuelType[] = Object.values(FuelType);
