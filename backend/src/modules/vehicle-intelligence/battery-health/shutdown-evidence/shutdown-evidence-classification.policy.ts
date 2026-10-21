import {
  BatteryShutdownEvidenceClass,
  BatteryShutdownStateAlignmentClass,
  BatteryShutdownStateCompleteness,
} from '@prisma/client';
import {
  SHUTDOWN_ALIGNMENT_ELIGIBLE_TIMESTAMP_SOURCES,
  SHUTDOWN_ALTERNATOR_VOLTAGE_THRESHOLD_V,
  SHUTDOWN_LV_CHARGING_VOLTAGE_THRESHOLD_V,
  SHUTDOWN_MAX_ACCEPTABLE_FIELD_SKEW_MS,
  SHUTDOWN_MAX_ALIGNED_FIELD_SKEW_MS,
  SHUTDOWN_POST_ENGINE_OFF_MAX_AGE_AFTER_TRIP_END_MS,
  SHUTDOWN_SPEED_AT_REST_KMH,
  SHUTDOWN_ENGINE_LOAD_RUNNING_THRESHOLD,
  SHUTDOWN_TIMESTAMP_SOURCES,
  type ShutdownTimestampSource,
} from './shutdown-evidence.constants';
import type {
  ShutdownEvidenceClassificationInput,
  ShutdownEvidenceClassificationResult,
  ShutdownEvidenceFieldBundle,
} from './shutdown-evidence.types';
import { resolveShutdownEvidenceConfidence } from './shutdown-evidence-confidence.policy';

function isSpeedKnownAtRest(speedKmh: number | null): boolean {
  return speedKmh != null && speedKmh <= SHUTDOWN_SPEED_AT_REST_KMH;
}

function isDriving(speedKmh: number | null): boolean {
  return speedKmh != null && speedKmh > SHUTDOWN_SPEED_AT_REST_KMH;
}

function isAlternatorVoltage(voltage: number | null): boolean {
  return voltage != null && voltage >= SHUTDOWN_ALTERNATOR_VOLTAGE_THRESHOLD_V;
}

function isLvChargingContext(
  voltage: number | null,
  isLvCharging: boolean | null,
  isHvCharging: boolean | null,
): boolean {
  if (isHvCharging === true) return true;
  if (isLvCharging === true) return true;
  if (voltage != null && voltage >= SHUTDOWN_LV_CHARGING_VOLTAGE_THRESHOLD_V && isHvCharging !== false) {
    return false;
  }
  return voltage != null && voltage >= SHUTDOWN_LV_CHARGING_VOLTAGE_THRESHOLD_V;
}

function collectAlignmentEligibleTimestamps(fields: ShutdownEvidenceFieldBundle): Date[] {
  const candidates: Array<{ at: Date | null; source: ShutdownTimestampSource }> = [
    { at: fields.voltageObservedAt, source: fields.voltageTimestampSource },
    { at: fields.speedObservedAt, source: fields.speedTimestampSource },
    { at: fields.ignitionObservedAt, source: fields.ignitionTimestampSource },
    { at: fields.engineRunningObservedAt, source: fields.engineRunningTimestampSource },
    { at: fields.chargingContextObservedAt, source: fields.chargingContextTimestampSource },
    { at: fields.activeTripObservedAt, source: fields.activeTripTimestampSource },
  ];

  return candidates
    .filter(
      ({ at, source }) =>
        at != null &&
        !Number.isNaN(at.getTime()) &&
        SHUTDOWN_ALIGNMENT_ELIGIBLE_TIMESTAMP_SOURCES.has(source),
    )
    .map(({ at }) => at as Date);
}

export function resolveStateCompleteness(
  fields: ShutdownEvidenceFieldBundle,
): BatteryShutdownStateCompleteness {
  const hasVoltage = fields.voltage != null;
  const hasMotion =
    fields.speedKmh != null || fields.ignitionOn != null || fields.engineRunning != null;
  const hasTrip = fields.activeTrip != null;

  if (hasVoltage && hasMotion && hasTrip) return BatteryShutdownStateCompleteness.COMPLETE;
  if (hasVoltage && (hasMotion || hasTrip)) {
    return BatteryShutdownStateCompleteness.PARTIAL;
  }
  return BatteryShutdownStateCompleteness.MISSING;
}

