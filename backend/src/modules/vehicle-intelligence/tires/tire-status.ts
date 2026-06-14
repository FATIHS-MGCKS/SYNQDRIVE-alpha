/**
 * Tire status classification — the single rule set shared by every consumer
 * (TireHealthService read model, TireCriticalDetector, Rental Health, …).
 *
 * These are pure functions with no I/O so there is exactly ONE definition of
 * the tread-status bands, the season logic, the confidence levels and the
 * aggregation order. Nothing else in the codebase is allowed to invent its own
 * tire thresholds — it must call into here (mirrors `battery-status.ts`).
 *
 * Honesty principle:
 *   · A measurement is truth; a projection is an estimate. The display mode and
 *     confidence below make that distinction explicit and never pretend an
 *     estimate is a measurement.
 *   · Tread STATUS is road-safety driven (mm bands, legal minimum = CRITICAL),
 *     decoupled from the wear MODEL thresholds used for remaining-km math.
 */

import { TIRE_HEALTH_CONFIG } from './tire-health.config';

const cfg = TIRE_HEALTH_CONFIG;

export type TireStatus = 'GOOD' | 'WATCH' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
export type TireDisplayMode = 'MEASURED' | 'ESTIMATED' | 'UNKNOWN';
export type TireConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

/** Canonical tire alert taxonomy (stable codes consumers can switch on). */
export type TireAlertCode =
  | 'TIRE_TREAD_CRITICAL'
  | 'TIRE_TREAD_LOW'
  | 'TIRE_PRESSURE_LOW'
  | 'TIRE_PRESSURE_HIGH'
  | 'TIRE_SEASON_MISMATCH'
  | 'TIRE_AGE_WARNING'
  | 'TIRE_MEASUREMENT_OVERDUE'
  | 'TIRE_WEAR_UNEVEN'
  | 'TIRE_ROTATION_RECOMMENDED'
  | 'TIRE_REMAINING_KM_CRITICAL'
  | 'TIRE_REMAINING_KM_LOW'
  | 'TIRE_LOW_CONFIDENCE'
  | 'TIRE_USED_NO_MEASUREMENT'
  | 'TIRE_GENERIC';

const STATUS_RANK: Record<TireStatus, number> = {
  GOOD: 1,
  WATCH: 2,
  WARNING: 3,
  CRITICAL: 4,
  UNKNOWN: 0,
};

/**
 * Lowest-tread → status, season aware. Legal minimum (1.6 mm) is always
 * CRITICAL. Summer/All-Season use the 4.0/3.0 bands, Winter the stricter
 * 5.0/4.0 bands.
 */
export function classifyTreadStatus(
  lowestTreadMm: number | null | undefined,
  tireSeason: string | null | undefined,
): TireStatus {
  if (lowestTreadMm == null || !Number.isFinite(lowestTreadMm)) return 'UNKNOWN';
  const legal = cfg.legalMinTreadMm;
  if (lowestTreadMm <= legal) return 'CRITICAL';
  const band = cfg.treadStatusBands[tireSeason ?? 'ALL_SEASON'] ?? cfg.defaultTreadStatusBand;
  if (lowestTreadMm > band.good) return 'GOOD';
  if (lowestTreadMm > band.watch) return 'WATCH';
  return 'WARNING';
}

/** Tread band edges for a season (UI labelling / explainability). */
export function treadBandForSeason(tireSeason: string | null | undefined): {
  good: number;
  watch: number;
  legal: number;
} {
  const band = cfg.treadStatusBands[tireSeason ?? 'ALL_SEASON'] ?? cfg.defaultTreadStatusBand;
  return { good: band.good, watch: band.watch, legal: cfg.legalMinTreadMm };
}

/**
 * Remaining-km → status. Mirrors the model's alert thresholds so the overall
 * status reflects an imminent replacement even when the current tread band is
 * still WATCH.
 */
export function classifyRemainingKmStatus(remainingKm: number | null | undefined): TireStatus {
  if (remainingKm == null || !Number.isFinite(remainingKm)) return 'UNKNOWN';
  if (remainingKm <= cfg.alerts.criticalRemainingKm) return 'CRITICAL';
  if (remainingKm <= cfg.alerts.lowRemainingKm) return 'WARNING';
  return 'GOOD';
}

/**
 * Uneven-wear status from side (left/right) and axle (front/rear) deltas (mm).
 *   · side delta >= critical (1.0)        → WARNING (suspension/alignment)
 *   · side delta >= attention (0.6)        → WATCH
 *   · axle delta >= rotation delta (1.2)   → WATCH (rotation advisable)
 */
