import {
  BATTERY_FRESHNESS_THRESHOLDS_MS,
  buildObservationFreshness,
  type ObservationFreshness,
} from './battery-freshness.policy';

export const BATTERY_SIGNAL_FRESHNESS_STATES = [
  'FRESH',
  'STALE',
  'MISSING_TIMESTAMP',
  'OUT_OF_ORDER',
  'UNAVAILABLE',
  'NO_MEASUREMENT',
] as const;

export type BatterySignalFreshnessState =
  (typeof BATTERY_SIGNAL_FRESHNESS_STATES)[number];

export const BATTERY_SIGNAL_ERROR_CODES = [
  'PROVIDER_ERROR',
  'QUERY_TIMEOUT',
  'CAPABILITY_UNAVAILABLE',
  'UNSUPPORTED',
  'NO_MEASUREMENT',
  'STALE',
  'INTERNAL_ERROR',
] as const;

export type BatterySignalErrorCode =
  (typeof BATTERY_SIGNAL_ERROR_CODES)[number];

export const BATTERY_SIGNAL_SOURCES = [
  'DIMO_TELEMETRY',
  'DIMO_PROVIDER_SIGNAL',
  'RESTING_SNAPSHOT',
  'LIVE_TELEMETRY',
  'BATTERY_EVIDENCE',
  'V2_PUBLICATION',
  'HV_CHARGE_SESSION',
  'WORKSHOP_REPORT',
  'CAPABILITY_PREFLIGHT',
  'UNKNOWN',
] as const;

export type BatterySignalSource =
  (typeof BATTERY_SIGNAL_SOURCES)[number];

export interface BatterySignalFreshness {
  observedAt: string | null;
  receivedAt: string | null;
  ageMs: number | null;
  freshnessState: BatterySignalFreshnessState;
  providerDelayMs: number | null;
  source: BatterySignalSource;
}

export interface BatterySignalError {
  code: BatterySignalErrorCode;
  labelDe: string;
  module: string;
  recoverable: boolean;
}

export interface BatteryNamedFreshnessSlices {
  liveVoltageFreshness: BatterySignalFreshness;
  restMeasurementFreshness: BatterySignalFreshness | null;
  startProxyFreshness: BatterySignalFreshness | null;
  assessmentFreshness: BatterySignalFreshness | null;
  publicationFreshness: BatterySignalFreshness | null;
  providerSohFreshness: BatterySignalFreshness | null;
  hvSessionFreshness: BatterySignalFreshness | null;
}

export interface BatterySignalEnvelope<T> {
  value: T;
  freshness: BatterySignalFreshness;
  error: BatterySignalError | null;
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapObservationStateToSignalState(
  observation: ObservationFreshness,
  hasValue: boolean,
): BatterySignalFreshnessState {
  switch (observation.observationState) {
    case 'FRESH':
      return 'FRESH';
    case 'STALE':
      return 'STALE';
    case 'MISSING_TIMESTAMP':
      return hasValue ? 'MISSING_TIMESTAMP' : 'NO_MEASUREMENT';
    case 'OUT_OF_ORDER':
      return 'OUT_OF_ORDER';
    case 'UNAVAILABLE':
    default:
      return hasValue ? 'MISSING_TIMESTAMP' : 'NO_MEASUREMENT';
  }
}

export function computeProviderDelayMs(
  observedAt: Date | string | null | undefined,
  receivedAt: Date | string | null | undefined,
): number | null {
  const observed = parseDate(observedAt);
  const received = parseDate(receivedAt);
  if (!observed || !received) return null;
  const delay = received.getTime() - observed.getTime();
  return delay >= 0 ? delay : null;
}

export function buildBatterySignalFreshness(input: {
  observedAt: Date | string | null | undefined;
  receivedAt: Date | string | null | undefined;
  now?: Date;
  maxAgeMs: number;
  source: BatterySignalSource;
  hasValue?: boolean;
  lastObservedAt?: Date | string | null;
}): BatterySignalFreshness {
  const now = input.now ?? new Date();
  const received = parseDate(input.receivedAt);
  const hasValue = input.hasValue ?? false;
  const observation = buildObservationFreshness({
    observedAt: input.observedAt,
    now,
    maxAgeMs: input.maxAgeMs,
    hasValueCarrier: hasValue,
    lastObservedAt: input.lastObservedAt,
  });

  return {
    observedAt: observation.observedAt,
    receivedAt: received?.toISOString() ?? null,
    ageMs: observation.observationAgeMs,
    freshnessState: mapObservationStateToSignalState(observation, hasValue),
    providerDelayMs: computeProviderDelayMs(input.observedAt, input.receivedAt),
    source: input.source,
  };
}

export function observationFreshnessToSignalFreshness(
  observation: ObservationFreshness,
  input: {
    receivedAt: Date | string | null | undefined;
    source: BatterySignalSource;
    hasValue?: boolean;
  },
): BatterySignalFreshness {
  const hasValue = input.hasValue ?? observation.observedAt != null;
  return {
    observedAt: observation.observedAt,
    receivedAt: parseDate(input.receivedAt)?.toISOString() ?? null,
    ageMs: observation.observationAgeMs,
    freshnessState: mapObservationStateToSignalState(observation, hasValue),
    providerDelayMs: computeProviderDelayMs(
      observation.observedAt,
      input.receivedAt,
    ),
    source: input.source,
  };
}

export function signalFreshnessIsDecisionFresh(
  freshness: BatterySignalFreshness,
): boolean {
  return freshness.freshnessState === 'FRESH';
}

export function buildSignalEnvelope<T>(input: {
  value: T;
  freshness: BatterySignalFreshness;
  error?: BatterySignalError | null;
}): BatterySignalEnvelope<T> {
  return {
    value: input.value,
    freshness: input.freshness,
    error: input.error ?? null,
  };
}

const SECRET_PATTERNS = [
  /bearer\s+/i,
  /api[_-]?key/i,
  /password/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /stack trace/i,
  /at\s+\S+\s+\(/,
];

export function sanitizeBatteryErrorMessage(message: string): string {
  const trimmed = message.trim().slice(0, 240);
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'Interner Verarbeitungsfehler';
    }
  }
  return trimmed || 'Unbekannter Fehler';
}

