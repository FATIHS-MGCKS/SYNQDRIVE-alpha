/**
 * Connectivity Diagnostic Hardening — provider reachable vs. observation stale.
 *
 * Reference incident (KS MX 2024): DIMO SNAPSHOT polling kept succeeding every
 * ~30s so `provider_fetched_at` advanced, while `source_timestamp` stayed frozen
 * for ~27h because the device SIM had been disabled. Canonical freshness
 * correctly went stale; the provider-reachable-but-silent-device combination was
 * what we could not see.
 */
import {
  classifyConnectivityDiagnostic,
  ConnectivityDiagnosticState,
} from './connectivity-diagnostic-state';
import { ProviderLinkState, type TelemetryFreshness } from './connectivity-domain.types';
import { TELEMETRY_FRESH_THRESHOLD_MS } from '../../vehicle-state-interpreter';

const NOW_MS = new Date('2026-08-28T12:00:00.000Z').getTime();

function secondsAgo(s: number): string {
  return new Date(NOW_MS - s * 1_000).toISOString();
}

function hoursAgo(h: number): string {
  return new Date(NOW_MS - h * 3_600_000).toISOString();
}

function inFuture(ms: number): string {
  return new Date(NOW_MS + ms).toISOString();
}

function classify(overrides: {
  providerLinkState?: ProviderLinkState;
  telemetryState?: TelemetryFreshness;
  lastObservationAt?: string | null;
  lastProviderFetchAt?: string | null;
  providerPollEligible?: boolean | null;
  bindingActive?: boolean | null;
}) {
  return classifyConnectivityDiagnostic({
    providerLinkState: overrides.providerLinkState ?? ProviderLinkState.ACTIVE,
    telemetryState: overrides.telemetryState ?? 'live',
    lastObservationAt:
      overrides.lastObservationAt === undefined
        ? secondsAgo(120)
        : overrides.lastObservationAt,
    lastProviderFetchAt:
      overrides.lastProviderFetchAt === undefined
        ? secondsAgo(20)
        : overrides.lastProviderFetchAt,
    providerPollEligible: overrides.providerPollEligible,
    bindingActive: overrides.bindingActive,
    nowMs: NOW_MS,
  });
}