export function classifyUnevenWear(
  sideDeltaFrontMm: number | null | undefined,
  sideDeltaRearMm: number | null | undefined,
  axleDeltaMm: number | null | undefined,
): TireStatus {
  const side = Math.max(
    Number.isFinite(sideDeltaFrontMm as number) ? (sideDeltaFrontMm as number) : 0,
    Number.isFinite(sideDeltaRearMm as number) ? (sideDeltaRearMm as number) : 0,
  );
  const axle = Number.isFinite(axleDeltaMm as number) ? (axleDeltaMm as number) : 0;
  if (side >= cfg.alerts.unevenWearCriticalMm) return 'WARNING';
  if (side >= cfg.alerts.unevenWearAttentionMm) return 'WATCH';
  if (axle >= cfg.alerts.frontRearRotationDeltaMm) return 'WATCH';
  return 'GOOD';
}

export interface SeasonStatusResult {
  status: TireStatus;
  mismatch: boolean;
  /** Season currently expected on the road, given the month. */
  expectedSeason: 'WINTER' | 'SUMMER' | 'TRANSITION';
}

/**
 * Month-based season suitability. Summer tires in winter are unsafe (WARNING);
 * winter tires in summer wear faster (WATCH). All-Season is always neutral.
 * Encapsulated so weather/temperature can later replace the month windows.
 */
export function classifySeasonStatus(
  tireSeason: string | null | undefined,
  date: Date = new Date(),
): SeasonStatusResult {
  const month = date.getMonth() + 1; // 1-based
  const isWinterMonth = (cfg.seasonCalendar.winterMonths as readonly number[]).includes(month);
  const isSummerMonth = (cfg.seasonCalendar.summerMonths as readonly number[]).includes(month);
  const expectedSeason = isWinterMonth ? 'WINTER' : isSummerMonth ? 'SUMMER' : 'TRANSITION';

  const season = (tireSeason ?? '').toUpperCase();
  if (season === 'ALL_SEASON') return { status: 'GOOD', mismatch: false, expectedSeason };
  if (season === 'SUMMER' && isWinterMonth) {
    return { status: 'WARNING', mismatch: true, expectedSeason };
  }
  if (season === 'WINTER' && isSummerMonth) {
    return { status: 'WATCH', mismatch: true, expectedSeason };
  }
  if (season === 'SUMMER' || season === 'WINTER' || season === 'TRACK') {
    return { status: 'GOOD', mismatch: false, expectedSeason };
  }
  return { status: 'UNKNOWN', mismatch: false, expectedSeason };
}

/**
 * Confidence LEVEL (HIGH/MEDIUM/LOW/UNKNOWN). A real measurement that is recent
 * (and few km ago) → HIGH; older but plausible → MEDIUM; no recent measurement
 * (pure estimate) → LOW; nothing usable → UNKNOWN.
 */
export function classifyConfidenceLevel(args: {
  hasMeasurement: boolean;
  measurementAgeDays: number | null;
  kmSinceMeasurement: number | null;
  hasWearBaseline: boolean;
}): TireConfidenceLevel {
  const { hasMeasurement, measurementAgeDays, kmSinceMeasurement, hasWearBaseline } = args;
  if (!hasMeasurement) {
    return hasWearBaseline ? 'LOW' : 'UNKNOWN';
  }
  const c = cfg.confidenceLevels;
  const ageOk = measurementAgeDays == null || measurementAgeDays <= c.highMaxMeasurementAgeDays;
  const kmOk = kmSinceMeasurement == null || kmSinceMeasurement <= c.highMaxKmSinceMeasurement;
  if (ageOk && kmOk) return 'HIGH';
  const ageMed = measurementAgeDays == null || measurementAgeDays <= c.mediumMaxMeasurementAgeDays;
  const kmMed = kmSinceMeasurement == null || kmSinceMeasurement <= c.mediumMaxKmSinceMeasurement;
  if (ageMed && kmMed) return 'MEDIUM';
  return 'LOW';
}

/** Translate the internal measurement state into the public display mode. */
export function resolveDisplayMode(
  measurementState: 'measured' | 'estimated' | 'mixed' | null | undefined,
  hasWearBaseline: boolean,
): TireDisplayMode {
  if (measurementState === 'measured') return 'MEASURED';
  if (!hasWearBaseline) return 'UNKNOWN';
  return 'ESTIMATED';
}

/**
 * Measurement age status. Overdue (no measurement in N days) is a WARNING; a
 * very stale one is escalated by the caller. UNKNOWN when never measured.
 */
export function classifyMeasurementOverdue(measurementAgeDays: number | null): boolean {
  if (measurementAgeDays == null) return false;
  return measurementAgeDays >= cfg.measurementFreshness.overdueDays;
}

/** Tire age (years) → status from DOT. >=10y CRITICAL hint, >=6y WARNING hint. */
export function classifyTireAgeYears(ageYears: number | null | undefined): TireStatus {
  if (ageYears == null || !Number.isFinite(ageYears)) return 'UNKNOWN';
  if (ageYears >= cfg.tireAge.criticalYears) return 'WARNING';
  if (ageYears >= cfg.tireAge.warnYears) return 'WATCH';
  return 'GOOD';
}

