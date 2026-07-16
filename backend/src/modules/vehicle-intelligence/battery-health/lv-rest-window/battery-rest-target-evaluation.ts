import { BatteryMeasurementType } from '@prisma/client';
import {
  isChargingContext,
  isEngineOffForRest,
  isSpeedAtRest,
  isWakeVoltage,
} from './lv-rest-window.policy';
import type { LvRestWindowSignalContext } from './lv-rest-window.types';
import { LV_REST_TARGET_TYPES, type LvRestTargetType } from './lv-rest-window-target.metadata';

/** Half-width of the VALID quality window around the REST target instant. */
export const REST_60M_QUALITY_WINDOW_MS = 15 * 60_000;
export const REST_6H_QUALITY_WINDOW_MS = 30 * 60_000;

/** @deprecated Use getRestTargetQualityWindowMs */
export const DEFAULT_REST_TARGET_OBSERVATION_WINDOW_MS = REST_60M_QUALITY_WINDOW_MS;

export interface RestTargetObservationContext {
  speedKmh?: number | null;
  ignitionOn?: boolean | null;
  engineRunning?: boolean | null;
  hasActiveTrip?: boolean;
  isLvCharging?: boolean;
  isHvCharging?: boolean;
  lvVoltage?: number | null;
  tripId?: string | null;
  providerObservationOutcome?: string | null;
}

export interface RestTargetObservationCandidate {
  measurementId: string;
  observedAt: Date;
  numericValue: number;
  providerTimestamp: Date | null;
  context?: RestTargetObservationContext;
}

export interface RestTargetEvaluationPolicy {
  targetAt: Date;
  windowBeforeMs: number;
  windowAfterMs: number;
  wakeVoltageThreshold: number;
  maxRestingVoltage: number;
  restRequiresEngineOff: boolean;
}

export interface RestTargetEvaluationConstraints {
  excludedSourceMeasurementIds?: string[];
  /** Trip starts after the rest-window anchor — observations at/after these are rejected. */
  tripStartsAfterAnchor?: Date[];
}

export type RestTargetEvaluationResult =
  | { ok: true; reason: 'observation_selected'; selected: RestTargetObservationCandidate }
  | {
      ok: false;
      reason: string;
      retryable: boolean;
      missed: boolean;
    };

export function getRestTargetQualityWindowMs(
  restTargetType: Extract<LvRestTargetType, 'REST_60M' | 'REST_6H'>,
): number {
  return restTargetType === LV_REST_TARGET_TYPES.REST_6H
    ? REST_6H_QUALITY_WINDOW_MS
    : REST_60M_QUALITY_WINDOW_MS;
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

export function buildRestMissedMeasurementIdempotencyKey(input: {
  sessionId: string;
  restTargetType: Extract<LvRestTargetType, 'REST_60M' | 'REST_6H'>;
}): string {
  return `rest-missed:${input.sessionId}:${input.restTargetType}`;
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

export function hasActualProviderTimestamp(candidate: RestTargetObservationCandidate): boolean {
  return candidate.providerTimestamp != null;
}

export function isDuplicateProviderObservation(
  candidate: RestTargetObservationCandidate,
): boolean {
  const outcome = candidate.context?.providerObservationOutcome?.trim().toUpperCase();
  if (!outcome) return false;
  return (
    outcome === 'DUPLICATE_OBSERVATION' ||
    outcome === 'STALE_REPLAY' ||
    outcome === 'VALUE_CHANGED_WITHOUT_NEW_TIMESTAMP'
  );
}

export function toRestTargetSignalContext(
  candidate: RestTargetObservationCandidate,
): LvRestWindowSignalContext {
  const ctx = candidate.context ?? {};
  return {
    observedAt: candidate.observedAt,
    providerObservedAt: candidate.providerTimestamp,
    providerError: false,
    speedKmh: ctx.speedKmh ?? null,
    ignitionOn: ctx.ignitionOn ?? null,
    engineRunning: ctx.engineRunning ?? null,
    hasActiveTrip: ctx.hasActiveTrip === true,
    isLvCharging: ctx.isLvCharging === true,
    isHvCharging: ctx.isHvCharging === true,
    lvVoltage: candidate.numericValue,
    lastActivityAt: null,
    tripEndAt: null,
    tripId: ctx.tripId ?? null,
  };
}

export function isObservationAfterTripStart(
  observedAt: Date,
  tripStartsAfterAnchor: Date[],
): boolean {
  for (const tripStart of tripStartsAfterAnchor) {
    if (observedAt.getTime() >= tripStart.getTime()) {
      return true;
    }
  }
  return false;
}

/**
 * Wake flank: voltage crosses the wake threshold upward between consecutive observations.
 * The rising observation and any subsequent wake-level reading in the sorted batch are rejected.
 */
export function detectWakeFlankMeasurementIds(
  candidates: RestTargetObservationCandidate[],
  wakeThreshold: number,
): Set<string> {
  const sorted = [...candidates].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );
  const rejected = new Set<string>();
  let flankActive = false;

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const previous = i > 0 ? sorted[i - 1] : null;

    if (
      previous &&
      !isRestTargetWakeVoltage(previous.numericValue, wakeThreshold) &&
      isRestTargetWakeVoltage(current.numericValue, wakeThreshold)
    ) {
      flankActive = true;
    }

    if (flankActive) {
      rejected.add(current.measurementId);
    }
  }

  return rejected;
}

