/**
 * Connectivity diagnostic dimension — Master-Admin-only.
 *
 * Separates two timestamps that are NOT interchangeable:
 *
 * - observation time (`VehicleLatestState.sourceTimestamp` → `lastTelemetryAt`)
 *   "When was the vehicle telemetry actually observed?"
 *   This is the ONLY input to canonical telemetry freshness.
 *
 * - provider fetch time (`VehicleLatestState.providerFetchedAt` → `lastReceivedAt`)
 *   "When did SynqDrive last successfully receive a provider response?"
 *   Diagnostic metadata only — never an input to freshness.
 *
 * A provider can be reachable while the vehicle observation is stale (device or
 * SIM not transmitting). That combination is invisible in `telemetryState` alone,
 * so it gets its own dimension here rather than distorting the canonical one.
 *
 * Rules:
 * - Derived exclusively from already-authoritative runtime fields.
 * - Reuses canonical telemetry thresholds — no second freshness policy.
 * - Never makes a stale observation look fresh.
 * - Never replaces `telemetryState`.
 */
import {
  TELEMETRY_FRESH_THRESHOLD_MS,
  type TelemetryFreshness,
} from '../../vehicle-state-interpreter';
import { ProviderLinkState } from './connectivity-domain.types';

export const ConnectivityDiagnosticState = {
  /** Provider answering and vehicle observation within canonical live/standby bands. */
  PROVIDER_REACHABLE_DATA_FRESH: 'PROVIDER_REACHABLE_DATA_FRESH',
  /** Provider answering, but observation stale (>= 24h). SIM/device-inactivity signature. */
  PROVIDER_REACHABLE_DATA_STALE: 'PROVIDER_REACHABLE_DATA_STALE',
  /** Active link, but no recent successful provider response. */
  PROVIDER_UNREACHABLE: 'PROVIDER_UNREACHABLE',
  /** Link/consent/binding itself is broken or absent — reachability is not the question. */
  AUTH_OR_BINDING_ERROR: 'AUTH_OR_BINDING_ERROR',
  /** Not enough evidence to classify. */
  UNKNOWN: 'UNKNOWN',
} as const;
export type ConnectivityDiagnosticState =
  (typeof ConnectivityDiagnosticState)[keyof typeof ConnectivityDiagnosticState];
export const CONNECTIVITY_DIAGNOSTIC_STATES = Object.values(
  ConnectivityDiagnosticState,
);

/**
 * Observation freshness values treated as stale for diagnostic purposes.
 *
 * `standby` is excluded on purpose: DIMO devices heartbeat every 1–4h, so
 * anything under the canonical 24h standby boundary is normal operation.
 * `no_signal` is excluded because there is no observation timestamp to age —
 * absence of data is not evidence of a stalled device.
 */
const STALE_OBSERVATION_STATES: ReadonlySet<TelemetryFreshness> = new Set([
  'signal_delayed',
  'offline',
]);

/** Link states where the grant chain, not provider reachability, is the fault. */
const BROKEN_LINK_STATES: ReadonlySet<ProviderLinkState> = new Set([
  ProviderLinkState.REAUTH_REQUIRED,
  ProviderLinkState.REVOKED,
  ProviderLinkState.ERROR,
  ProviderLinkState.NO_LINK,
]);

export interface ConnectivityDiagnostic {
  state: ConnectivityDiagnosticState;
  /**
   * Whether a provider response arrived within the canonical fresh window.
   * `null` when no provider fetch timestamp has ever been recorded.
   */
  providerReachable: boolean | null;
  /** Age of the real vehicle observation (`sourceTimestamp` lineage). */
  observationAgeMs: number | null;
  /** Age of the last successful provider response (`providerFetchedAt` lineage). */
  providerFetchAgeMs: number | null;
  /** Canonical observation freshness — passed through, never re-derived here. */
  observationState: TelemetryFreshness;
}

export interface ClassifyConnectivityDiagnosticInput {
  providerLinkState: ProviderLinkState;
  /** Canonical `telemetryState` from the runtime builder. Authoritative. */
  telemetryState: TelemetryFreshness;
  /** Canonical `lastTelemetryAt` — real vehicle observation instant. */
  lastObservationAt: string | null;
  /** `lastReceivedAt` — provider response receipt instant. Diagnostic only. */
  lastProviderFetchAt: string | null;
  nowMs: number;
}

/**
 * Classify the diagnostic dimension.
 *
 * Precedence is deliberate: a broken grant chain or an unreachable provider must
 * win over `PROVIDER_REACHABLE_DATA_STALE`, so the stale-observation signal only
 * ever fires when the provider path is genuinely healthy.
 */
export function classifyConnectivityDiagnostic(
  input: ClassifyConnectivityDiagnosticInput,
): ConnectivityDiagnostic {
  const observationAgeMs = ageMs(input.lastObservationAt, input.nowMs);
  const providerFetchAgeMs = ageMs(input.lastProviderFetchAt, input.nowMs);
  const providerReachable =
    providerFetchAgeMs == null
      ? null
      : providerFetchAgeMs < TELEMETRY_FRESH_THRESHOLD_MS;

  const base = {
    providerReachable,
    observationAgeMs,
    providerFetchAgeMs,
    observationState: input.telemetryState,
  };

  if (BROKEN_LINK_STATES.has(input.providerLinkState)) {
    return { ...base, state: ConnectivityDiagnosticState.AUTH_OR_BINDING_ERROR };
  }

  if (input.providerLinkState !== ProviderLinkState.ACTIVE) {
    return { ...base, state: ConnectivityDiagnosticState.UNKNOWN };
  }

  if (providerReachable == null) {
    return { ...base, state: ConnectivityDiagnosticState.UNKNOWN };
  }

  if (!providerReachable) {
    return { ...base, state: ConnectivityDiagnosticState.PROVIDER_UNREACHABLE };
  }

  if (STALE_OBSERVATION_STATES.has(input.telemetryState)) {
    return {
      ...base,
      state: ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE,
    };
  }

  if (input.telemetryState === 'no_signal') {
    return { ...base, state: ConnectivityDiagnosticState.UNKNOWN };
  }

  return {
    ...base,
    state: ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_FRESH,
  };
}

function ageMs(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, nowMs - parsed);
}
