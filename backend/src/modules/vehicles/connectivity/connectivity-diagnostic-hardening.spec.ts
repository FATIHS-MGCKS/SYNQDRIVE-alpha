/**
 * Connectivity Diagnostic Hardening — integration guarantees.
 *
 * Covers the boundaries that must not regress:
 * - a successful provider fetch never rejuvenates canonical telemetry freshness
 * - the tenant-facing runtime DTO never leaks Master-Admin diagnostic internals
 * - the Master Admin payload separates observation time from provider fetch time
 * - observability fires on state transitions only
 */
import {
  ConnectivityDiagnosticTransitionTracker,
  observationAgeBucket,
} from '../../dimo/connectivity/connectivity-diagnostic-transition.tracker';
import { serializeConnectivityDiagnosticAdmin } from './connectivity-diagnostic.admin-dto';
import { mockConnectivityRuntime } from './connectivity-runtime.test-fixture';
import { ConnectivityDiagnosticState } from './domain/connectivity-diagnostic-state';
import {
  ConnectivityReasonCode,
  ProviderLinkState,
} from './domain/connectivity-domain.types';
import {
  ConnectivityDeviceType,
  ConnectivitySourceType,
  VehicleConnectivityRuntimeStateBuilder,
  type BuildVehicleConnectivityRuntimeStateInput,
} from './domain/vehicle-connectivity-runtime-state.builder';
import { ProviderLinkStateBuilder } from './domain/provider-link-state.builder';
import {
  ConsentLedgerStatus,
  ProviderAuthorizationLedgerStatus,
  type ProviderLinkEvidenceInput,
} from './domain/provider-link-state.types';
import { serializeVehicleConnectivityRuntimeState } from './vehicle-connectivity-runtime-state.dto';

const NOW_MS = new Date('2026-08-28T12:00:00.000Z').getTime();
const ORG = 'org-diag-1';
const VEHICLE = 'veh-diag-1';

function secondsAgo(s: number): string {
  return new Date(NOW_MS - s * 1_000).toISOString();
}

function hoursAgo(h: number): string {
  return new Date(NOW_MS - h * 3_600_000).toISOString();
}

function activeProviderEvidence(
  overrides: Partial<ProviderLinkEvidenceInput> = {},
): ProviderLinkEvidenceInput {
  return {
    organizationId: ORG,
    vehicleId: VEHICLE,
    nowMs: NOW_MS,
    mapping: {
      hasActiveMapping: true,
      activeMappingCount: 1,
      provider: 'DIMO',
      mappingOrganizationId: ORG,
    },
    authorization: {
      status: ProviderAuthorizationLedgerStatus.ACTIVE,
      expiresAt: null,
    },
    consent: {
      status: ConsentLedgerStatus.ACTIVE,
      grantedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: null,
    },
    tokenBinding: {
      hasToken: true,
      tokenId: 190497,
      bindingId: 'binding-diag-1',
      hasHistoricalDimoRecord: true,
    },
    revocation: { isRevoked: false, revokedAt: null },
    expiry: { isExpired: false, expiresAt: null },
    providerError: { hasError: false, connectionStatus: 'CONNECTED' },
    lastAccess: { lastSuccessfulAt: secondsAgo(20) },
    ...overrides,
  };
}

function buildRuntime(telemetry: {
  lastTelemetryAt: string | null;
  lastReceivedAt: string | null;
}) {
  const input: BuildVehicleConnectivityRuntimeStateInput = {
    vehicleId: VEHICLE,
    organizationId: ORG,
    calculatedAt: new Date(NOW_MS).toISOString(),
    nowMs: NOW_MS,
    provider: { link: ProviderLinkStateBuilder.build(activeProviderEvidence()) },
    telemetry: {
      lastTelemetryAt: telemetry.lastTelemetryAt,
      lastProviderObservedAt: telemetry.lastTelemetryAt,
      lastReceivedAt: telemetry.lastReceivedAt,
    },
    binding: {
      deviceBindingId: 'binding-diag-1',
      deviceType: ConnectivityDeviceType.OEM,
      sourceType: ConnectivitySourceType.DIMO,
      physicalObdCapable: false,
      bindingChangedSinceEpisode: false,
    },
    episode: {
      activeEpisodeId: null,
      openUnpluggedEpisode: false,
      episodeBindingId: null,
      lastUnplugWebhookAt: null,
      lastExplicitPlugWebhookAt: null,
      lastTelemetryRecoveryAt: null,
    },
    snapshotPlug: {
      obdIsPluggedIn: null,
      observedAt: telemetry.lastTelemetryAt,
      sameBindingAsEpisode: true,
    },
    webhook: { configured: true, processingFailed: false, recentEventIds: [] },
    dataCoverage: { signalCoveragePercent: 82, hasTelemetrySnapshot: true },
    processingErrors: { integrationError: false, webhookProcessingFailed: false },
  };

  return VehicleConnectivityRuntimeStateBuilder.build(input);
}

