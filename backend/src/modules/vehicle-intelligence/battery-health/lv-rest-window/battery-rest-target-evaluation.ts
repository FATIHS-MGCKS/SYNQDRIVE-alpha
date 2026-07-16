import { BatteryMeasurementType } from '@prisma/client';
import { LV_REST_TARGET_TYPES, type LvRestTargetType } from './lv-rest-window-target.metadata';

/** Half-width of the historical observation pick window around the target instant. */
export const DEFAULT_REST_TARGET_OBSERVATION_WINDOW_MS = 15 * 60_000;

export interface RestTargetObservationCandidate {
  measurementId: string;
  observedAt: Date;
  numericValue: number;
  providerTimestamp: Date | null;
}

export interface RestTargetEvaluationPolicy {
  targetAt: Date;
  windowBeforeMs: number;
  windowAfterMs: number;
  wakeVoltageThreshold: number;
  maxRestingVoltage: number;
}

export function restTargetAt(
  restWindowStartedAt: Date,
  restTargetType: Extract<LvRestTargetType, 'REST_60M' | 'REST_6H'>,
  rest60mDelayMs: number,
  rest6hDelayMs: number,
): Date {
  const offsetMs =
    restTargetType === LV_REST_TARGET_TYPES.REST_6H ? rest6hDelayMs : rest60mDelayMs;
  return new Date(restWindowStartedAt.getTime() + offsetMs);
}

export function measurementTypeForRestTarget(
  restTargetType: Extract<LvRestTargetType, 'REST_60M' | 'REST_6H'>,
): BatteryMeasurementType {
  return restTargetType === LV_REST_TARGET_TYPES.REST_6H
    ? BatteryMeasurementType.REST_6H
    : BatteryMeasurementType.REST_60M;
}

export function buildRestMeasurementIdempotencyKey(input: {
  sessionId: string;
  restTargetType: Extract<LvRestTargetType, 'REST_60M' | 'REST_6H'>;
  sourceObservationId: string;
}): string {
  return `rest-meas:${input.sessionId}:${input.restTargetType}:${input.sourceObservationId}`;
}

export function isPlausibleRestVoltage(value: number): boolean {
  return Number.isFinite(value) && value >= 9 && value <= 16;
}

export function isRestTargetWakeVoltage(value: number, wakeThreshold: number): boolean {
  return value >= wakeThreshold;
}

export function isObservationWithinTargetWindow(
  observedAt: Date,
  policy: RestTargetEvaluationPolicy,
): boolean {
  const startMs = policy.targetAt.getTime() - policy.windowBeforeMs;
  const endMs = policy.targetAt.getTime() + policy.windowAfterMs;
  const t = observedAt.getTime();
  return t >= startMs && t <= endMs;
}

/** Reject wake readings that occur strictly after the target window ends. */
export function isWakeAfterTargetWindow(
  observedAt: Date,
  voltage: number,
  policy: RestTargetEvaluationPolicy,
): boolean {
  if (observedAt.getTime() <= policy.targetAt.getTime() + policy.windowAfterMs) {
    return false;
  }
  return isRestTargetWakeVoltage(voltage, policy.wakeVoltageThreshold);
}

export function selectRestTargetObservation(input: {
  candidates: RestTargetObservationCandidate[];
  policy: RestTargetEvaluationPolicy;
  excludedSourceMeasurementIds?: string[];
}): { ok: boolean; reason: string; selected?: RestTargetObservationCandidate } {
  const excluded = new Set(input.excludedSourceMeasurementIds ?? []);
  const eligible = input.candidates.filter((candidate) => {
    if (excluded.has(candidate.measurementId)) return false;
    if (!isPlausibleRestVoltage(candidate.numericValue)) return false;
    if (isWakeAfterTargetWindow(candidate.observedAt, candidate.numericValue, input.policy)) {
      return false;
    }
    if (!isObservationWithinTargetWindow(candidate.observedAt, input.policy)) {
      return false;
    }
    if (isRestTargetWakeVoltage(candidate.numericValue, input.policy.wakeVoltageThreshold)) {
      return false;
    }
    if (candidate.numericValue > input.policy.maxRestingVoltage) {
      return false;
    }
    return true;
  });

  if (eligible.length === 0) {
    return { ok: false, reason: 'no_eligible_observation_in_target_window' };
  }

  const targetMs = input.policy.targetAt.getTime();
  eligible.sort(
    (a, b) =>
      Math.abs(a.observedAt.getTime() - targetMs) -
      Math.abs(b.observedAt.getTime() - targetMs),
  );

  return { ok: true, reason: 'observation_selected', selected: eligible[0] };
}