export function isCandidateEligibleForRestTarget(input: {
  candidate: RestTargetObservationCandidate;
  policy: RestTargetEvaluationPolicy;
  constraints: RestTargetEvaluationConstraints;
  wakeFlankIds: Set<string>;
}): { ok: boolean; reason: string } {
  const { candidate, policy, constraints, wakeFlankIds } = input;

  if ((constraints.excludedSourceMeasurementIds ?? []).includes(candidate.measurementId)) {
    return { ok: false, reason: 'excluded_source_observation' };
  }
  if (!hasActualProviderTimestamp(candidate)) {
    return { ok: false, reason: 'missing_provider_timestamp' };
  }
  if (isDuplicateProviderObservation(candidate)) {
    return { ok: false, reason: 'duplicate_provider_observation' };
  }
  if (!isPlausibleRestVoltage(candidate.numericValue)) {
    return { ok: false, reason: 'implausible_voltage' };
  }
  if (!isObservationWithinTargetWindow(candidate.observedAt, policy)) {
    return { ok: false, reason: 'outside_quality_window' };
  }
  if (
    isWakeAfterTargetWindow(candidate.observedAt, candidate.numericValue, policy)
  ) {
    return { ok: false, reason: 'wake_after_target_window' };
  }
  if (wakeFlankIds.has(candidate.measurementId)) {
    return { ok: false, reason: 'wake_flank' };
  }
  if (isRestTargetWakeVoltage(candidate.numericValue, policy.wakeVoltageThreshold)) {
    return { ok: false, reason: 'wake_voltage' };
  }
  if (candidate.numericValue > policy.maxRestingVoltage) {
    return { ok: false, reason: 'above_max_resting_voltage' };
  }

  const signal = toRestTargetSignalContext(candidate);
  if (signal.hasActiveTrip) {
    return { ok: false, reason: 'active_trip' };
  }
  if (!isSpeedAtRest(signal.speedKmh)) {
    return { ok: false, reason: 'speed_not_zero' };
  }
  if (!isEngineOffForRest(signal, policy.restRequiresEngineOff)) {
    return { ok: false, reason: 'engine_not_off' };
  }
  if (isChargingContext(signal)) {
    return { ok: false, reason: 'charging_context' };
  }
  if (
    isObservationAfterTripStart(
      candidate.observedAt,
      constraints.tripStartsAfterAnchor ?? [],
    )
  ) {
    return { ok: false, reason: 'observation_after_trip_start' };
  }

  return { ok: true, reason: 'eligible' };
}

export function selectRestTargetObservation(input: {
  candidates: RestTargetObservationCandidate[];
  policy: RestTargetEvaluationPolicy;
  constraints?: RestTargetEvaluationConstraints;
}): { ok: boolean; reason: string; selected?: RestTargetObservationCandidate } {
  const constraints = input.constraints ?? {};
  const wakeFlankIds = detectWakeFlankMeasurementIds(
    input.candidates,
    input.policy.wakeVoltageThreshold,
  );

  const eligible = input.candidates.filter((candidate) => {
    const gate = isCandidateEligibleForRestTarget({
      candidate,
      policy: input.policy,
      constraints,
      wakeFlankIds,
    });
    return gate.ok;
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

export function evaluateRestTargetRetryState(input: {
  now: Date;
  targetAt: Date;
  qualityWindowAfterMs: number;
  retryGraceMs: number;
  hasSelection: boolean;
}): { retryable: boolean; missed: boolean } {
  const retryWindowEndMs =
    input.targetAt.getTime() + input.qualityWindowAfterMs + input.retryGraceMs;

  if (input.hasSelection) {
    return { retryable: false, missed: false };
  }

  if (input.now.getTime() < retryWindowEndMs) {
    return { retryable: true, missed: false };
  }

  return { retryable: false, missed: true };
}

export function evaluateRestTargetOutcome(input: {
  candidates: RestTargetObservationCandidate[];
  policy: RestTargetEvaluationPolicy;
  constraints?: RestTargetEvaluationConstraints;
  now?: Date;
  retryGraceMs: number;
}): RestTargetEvaluationResult {
  const selection = selectRestTargetObservation({
    candidates: input.candidates,
    policy: input.policy,
    constraints: input.constraints,
  });

  if (selection.ok && selection.selected) {
    return {
      ok: true,
      reason: 'observation_selected',
      selected: selection.selected,
    };
  }

  const now = input.now ?? new Date();
  const retry = evaluateRestTargetRetryState({
    now,
    targetAt: input.policy.targetAt,
    qualityWindowAfterMs: input.policy.windowAfterMs,
    retryGraceMs: input.retryGraceMs,
    hasSelection: false,
  });

  return {
    ok: false,
    reason: selection.reason,
    retryable: retry.retryable,
    missed: retry.missed,
  };
}

export function parseRestTargetObservationContext(
  context: unknown,
  provenance: unknown,
): RestTargetObservationContext {
  const ctx = isPlainObject(context) ? context : {};
  const prov = isPlainObject(provenance) ? provenance : {};
  const merged = { ...prov, ...ctx };

  return {
    speedKmh: readNullableNumber(merged.speedKmh),
    ignitionOn: readNullableBoolean(merged.ignitionOn),
    engineRunning: readNullableBoolean(merged.engineRunning),
    hasActiveTrip: merged.hasActiveTrip === true,
    isLvCharging: merged.isLvCharging === true,
    isHvCharging: merged.isHvCharging === true,
    lvVoltage: readNullableNumber(merged.lvVoltage),
    tripId: typeof merged.tripId === 'string' ? merged.tripId : null,
    providerObservationOutcome:
      typeof merged.providerObservationOutcome === 'string'
        ? merged.providerObservationOutcome
        : typeof merged.observationOutcome === 'string'
          ? merged.observationOutcome
          : null,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}
