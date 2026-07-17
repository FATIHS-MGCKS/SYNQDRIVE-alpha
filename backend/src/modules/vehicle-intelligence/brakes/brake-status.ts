/**
 * Brake status classification — the single rule set shared by every consumer
 * (BrakeHealthService canonical read model, BrakeCriticalDetector, Rental
 * Health, AI Health Care, Fleet Condition). Pure functions, no I/O, so there is
 * exactly ONE definition of the condition bands, the confidence levels, the
 * data-basis taxonomy and the aggregation order (mirrors `tire-status.ts` /
 * `battery-status.ts`).
 *
 * Honesty principles (hard rules from the product spec):
 *   · A measurement/document/sensor reading is truth; a projection is an
 *     ESTIMATE. The data basis and confidence below make that explicit and
 *     never present an estimate as a measured value.
 *   · CRITICAL requires a *real safety signal*: a measured/documented critical
 *     thickness, a safety-relevant brake DTC, a critical brake-fluid state, an
 *     active warning contact, or a confirmed "immediate replacement" document.
 *     A purely ESTIMATED condition can never exceed WARNING — many harsh
 *     brakings + high usage may at most produce WARNING.
 *   · Harsh braking only scales the wear MULTIPLIER; it is never a condition by
 *     itself.
 */

import { BRAKE_HEALTH_CONFIG } from './brake-health.config';

const cfg = BRAKE_HEALTH_CONFIG;

export type BrakeCondition = 'GOOD' | 'WATCH' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
export type BrakeDataBasis = 'MEASURED' | 'DOCUMENTED' | 'SENSOR' | 'ESTIMATED' | 'UNKNOWN';
export type BrakeConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type HarshBrakingLevel = 'normal' | 'elevated' | 'high' | 'very_high';

/** Canonical brake alert taxonomy (stable codes consumers can switch on). */
export type BrakeAlertCode =
  | 'BRAKE_PAD_WARNING'
  | 'BRAKE_PAD_CRITICAL'
  | 'BRAKE_DISC_WARNING'
  | 'BRAKE_DISC_CRITICAL'
  | 'BRAKE_SYSTEM_DTC'
  | 'BRAKE_FLUID_WARNING'
  | 'BRAKE_INSPECTION_OVERDUE'
  | 'BRAKE_HEALTH_LOW_CONFIDENCE'
  | 'BRAKE_GENERIC';

const CONDITION_RANK: Record<BrakeCondition, number> = {
  UNKNOWN: 0,
  GOOD: 1,
  WATCH: 2,
  WARNING: 3,
  CRITICAL: 4,
};

// ── Aggregation ──────────────────────────────────────────────────────────────

/**
 * Aggregate the available brake signals into one condition.
 *   · CRITICAL always wins
 *   · WARNING beats WATCH, WATCH beats GOOD
 *   · UNKNOWN signals are ignored
 *   · result is UNKNOWN only when no usable signal exists at all
 */
export function aggregateBrakeCondition(
  ...conditions: Array<BrakeCondition | null | undefined>
): BrakeCondition {
  let worst: BrakeCondition | null = null;
  for (const c of conditions) {
    if (c == null || c === 'UNKNOWN') continue;
    if (worst == null || CONDITION_RANK[c] > CONDITION_RANK[worst]) worst = c;
  }
  return worst ?? 'UNKNOWN';
}

/** True when the condition warrants a vehicle alert (WATCH never alerts). */
export function isAlertableCondition(condition: BrakeCondition): boolean {
  return condition === 'WARNING' || condition === 'CRITICAL';
}

