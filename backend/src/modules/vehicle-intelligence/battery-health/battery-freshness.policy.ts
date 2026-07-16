/**
 * Central battery freshness policy — separates poll fetch time from provider observation time.
 *
 * Rules:
 * - Vehicle value "current" semantics use `observationFreshness` (provider `observedAt`).
 * - A successful recent poll does not refresh a stale observed value.
 * - Missing `observedAt` → MISSING_TIMESTAMP (or UNAVAILABLE when no carrier).
 * - Thresholds are centralized here — no UI magic numbers.
 */

export const BATTERY_FETCH_FRESHNESS_STATES = [
  'FRESH',
  'STALE',
  'UNAVAILABLE',
] as const;

export type BatteryFetchFreshnessState =
  (typeof BATTERY_FETCH_FRESHNESS_STATES)[number];

export const BATTERY_OBSERVATION_FRESHNESS_STATES = [
  'FRESH',
  'STALE',
  'MISSING_TIMESTAMP',
  'OUT_OF_ORDER',
  'UNAVAILABLE',
] as const;

export type BatteryObservationFreshnessState =
  (typeof BATTERY_OBSERVATION_FRESHNESS_STATES)[number];

/** Central thresholds (ms) — env overrides optional later. */
export const BATTERY_FRESHNESS_THRESHOLDS_MS = {
  /** Poll / VLS mirror considered a live fetch. */
  fetchLive: 15 * 60_000,
  /** LV live/rest voltage observation for display decisions. */
  lvLiveObservation: 48 * 60 * 60_000,
  /** HV telemetry observation (SOC, energy, charging context). */
  hvTelemetryObservation: 7 * 24 * 60 * 60_000,
  /** Provider-reported HV SOH. */
  providerSohObservation: 45 * 24 * 60 * 60_000,
  /** Workshop/document/manual HV SOH reports. */
  reportedSohObservation: 365 * 24 * 60 * 60_000,
  /** REST_60M / REST_6H measurement windows (future hooks). */
  restMeasurementObservation: 48 * 60 * 60_000,
  /** START_DIP_PROXY crank capture (future hooks). */
  startProxyObservation: 7 * 24 * 60 * 60_000,
  /** Assessment publication inputs (future hooks). */
  assessmentObservation: 30 * 24 * 60 * 60_000,
  /** Published SOH row freshness (future hooks). */
  publicationObservation: 45 * 24 * 60 * 60_000,
  /** HV charge session boundary observations (future hooks). */
  hvSessionObservation: 7 * 24 * 60 * 60_000,
} as const;

export interface FetchFreshness {
  fetchedAt: string | null;
  fetchAgeMs: number | null;
  fetchState: BatteryFetchFreshnessState;
}

export interface ObservationFreshness {
  observedAt: string | null;
  observationAgeMs: number | null;
  observationState: BatteryObservationFreshnessState;
}

/** Structured freshness bundle for battery health read models. */
export interface BatteryDomainFreshnessBundle {
  fetch: FetchFreshness;
  observation: ObservationFreshness;
  restMeasurementFreshness: ObservationFreshness | null;
  startProxyFreshness: ObservationFreshness | null;
  assessmentFreshness: ObservationFreshness | null;
  publicationFreshness: ObservationFreshness | null;
  providerSohFreshness: ObservationFreshness | null;
  hvSessionFreshness: ObservationFreshness | null;
}

