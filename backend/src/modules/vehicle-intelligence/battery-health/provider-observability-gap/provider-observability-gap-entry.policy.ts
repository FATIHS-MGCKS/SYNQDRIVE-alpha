import type { BatteryProviderObservationOutcome } from '../battery-provider-observation.policy';
import { BatteryGeneralizedEvidenceClass } from '@prisma/client';

/** Poll outcomes that may extend an already OPEN gap (idempotent stale polls). */
export function canExtendOpenProviderObservabilityGap(
  outcome: BatteryProviderObservationOutcome,
): boolean {
  return outcome === 'STALE_REPLAY' || outcome === 'DUPLICATE_OBSERVATION';
}

/** NEW gap requires stale replay threshold — not short duplicate polling (B1.2W). */
export function canOpenNewProviderObservabilityGap(
  outcome: BatteryProviderObservationOutcome,
): boolean {
  return outcome === 'STALE_REPLAY';
}

/** @deprecated use canExtend/canOpen helpers */
export function isSuccessfulPollGapEntryOutcome(
  outcome: BatteryProviderObservationOutcome,
): boolean {
  return canExtendOpenProviderObservabilityGap(outcome);
}

export function isTransportOrNonPollGapOutcome(
  outcome: BatteryProviderObservationOutcome,
): boolean {
  return (
    outcome === 'INVALID_TIMESTAMP' ||
    outcome === 'OUT_OF_ORDER' ||
    outcome === 'VALUE_CHANGED_WITHOUT_NEW_TIMESTAMP'
  );
}

export function isPreGapTrustworthyEngineOffEvidenceClass(
  evidenceClass: BatteryGeneralizedEvidenceClass,
): boolean {
  return evidenceClass === BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION;
}
