import {
  BatteryShutdownEvidenceClass,
  BatteryShutdownEvidenceConfidenceClass,
  BatteryShutdownStateAlignmentClass,
  BatteryShutdownStateCompleteness,
} from '@prisma/client';
import { SHUTDOWN_TIMESTAMP_SOURCES } from './shutdown-evidence.constants';
import type { ShutdownEvidenceFieldBundle } from './shutdown-evidence.types';

export interface ShutdownConfidenceInput {
  evidenceClass: BatteryShutdownEvidenceClass;
  stateCompleteness: BatteryShutdownStateCompleteness;
  stateAlignmentClass: BatteryShutdownStateAlignmentClass;
  fields: ShutdownEvidenceFieldBundle;
}

/**
 * Discrete explainable confidence tiers — shadow metadata only.
 */
export function resolveShutdownEvidenceConfidence(
  input: ShutdownConfidenceInput,
): BatteryShutdownEvidenceConfidenceClass {
  if (input.stateCompleteness === BatteryShutdownStateCompleteness.MISSING) {
    return BatteryShutdownEvidenceConfidenceClass.INSUFFICIENT;
  }

  if (
    input.evidenceClass === BatteryShutdownEvidenceClass.UNKNOWN_STATE ||
    input.evidenceClass === BatteryShutdownEvidenceClass.STALE_OR_SKEWED_STATE
  ) {
    return BatteryShutdownEvidenceConfidenceClass.INSUFFICIENT;
  }

  if (input.evidenceClass === BatteryShutdownEvidenceClass.POST_ENGINE_OFF_PRE_SLEEP) {
    const hasProviderLvTimestamp =
      input.fields.voltageObservedAt != null &&
      input.fields.voltageTimestampSource ===
        SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP;

    if (
      input.stateCompleteness === BatteryShutdownStateCompleteness.COMPLETE &&
      input.stateAlignmentClass === BatteryShutdownStateAlignmentClass.ALIGNED &&
      hasProviderLvTimestamp &&
      input.fields.speedKmh != null
    ) {
      return BatteryShutdownEvidenceConfidenceClass.HIGH;
    }
    if (
      hasProviderLvTimestamp &&
      input.stateAlignmentClass === BatteryShutdownStateAlignmentClass.PARTIAL
    ) {
      return BatteryShutdownEvidenceConfidenceClass.MEDIUM;
    }
    return BatteryShutdownEvidenceConfidenceClass.LOW;
  }

  if (input.evidenceClass === BatteryShutdownEvidenceClass.SHUTDOWN_TRANSITION) {
    if (
      input.stateCompleteness === BatteryShutdownStateCompleteness.COMPLETE &&
      input.fields.speedKmh != null
    ) {
      return BatteryShutdownEvidenceConfidenceClass.MEDIUM;
    }
    return BatteryShutdownEvidenceConfidenceClass.LOW;
  }

  if (
    input.evidenceClass === BatteryShutdownEvidenceClass.ACTIVE_ALTERNATOR ||
    input.evidenceClass === BatteryShutdownEvidenceClass.ACTIVE_NON_CHARGING
  ) {
    return BatteryShutdownEvidenceConfidenceClass.MEDIUM;
  }

  return BatteryShutdownEvidenceConfidenceClass.INSUFFICIENT;
}
