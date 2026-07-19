import {
  ConnectivityDeviceType,
  ConnectivitySourceType,
  ProviderAuthorizationStatus,
  VehicleConnectivityRuntimeStateBuilder,
  type BuildVehicleConnectivityRuntimeStateInput,
} from './vehicle-connectivity-runtime-state.builder';
import {
  ConnectivityReasonCode,
  ConnectivityRecommendedAction,
} from './connectivity-domain.types';
import { validateConnectivityStateCombination } from './connectivity-domain.validation';

const NOW_MS = new Date('2026-07-18T12:00:00.000Z').getTime();
const CALCULATED_AT = '2026-07-18T12:00:00.000Z';

function minutesAgo(m: number): string {
  return new Date(NOW_MS - m * 60_000).toISOString();
}

function hoursAgo(h: number): string {
  return new Date(NOW_MS - h * 3_600_000).toISOString();
}

function baseInput(
  overrides: Partial<BuildVehicleConnectivityRuntimeStateInput> = {},
): BuildVehicleConnectivityRuntimeStateInput {
  return {
    vehicleId: 'veh-builder-1',
    organizationId: 'org-builder-1',
    calculatedAt: CALCULATED_AT,
    nowMs: NOW_MS,
    provider: {
      hasProviderLink: true,
      authorizationStatus: ProviderAuthorizationStatus.ACTIVE,
      consentGranted: true,
      providerConnectionStatus: 'CONNECTED',
    },
    telemetry: {
      lastTelemetryAt: minutesAgo(5),
      lastProviderObservedAt: minutesAgo(5),
      lastReceivedAt: minutesAgo(4),
    },
    binding: {
      deviceBindingId: 'binding-1',
      deviceType: ConnectivityDeviceType.PHYSICAL_OBD,
      sourceType: ConnectivitySourceType.DIMO,
      physicalObdCapable: true,
      bindingChangedSinceEpisode: false,
    },
    episode: {
      activeEpisodeId: null,
      openUnpluggedEpisode: false,
      episodeBindingId: null,
      lastUnplugWebhookAt: null,
      lastExplicitPlugWebhookAt: null,
    },
    snapshotPlug: {
      obdIsPluggedIn: true,
      observedAt: minutesAgo(5),
      sameBindingAsEpisode: true,
    },
    webhook: {
      configured: true,
      processingFailed: false,
      recentEventIds: [],
    },
    dataCoverage: {
      signalCoveragePercent: 88,
      hasTelemetrySnapshot: true,
    },
    processingErrors: {
      integrationError: false,
      webhookProcessingFailed: false,
    },
    ...overrides,
  };
}

function build(overrides: Partial<BuildVehicleConnectivityRuntimeStateInput> = {}) {
  return VehicleConnectivityRuntimeStateBuilder.build(baseInput(overrides));
}