export function resolveStateAlignment(
  fields: ShutdownEvidenceFieldBundle,
  referenceAt: Date,
): {
  stateAlignmentClass: BatteryShutdownStateAlignmentClass;
  stateTimestampSkewMs: number | null;
  maxFieldTimestampSkewMs: number | null;
} {
  const stamps = collectAlignmentEligibleTimestamps(fields);
  if (stamps.length === 0) {
    return {
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.UNKNOWN,
      stateTimestampSkewMs: null,
      maxFieldTimestampSkewMs: null,
    };
  }

  if (stamps.length === 1) {
    return {
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.PARTIAL,
      stateTimestampSkewMs: 0,
      maxFieldTimestampSkewMs: 0,
    };
  }

  const minMs = Math.min(...stamps.map((d) => d.getTime()));
  const maxMs = Math.max(...stamps.map((d) => d.getTime()));
  const maxSkew = maxMs - minMs;
  const voltageMs =
    fields.voltageObservedAt != null &&
    SHUTDOWN_ALIGNMENT_ELIGIBLE_TIMESTAMP_SOURCES.has(fields.voltageTimestampSource)
      ? fields.voltageObservedAt.getTime()
      : null;
  const stateTimestampSkewMs =
    voltageMs != null ? Math.abs(maxMs - voltageMs) : maxSkew;

  if (maxSkew > SHUTDOWN_MAX_ACCEPTABLE_FIELD_SKEW_MS) {
    return {
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.SKEWED,
      stateTimestampSkewMs,
      maxFieldTimestampSkewMs: maxSkew,
    };
  }
  if (maxSkew <= SHUTDOWN_MAX_ALIGNED_FIELD_SKEW_MS) {
    return {
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      stateTimestampSkewMs,
      maxFieldTimestampSkewMs: maxSkew,
    };
  }
  return {
    stateAlignmentClass: BatteryShutdownStateAlignmentClass.PARTIAL,
    stateTimestampSkewMs,
    maxFieldTimestampSkewMs: maxSkew,
  };
}

function meetsPostEngineOffPreSleepContract(
  input: ShutdownEvidenceClassificationInput,
  alignment: BatteryShutdownStateAlignmentClass,
  maxSkew: number | null,
): boolean {
  const { fields, relativeToTripEndMs, tripEndedAt } = input;
  if (tripEndedAt == null || relativeToTripEndMs == null) return false;
  if (fields.activeTrip !== false) return false;
  if (fields.engineRunning !== false) return false;
  if (fields.ignitionOn !== false) return false;
  if (!isSpeedKnownAtRest(fields.speedKmh)) return false;
  if (fields.voltageObservedAt == null) return false;
  if (fields.voltageTimestampSource !== SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP) {
    return false;
  }
  if (isLvChargingContext(fields.voltage, fields.isLvCharging, fields.isHvCharging)) {
    return false;
  }
  if (
    relativeToTripEndMs < -SHUTDOWN_POST_ENGINE_OFF_MAX_AGE_AFTER_TRIP_END_MS ||
    relativeToTripEndMs > SHUTDOWN_POST_ENGINE_OFF_MAX_AGE_AFTER_TRIP_END_MS
  ) {
    return false;
  }
  if (
    alignment === BatteryShutdownStateAlignmentClass.SKEWED ||
    alignment === BatteryShutdownStateAlignmentClass.UNKNOWN ||
    (maxSkew != null && maxSkew > SHUTDOWN_MAX_ACCEPTABLE_FIELD_SKEW_MS)
  ) {
    return false;
  }
  return fields.voltage != null && !isAlternatorVoltage(fields.voltage);
}

/**
 * Pessimistic shadow evidence classification — stale/skewed wins over optimistic clean labels.
 */
