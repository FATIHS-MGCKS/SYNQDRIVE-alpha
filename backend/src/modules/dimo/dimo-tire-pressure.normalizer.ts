/**
 * DIMO tire pressure normalization at the provider boundary.
 *
 * Official DIMO signal semantics (verified audit 2026-07):
 *   chassisAxleRow1WheelLeftTirePressure  → FL, kPa
 *   chassisAxleRow1WheelRightTirePressure → FR, kPa
 *   chassisAxleRow2WheelLeftTirePressure  → RL, kPa
 *   chassisAxleRow2WheelRightTirePressure → RR, kPa
 *
 * SynqDrive canonical internal unit: bar (divide DIMO kPa by 100 exactly once).
 */

export const TIRE_PRESSURE_UNIT_BAR = 'BAR' as const;
export const TIRE_PRESSURE_UNIT_KPA = 'KPA' as const;
export const TIRE_PRESSURE_PROVIDER_DIMO = 'DIMO' as const;
export const TIRE_PRESSURE_PROVIDER_HIGH_MOBILITY = 'HIGH_MOBILITY' as const;

export type TirePressureNormalizedUnit = typeof TIRE_PRESSURE_UNIT_BAR;
export type TirePressureSourceUnit =
  | typeof TIRE_PRESSURE_UNIT_KPA
  | typeof TIRE_PRESSURE_UNIT_BAR;
export type TirePressureSourceProvider =
  | typeof TIRE_PRESSURE_PROVIDER_DIMO
  | typeof TIRE_PRESSURE_PROVIDER_HIGH_MOBILITY;

export type DimoTirePressurePlausibility =
  | 'valid'
  | 'missing'
  | 'zero'
  | 'negative'
  | 'too_low'
  | 'too_high'
  | 'non_finite';

export interface CanonicalTirePressureReading {
  normalizedValue: number | null;
  normalizedUnit: TirePressureNormalizedUnit;
  sourceValue: number | null;
  sourceUnit: TirePressureSourceUnit;
  sourceProvider: TirePressureSourceProvider;
  sourceTimestamp: Date | null;
  plausibility: DimoTirePressurePlausibility;
}

/** Plausibility band for canonical bar values (passenger / light commercial). */
export const TIRE_PRESSURE_PLAUSIBLE_BAR_MIN = 0.5;
export const TIRE_PRESSURE_PLAUSIBLE_BAR_MAX = 6.0;

/**
 * Legacy DIMO rows stored raw kPa in bar columns before Prompt 16.
 * Detection is provider-scoped (DIMO only) — never a global value heuristic.
 */
export const LEGACY_DIMO_KPA_STORED_MIN = 50;
export const LEGACY_DIMO_KPA_STORED_MAX = 650;

export const DIMO_TIRE_PRESSURE_SIGNALS = {
  fl: 'chassisAxleRow1WheelLeftTirePressure',
  fr: 'chassisAxleRow1WheelRightTirePressure',
  rl: 'chassisAxleRow2WheelLeftTirePressure',
  rr: 'chassisAxleRow2WheelRightTirePressure',
} as const;

export type DimoTirePressureWheel = keyof typeof DIMO_TIRE_PRESSURE_SIGNALS;

export function kPaToBar(kpa: number): number {
  return kpa / 100;
}

export function assessTirePressurePlausibility(
  bar: number | null,
): DimoTirePressurePlausibility {
  if (bar == null) return 'missing';
  if (!Number.isFinite(bar)) return 'non_finite';
  if (bar === 0) return 'zero';
  if (bar < 0) return 'negative';
  if (bar < TIRE_PRESSURE_PLAUSIBLE_BAR_MIN) return 'too_low';
  if (bar > TIRE_PRESSURE_PLAUSIBLE_BAR_MAX) return 'too_high';
  return 'valid';
}

export function isPlausibleTirePressure(
  plausibility: DimoTirePressurePlausibility,
): boolean {
  return plausibility === 'valid';
}