/** @deprecated Compatibility shape — maps from observation freshness only. */
export interface LegacyFreshnessInfo {
  observedAt: string | null;
  ageMs: number | null;
  isFresh: boolean;
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildFetchFreshness(input: {
  fetchedAt: Date | string | null | undefined;
  now?: Date;
  maxAgeMs?: number;
}): FetchFreshness {
  const now = input.now ?? new Date();
  const maxAgeMs = input.maxAgeMs ?? BATTERY_FRESHNESS_THRESHOLDS_MS.fetchLive;
  const fetched = parseDate(input.fetchedAt);

  if (!fetched) {
    return {
      fetchedAt: null,
      fetchAgeMs: null,
      fetchState: 'UNAVAILABLE',
    };
  }

  const fetchAgeMs = Math.max(0, now.getTime() - fetched.getTime());
  return {
    fetchedAt: fetched.toISOString(),
    fetchAgeMs,
    fetchState: fetchAgeMs <= maxAgeMs ? 'FRESH' : 'STALE',
  };
}

export function buildObservationFreshness(input: {
  observedAt: Date | string | null | undefined;
  now?: Date;
  maxAgeMs: number;
  lastObservedAt?: Date | string | null;
  hasValueCarrier?: boolean;
}): ObservationFreshness {
  const now = input.now ?? new Date();
  const observed = parseDate(input.observedAt);
  const lastObserved = parseDate(input.lastObservedAt ?? null);

  if (!observed) {
    return {
      observedAt: null,
      observationAgeMs: null,
      observationState:
        input.hasValueCarrier === false ? 'UNAVAILABLE' : 'MISSING_TIMESTAMP',
    };
  }

  if (
    lastObserved &&
    observed.getTime() < lastObserved.getTime()
  ) {
    return {
      observedAt: observed.toISOString(),
      observationAgeMs: Math.max(0, now.getTime() - observed.getTime()),
      observationState: 'OUT_OF_ORDER',
    };
  }

  const observationAgeMs = Math.max(0, now.getTime() - observed.getTime());
  return {
    observedAt: observed.toISOString(),
    observationAgeMs,
    observationState:
      observationAgeMs <= input.maxAgeMs ? 'FRESH' : 'STALE',
  };
}

export function observationFreshnessIsDecisionFresh(
  freshness: ObservationFreshness,
): boolean {
  return freshness.observationState === 'FRESH';
}

export function toLegacyFreshnessInfo(
  observation: ObservationFreshness,
): LegacyFreshnessInfo {
  return {
    observedAt: observation.observedAt,
    ageMs: observation.observationAgeMs,
    isFresh: observationFreshnessIsDecisionFresh(observation),
  };
}

export function buildUnavailableObservationFreshness(): ObservationFreshness {
  return {
    observedAt: null,
    observationAgeMs: null,
    observationState: 'UNAVAILABLE',
  };
}

export function buildBatteryDomainFreshnessBundle(input: {
  fetch: FetchFreshness;
  observation: ObservationFreshness;
  restMeasurementFreshness?: ObservationFreshness | null;
  startProxyFreshness?: ObservationFreshness | null;
  assessmentFreshness?: ObservationFreshness | null;
  publicationFreshness?: ObservationFreshness | null;
  providerSohFreshness?: ObservationFreshness | null;
  hvSessionFreshness?: ObservationFreshness | null;
}): BatteryDomainFreshnessBundle {
  return {
    fetch: input.fetch,
    observation: input.observation,
    restMeasurementFreshness: input.restMeasurementFreshness ?? null,
    startProxyFreshness: input.startProxyFreshness ?? null,
    assessmentFreshness: input.assessmentFreshness ?? null,
    publicationFreshness: input.publicationFreshness ?? null,
    providerSohFreshness: input.providerSohFreshness ?? null,
    hvSessionFreshness: input.hvSessionFreshness ?? null,
  };
}

/** Adapter for existing data-quality helpers. */
export function observationFreshnessToBatteryInput(
  observation: ObservationFreshness,
): { observedAt: string | null; ageMs: number | null; isFresh: boolean } {
  return toLegacyFreshnessInfo(observation);
}

/** @deprecated Use `buildObservationFreshness` — kept for incremental migration. */
export function legacyFreshnessFromDate(
  date: Date | null | undefined,
  maxAgeMs: number,
  now: Date = new Date(),
): LegacyFreshnessInfo {
  return toLegacyFreshnessInfo(
    buildObservationFreshness({
      observedAt: date,
      maxAgeMs,
      now,
      hasValueCarrier: date != null,
    }),
  );
}
