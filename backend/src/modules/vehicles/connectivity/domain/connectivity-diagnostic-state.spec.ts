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

const NOW_MS = new Date('2026-08-28T12:00:00.000Z').getTime();

function secondsAgo(s: number): string {
  return new Date(NOW_MS - s * 1_000).toISOString();
}

function hoursAgo(h: number): string {
  return new Date(NOW_MS - h * 3_600_000).toISOString();
}

function classify(overrides: {
  providerLinkState?: ProviderLinkState;
  telemetryState?: TelemetryFreshness;
  lastObservationAt?: string | null;
  lastProviderFetchAt?: string | null;
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
});
