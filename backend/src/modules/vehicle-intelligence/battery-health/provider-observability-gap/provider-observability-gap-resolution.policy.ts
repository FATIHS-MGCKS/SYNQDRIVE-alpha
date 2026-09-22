import { BatteryGeneralizedEvidenceClass, BatteryProviderObservabilityGapStatus } from '@prisma/client';

export type ProviderGapResolutionDecision =
  | { action: 'remain_open' }
  | {
      action: 'resolve';
      status: BatteryProviderObservabilityGapStatus;
    };

const RUNNING_LIKE = new Set<BatteryGeneralizedEvidenceClass>([
  BatteryGeneralizedEvidenceClass.DRIVING_CHARGING,
  BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
  BatteryGeneralizedEvidenceClass.ACTIVE_VEHICLE_CONTAMINATED,
  BatteryGeneralizedEvidenceClass.CHARGING_CONTAMINATED,
]);

/**
 * Map first fresh generalized classification after gap to B1.2W exit matrix.
 * Does not fabricate ENGINE_OFF — T4 only via ENGINE_OFF_TRANSITION class.
 */
export function resolveProviderGapFromEvidenceClass(
  evidenceClass: BatteryGeneralizedEvidenceClass,
): ProviderGapResolutionDecision {
  if (evidenceClass === BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION) {
    return { action: 'resolve', status: BatteryProviderObservabilityGapStatus.RESOLVED_OFF };
  }
  if (RUNNING_LIKE.has(evidenceClass)) {
    return {
      action: 'resolve',
      status: BatteryProviderObservabilityGapStatus.RESOLVED_FRESH_RUNNING_NO_OBSERVED_OFF,
    };
  }
  if (
    evidenceClass === BatteryGeneralizedEvidenceClass.STATE_AMBIGUOUS ||
    evidenceClass === BatteryGeneralizedEvidenceClass.UNKNOWN
  ) {
    return { action: 'resolve', status: BatteryProviderObservabilityGapStatus.RESOLVED_AMBIGUOUS };
  }
  if (
    evidenceClass === BatteryGeneralizedEvidenceClass.STALE_REPLAY ||
    evidenceClass === BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE ||
    evidenceClass === BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE ||
    evidenceClass === BatteryGeneralizedEvidenceClass.REST_STABLE_VOLTAGE
  ) {
    return { action: 'remain_open' };
  }
  return { action: 'remain_open' };
}