export function classifyShutdownEvidence(
  input: ShutdownEvidenceClassificationInput,
): ShutdownEvidenceClassificationResult {
  const stateCompleteness = resolveStateCompleteness(input.fields);
  const alignmentResult = resolveStateAlignment(input.fields, input.referenceAt);

  if (stateCompleteness === BatteryShutdownStateCompleteness.MISSING) {
    return {
      evidenceClass: BatteryShutdownEvidenceClass.UNKNOWN_STATE,
      confidenceClass: resolveShutdownEvidenceConfidence({
        evidenceClass: BatteryShutdownEvidenceClass.UNKNOWN_STATE,
        stateCompleteness,
        stateAlignmentClass: alignmentResult.stateAlignmentClass,
        fields: input.fields,
      }),
      stateCompleteness,
      ...alignmentResult,
    };
  }

  if (
    alignmentResult.stateAlignmentClass === BatteryShutdownStateAlignmentClass.SKEWED ||
    (alignmentResult.maxFieldTimestampSkewMs != null &&
      alignmentResult.maxFieldTimestampSkewMs > SHUTDOWN_MAX_ACCEPTABLE_FIELD_SKEW_MS)
  ) {
    return {
      evidenceClass: BatteryShutdownEvidenceClass.STALE_OR_SKEWED_STATE,
      confidenceClass: resolveShutdownEvidenceConfidence({
        evidenceClass: BatteryShutdownEvidenceClass.STALE_OR_SKEWED_STATE,
        stateCompleteness,
        stateAlignmentClass: alignmentResult.stateAlignmentClass,
        fields: input.fields,
      }),
      stateCompleteness,
      ...alignmentResult,
    };
  }

  const { fields } = input;
  const charging = isLvChargingContext(
    fields.voltage,
    fields.isLvCharging,
    fields.isHvCharging,
  );
  const driving = isDriving(fields.speedKmh);
  const engineActive =
    fields.engineRunning === true ||
    fields.ignitionOn === true ||
    (fields.engineRunning == null &&
      fields.ignitionOn == null &&
      isAlternatorVoltage(fields.voltage));

  if (
    driving ||
    charging ||
    isAlternatorVoltage(fields.voltage) ||
    (fields.engineRunning === true && fields.ignitionOn === true)
  ) {
    const evidenceClass =
      isAlternatorVoltage(fields.voltage) || charging
        ? BatteryShutdownEvidenceClass.ACTIVE_ALTERNATOR
        : BatteryShutdownEvidenceClass.ACTIVE_NON_CHARGING;
    return {
      evidenceClass,
      confidenceClass: resolveShutdownEvidenceConfidence({
        evidenceClass,
        stateCompleteness,
        stateAlignmentClass: alignmentResult.stateAlignmentClass,
        fields: input.fields,
      }),
      stateCompleteness,
      ...alignmentResult,
    };
  }

  if (
    meetsPostEngineOffPreSleepContract(
      input,
      alignmentResult.stateAlignmentClass,
      alignmentResult.maxFieldTimestampSkewMs,
    )
  ) {
    return {
      evidenceClass: BatteryShutdownEvidenceClass.POST_ENGINE_OFF_PRE_SLEEP,
      confidenceClass: resolveShutdownEvidenceConfidence({
        evidenceClass: BatteryShutdownEvidenceClass.POST_ENGINE_OFF_PRE_SLEEP,
        stateCompleteness,
        stateAlignmentClass: alignmentResult.stateAlignmentClass,
        fields: input.fields,
      }),
      stateCompleteness,
      ...alignmentResult,
    };
  }

  if (
    isSpeedKnownAtRest(fields.speedKmh) &&
    fields.ignitionOn === false &&
    fields.engineRunning === false &&
    !charging
  ) {
    return {
      evidenceClass: BatteryShutdownEvidenceClass.SHUTDOWN_TRANSITION,
      confidenceClass: resolveShutdownEvidenceConfidence({
        evidenceClass: BatteryShutdownEvidenceClass.SHUTDOWN_TRANSITION,
        stateCompleteness,
        stateAlignmentClass: alignmentResult.stateAlignmentClass,
        fields: input.fields,
      }),
      stateCompleteness,
      ...alignmentResult,
    };
  }

  if (engineActive) {
    return {
      evidenceClass: BatteryShutdownEvidenceClass.ACTIVE_NON_CHARGING,
      confidenceClass: resolveShutdownEvidenceConfidence({
        evidenceClass: BatteryShutdownEvidenceClass.ACTIVE_NON_CHARGING,
        stateCompleteness,
        stateAlignmentClass: alignmentResult.stateAlignmentClass,
        fields: input.fields,
      }),
      stateCompleteness,
      ...alignmentResult,
    };
  }

  return {
    evidenceClass: BatteryShutdownEvidenceClass.UNKNOWN_STATE,
    confidenceClass: resolveShutdownEvidenceConfidence({
      evidenceClass: BatteryShutdownEvidenceClass.UNKNOWN_STATE,
      stateCompleteness,
      stateAlignmentClass: alignmentResult.stateAlignmentClass,
      fields: input.fields,
    }),
    stateCompleteness,
    ...alignmentResult,
  };
}

export function deriveEngineRunningFromLoad(engineLoad: number | null): boolean | null {
  if (engineLoad == null) return null;
  return engineLoad > SHUTDOWN_ENGINE_LOAD_RUNNING_THRESHOLD;
}