export function classifyBatteryModuleError(
  module: string,
  error: unknown,
): BatterySignalError {
  const fallback: BatterySignalError = {
    code: 'INTERNAL_ERROR',
    labelDe: 'Interner Verarbeitungsfehler',
    module,
    recoverable: true,
  };

  if (error == null) return fallback;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unbekannter Fehler';
  const safeMessage = sanitizeBatteryErrorMessage(message);
  const lower = safeMessage.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return {
      code: 'QUERY_TIMEOUT',
      labelDe: 'Provider-Abfrage Zeitüberschreitung',
      module,
      recoverable: true,
    };
  }
  if (lower.includes('provider') || lower.includes('dimo')) {
    return {
      code: 'PROVIDER_ERROR',
      labelDe: 'Provider-Fehler bei der Datenabfrage',
      module,
      recoverable: true,
    };
  }
  if (lower.includes('capability') || lower.includes('preflight')) {
    return {
      code: 'CAPABILITY_UNAVAILABLE',
      labelDe: 'Fahrzeug-Capability nicht verfügbar',
      module,
      recoverable: true,
    };
  }
  if (lower.includes('unsupported') || lower.includes('not supported')) {
    return {
      code: 'UNSUPPORTED',
      labelDe: 'Signal für Fahrzeugprofil nicht unterstützt',
      module,
      recoverable: false,
    };
  }
  if (lower.includes('no measurement') || lower.includes('no data')) {
    return {
      code: 'NO_MEASUREMENT',
      labelDe: 'Keine Messung verfügbar',
      module,
      recoverable: true,
    };
  }

  return {
    ...fallback,
    labelDe: safeMessage,
  };
}

export async function resolveBatteryModuleSafe<T>(input: {
  module: string;
  loader: () => Promise<T>;
  errors: BatterySignalError[];
}): Promise<T | null> {
  try {
    return await input.loader();
  } catch (error) {
    input.errors.push(classifyBatteryModuleError(input.module, error));
    return null;
  }
}

export function staleSignalError(module: string): BatterySignalError {
  return {
    code: 'STALE',
    labelDe: 'Messwert veraltet',
    module,
    recoverable: true,
  };
}

export function buildNamedFreshnessSlices(input: {
  liveVoltageFreshness: BatterySignalFreshness;
  restMeasurementFreshness?: BatterySignalFreshness | null;
  startProxyFreshness?: BatterySignalFreshness | null;
  assessmentFreshness?: BatterySignalFreshness | null;
  publicationFreshness?: BatterySignalFreshness | null;
  providerSohFreshness?: BatterySignalFreshness | null;
  hvSessionFreshness?: BatterySignalFreshness | null;
}): BatteryNamedFreshnessSlices {
  return {
    liveVoltageFreshness: input.liveVoltageFreshness,
    restMeasurementFreshness: input.restMeasurementFreshness ?? null,
    startProxyFreshness: input.startProxyFreshness ?? null,
    assessmentFreshness: input.assessmentFreshness ?? null,
    publicationFreshness: input.publicationFreshness ?? null,
    providerSohFreshness: input.providerSohFreshness ?? null,
    hvSessionFreshness: input.hvSessionFreshness ?? null,
  };
}

export const BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS = BATTERY_FRESHNESS_THRESHOLDS_MS;