/** Map a brake condition to a 3-bar indicator (0 = unknown). */
export function conditionToBars(condition: BrakeCondition): 0 | 1 | 2 | 3 {
  switch (condition) {
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

// ── Harsh braking → wear multiplier ──────────────────────────────────────────

/**
 * Normalize harsh-brake events / 100 km into a wear multiplier. This is the
 * single, centralized definition of the harsh-braking impact band. It can never
 * by itself raise a CRITICAL condition — it only scales the wear rate.
 */
export function harshBrakeWearMultiplier(eventsPer100Km: number | null | undefined): {
  level: HarshBrakingLevel;
  multiplier: number;
} {
  const v = Number.isFinite(eventsPer100Km as number) ? Math.max(0, eventsPer100Km as number) : 0;
  for (const band of cfg.harshBraking.bands) {
    if (v <= band.maxPer100Km) {
      return { level: band.level as HarshBrakingLevel, multiplier: band.multiplier };
    }
  }
  const last = cfg.harshBraking.bands[cfg.harshBraking.bands.length - 1];
  return { level: last.level as HarshBrakingLevel, multiplier: last.multiplier };
}

// ── Condition classifiers ────────────────────────────────────────────────────

/** Health-percent → condition (no CRITICAL: estimates cap at WARNING here). */
export function classifyHealthPct(healthPct: number | null | undefined): BrakeCondition {
  if (healthPct == null || !Number.isFinite(healthPct)) return 'UNKNOWN';
  const b = cfg.conditionBands.healthPct;
  if (healthPct >= b.good) return 'GOOD';
  if (healthPct >= b.watch) return 'WATCH';
  return 'WARNING';
}

/**
 * Remaining-km → condition for an ESTIMATED basis. Caps at WARNING — a modeled
 * estimate never claims a confirmed "replace now".
 */
export function classifyRemainingKmEstimated(remainingKm: number | null | undefined): BrakeCondition {
  if (remainingKm == null || !Number.isFinite(remainingKm)) return 'UNKNOWN';
  const b = cfg.conditionBands.remainingKm;
  if (remainingKm <= b.warning) return 'WARNING';
  if (remainingKm <= b.watch) return 'WATCH';
  return 'GOOD';
}

/**
 * Remaining-km → condition that *can* return CRITICAL. Only used when the
 * underlying thickness is backed by a real measurement/document/sensor.
 */
export function classifyRemainingKmMeasured(remainingKm: number | null | undefined): BrakeCondition {
  if (remainingKm == null || !Number.isFinite(remainingKm)) return 'UNKNOWN';
  const b = cfg.conditionBands.remainingKm;
  if (remainingKm <= b.critical) return 'CRITICAL';
  if (remainingKm <= b.warning) return 'WARNING';
  if (remainingKm <= b.watch) return 'WATCH';
  return 'GOOD';
}

/**
 * Estimated condition from health-percent + remaining-km, capped at WARNING.
 * This is the condition for components without a real recent measurement.
 */
export function classifyEstimatedCondition(
  healthPct: number | null | undefined,
  remainingKm: number | null | undefined,
): BrakeCondition {
  const agg = aggregateBrakeCondition(
    classifyHealthPct(healthPct),
    classifyRemainingKmEstimated(remainingKm),
  );
  return agg === 'CRITICAL' ? 'WARNING' : agg;
}

/**
 * Measured pad/disc thickness (mm) → condition. A real measured value at/below
 * the critical limit is a genuine CRITICAL; near the warning limit is WARNING.
 */
export function classifyMeasuredThickness(
  measuredMm: number | null | undefined,
  criticalMm: number,
  warningMm: number,
): BrakeCondition {
  if (measuredMm == null || !Number.isFinite(measuredMm)) return 'UNKNOWN';
  if (measuredMm <= criticalMm) return 'CRITICAL';
  if (measuredMm <= warningMm) return 'WARNING';
  if (measuredMm <= warningMm + 1) return 'WATCH';
  return 'GOOD';
}

export interface MeasuredThicknessThresholdInput {
  criticalThresholdMm: number | null;
  warningThresholdMm: number | null;
  confirmed: boolean;
  thresholdMissing: boolean;
  usesLegacyDefault?: boolean;
}

/**
 * Measured thickness against component-specific confirmed minimums.
 * Generic legacy defaults never produce a measured CRITICAL hard block.
 */
export function classifyMeasuredThicknessWithThresholds(
  measuredMm: number | null | undefined,
  thresholds: MeasuredThicknessThresholdInput,
): BrakeCondition {
  if (measuredMm == null || !Number.isFinite(measuredMm)) return 'UNKNOWN';
  if (
    thresholds.thresholdMissing ||
    !thresholds.confirmed ||
    thresholds.criticalThresholdMm == null ||
    thresholds.usesLegacyDefault
  ) {
    return 'UNKNOWN';
  }
  const warning =
    thresholds.warningThresholdMm != null
      ? thresholds.warningThresholdMm
      : thresholds.criticalThresholdMm + 1;
  return classifyMeasuredThickness(measuredMm, thresholds.criticalThresholdMm, warning);
}

/** Brake-fluid status string → condition. */
export function classifyFluidStatus(status: string | null | undefined): BrakeCondition {
  switch ((status ?? '').toUpperCase()) {
    case 'CRITICAL':
      return 'CRITICAL';
    case 'WARNING':
    case 'LOW':
      return 'WARNING';
    case 'WATCH':
      return 'WATCH';
    case 'GOOD':
    case 'OK':
      return 'GOOD';
    default:
      return 'UNKNOWN';
  }
}

/** Disc-condition string (from a document/inspection) → condition. */
export function classifyDiscConditionLabel(label: string | null | undefined): BrakeCondition {
  switch ((label ?? '').toUpperCase()) {
    case 'CRITICAL':
    case 'REPLACE':
    case 'SCORED':
      return 'CRITICAL';
    case 'WARNING':
    case 'WORN':
      return 'WARNING';
    case 'WATCH':
      return 'WATCH';
    case 'GOOD':
    case 'OK':
      return 'GOOD';
    default:
      return 'UNKNOWN';
  }
}

/** Brake-system DTC severity → condition. */
export function classifyDtcSeverity(severity: string | null | undefined): BrakeCondition {
  switch ((severity ?? '').toUpperCase()) {
    case 'CRITICAL':
      return 'CRITICAL';
    case 'WARNING':
      return 'WARNING';
    case 'INFO':
      return 'WATCH';
    default:
      return 'UNKNOWN';
  }
}

// ── Data basis ───────────────────────────────────────────────────────────────

/** Map the V2 wear-model state class to a public data basis. */
export function dataBasisFromStateClass(
  stateClass: string | null | undefined,
): BrakeDataBasis {
  switch ((stateClass ?? '').toUpperCase()) {
    case 'MEASURED':
      return 'MEASURED';
    case 'ESTIMATED':
      return 'ESTIMATED';
    case 'WARNING_ONLY':
      return 'SENSOR';
    case 'NO_BASELINE':
    default:
      return 'UNKNOWN';
  }
}

/**
 * Map anchor provenance to the public data basis before evidence upgrades.
 * Spec-fallback anchors (e.g. registration nominal values) are DOCUMENTED,
 * not ESTIMATED wear-model output.
 */
export function dataBasisFromAnchorValidation(
  anchorValidationStatus: string | null | undefined,
  stateClass?: string | null | undefined,
): BrakeDataBasis {
  const status = String(anchorValidationStatus ?? '').toLowerCase();
  if (status.includes('measured')) return 'MEASURED';
  if (status.includes('spec_fallback')) return 'DOCUMENTED';
  return dataBasisFromStateClass(stateClass);
}

/** Map a brake-evidence source to the public data basis it provides. */
export function evidenceSourceToDataBasis(source: string | null | undefined): BrakeDataBasis {
  switch ((source ?? '').toUpperCase()) {
    case 'MANUAL_MEASUREMENT':
      return 'MEASURED';
    case 'WORKSHOP_REPORT':
    case 'SERVICE_INVOICE':
    case 'INSPECTION_PROTOCOL':
    case 'AI_UPLOAD':
      return 'DOCUMENTED';
    case 'DTC_SIGNAL':
    case 'BRAKE_WEAR_SENSOR':
      return 'SENSOR';
    case 'TELEMATICS_ESTIMATION':
      return 'ESTIMATED';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Pick the stronger of two data bases for display. Ordering reflects how much we
 * trust the source: MEASURED > DOCUMENTED > SENSOR > ESTIMATED > UNKNOWN.
 */
const DATA_BASIS_RANK: Record<BrakeDataBasis, number> = {
  UNKNOWN: 0,
  ESTIMATED: 1,
  SENSOR: 2,
  DOCUMENTED: 3,
  MEASURED: 4,
};

export function strongerDataBasis(a: BrakeDataBasis, b: BrakeDataBasis): BrakeDataBasis {
  return DATA_BASIS_RANK[a] >= DATA_BASIS_RANK[b] ? a : b;
}

// ── Confidence level ─────────────────────────────────────────────────────────

/**
 * Map the point-based confidence score (0–100) and data basis to a level.
 *   · UNKNOWN basis → UNKNOWN
 *   · ESTIMATED/SENSOR basis can never be HIGH (capped at MEDIUM)
 *   · a stale/old measured anchor downgrades HIGH → MEDIUM
 */
export function classifyConfidenceLevel(args: {
  score: number | null | undefined;
  dataBasis: BrakeDataBasis;
  measurementAgeDays?: number | null;
  kmSinceMeasurement?: number | null;
}): BrakeConfidenceLevel {
  const { dataBasis } = args;
  if (dataBasis === 'UNKNOWN') return 'UNKNOWN';

  const c = cfg.confidenceLevels;
  const s = typeof args.score === 'number' && Number.isFinite(args.score) ? args.score : 0;
  let level: BrakeConfidenceLevel = s >= c.highScore ? 'HIGH' : s >= c.mediumScore ? 'MEDIUM' : 'LOW';

  if ((dataBasis === 'ESTIMATED' || dataBasis === 'SENSOR') && level === 'HIGH') {
    level = 'MEDIUM';
  }

  if (level === 'HIGH') {
    const ageDays = args.measurementAgeDays;
    const km = args.kmSinceMeasurement;
    if (
      (ageDays != null && ageDays > c.measuredHighMaxAgeDays) ||
      (km != null && km > c.measuredHighMaxKm)
    ) {
      level = 'MEDIUM';
    }
  }

  return level;
}

// ── Remaining-life range ─────────────────────────────────────────────────────

/**
 * Widen a single modeled remaining-km value into an honest [min,max] band whose
 * spread depends on confidence, rounded to a readable step. Returns null when no
 * remaining-km can be derived (insufficient data) — the UI then shows a reason
 * instead of false precision.
 */
export function buildRemainingKmRange(
  remainingKm: number | null | undefined,
  confidence: BrakeConfidenceLevel,
): { min: number; max: number } | null {
  if (remainingKm == null || !Number.isFinite(remainingKm) || remainingKm < 0) return null;
  const spread =
    cfg.remainingKmRange.spreadByConfidence[confidence] ??
    cfg.remainingKmRange.spreadByConfidence.UNKNOWN;
  const step = cfg.remainingKmRange.roundStepKm;
  const roundTo = (v: number) => Math.max(0, Math.round(v / step) * step);
  const min = roundTo(remainingKm * (1 - spread));
  const max = roundTo(remainingKm * (1 + spread));
  return { min, max: Math.max(max, min) };
}

// ── Alert code mapping ───────────────────────────────────────────────────────

/** Map an internal computeAlerts() `type` to the canonical alert code. */
export function alertTypeToCode(type: string): BrakeAlertCode {
  switch (type) {
    case 'PAD_CRITICAL':
      return 'BRAKE_PAD_CRITICAL';
    case 'PAD_WARNING':
      return 'BRAKE_PAD_WARNING';
    case 'DISC_CRITICAL':
      return 'BRAKE_DISC_CRITICAL';
    case 'DISC_WARNING':
      return 'BRAKE_DISC_WARNING';
    case 'CRITICAL_REMAINING_KM':
      return 'BRAKE_PAD_CRITICAL';
    case 'LOW_REMAINING_KM':
      return 'BRAKE_PAD_WARNING';
    case 'BRAKE_SYSTEM_DTC':
      return 'BRAKE_SYSTEM_DTC';
    case 'BRAKE_FLUID_WARNING':
      return 'BRAKE_FLUID_WARNING';
    case 'INSPECTION_OVERDUE':
      return 'BRAKE_INSPECTION_OVERDUE';
    case 'LOW_CONFIDENCE':
      return 'BRAKE_HEALTH_LOW_CONFIDENCE';
    default:
      return 'BRAKE_GENERIC';
  }
}

/** Severity that a canonical alert code maps to when no signal context is available. */
export function alertCodeSeverity(code: BrakeAlertCode): 'info' | 'warning' | 'critical' {
  switch (code) {
    case 'BRAKE_PAD_CRITICAL':
    case 'BRAKE_DISC_CRITICAL':
      return 'critical';
    case 'BRAKE_PAD_WARNING':
    case 'BRAKE_DISC_WARNING':
    case 'BRAKE_FLUID_WARNING':
    case 'BRAKE_INSPECTION_OVERDUE':
    case 'BRAKE_SYSTEM_DTC':
      return 'warning';
    case 'BRAKE_HEALTH_LOW_CONFIDENCE':
    case 'BRAKE_GENERIC':
    default:
      return 'info';
  }
}

/** Map a brake-system DTC condition band to alert severity (never auto-critical). */
export function dtcConditionToAlertSeverity(
  condition: BrakeCondition,
): 'info' | 'warning' | 'critical' {
  if (condition === 'CRITICAL') return 'critical';
  if (condition === 'WARNING') return 'warning';
  if (condition === 'WATCH') return 'info';
  return 'info';
}

/** Map canonical condition to legacy summary status string (backward compat only). */
export function conditionToLegacyStatus(
  condition: BrakeCondition,
  stateClass: string | null | undefined,
): string {
  const sc = (stateClass ?? '').toUpperCase();
  if (sc === 'WARNING_ONLY') return 'warning_only';
  if (sc === 'NO_BASELINE') return 'awaiting_baseline';
  switch (condition) {
    case 'GOOD':
      return 'healthy';
    case 'WATCH':
    case 'WARNING':
      return 'attention';
    case 'CRITICAL':
      return 'critical';
    default:
      return 'attention';
  }
}