function parseSignalTimestamp(
  timestamp: number | string | null | undefined,
): Date | null {
  if (timestamp == null) return null;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Normalize a single DIMO tire-pressure signal (kPa) to canonical bar.
 * Implausible values return normalizedValue=null so wear factors ignore them.
 */
export function normalizeDimoTirePressureKpa(
  sourceValue: number | null | undefined,
  sourceTimestamp: Date | null = null,
): CanonicalTirePressureReading {
  if (sourceValue == null || !Number.isFinite(sourceValue)) {
    return {
      normalizedValue: null,
      normalizedUnit: TIRE_PRESSURE_UNIT_BAR,
      sourceValue: null,
      sourceUnit: TIRE_PRESSURE_UNIT_KPA,
      sourceProvider: TIRE_PRESSURE_PROVIDER_DIMO,
      sourceTimestamp,
      plausibility: 'missing',
    };
  }

  const normalizedValue = kPaToBar(sourceValue);
  const plausibility = assessTirePressurePlausibility(normalizedValue);

  return {
    normalizedValue: isPlausibleTirePressure(plausibility)
      ? normalizedValue
      : null,
    normalizedUnit: TIRE_PRESSURE_UNIT_BAR,
    sourceValue,
    sourceUnit: TIRE_PRESSURE_UNIT_KPA,
    sourceProvider: TIRE_PRESSURE_PROVIDER_DIMO,
    sourceTimestamp,
    plausibility,
  };
}

/** Normalize a DIMO GraphQL SignalFloat field `{ timestamp, value }`. */
export function normalizeDimoTirePressureSignalField(
  signal: { value?: number; timestamp?: number | string } | null | undefined,
): CanonicalTirePressureReading {
  const value =
    signal != null && typeof signal === 'object' && typeof signal.value === 'number'
      ? signal.value
      : null;
  return normalizeDimoTirePressureKpa(
    value,
    parseSignalTimestamp(signal?.timestamp),
  );
}

export interface SynqDriveTirePressureMeta {
  normalizedValue: number | null;
  normalizedUnit: TirePressureNormalizedUnit;
  sourceValue: number | null;
  sourceUnit: TirePressureSourceUnit;
  sourceProvider: TirePressureSourceProvider;
  sourceTimestamp: string | null;
  plausibility: DimoTirePressurePlausibility;
}

export function toSynqDriveTirePressureMeta(
  reading: CanonicalTirePressureReading,
): SynqDriveTirePressureMeta {
  return {
    normalizedValue: reading.normalizedValue,
    normalizedUnit: reading.normalizedUnit,
    sourceValue: reading.sourceValue,
    sourceUnit: reading.sourceUnit,
    sourceProvider: reading.sourceProvider,
    sourceTimestamp: reading.sourceTimestamp?.toISOString() ?? null,
    plausibility: reading.plausibility,
  };
}

export interface DimoSnapshotTirePressureNormalization {
  fl: CanonicalTirePressureReading;
  fr: CanonicalTirePressureReading;
  rl: CanonicalTirePressureReading;
  rr: CanonicalTirePressureReading;
}

/** Normalize all four DIMO tire-pressure signals from a signalsLatest object. */
export function normalizeDimoSnapshotTirePressures(
  signals: Record<string, unknown>,
): DimoSnapshotTirePressureNormalization {
  return {
    fl: normalizeDimoTirePressureSignalField(
      signals[DIMO_TIRE_PRESSURE_SIGNALS.fl] as
        | { value?: number; timestamp?: number | string }
        | undefined,
    ),
    fr: normalizeDimoTirePressureSignalField(
      signals[DIMO_TIRE_PRESSURE_SIGNALS.fr] as
        | { value?: number; timestamp?: number | string }
        | undefined,
    ),
    rl: normalizeDimoTirePressureSignalField(
      signals[DIMO_TIRE_PRESSURE_SIGNALS.rl] as
        | { value?: number; timestamp?: number | string }
        | undefined,
    ),
    rr: normalizeDimoTirePressureSignalField(
      signals[DIMO_TIRE_PRESSURE_SIGNALS.rr] as
        | { value?: number; timestamp?: number | string }
        | undefined,
    ),
  };
}
