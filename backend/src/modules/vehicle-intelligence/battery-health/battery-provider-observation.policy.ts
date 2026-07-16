/**
 * Pure policy: decide whether an ingested provider sample is a new observation.
 *
 * Contract: `docs/audits/battery-measurement-domain-decision.md` §3.3
 * — Poll ≠ neue Messung; Provider-`observedAt` + Wert bestimmen Idempotenz.
 *
 * No UI, no persistence, no side effects.
 */

export const BATTERY_PROVIDER_OBSERVATION_OUTCOMES = [
  'NEW_OBSERVATION',
  'DUPLICATE_OBSERVATION',
  'OUT_OF_ORDER',
  'INVALID_TIMESTAMP',
  'VALUE_CHANGED_WITHOUT_NEW_TIMESTAMP',
  'STALE_REPLAY',
] as const;

export type BatteryProviderObservationOutcome =
  (typeof BATTERY_PROVIDER_OBSERVATION_OUTCOMES)[number];

export type BatteryProviderObservationValue =
  | number
  | string
  | boolean
  | null;

export interface BatteryProviderStoredObservationContext {
  observedAt: Date | string;
  normalizedValue: BatteryProviderObservationValue;
  receivedAt?: Date | string | null;
  idempotencyKey?: string | null;
}

export interface BatteryProviderObservationInput {
  organizationId: string;
  vehicleId: string;
  signalName: string;
  providerSource: string;
  normalizedValue: BatteryProviderObservationValue;
  observedAt: Date | string | null | undefined;
  receivedAt: Date | string;
  lastStored?: BatteryProviderStoredObservationContext | null;
}

export interface BatteryProviderObservationPolicyOptions {
  /** observedAt must not be more than this far in the future vs receivedAt. */
  maxFutureSkewMs?: number;
  /**
   * When a poll repeats the same provider timestamp+value and the provider
   * observation is older than this vs receivedAt, classify as STALE_REPLAY.
   */
  staleReplayThresholdMs?: number;
}

export interface BatteryProviderObservationDecision {
  outcome: BatteryProviderObservationOutcome;
  idempotencyKey: string | null;
  observedAt: Date | null;
  receivedAt: Date;
  /** Safe to insert a new measurement/evidence row. */
  shouldPersist: boolean;
  /** Safe to update latest-state / “current truth” pointers. */
  shouldAdvanceLatest: boolean;
}

const DEFAULT_MAX_FUTURE_SKEW_MS = 60_000;
const DEFAULT_STALE_REPLAY_THRESHOLD_MS = 5 * 60_000;

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function valuesEqual(
  a: BatteryProviderObservationValue,
  b: BatteryProviderObservationValue,
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a === 'number' && typeof b === 'number') {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.abs(a - b) < 1e-9;
  }
  return false;
}

/** Stable scalar serialization for idempotency keys. */
export function canonicalizeBatteryProviderObservationValue(
  value: BatteryProviderObservationValue,
): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'invalid';
    return Object.is(value, -0) ? '0' : Number(value.toFixed(6)).toString();
  }
  return value.trim();
}

export function buildBatteryProviderObservationIdempotencyKey(input: {
  organizationId: string;
  vehicleId: string;
  signalName: string;
  providerSource: string;
  observedAt: Date;
  normalizedValue: BatteryProviderObservationValue;
}): string {
  return [
    'battery-obs',
    input.organizationId,
    input.vehicleId,
    input.signalName,
    input.providerSource,
    String(input.observedAt.getTime()),
    canonicalizeBatteryProviderObservationValue(input.normalizedValue),
  ].join(':');
}

function buildDecision(
  outcome: BatteryProviderObservationOutcome,
  observedAt: Date | null,
  receivedAt: Date,
  idempotencyKey: string | null,
): BatteryProviderObservationDecision {
  const shouldPersist = outcome === 'NEW_OBSERVATION';
  const shouldAdvanceLatest = outcome === 'NEW_OBSERVATION';

  return {
    outcome,
    idempotencyKey,
    observedAt,
    receivedAt,
    shouldPersist,
    shouldAdvanceLatest,
  };
}

/**
 * Evaluate whether an incoming provider sample should create a new observation.
 */
export function evaluateBatteryProviderObservation(
  input: BatteryProviderObservationInput,
  options: BatteryProviderObservationPolicyOptions = {},
): BatteryProviderObservationDecision {
  const maxFutureSkewMs = options.maxFutureSkewMs ?? DEFAULT_MAX_FUTURE_SKEW_MS;
  const staleReplayThresholdMs =
    options.staleReplayThresholdMs ?? DEFAULT_STALE_REPLAY_THRESHOLD_MS;

  const receivedAt = parseDate(input.receivedAt);
  if (!receivedAt) {
    return buildDecision('INVALID_TIMESTAMP', null, new Date(), null);
  }

  const observedAt = parseDate(input.observedAt);
  if (!observedAt) {
    return buildDecision('INVALID_TIMESTAMP', null, receivedAt, null);
  }

  if (observedAt.getTime() > receivedAt.getTime() + maxFutureSkewMs) {
    return buildDecision('INVALID_TIMESTAMP', null, receivedAt, null);
  }

  const idempotencyKey = buildBatteryProviderObservationIdempotencyKey({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    signalName: input.signalName,
    providerSource: input.providerSource,
    observedAt,
    normalizedValue: input.normalizedValue,
  });

  const lastStored = input.lastStored ?? null;
  if (!lastStored) {
    return buildDecision(
      'NEW_OBSERVATION',
      observedAt,
      receivedAt,
      idempotencyKey,
    );
  }

  const lastObservedAt = parseDate(lastStored.observedAt);
  if (!lastObservedAt) {
    return buildDecision(
      'NEW_OBSERVATION',
      observedAt,
      receivedAt,
      idempotencyKey,
    );
  }

  const lastReceivedAt = parseDate(lastStored.receivedAt ?? null);
  const observedAtMs = observedAt.getTime();
  const lastObservedAtMs = lastObservedAt.getTime();

  if (observedAtMs < lastObservedAtMs) {
    return buildDecision('OUT_OF_ORDER', observedAt, receivedAt, idempotencyKey);
  }

  if (observedAtMs === lastObservedAtMs) {
    if (valuesEqual(input.normalizedValue, lastStored.normalizedValue)) {
      const observationAgeMs = receivedAt.getTime() - observedAtMs;
      const receivedAdvanced =
        lastReceivedAt != null && receivedAt.getTime() > lastReceivedAt.getTime();

      if (
        receivedAdvanced &&
        observationAgeMs > staleReplayThresholdMs
      ) {
        return buildDecision(
          'STALE_REPLAY',
          observedAt,
          receivedAt,
          idempotencyKey,
        );
      }

      return buildDecision(
        'DUPLICATE_OBSERVATION',
        observedAt,
        receivedAt,
        idempotencyKey,
      );
    }

    return buildDecision(
      'VALUE_CHANGED_WITHOUT_NEW_TIMESTAMP',
      observedAt,
      receivedAt,
      idempotencyKey,
    );
  }

  // observedAt advanced — new provider observation even if value unchanged.
  return buildDecision(
    'NEW_OBSERVATION',
    observedAt,
    receivedAt,
    idempotencyKey,
  );
}
