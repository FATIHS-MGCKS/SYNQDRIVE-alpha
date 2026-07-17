import {
  BATTERY_CRANK_SIGNAL_CADENCE_MS,
  isLegacyCrankAssessmentEnabled,
} from '../../../config/battery-health-v2.config';
import type { BatteryHealthStatus } from './battery-status';
import { classifyCrankDrop } from './battery-status';

export const LEGACY_CRANK_DISPLAY_MODE = 'LEGACY_UNVERIFIED' as const;
export const START_DIP_PROXY_MEASUREMENT_KIND = 'START_DIP_PROXY' as const;

/** @deprecated Real CRANK_MIN — blocked while legacy crank assessment is disabled. */
export const CRANK_MIN_MEASUREMENT_KIND = 'CRANK_MIN' as const;

export type CrankMeasurementKind =
  | typeof CRANK_MIN_MEASUREMENT_KIND
  | typeof START_DIP_PROXY_MEASUREMENT_KIND
  | 'NONE';

export interface LegacyCrankFeatures {
  crankDrop?: number | null;
  crankObservationCount?: number | null;
  vPreCrank?: number | null;
  vMinCrank?: number | null;
  vRecovery5s?: number | null;
  vRecovery30s?: number | null;
  crankAt?: Date | string | null;
  crankTripId?: string | null;
}

export interface LegacyCrankPresentation {
  measurementKind: CrankMeasurementKind;
  displayMode: typeof LEGACY_CRANK_DISPLAY_MODE | 'DECISION_CAPABLE';
  decisionCapable: boolean;
  diagnosticLabelDe: string;
  signalCadenceMs: number;
  claimsSubSecondPrecision: false;
  crankDrop: number | null;
  diagnosticCrankDrop: number | null;
  diagnosticStatus: BatteryHealthStatus;
  operationalStatus: BatteryHealthStatus;
}

export function resolveCrankMeasurementKind(): CrankMeasurementKind {
  return isLegacyCrankAssessmentEnabled() ? CRANK_MIN_MEASUREMENT_KIND : 'NONE';
}

export function effectiveCrankObservationCountForMaturity(count: number): number {
  return isLegacyCrankAssessmentEnabled() ? count : 0;
}

export function effectiveCrankDropForDecisions(crankDrop: number | null | undefined): number | null {
  if (!isLegacyCrankAssessmentEnabled()) return null;
  if (crankDrop == null || !Number.isFinite(crankDrop)) return null;
  return crankDrop;
}

export function effectiveCrankStatusForDecisions(
  crankDrop: number | null | undefined,
): BatteryHealthStatus {
  const effectiveDrop = effectiveCrankDropForDecisions(crankDrop);
  if (effectiveDrop == null) return 'UNKNOWN';
  return classifyCrankDrop(effectiveDrop);
}

export function presentLegacyCrankFeatures(
  features: LegacyCrankFeatures | null | undefined,
): LegacyCrankPresentation {
  const crankDrop = features?.crankDrop ?? null;
  const diagnosticStatus = classifyCrankDrop(crankDrop);
  const decisionCapable = isLegacyCrankAssessmentEnabled() && crankDrop != null;

  return {
    measurementKind: resolveCrankMeasurementKind(),
    displayMode: decisionCapable ? 'DECISION_CAPABLE' : LEGACY_CRANK_DISPLAY_MODE,
    decisionCapable,
    diagnosticLabelDe: decisionCapable
      ? 'Startereinbruch (Legacy-Bewertung aktiv)'
      : 'Legacy-Crank / unverifiziert (nicht entscheidungsfähig)',
    signalCadenceMs: BATTERY_CRANK_SIGNAL_CADENCE_MS,
    claimsSubSecondPrecision: false,
    crankDrop: decisionCapable ? crankDrop : null,
    diagnosticCrankDrop: crankDrop,
    diagnosticStatus,
    operationalStatus: decisionCapable ? diagnosticStatus : 'UNKNOWN',
  };
}