describe('connectivity diagnostic — canonical freshness is unaffected', () => {
  // ── Phase 8.3 — critical regression test ──────────────────────────────────
  it('a successful provider fetch does NOT rejuvenate telemetry freshness', () => {
    const runtime = buildRuntime({
      lastTelemetryAt: hoursAgo(27),
      lastReceivedAt: secondsAgo(20),
    });

    // Canonical dimension still reflects the frozen observation.
    expect(runtime.telemetryState).toBe('signal_delayed');
    expect(runtime.lastTelemetryAt).toBe(hoursAgo(27));
    expect(runtime.reasonCodes).toContain(
      ConnectivityReasonCode.TELEMETRY_SOFT_OFFLINE,
    );

    // provider_fetched_at stays in its own lane.
    expect(runtime.lastReceivedAt).toBe(secondsAgo(20));
    expect(runtime.lastTelemetryAt).not.toBe(runtime.lastReceivedAt);

    // The gap is only visible in the diagnostic dimension.
    expect(runtime.diagnostic.state).toBe(
      ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE,
    );
  });

  it('diagnostic dimension does not alter overallState or attention', () => {
    const stale = buildRuntime({
      lastTelemetryAt: hoursAgo(27),
      lastReceivedAt: secondsAgo(20),
    });
    const staleWithoutRecentFetch = buildRuntime({
      lastTelemetryAt: hoursAgo(27),
      lastReceivedAt: hoursAgo(27),
    });

    // Same canonical outcome regardless of provider fetch recency; only the
    // diagnostic dimension differs.
    expect(stale.overallState).toBe(staleWithoutRecentFetch.overallState);
    expect(stale.attentionState).toBe(staleWithoutRecentFetch.attentionState);
    expect(stale.telemetryState).toBe(staleWithoutRecentFetch.telemetryState);
    expect(stale.diagnostic.state).not.toBe(
      staleWithoutRecentFetch.diagnostic.state,
    );
  });

  it('healthy vehicle classifies as provider reachable + data fresh', () => {
    const runtime = buildRuntime({
      lastTelemetryAt: secondsAgo(120),
      lastReceivedAt: secondsAgo(20),
    });

    expect(runtime.telemetryState).toBe('live');
    expect(runtime.diagnostic.state).toBe(
      ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_FRESH,
    );
  });
});

describe('connectivity diagnostic — tenant DTO isolation', () => {
  // ── Phase 8.7 — no Master-Admin leak into fleet/org payloads ──────────────
  it('tenant runtime DTO omits the diagnostic dimension', () => {
    const runtime = buildRuntime({
      lastTelemetryAt: hoursAgo(27),
      lastReceivedAt: secondsAgo(20),
    });

    const dto = serializeVehicleConnectivityRuntimeState(runtime);

    expect(runtime.diagnostic).toBeDefined();
    expect('diagnostic' in dto).toBe(false);
    expect(JSON.stringify(dto)).not.toContain('PROVIDER_REACHABLE');
    expect(JSON.stringify(dto)).not.toContain('providerReachable');
  });

  it('tenant runtime DTO still exposes canonical operational fields', () => {
    const runtime = buildRuntime({
      lastTelemetryAt: hoursAgo(27),
      lastReceivedAt: secondsAgo(20),
    });

    const dto = serializeVehicleConnectivityRuntimeState(runtime);

    expect(dto.telemetryState).toBe('signal_delayed');
    expect(dto.lastTelemetryAt).toBe(hoursAgo(27));
    expect(dto.overallState).toBe(runtime.overallState);
  });
});

