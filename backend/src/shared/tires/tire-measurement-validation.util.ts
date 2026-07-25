/**
 * Central tire tread measurement validation — all values in mm.
 * Used by operator capture and canonical TireLifecycleService.
 */

export const TIRE_TREAD_MIN_MM = 0;
export const TIRE_TREAD_MAX_MM = 20;
export const TIRE_LEGAL_MIN_MM = 1.6;
export const TIRE_WARN_LOW_MM = 2.5;
export const TIRE_WARN_HIGH_MM = 10;
export const TIRE_AXLE_DIFF_WARN_MM = 2;
export const TIRE_ODOMETER_MAX_KM = 5_000_000;

export type TireWheelPosition = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';

export const TIRE_WHEEL_POSITION_LABELS: Record<TireWheelPosition, string> = {
  frontLeft: 'Vorne links',
  frontRight: 'Vorne rechts',
  rearLeft: 'Hinten links',
  rearRight: 'Hinten rechts',
};

export interface TireTreadValuesMm {
  frontLeftMm?: number | null;
  frontRightMm?: number | null;
  rearLeftMm?: number | null;
  rearRightMm?: number | null;
}

export interface TireMeasurementValidationOptions {
  tireSeason?: string | null;
}

export interface TireMeasurementValidationResult {
  values: TireTreadValuesMm;
  errors: string[];
  warnings: string[];
}

/** Locale-safe decimal parse (comma or dot). */
export function parseLocaleDecimalMm(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

function roundTreadMm(value: number): number {
  return Math.round(value * 10) / 10;
}

function seasonBandLabel(tireSeason?: string | null): string {
  const s = (tireSeason ?? '').toUpperCase();
  if (s === 'WINTER') return 'Winterreifen';
  if (s === 'SUMMER') return 'Sommerreifen';
  if (s === 'ALL_SEASON') return 'Ganzjahresreifen';
  return 'Reifen';
}

export function validateTireTreadMeasurementMm(
  input: TireTreadValuesMm,
  options: TireMeasurementValidationOptions = {},
): TireMeasurementValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const values: TireTreadValuesMm = {};

  const entries: { pos: TireWheelPosition; key: keyof TireTreadValuesMm }[] = [
    { pos: 'frontLeft', key: 'frontLeftMm' },
    { pos: 'frontRight', key: 'frontRightMm' },
    { pos: 'rearLeft', key: 'rearLeftMm' },
    { pos: 'rearRight', key: 'rearRightMm' },
  ];

  let count = 0;
  for (const { pos, key } of entries) {
    const raw = input[key];
    if (raw == null || raw === undefined) continue;
    count += 1;
    const label = TIRE_WHEEL_POSITION_LABELS[pos];

    if (raw < TIRE_TREAD_MIN_MM) {
      errors.push(`${label}: Negativer Wert ist nicht erlaubt.`);
      continue;
    }
    if (raw > TIRE_TREAD_MAX_MM) {
      errors.push(
        `${label}: ${raw} mm überschreitet den zulässigen Bereich (0–${TIRE_TREAD_MAX_MM} mm).`,
      );
      continue;
    }

    const mm = roundTreadMm(raw);
    values[key] = mm;

    if (mm <= TIRE_LEGAL_MIN_MM) {
      warnings.push(
        `${label}: ${mm} mm — nahe oder unter gesetzlicher Mindestprofiltiefe (${TIRE_LEGAL_MIN_MM} mm).`,
      );
    } else if (mm <= TIRE_WARN_LOW_MM) {
      warnings.push(`${label}: ${mm} mm — Profil sehr niedrig (${seasonBandLabel(options.tireSeason)}).`);
    } else if (mm >= TIRE_WARN_HIGH_MM) {
      warnings.push(`${label}: ${mm} mm — ungewöhnlich hoch, bitte prüfen.`);
    }
  }

  if (count === 0) {
    errors.push('Mindestens eine Radposition (Vorne links/rechts, Hinten links/rechts) erforderlich.');
  }

  const fl = values.frontLeftMm ?? null;
  const fr = values.frontRightMm ?? null;
  const rl = values.rearLeftMm ?? null;
  const rr = values.rearRightMm ?? null;

  if (fl != null && fr != null) {
    const diff = Math.abs(fl - fr);
    if (diff >= TIRE_AXLE_DIFF_WARN_MM) {
      warnings.push(
        `Vorderachse: Unterschied links/rechts auffällig (${diff.toFixed(1)} mm).`,
      );
    }
  }
  if (rl != null && rr != null) {
    const diff = Math.abs(rl - rr);
    if (diff >= TIRE_AXLE_DIFF_WARN_MM) {
      warnings.push(
        `Hinterachse: Unterschied links/rechts auffällig (${diff.toFixed(1)} mm).`,
      );
    }
  }

  return { values, errors, warnings };
}

export function validateOdometerKm(value: number | undefined | null): string | null {
  if (value == null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) {
    return 'Kilometerstand muss eine nicht-negative Zahl sein.';
  }
  if (value > TIRE_ODOMETER_MAX_KM) {
    return `Kilometerstand über ${TIRE_ODOMETER_MAX_KM.toLocaleString('de-DE')} km ist nicht plausibel.`;
  }
  return null;
}

export function validateMeasuredAt(value: Date | string | undefined | null): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return 'Messzeitpunkt ist ungültig.';
  if (d.getTime() > Date.now() + 60_000) {
    return 'Messzeitpunkt darf nicht in der Zukunft liegen.';
  }
  return null;
}
