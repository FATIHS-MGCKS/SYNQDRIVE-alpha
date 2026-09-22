import type { BatteryProviderObservationOutcome } from '../battery-provider-observation.policy';
import { BatteryGeneralizedEvidenceClass } from '@prisma/client';

const GAP_ENTRY_OUTCOMES = new Set<BatteryProviderObservationOutcome>([
  'STALE_REPLAY',
  'DUPLICATE_OBSERVATION',
]);

/** Transport failures and invalid samples must not open a gap. */
export function isSuccessfulPollGapEntryOutcome(
  outcome: BatteryProviderObservationOutcome,
): boolean {
  return GAP_ENTRY_OUTCOMES.has(outcome);
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

/** Pre-gap bundle must not already be trustworthy parked engine-off (B1.2W §4). */
export function isPreGapTrustworthyEngineOffEvidenceClass(
  evidenceClass: BatteryGeneralizedEvidenceClass,
): boolean {
  return evidenceClass === BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION;
}