describe('serializeConnectivityDiagnosticAdmin', () => {
  it('separates vehicle observation time from provider fetch time', () => {
    const runtime = buildRuntime({
      lastTelemetryAt: hoursAgo(27),
      lastReceivedAt: secondsAgo(20),
    });

    const dto = serializeConnectivityDiagnosticAdmin(runtime, { provider: 'DIMO' });

    expect(dto.provider).toBe('DIMO');
    expect(dto.diagnosticState).toBe(
      ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE,
    );
    expect(dto.providerApiReachable).toBe(true);
    expect(dto.lastProviderFetchAt).toBe(secondsAgo(20));
    expect(dto.lastProviderFetchAgeMs).toBe(20_000);
    expect(dto.lastVehicleObservationAt).toBe(hoursAgo(27));
    expect(dto.lastVehicleObservationAgeMs).toBe(27 * 3_600_000);
    expect(dto.observationState).toBe('signal_delayed');
  });

  it('reports binding, consent and connection status', () => {
    const runtime = buildRuntime({
      lastTelemetryAt: secondsAgo(120),
      lastReceivedAt: secondsAgo(20),
    });

    const dto = serializeConnectivityDiagnosticAdmin(runtime, { provider: 'DIMO' });

    expect(dto.bindingState).toBe('ACTIVE');
    expect(dto.consentState).toBe('ACTIVE');
    expect(dto.connectionStatus).toBe('CONNECTED');
    expect(dto.providerErrorCategory).toBeNull();
  });

  it('flags a broken grant chain with an error category', () => {
    const runtime = mockConnectivityRuntime({
      providerLinkState: ProviderLinkState.REVOKED,
      telemetryState: 'offline',
      reasonCodes: [ConnectivityReasonCode.PROVIDER_REVOKED],
      deviceBindingId: null,
    });

    const dto = serializeConnectivityDiagnosticAdmin(runtime, { provider: 'DIMO' });

    expect(dto.diagnosticState).toBe(
      ConnectivityDiagnosticState.AUTH_OR_BINDING_ERROR,
    );
    expect(dto.bindingState).toBe('INACTIVE');
    expect(dto.consentState).toBe('INACTIVE');
    expect(dto.providerErrorCategory).toBe(
      ConnectivityReasonCode.PROVIDER_REVOKED,
    );
  });

  it('exposes no credentials or raw provider payloads', () => {
    const runtime = buildRuntime({
      lastTelemetryAt: hoursAgo(27),
      lastReceivedAt: secondsAgo(20),
    });

    const serialized = JSON.stringify(
      serializeConnectivityDiagnosticAdmin(runtime, { provider: 'DIMO' }),
    ).toLowerCase();

    for (const forbidden of [
      'token',
      'jwt',
      'secret',
      'credential',
      'privatekey',
      'authorization',
      'rawpayload',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe('ConnectivityDiagnosticTransitionTracker', () => {
  // ── Phase 6 — deduped, transition-only observability ─────────────────────
  it('reports the first observation and stays silent while unchanged', () => {
    const tracker = new ConnectivityDiagnosticTransitionTracker();

    expect(
      tracker.observe(VEHICLE, ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE),
    ).toEqual({
      previous: null,
      current: ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE,
    });

    // Repeated polls must not re-emit.
    for (let i = 0; i < 100; i += 1) {
      expect(
        tracker.observe(
          VEHICLE,
          ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE,
        ),
      ).toBeNull();
    }
  });

  it('reports recovery transitions', () => {
    const tracker = new ConnectivityDiagnosticTransitionTracker();
    tracker.observe(VEHICLE, ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE);

    expect(
      tracker.observe(VEHICLE, ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_FRESH),
    ).toEqual({
      previous: ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE,
      current: ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_FRESH,
    });
  });

  it('tracks vehicles independently', () => {
    const tracker = new ConnectivityDiagnosticTransitionTracker();
    tracker.observe('veh-a', ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_FRESH);

    expect(
      tracker.observe('veh-b', ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE),
    ).not.toBeNull();
  });

  it('buckets observation age without leaking exact per-vehicle values', () => {
    expect(observationAgeBucket(null)).toBe('unknown');
    expect(observationAgeBucket(2 * 3_600_000)).toBe('lt_24h');
    expect(observationAgeBucket(27 * 3_600_000)).toBe('24h_48h');
    expect(observationAgeBucket(72 * 3_600_000)).toBe('48h_7d');
    expect(observationAgeBucket(30 * 24 * 3_600_000)).toBe('gte_7d');
  });
});
