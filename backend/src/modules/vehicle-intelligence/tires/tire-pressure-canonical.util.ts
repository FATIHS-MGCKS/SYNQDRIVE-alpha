/**
 * Read-path canonical tire pressure resolution.
 *
 * New DIMO ingest stores bar. Legacy DIMO rows may still hold raw kPa — convert
 * only when providerSource is DIMO and the stored magnitude matches the known
 * legacy kPa band (provider-scoped, not a global heuristic).
 *
 * High Mobility values are passed through as bar without conversion here; HM
 * normalization remains in high-mobility-mqtt-payload.util.ts at ingest.
 */

import {
  assessTirePressurePlausibility,
  isPlausibleTirePressure,
  kPaToBar,
  LEGACY_DIMO_KPA_STORED_MAX,
  LEGACY_DIMO_KPA_STORED_MIN,
  TIRE_PRESSURE_PROVIDER_DIMO,
  TIRE_PRESSURE_PROVIDER_HIGH_MOBILITY,
  TIRE_PRESSURE_UNIT_BAR,
  TIRE_PRESSURE_UNIT_KPA,
  type CanonicalTirePressureReading,
  type TirePressureSourceProvider,
} from '@modules/dimo/dimo-tire-pressure.normalizer';

export function isLegacyDimoKpaStoredValue(
  providerSource: string | null | undefined,
  storedValue: number,
): boolean {
  if (providerSource?.trim().toUpperCase() !== TIRE_PRESSURE_PROVIDER_DIMO) {
    return false;
  }
  return (
    Number.isFinite(storedValue) &&
    storedValue >= LEGACY_DIMO_KPA_STORED_MIN &&
    storedValue <= LEGACY_DIMO_KPA_STORED_MAX
  );
}

function resolveProvider(
  providerSource: string | null | undefined,
): TirePressureSourceProvider {
  const normalized = providerSource?.trim().toUpperCase();
  if (normalized === TIRE_PRESSURE_PROVIDER_HIGH_MOBILITY) {
    return TIRE_PRESSURE_PROVIDER_HIGH_MOBILITY;
  }
  return TIRE_PRESSURE_PROVIDER_DIMO;
}

/**
 * Resolve a stored vehicle_latest_states pressure column to canonical bar.
 */
export function resolveCanonicalTirePressureBar(
  storedValue: number | null | undefined,
  providerSource: string | null | undefined,
  sourceTimestamp: Date | null = null,
): CanonicalTirePressureReading {
  const sourceProvider = resolveProvider(providerSource);

  if (storedValue == null || !Number.isFinite(storedValue)) {
    return {
      normalizedValue: null,
      normalizedUnit: TIRE_PRESSURE_UNIT_BAR,
      sourceValue: null,
      sourceUnit: TIRE_PRESSURE_UNIT_BAR,
      sourceProvider,
      sourceTimestamp,
      plausibility: 'missing',
    };
  }

  if (isLegacyDimoKpaStoredValue(providerSource, storedValue)) {
    const normalizedValue = kPaToBar(storedValue);
    const plausibility = assessTirePressurePlausibility(normalizedValue);
    return {
      normalizedValue: isPlausibleTirePressure(plausibility)
        ? normalizedValue
        : null,
      normalizedUnit: TIRE_PRESSURE_UNIT_BAR,
      sourceValue: storedValue,
      sourceUnit: TIRE_PRESSURE_UNIT_KPA,
      sourceProvider: TIRE_PRESSURE_PROVIDER_DIMO,
      sourceTimestamp,
      plausibility,
    };
  }

  const plausibility = assessTirePressurePlausibility(storedValue);
  return {
    normalizedValue: isPlausibleTirePressure(plausibility) ? storedValue : null,
    normalizedUnit: TIRE_PRESSURE_UNIT_BAR,
    sourceValue: storedValue,
    sourceUnit: TIRE_PRESSURE_UNIT_BAR,
    sourceProvider,
    sourceTimestamp,
    plausibility,
  };
}

export interface CanonicalVehicleTirePressures {
  tirePressureFl: number | null;
  tirePressureFr: number | null;
  tirePressureRl: number | null;
  tirePressureRr: number | null;
}

export function resolveCanonicalVehicleTirePressuresBar(input: {
  providerSource?: string | null;
  tirePressureFl?: number | null;
  tirePressureFr?: number | null;
  tirePressureRl?: number | null;
  tirePressureRr?: number | null;
  sourceTimestamp?: Date | null;
}): CanonicalVehicleTirePressures {
  const ts = input.sourceTimestamp ?? null;
  const provider = input.providerSource ?? null;
  return {
    tirePressureFl: resolveCanonicalTirePressureBar(
      input.tirePressureFl,
      provider,
      ts,
    ).normalizedValue,
    tirePressureFr: resolveCanonicalTirePressureBar(
      input.tirePressureFr,
      provider,
      ts,
    ).normalizedValue,
    tirePressureRl: resolveCanonicalTirePressureBar(
      input.tirePressureRl,
      provider,
      ts,
    ).normalizedValue,
    tirePressureRr: resolveCanonicalTirePressureBar(
      input.tirePressureRr,
      provider,
      ts,
    ).normalizedValue,
  };
}