describe('VehicleConnectivityRuntimeStateBuilder', () => {
  it('live + active provider → TELEMETRY_ACTIVE, telemetry dimension live', () => {
    const state = build();
    expect(state.telemetryState).toBe('live');
    expect(state.providerLinkState).toBe('ACTIVE');
    expect(state.overallState).toBe('TELEMETRY_ACTIVE');
    expect(state.attentionState).toBe('NONE');
    expect(state.recommendedAction).toBe(ConnectivityRecommendedAction.NONE);
    expect(state.reasonCodes).toContain(ConnectivityReasonCode.TELEMETRY_FRESH);
  });

  it('standby telemetry → STANDBY overall, not offline', () => {
    const state = build({
      telemetry: {
        lastTelemetryAt: hoursAgo(3),
        lastProviderObservedAt: hoursAgo(3),
        lastReceivedAt: hoursAgo(3),
      },
    });
    expect(state.telemetryState).toBe('standby');
    expect(state.overallState).toBe('STANDBY');
    expect(state.attentionState).toBe('NONE');
  });

  it('soft-offline (30h) → SOFT_OFFLINE overall, WATCH attention', () => {
    const state = build({
      telemetry: {
        lastTelemetryAt: hoursAgo(30),
        lastProviderObservedAt: hoursAgo(30),
        lastReceivedAt: hoursAgo(30),
      },
    });
    expect(state.telemetryState).toBe('signal_delayed');
    expect(state.overallState).toBe('SOFT_OFFLINE');
    expect(state.attentionState).toBe('WATCH');
    expect(state.recommendedAction).toBe(ConnectivityRecommendedAction.REVIEW_CONNECTIVITY);
  });

  it('offline (50h) → OFFLINE overall, ACTION_REQUIRED', () => {
    const state = build({
      telemetry: {
        lastTelemetryAt: hoursAgo(50),
        lastProviderObservedAt: hoursAgo(50),
        lastReceivedAt: hoursAgo(50),
      },
    });
    expect(state.telemetryState).toBe('offline');
    expect(state.overallState).toBe('OFFLINE');
    expect(state.attentionState).toBe('ACTION_REQUIRED');
    expect(state.recommendedAction).toBe(ConnectivityRecommendedAction.WAIT_FOR_TELEMETRY);
  });

  it('explicit unplug episode → UNPLUGGED_CONFIRMED + DEVICE_UNPLUGGED', () => {
    const state = build({
      episode: {
        activeEpisodeId: 'ep-1',
        openUnpluggedEpisode: true,
        episodeBindingId: 'binding-1',
        lastUnplugWebhookAt: hoursAgo(2),
        lastExplicitPlugWebhookAt: null,
      },
      snapshotPlug: {
        obdIsPluggedIn: false,
        observedAt: hoursAgo(2),
        sameBindingAsEpisode: true,
      },
    });
    expect(state.physicalDeviceState).toBe('UNPLUGGED_CONFIRMED');
    expect(state.overallState).toBe('DEVICE_UNPLUGGED');
    expect(state.activeEpisodeId).toBe('ep-1');
    expect(state.recommendedAction).toBe(ConnectivityRecommendedAction.CHECK_DEVICE);
    expect(state.reasonCodes).toContain(ConnectivityReasonCode.DEVICE_UNPLUG_WEBHOOK);
  });

  it('inferred recovery → PLUGGED_INFERRED when episode closed and snapshot plugged', () => {
    const state = build({
      episode: {
        activeEpisodeId: null,
        openUnpluggedEpisode: false,
        episodeBindingId: null,
        lastUnplugWebhookAt: hoursAgo(48),
        lastExplicitPlugWebhookAt: null,
      },
      snapshotPlug: {
        obdIsPluggedIn: true,
        observedAt: minutesAgo(5),
        sameBindingAsEpisode: true,
      },
    });
    expect(state.physicalDeviceState).toBe('PLUGGED_INFERRED');
    expect(state.reasonCodes).toContain(ConnectivityReasonCode.DEVICE_RECONNECTED_SNAPSHOT);
    expect(state.overallState).toBe('TELEMETRY_ACTIVE');
  });

  it('OEM without physical OBD → NOT_APPLICABLE, no DEVICE_UNPLUGGED overall', () => {
    const state = build({
      binding: {
        deviceBindingId: 'synthetic-1',
        deviceType: ConnectivityDeviceType.SYNTHETIC,
        sourceType: ConnectivitySourceType.DIMO,
        physicalObdCapable: false,
        bindingChangedSinceEpisode: false,
      },
      episode: {
        activeEpisodeId: 'ep-stale',
        openUnpluggedEpisode: true,
        episodeBindingId: 'synthetic-1',
        lastUnplugWebhookAt: hoursAgo(1),
        lastExplicitPlugWebhookAt: null,
      },
      snapshotPlug: {
        obdIsPluggedIn: null,
        observedAt: null,
        sameBindingAsEpisode: true,
      },
      dataCoverage: {
        signalCoveragePercent: 60,
        hasTelemetrySnapshot: true,
      },
    });
    expect(state.physicalDeviceState).toBe('NOT_APPLICABLE');
    expect(state.overallState).not.toBe('DEVICE_UNPLUGGED');
    expect(state.activeEpisodeId).toBeNull();
  });

  it('authorization expired keeps telemetry visible but overall AUTHORIZATION_REQUIRED', () => {
    const state = build({
      provider: {
        hasProviderLink: true,
        authorizationStatus: ProviderAuthorizationStatus.EXPIRED,
        consentGranted: true,
        providerConnectionStatus: 'CONNECTED',
      },
      telemetry: {
        lastTelemetryAt: minutesAgo(3),
        lastProviderObservedAt: minutesAgo(3),
        lastReceivedAt: minutesAgo(3),
      },
    });
    expect(state.providerLinkState).toBe('REAUTH_REQUIRED');
    expect(state.telemetryState).toBe('live');
    expect(state.overallState).toBe('AUTHORIZATION_REQUIRED');
    expect(state.reasonCodes).toContain(ConnectivityReasonCode.AUTHORIZATION_EXPIRED);
    expect(state.recommendedAction).toBe(ConnectivityRecommendedAction.REAUTHORIZE_PROVIDER);
  });

  it('no provider link → NO_LINK + NO_ACTIVE_DATA_SOURCE', () => {
    const state = build({
      provider: {
        hasProviderLink: false,
        authorizationStatus: ProviderAuthorizationStatus.MISSING,
        consentGranted: null,
      },
      telemetry: {
        lastTelemetryAt: null,
        lastProviderObservedAt: null,
        lastReceivedAt: null,
      },
      dataCoverage: {
        signalCoveragePercent: null,
        hasTelemetrySnapshot: false,
      },
      snapshotPlug: {
        obdIsPluggedIn: null,
        observedAt: null,
        sameBindingAsEpisode: true,
      },
    });
    expect(state.providerLinkState).toBe('NO_LINK');
    expect(state.overallState).toBe('NO_ACTIVE_DATA_SOURCE');
    expect(state.recommendedAction).toBe(ConnectivityRecommendedAction.CONNECT_DATA_SOURCE);
  });

  it('state conflict: open episode + snapshot plugged → STATE_CONFLICT surfaced', () => {
    const state = build({
      episode: {
        activeEpisodeId: 'ep-open',
        openUnpluggedEpisode: true,
        episodeBindingId: 'binding-1',
        lastUnplugWebhookAt: hoursAgo(10),
        lastExplicitPlugWebhookAt: null,
      },
      snapshotPlug: {
        obdIsPluggedIn: true,
        observedAt: minutesAgo(5),
        sameBindingAsEpisode: true,
      },
      telemetry: {
        lastTelemetryAt: minutesAgo(5),
        lastProviderObservedAt: minutesAgo(5),
        lastReceivedAt: minutesAgo(5),
      },
    });
    expect(state.physicalDeviceState).toBe('UNPLUGGED_CONFIRMED');
    expect(state.overallState).toBe('DEVICE_UNPLUGGED');
    expect(state.reasonCodes).toContain(ConnectivityReasonCode.STATE_CONFLICT);
    expect(state.recommendedAction).toBe(ConnectivityRecommendedAction.REVIEW_CONNECTIVITY);
    expect(state.evidence.openUnpluggedEpisode).toBe(true);
  });

  it('partial coverage → PARTIAL data coverage + WATCH when otherwise healthy', () => {
    const state = build({
      dataCoverage: {
        signalCoveragePercent: 62,
        hasTelemetrySnapshot: true,
      },
    });
    expect(state.dataCoverageState).toBe('PARTIAL');
    expect(state.attentionState).toBe('WATCH');
    expect(state.reasonCodes).toContain(ConnectivityReasonCode.DATA_COVERAGE_PARTIAL);
  });

  it('unknown timestamp → no_signal telemetry, UNKNOWN overall', () => {
    const state = build({
      telemetry: {
        lastTelemetryAt: null,
        lastProviderObservedAt: null,
        lastReceivedAt: null,
      },
      dataCoverage: {
        signalCoveragePercent: null,
        hasTelemetrySnapshot: false,
      },
    });
    expect(state.telemetryState).toBe('no_signal');
    expect(state.overallState).toBe('UNKNOWN');
    expect(state.reasonCodes).toContain(ConnectivityReasonCode.NO_TELEMETRY_TIMESTAMP);
    expect(state.overallState).not.toBe('TELEMETRY_ACTIVE');
  });

  it('multiple simultaneous problems: integration error beats unplug', () => {
    const state = build({
      processingErrors: {
        integrationError: true,
        webhookProcessingFailed: true,
      },
      episode: {
        activeEpisodeId: 'ep-1',
        openUnpluggedEpisode: true,
        episodeBindingId: 'binding-1',
        lastUnplugWebhookAt: hoursAgo(1),
        lastExplicitPlugWebhookAt: null,
      },
      snapshotPlug: {
        obdIsPluggedIn: false,
        observedAt: hoursAgo(1),
        sameBindingAsEpisode: true,
      },
    });
    expect(state.overallState).toBe('INTEGRATION_ERROR');
    expect(state.attentionState).toBe('CRITICAL');
    expect(state.recommendedAction).toBe(ConnectivityRecommendedAction.CHECK_INTEGRATION);
    expect(state.reasonCodes).toContain(ConnectivityReasonCode.PROVIDER_ERROR);
    expect(state.reasonCodes).toContain(ConnectivityReasonCode.DEVICE_UNPLUG_WEBHOOK);
  });

  it('binding change prevents stale episode from dominating new binding', () => {
    const state = build({
      binding: {
        deviceBindingId: 'binding-new',
        deviceType: ConnectivityDeviceType.PHYSICAL_OBD,
        sourceType: ConnectivitySourceType.DIMO,
        physicalObdCapable: true,
        bindingChangedSinceEpisode: true,
      },
      episode: {
        activeEpisodeId: 'ep-old',
        openUnpluggedEpisode: true,
        episodeBindingId: 'binding-old',
        lastUnplugWebhookAt: hoursAgo(20),
        lastExplicitPlugWebhookAt: null,
      },
      snapshotPlug: {
        obdIsPluggedIn: true,
        observedAt: minutesAgo(5),
        sameBindingAsEpisode: false,
      },
    });
    expect(state.overallState).not.toBe('DEVICE_UNPLUGGED');
    expect(state.activeEpisodeId).toBeNull();
    expect(state.reasonCodes).toContain(ConnectivityReasonCode.DEVICE_BINDING_CHANGED);
  });

  it('is deterministic for identical inputs', () => {
    const input = baseInput();
    const a = VehicleConnectivityRuntimeStateBuilder.build(input);
    const b = VehicleConnectivityRuntimeStateBuilder.build(input);
    expect(a).toEqual(b);
  });

  it('keeps telemetry, device, and provider as separate dimensions', () => {
    const state = build({
      provider: {
        hasProviderLink: true,
        authorizationStatus: ProviderAuthorizationStatus.EXPIRED,
        consentGranted: true,
      },
      episode: {
        activeEpisodeId: 'ep-1',
        openUnpluggedEpisode: true,
        episodeBindingId: 'binding-1',
        lastUnplugWebhookAt: hoursAgo(1),
        lastExplicitPlugWebhookAt: null,
      },
      snapshotPlug: { obdIsPluggedIn: false, observedAt: hoursAgo(1), sameBindingAsEpisode: true },
      telemetry: {
        lastTelemetryAt: minutesAgo(5),
        lastProviderObservedAt: minutesAgo(5),
        lastReceivedAt: minutesAgo(5),
      },
    });
    expect(state.providerLinkState).toBe('REAUTH_REQUIRED');
    expect(state.telemetryState).toBe('live');
    expect(state.physicalDeviceState).toBe('UNPLUGGED_CONFIRMED');
    expect(state.overallState).toBe('AUTHORIZATION_REQUIRED');
  });

  it('explicit plug webhook → PLUGGED_CONFIRMED', () => {
    const state = build({
      episode: {
        activeEpisodeId: null,
        openUnpluggedEpisode: false,
        episodeBindingId: null,
        lastUnplugWebhookAt: hoursAgo(5),
        lastExplicitPlugWebhookAt: hoursAgo(4),
      },
      snapshotPlug: {
        obdIsPluggedIn: true,
        observedAt: hoursAgo(4),
        sameBindingAsEpisode: true,
      },
    });
    expect(state.physicalDeviceState).toBe('PLUGGED_CONFIRMED');
    expect(state.reasonCodes).toContain(ConnectivityReasonCode.DEVICE_RECONNECTED_EXPLICIT);
  });
});

describe('VehicleConnectivityRuntimeStateBuilder validation integration', () => {
  it('produces combinations that pass domain validation for healthy state', () => {
    const state = build();
    const result = validateConnectivityStateCombination(state);
    expect(result.valid).toBe(true);
  });

  it('state conflict snapshot is internally consistent (episode open + unplug physical)', () => {
    const state = build({
      episode: {
        activeEpisodeId: 'ep-conflict',
        openUnpluggedEpisode: true,
        episodeBindingId: 'binding-1',
        lastUnplugWebhookAt: hoursAgo(10),
        lastExplicitPlugWebhookAt: null,
      },
      snapshotPlug: {
        obdIsPluggedIn: true,
        observedAt: minutesAgo(5),
        sameBindingAsEpisode: true,
      },
    });
    const result = validateConnectivityStateCombination(state);
    expect(state.reasonCodes).toContain(ConnectivityReasonCode.STATE_CONFLICT);
    expect(result.valid).toBe(true);
  });
});