/**
 * Parse a 4-digit DOT week/year suffix (e.g. "1219" → week 12 / 2019) into an
 * age in years relative to `now`. Returns null when the code is not parseable.
 */
export function dotAgeYears(dotCode: string | null | undefined, now: Date = new Date()): number | null {
  if (!dotCode) return null;
  const digits = String(dotCode).replace(/[^0-9]/g, '');
  // Take the trailing 4 digits (the WWYY production stamp).
  const stamp = digits.slice(-4);
  if (stamp.length !== 4) return null;
  const week = parseInt(stamp.slice(0, 2), 10);
  const yy = parseInt(stamp.slice(2, 4), 10);
  if (!Number.isFinite(week) || week < 1 || week > 53) return null;
  if (!Number.isFinite(yy)) return null;
  // Two-digit year → assume 2000-2099 window (tires older than ~26 years are
  // long out of service; ambiguity is acceptable for an advisory hint).
  const year = 2000 + yy;
  const produced = new Date(year, 0, 1 + (week - 1) * 7);
  const ageMs = now.getTime() - produced.getTime();
  if (ageMs < 0) return null;
  return ageMs / (365.25 * 24 * 60 * 60 * 1000);
}

/**
 * Aggregate the available tire signals into one status.
 *   · CRITICAL always wins
 *   · WARNING beats WATCH, WATCH beats GOOD
 *   · UNKNOWN signals are ignored
 *   · result is UNKNOWN only when no usable signal exists at all
 */
export function aggregateTireStatus(
  ...statuses: Array<TireStatus | null | undefined>
): TireStatus {
  let worst: TireStatus | null = null;
  for (const s of statuses) {
    if (s == null || s === 'UNKNOWN') continue;
    if (worst == null || STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  }
  return worst ?? 'UNKNOWN';
}

/** True when the status warrants a vehicle alert (WATCH never alerts). */
export function isAlertableStatus(status: TireStatus): boolean {
  return status === 'WARNING' || status === 'CRITICAL';
}

/** Map a tire-bar status to a 3-bar indicator (0 = unknown). */
export function statusToBars(status: TireStatus): 0 | 1 | 2 | 3 {
  switch (status) {
    case 'GOOD':
      return 3;
    case 'WATCH':
      return 2;
    case 'WARNING':
      return 1;
    case 'CRITICAL':
      return 1;
    default:
      return 0;
  }
}

/** Map the legacy Prisma TireHealthStatus enum to the canonical status scale. */
export function legacyHealthStatusToCanonical(
  legacy: string | null | undefined,
): TireStatus {
  switch ((legacy ?? '').toUpperCase()) {
    case 'EXCELLENT':
    case 'GOOD':
      return 'GOOD';
    case 'MODERATE':
      return 'WATCH';
    case 'POOR':
      return 'WARNING';
    case 'REPLACE_NOW':
      return 'CRITICAL';
    default:
      return 'UNKNOWN';
  }
}

/** Map an internal alert `type` (legacy) to the canonical alert code. */
export function alertTypeToCode(type: string): TireAlertCode {
  switch (type) {
    case 'CRITICAL_TREAD':
      return 'TIRE_TREAD_CRITICAL';
    case 'LOW_TREAD':
      return 'TIRE_TREAD_LOW';
    case 'CRITICAL_REMAINING_KM':
      return 'TIRE_REMAINING_KM_CRITICAL';
    case 'LOW_REMAINING_KM':
      return 'TIRE_REMAINING_KM_LOW';
    case 'UNEVEN_WEAR_CRITICAL':
    case 'UNEVEN_WEAR_ATTENTION':
    case 'AXLE_WEAR_IMBALANCE':
      return 'TIRE_WEAR_UNEVEN';
    case 'ROTATION_OVERDUE':
    case 'ROTATION_RECOMMENDED':
      return 'TIRE_ROTATION_RECOMMENDED';
    case 'LOW_CONFIDENCE':
      return 'TIRE_LOW_CONFIDENCE';
    case 'PRESSURE_IMPACT':
    case 'PRESSURE_LOW':
      return 'TIRE_PRESSURE_LOW';
    case 'PRESSURE_HIGH':
      return 'TIRE_PRESSURE_HIGH';
    case 'SEASON_MISMATCH':
      return 'TIRE_SEASON_MISMATCH';
    case 'TIRE_AGE_WARNING':
      return 'TIRE_AGE_WARNING';
    case 'MEASUREMENT_OVERDUE':
      return 'TIRE_MEASUREMENT_OVERDUE';
    case 'USED_TIRE_NO_MEASUREMENT':
      return 'TIRE_USED_NO_MEASUREMENT';
    default:
      return 'TIRE_GENERIC';
  }
}
