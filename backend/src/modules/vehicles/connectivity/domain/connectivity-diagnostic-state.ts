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

/**
 * Why the canonical fresh threshold is the right reachability window — and what
 * it does and does not prove.
 *
 * `providerFetchedAt` is written in `DimoSnapshotProcessor` only after the
 * vehicle JWT, the telemetry fetch and a non-empty `signalsLatest` all succeed;
 * a failed or empty poll throws first and leaves the column frozen. So a recent
 * value is confirmed evidence of a successful provider response, which is what
 * makes the `PROVIDER_REACHABLE_DATA_STALE` signal trustworthy.
 *
 * The absence of a recent value is weaker evidence, because our own polling can
 * pause without the provider being at fault:
 * - `DimoSnapshotScheduler` documents host-level suspensions (sleep, freeze, GC
 *   stall) and treats gaps over 3 min as missed work, capped at a 24h backfill.
 * - `canEnqueueQueue` can gate enqueueing entirely.
 * - Vehicles outside the poll cohort are never enqueued at all — handled
 *   explicitly via `providerPollEligible`.
 *
 * The 30s cadence against a 15 min window leaves ~30 missed ticks of slack, so
 * normal jitter, retries and backoff never trip it. A fleet-wide worker pause
 * still can, which is why `PROVIDER_UNREACHABLE` is worded as "no recent
 * successful provider response" rather than an assertion that the provider is
 * down. Deliberately no second threshold: this reuses
 * `TELEMETRY_FRESH_THRESHOLD_MS` unchanged.
 */

/** Link states where the grant chain, not provider reachability, is the fault. */
const BROKEN_LINK_STATES: ReadonlySet<ProviderLinkState> = new Set([
  ProviderLinkState.REAUTH_REQUIRED,
  ProviderLinkState.REVOKED,
  ProviderLinkState.ERROR,
  ProviderLinkState.NO_LINK,
]);

/**
 * Tolerated forward clock skew between provider/device clocks and ours.
 * Matches the existing convention in `battery-provider-observation.policy.ts`
 * (`DEFAULT_MAX_FUTURE_SKEW_MS`) rather than introducing a new policy value.
 *
 * Beyond this the timestamp is unusable: reporting it as age 0 would let a
 * wildly future timestamp read as "just observed".
 */
export const DIAGNOSTIC_MAX_FUTURE_SKEW_MS = 60_000;

export interface ConnectivityDiagnostic {
  state: ConnectivityDiagnosticState;
  /**
   * Whether a provider response arrived within the canonical fresh window.
   * `null` when no usable provider fetch timestamp has been recorded.
   */
  providerReachable: boolean | null;
  /** Age of the real vehicle observation (`sourceTimestamp` lineage). */
  observationAgeMs: number | null;
  /** Age of the last successful provider response (`providerFetchedAt` lineage). */
  providerFetchAgeMs: number | null;
  /** Canonical observation freshness — passed through, never re-derived here. */
  observationState: TelemetryFreshness;
  /**
   * Whether the vehicle currently sits inside the provider polling cohort.
   * `false` proves an absent recent fetch is a scheduling decision rather than
   * provider downtime; `null` when eligibility could not be established.
   */
  providerPollEligible: boolean | null;
  /**
   * Whether an active provider binding (data source link) exists.
   * `null` when the caller supplied no authoritative binding evidence — the
   * link state alone cannot prove it either way outside ACTIVE/NO_LINK.
   */
  bindingActive: boolean | null;
}

export interface ClassifyConnectivityDiagnosticInput {
  providerLinkState: ProviderLinkState;
  /** Canonical `telemetryState` from the runtime builder. Authoritative. */
  telemetryState: TelemetryFreshness;
  /** Canonical `lastTelemetryAt` — real vehicle observation instant. */
  lastObservationAt: string | null;
  /** `lastReceivedAt` — provider response receipt instant. Diagnostic only. */
  lastProviderFetchAt: string | null;
  /**
   * Whether the provider polling cohort currently includes this vehicle.
   * See {@link ConnectivityDiagnostic.providerPollEligible}.
   */
  providerPollEligible?: boolean | null;
  /** Authoritative active-binding evidence, when the caller has it. */
  bindingActive?: boolean | null;
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
    providerPollEligible: input.providerPollEligible ?? null,
    bindingActive: input.bindingActive ?? null,
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
    // A stale `providerFetchedAt` only proves the provider is unreachable when
    // the vehicle was actually due to be polled. Vehicles outside the polling
    // cohort (status not AVAILABLE/RENTED, provider not CONNECTED, no token)
    // are never enqueued, so their fetch timestamp freezes for benign reasons.
    return {
      ...base,
      state:
        input.providerPollEligible === false
          ? ConnectivityDiagnosticState.UNKNOWN
          : ConnectivityDiagnosticState.PROVIDER_UNREACHABLE,
    };
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

/**
 * Age of an instant, or `null` when there is no usable age.
 *
 * A timestamp beyond {@link DIAGNOSTIC_MAX_FUTURE_SKEW_MS} in the future is
 * treated as unusable rather than clamped to 0 — clamping would let a corrupt
 * future timestamp present as "observed just now" and read as healthy. Small
 * forward skew still clamps to 0, since provider and device clocks drift.
 */
function ageMs(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  const age = nowMs - parsed;
  if (age < -DIAGNOSTIC_MAX_FUTURE_SKEW_MS) return null;
  return Math.max(0, age);
}