describe('classifyConnectivityDiagnostic', () => {
  // ── Phase 8.1 — fresh fetch + fresh observation ────────────────────────────
  it('fresh provider fetch + fresh observation → PROVIDER_REACHABLE_DATA_FRESH', () => {
    const result = classify({ telemetryState: 'live' });

    expect(result.state).toBe(
      ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_FRESH,
    );
    expect(result.providerReachable).toBe(true);
  });

  it('standby observation is normal, not stale (DIMO heartbeats 1–4h)', () => {
    const result = classify({
      telemetryState: 'standby',
      lastObservationAt: hoursAgo(6),
    });

    expect(result.state).toBe(
      ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_FRESH,
    );
  });

  // ── Phase 8.2 — the incident signature ─────────────────────────────────────
  it('fresh provider fetch + 27h stale observation → PROVIDER_REACHABLE_DATA_STALE', () => {
    const result = classify({
      telemetryState: 'signal_delayed',
      lastObservationAt: hoursAgo(27),
      lastProviderFetchAt: secondsAgo(20),
    });

    expect(result.state).toBe(
      ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE,
    );
    expect(result.providerReachable).toBe(true);
    expect(result.observationAgeMs).toBe(27 * 3_600_000);
    expect(result.providerFetchAgeMs).toBe(20_000);
  });

  it('fresh provider fetch + offline observation (>48h) → PROVIDER_REACHABLE_DATA_STALE', () => {
    const result = classify({
      telemetryState: 'offline',
      lastObservationAt: hoursAgo(72),
    });

    expect(result.state).toBe(
      ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE,
    );
  });

  it('never reports the stale observation as fresh', () => {
    const result = classify({
      telemetryState: 'signal_delayed',
      lastObservationAt: hoursAgo(27),
      lastProviderFetchAt: secondsAgo(20),
    });

    // Observation state is passed through from canonical telemetryState, and the
    // observation age must reflect the frozen source_timestamp — never the poll.
    expect(result.observationState).toBe('signal_delayed');
    expect(result.observationAgeMs).toBeGreaterThan(result.providerFetchAgeMs!);
  });

  // ── Phase 8.4 — automatic recovery ─────────────────────────────────────────
  it('recovers automatically once the observation timestamp advances', () => {
    const stale = classify({
      telemetryState: 'signal_delayed',
      lastObservationAt: hoursAgo(27),
    });
    expect(stale.state).toBe(
      ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE,
    );

    // Device resumes transmitting: source_timestamp advances naturally.
    const recovered = classify({
      telemetryState: 'live',
      lastObservationAt: secondsAgo(45),
    });

    expect(recovered.state).toBe(
      ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_FRESH,
    );
  });

  // ── Phase 8.5 — provider/auth failure must take precedence ─────────────────
  it('stale provider fetch → PROVIDER_UNREACHABLE, not DATA_STALE', () => {
    const result = classify({
      telemetryState: 'signal_delayed',
      lastObservationAt: hoursAgo(27),
      lastProviderFetchAt: hoursAgo(26),
    });

    expect(result.state).toBe(ConnectivityDiagnosticState.PROVIDER_UNREACHABLE);
    expect(result.providerReachable).toBe(false);
  });

  it.each([
    ProviderLinkState.REAUTH_REQUIRED,
    ProviderLinkState.REVOKED,
    ProviderLinkState.ERROR,
  ])('%s link → AUTH_OR_BINDING_ERROR even with a fresh provider fetch', (linkState) => {
    const result = classify({
      providerLinkState: linkState,
      telemetryState: 'signal_delayed',
      lastObservationAt: hoursAgo(27),
      lastProviderFetchAt: secondsAgo(20),
    });

    expect(result.state).toBe(
      ConnectivityDiagnosticState.AUTH_OR_BINDING_ERROR,
    );
  });

  // ── Phase 8.6 — binding / consent inactive ────────────────────────────────
  it('no active binding → AUTH_OR_BINDING_ERROR', () => {
    const result = classify({
      providerLinkState: ProviderLinkState.NO_LINK,
      telemetryState: 'offline',
      lastObservationAt: hoursAgo(96),
    });

    expect(result.state).toBe(
      ConnectivityDiagnosticState.AUTH_OR_BINDING_ERROR,
    );
  });

  it('revoked consent → AUTH_OR_BINDING_ERROR', () => {
    const result = classify({
      providerLinkState: ProviderLinkState.REVOKED,
      telemetryState: 'standby',
    });

    expect(result.state).toBe(
      ConnectivityDiagnosticState.AUTH_OR_BINDING_ERROR,
    );
  });

  // ── Indeterminate evidence ────────────────────────────────────────────────
  it('unknown link state → UNKNOWN', () => {
    const result = classify({ providerLinkState: ProviderLinkState.UNKNOWN });

    expect(result.state).toBe(ConnectivityDiagnosticState.UNKNOWN);
  });

  it('no provider fetch timestamp → UNKNOWN, not a false unreachable alarm', () => {
    const result = classify({ lastProviderFetchAt: null });

    expect(result.state).toBe(ConnectivityDiagnosticState.UNKNOWN);
    expect(result.providerReachable).toBeNull();
  });

  it('never-observed vehicle (no_signal) → UNKNOWN, not fabricated staleness', () => {
    const result = classify({
      telemetryState: 'no_signal',
      lastObservationAt: null,
    });

    expect(result.state).toBe(ConnectivityDiagnosticState.UNKNOWN);
    expect(result.observationAgeMs).toBeNull();
  });

  it('ignores an unparseable timestamp instead of throwing', () => {
    const result = classify({ lastObservationAt: 'not-a-date' });

    expect(result.observationAgeMs).toBeNull();
  });

  it('unparseable provider fetch timestamp → UNKNOWN, never a reachability claim', () => {
    const result = classify({ lastProviderFetchAt: 'not-a-date' });

    expect(result.providerFetchAgeMs).toBeNull();
    expect(result.providerReachable).toBeNull();
    expect(result.state).toBe(ConnectivityDiagnosticState.UNKNOWN);
  });
});

// ── Adversarial review — observation-age band boundaries ────────────────────
describe('classifyConnectivityDiagnostic — observation boundaries', () => {
  it.each<[string, TelemetryFreshness, number, ConnectivityDiagnosticState]>([
    ['23h59m (standby)', 'standby', 23 * 3_600_000 + 59 * 60_000, ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_FRESH],
    ['exactly 24h (signal_delayed)', 'signal_delayed', 24 * 3_600_000, ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE],
    ['27h (signal_delayed)', 'signal_delayed', 27 * 3_600_000, ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE],
    ['exactly 48h (offline)', 'offline', 48 * 3_600_000, ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE],
    ['>7d (offline)', 'offline', 8 * 24 * 3_600_000, ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE],
  ])('%s → %s', (_label, telemetryState, ageMs, expected) => {
    const result = classify({
      telemetryState,
      lastObservationAt: new Date(NOW_MS - ageMs).toISOString(),
    });

    expect(result.state).toBe(expected);
    expect(result.observationAgeMs).toBe(ageMs);
  });

  it('a stale telemetryState without an observation timestamp reports no age', () => {
    // Defensive: the canonical builder pairs `no_signal` with a null timestamp,
    // but the classifier must never invent an age from thin air either way.
    const result = classify({
      telemetryState: 'offline',
      lastObservationAt: null,
    });

    expect(result.observationAgeMs).toBeNull();
    expect(result.state).toBe(
      ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE,
    );
  });
});

