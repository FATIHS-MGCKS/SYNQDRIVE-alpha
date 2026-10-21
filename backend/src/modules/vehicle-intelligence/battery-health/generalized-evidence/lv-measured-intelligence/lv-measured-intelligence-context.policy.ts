import { BatteryGeneralizedEvidenceClass } from '@prisma/client';

export type LvMeasuredOperationalContext =
  | 'DRIVING'
  | 'CHARGING'
  | 'REST'
  | 'UNKNOWN';

export type LvMeasuredEpistemicBand =
  | 'MEASURED'
  | 'DERIVED'
  | 'CONTEXT_LIMITED'
  | 'NOT_ASSESSED';

const DRIVING_CLASSES: ReadonlySet<BatteryGeneralizedEvidenceClass> = new Set([
  BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
  BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
]);

const REST_CLASSES: ReadonlySet<BatteryGeneralizedEvidenceClass> = new Set([
  BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
  BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
  BatteryGeneralizedEvidenceClass.REST_STABLE_VOLTAGE,
]);

export function mapEvidenceClassToOperationalContext(
  evidenceClass: BatteryGeneralizedEvidenceClass,
  isLvCharging: boolean | null,
): LvMeasuredOperationalContext {
  if (isLvCharging === true) {
    return 'CHARGING';
  }
  if (REST_CLASSES.has(evidenceClass)) {
    return 'REST';
  }
  if (DRIVING_CLASSES.has(evidenceClass)) {
    return 'DRIVING';
  }
  return 'UNKNOWN';
}

/** Nominal 8h ladder label for display (index 0 = anchor, 1 = 8h, 2 = 16h, 3 = 24h, …). */
export function nominalRestIntervalIndexToLadderLabel(index: number | null): string | null {
  if (index == null) return null;
  if (index === 0) return 'ANCHOR';
  return `${index * 8}h`;
}

export function actualRestAgeMsToHours(actualRestAgeMs: number | null): number | null {
  if (actualRestAgeMs == null) return null;
  return actualRestAgeMs / (60 * 60 * 1000);
}