// ── Adversarial review — provider fetch band boundaries ─────────────────────
describe('classifyConnectivityDiagnostic — provider fetch boundaries', () => {
  it('provider fetch exactly at the fresh threshold counts as unreachable', () => {
    const result = classify({
      lastProviderFetchAt: new Date(
        NOW_MS - TELEMETRY_FRESH_THRESHOLD_MS,
      ).toISOString(),
      telemetryState: 'signal_delayed',
      lastObservationAt: hoursAgo(27),
    });

    // The canonical threshold is exclusive (`age < threshold`), matching
    // `classifyTelemetryFreshness`. No second freshness policy here.
    expect(result.providerReachable).toBe(false);
    expect(result.state).toBe(ConnectivityDiagnosticState.PROVIDER_UNREACHABLE);
  });

  it('provider fetch 1ms inside the fresh threshold counts as reachable', () => {
    const result = classify({
      lastProviderFetchAt: new Date(
        NOW_MS - TELEMETRY_FRESH_THRESHOLD_MS + 1,
      ).toISOString(),
      telemetryState: 'signal_delayed',
      lastObservationAt: hoursAgo(27),
    });

    expect(result.providerReachable).toBe(true);
    expect(result.state).toBe(
      ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE,
    );
  });
});

// ── Adversarial review — clock skew / future timestamps ─────────────────────
describe('classifyConnectivityDiagnostic — clock skew', () => {
  it('tolerates small forward clock skew by clamping the age to zero', () => {
    const result = classify({
      lastObservationAt: inFuture(30_000),
      lastProviderFetchAt: inFuture(30_000),
    });

    expect(result.observationAgeMs).toBe(0);
    expect(result.providerFetchAgeMs).toBe(0);
  });

  it('a wildly future provider fetch is unusable, never "reachable"', () => {
    const result = classify({
      lastProviderFetchAt: inFuture(72 * 3_600_000),
      telemetryState: 'signal_delayed',
      lastObservationAt: hoursAgo(27),
    });

    expect(result.providerFetchAgeMs).toBeNull();
    expect(result.providerReachable).toBeNull();
    expect(result.state).toBe(ConnectivityDiagnosticState.UNKNOWN);
  });

  it('a wildly future observation reports no age instead of "just observed"', () => {
    // Upstream `resolveTelemetryFreshness` already classifies a future
    // observation as `offline`; the diagnostic must not contradict that by
    // reporting age 0, which would read as a vehicle seen seconds ago.
    const result = classify({
      telemetryState: 'offline',
      lastObservationAt: inFuture(72 * 3_600_000),
    });

    expect(result.observationAgeMs).toBeNull();
    expect(result.state).toBe(
      ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE,
    );
  });
});

// ── Adversarial review — provider reachability needs poll evidence ──────────
describe('classifyConnectivityDiagnostic — provider poll eligibility', () => {
  const staleFetch = {
    telemetryState: 'signal_delayed' as TelemetryFreshness,
    lastObservationAt: hoursAgo(27),
    lastProviderFetchAt: hoursAgo(26),
  };

  it('does not claim PROVIDER_UNREACHABLE for a vehicle that is never polled', () => {
    // The snapshot scheduler only enqueues AVAILABLE/RENTED + CONNECTED
    // vehicles. Outside that cohort a frozen provider fetch proves nothing
    // about the provider.
    const result = classify({ ...staleFetch, providerPollEligible: false });

    expect(result.state).toBe(ConnectivityDiagnosticState.UNKNOWN);
    expect(result.providerReachable).toBe(false);
    expect(result.providerPollEligible).toBe(false);
  });

  it('still reports PROVIDER_UNREACHABLE when the vehicle is in the polling cohort', () => {
    const result = classify({ ...staleFetch, providerPollEligible: true });

    expect(result.state).toBe(ConnectivityDiagnosticState.PROVIDER_UNREACHABLE);
  });

  it('keeps the conservative verdict when eligibility is undetermined', () => {
    const result = classify({ ...staleFetch, providerPollEligible: null });

    expect(result.state).toBe(ConnectivityDiagnosticState.PROVIDER_UNREACHABLE);
  });

  it('poll eligibility never downgrades a genuine stale-observation signal', () => {
    const result = classify({
      telemetryState: 'signal_delayed',
      lastObservationAt: hoursAgo(27),
      lastProviderFetchAt: secondsAgo(20),
      providerPollEligible: false,
    });

    expect(result.state).toBe(
      ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE,
    );
  });

  it('passes authoritative binding evidence through untouched', () => {
    expect(classify({ bindingActive: true }).bindingActive).toBe(true);
    expect(classify({ bindingActive: false }).bindingActive).toBe(false);
    expect(classify({}).bindingActive).toBeNull();
  });
});
