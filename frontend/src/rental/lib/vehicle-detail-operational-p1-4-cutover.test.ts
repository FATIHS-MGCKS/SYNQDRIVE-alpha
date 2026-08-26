/**
 * P1.4 — Vehicle Detail header / connectivity cutover tests.
 */
import { describe, expect, it } from 'vitest';
import type { FleetMapVehicleResponse, VehicleConnectivityRuntimeState } from '../../lib/api';
import { de } from '../i18n/translations/de';
import type { TranslationKey } from '../i18n/translations/en';
import { mapFleetMapVehicleResponse } from './fleet-map-vehicle-mapper';
import { buildFleetVehicleContexts } from './fleet-operator-panel';
import { deriveFleetVisualState } from './fleetVisualState';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import { buildFleetVehicleUiProjection } from './fleet-vehicle-ui-projection';
import {
  resolveVehicleDetailConnectivityPresentation,
  resolveVehicleDetailFleetDisplay,
  resolveVehicleDetailMapTrackingBadge,
} from './vehicle-detail-operational-display';

function tFor() {
  return (key: TranslationKey) => de[key] ?? key;
}

function runtime(overrides: Partial<VehicleConnectivityRuntimeState> = {}): VehicleConnectivityRuntimeState {
  return {
    vehicleId: 'p14-1',
    organizationId: 'org-1',
    overallState: 'TELEMETRY_ACTIVE',
    providerLinkState: 'ACTIVE',
    telemetryState: 'live',
    physicalDeviceState: 'PLUGGED_CONFIRMED',
    dataCoverageState: 'GOOD',
    attentionState: 'NONE',
    reasonCodes: [],
    recommendedAction: 'NONE',
    requiresAction: false,
    lastTelemetryAt: '2026-08-26T12:00:00.000Z',
    lastProviderObservedAt: '2026-08-26T12:00:00.000Z',
    lastReceivedAt: '2026-08-26T12:00:00.000Z',
    deviceBindingId: null,
    activeEpisodeId: null,
    evidence: {},
    calculatedAt: '2026-08-26T12:00:00.000Z',
    stateVersion: 1,
    ...overrides,
  };
}

function availability(
  state: 'AVAILABLE' | 'NEEDS_VERIFICATION' | 'UNAVAILABLE' | 'UNKNOWN',
  overrides: Record<string, unknown> = {},
) {
  return {
    state,
    generatedAt: '2026-08-26T12:00:00.000Z',
    ...overrides,
  };
}

function health(
  evaluability: 'EVALUABLE' | 'PARTIALLY_EVALUABLE' | 'NOT_EVALUABLE' | 'UNKNOWN',
  overrides: Record<string, unknown> = {},
) {
  return {
    condition: 'good',
    evaluability,
    pipelineAvailability: 'ready',
    generatedAt: '2026-08-26T12:00:00.000Z',
    healthEvidenceAt: null,
    anyModuleDataStale: false,
    source: 'p0.2_projection',
    ...overrides,
  };
}

function fleetRow(overrides: Partial<FleetMapVehicleResponse> = {}): FleetMapVehicleResponse {
  return {
    id: 'p14-1',
    licensePlate: 'P14 1',
    displayName: 'Test',
    make: 'VW',
    model: 'Golf',
    year: 2024,
    status: 'Available',
    fuelType: 'Petrol',
    healthStatus: 'Good Health',
    cleaningStatus: 'Clean',
    stationId: 'st-1',
    stationName: 'Berlin',
    homeStationId: 'st-1',
    currentStationId: 'st-1',
    expectedStationId: null,
    latitude: 52.5,
    longitude: 13.4,
    lastSeenAt: '2010-01-01T00:00:00.000Z',
    signalAgeMs: 999_999_999,
    isFresh: false,
    onlineStatus: 'OFFLINE',
    telemetryFreshness: 'offline',
    displayState: 'PARKED',
    displayIgnition: 'OFF',
    isLiveTracking: false,
    heading: null,
    imageUrl: null,
    odometerKm: 1000,
    fuelPercent: 50,
    evSoc: null,
    isElectric: false,
    reservedBookingId: null,
    reservedCustomerName: null,
    reservedPickupAt: null,
    reservedReturnAt: null,
    reservedPickupStationName: null,
    reservedIsOverdue: false,
    activeBookingId: null,
    activeCustomerName: null,
    activeStartAt: null,
    activeReturnAt: null,
    activeReturnStationName: null,
    activeKmIncluded: null,
    activeKmDriven: null,
    activeIsOverdue: false,
    maintenanceReason: null,
    maintenanceReasonCode: null,
    maintenanceUrgency: null,
    ...overrides,
  };
}

function fleetSurfaces(row: Partial<FleetMapVehicleResponse>) {
  const vehicle = mapFleetMapVehicleResponse(fleetRow(row));
  const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
  const [ctx] = buildFleetVehicleContexts([vehicle], () => null, { locale: 'de' });
  const display = resolveFleetVehicleDisplayState(vehicle, {
    visual: ctx.visual,
    uiProjection: ui,
    locale: 'de',
    t: tFor(),
  });
  const visual = deriveFleetVisualState(vehicle, {
    uiProjection: ui,
    requireLocation: true,
    locale: 'de',
  });
  return { vehicle, ui, display, visual };
}

function detailSurfaces(row: Partial<FleetMapVehicleResponse>) {
  const vehicle = mapFleetMapVehicleResponse(fleetRow(row));
  const detail = resolveVehicleDetailFleetDisplay(vehicle, { locale: 'de' });
  return { vehicle, ...detail };
}

describe('P1.4 vehicle detail cutover', () => {
  it('1 — AVAILABLE + live + EVALUABLE/good', () => {
    const d = detailSurfaces({
      connectivityRuntime: runtime(),
      operationalAvailability: availability('AVAILABLE'),
      healthEvaluation: health('EVALUABLE'),
    });
    expect(d.display.statusBadge.label).toBe('Verfügbar');
    expect(d.health.label).toBe('Gut');
    expect(d.connectivity.shortLabel).toBe(de['fleetConnectivity.telemetryFreshness.live']);
  });

  it('2 — AVAILABLE + standby (not offline)', () => {
    const d = detailSurfaces({
      connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby' }),
      operationalAvailability: availability('AVAILABLE'),
    });
    expect(d.connectivity.shortLabel).toBe(de['fleetConnectivity.telemetryFreshness.standby']);
    expect(d.connectivity.shortLabel).not.toBe(de['fleetConnectivity.telemetryFreshness.offline']);
  });

  it('3 — AVAILABLE + SOFT_OFFLINE', () => {
    const d = detailSurfaces({
      connectivityRuntime: runtime({
        overallState: 'SOFT_OFFLINE',
        telemetryState: 'signal_delayed',
        attentionState: 'WATCH',
      }),
      operationalAvailability: availability('AVAILABLE'),
    });
    expect(d.display.statusBadge.label).toBe('Verfügbar');
    expect(d.connectivity.shortLabel).toBe(de['fleetConnectivity.telemetryFreshness.signal_delayed']);
  });

  it('4 — NEEDS_VERIFICATION + OFFLINE', () => {
    const d = detailSurfaces({
      connectivityRuntime: runtime({ overallState: 'OFFLINE', telemetryState: 'offline' }),
      operationalAvailability: availability('NEEDS_VERIFICATION', { attention: 'WATCH' }),
    });
    expect(d.display.statusBadge.label).toBe('Prüfung erforderlich');
    expect(d.connectivity.shortLabel).toBe(de['fleetConnectivity.state.OFFLINE']);
  });

  it('5 — AUTHORIZATION_REQUIRED', () => {
    const d = detailSurfaces({
      connectivityRuntime: runtime({
        overallState: 'AUTHORIZATION_REQUIRED',
        providerLinkState: 'REAUTH_REQUIRED',
        recommendedAction: 'REAUTHORIZE_PROVIDER',
      }),
      operationalAvailability: availability('NEEDS_VERIFICATION'),
    });
    expect(d.connectivity.shortLabel).toBe(de['fleetConnectivity.state.AUTHORIZATION_REQUIRED']);
    expect(d.connectivity.shortLabel).not.toBe(de['fleetConnectivity.telemetryFreshness.live']);
  });

  it('6 — REAUTH_REQUIRED provider link', () => {
    const d = detailSurfaces({
      connectivityRuntime: runtime({
        overallState: 'AUTHORIZATION_REQUIRED',
        providerLinkState: 'REAUTH_REQUIRED',
      }),
      operationalAvailability: availability('NEEDS_VERIFICATION'),
    });
    expect(d.ui.connectivity.providerLinkState.presentation?.state).toBe('REAUTH_REQUIRED');
  });

  it('7 — DEVICE_UNPLUGGED', () => {
    const d = detailSurfaces({
      connectivityRuntime: runtime({
        overallState: 'DEVICE_UNPLUGGED',
        physicalDeviceState: 'UNPLUGGED_CONFIRMED',
        attentionState: 'ACTION_REQUIRED',
      }),
      operationalAvailability: availability('UNAVAILABLE'),
    });
    expect(d.connectivity.shortLabel).toBe(de['fleetConnectivity.state.DEVICE_UNPLUGGED']);
  });

  it('8 — NO_ACTIVE_DATA_SOURCE', () => {
    const d = detailSurfaces({
      connectivityRuntime: runtime({
        overallState: 'NO_ACTIVE_DATA_SOURCE',
        telemetryState: 'no_signal',
      }),
      operationalAvailability: availability('UNKNOWN'),
    });
    expect(d.connectivity.shortLabel).toBe(de['fleetConnectivity.state.NO_ACTIVE_DATA_SOURCE']);
  });

  it('9 — INTEGRATION_ERROR', () => {
    const d = detailSurfaces({
      connectivityRuntime: runtime({
        overallState: 'INTEGRATION_ERROR',
        telemetryState: 'no_signal',
      }),
      operationalAvailability: availability('UNKNOWN'),
    });
    expect(d.connectivity.shortLabel).toBe(de['fleetConnectivity.state.INTEGRATION_ERROR']);
  });

  it('10 — connectivity UNKNOWN', () => {
    const d = detailSurfaces({
      connectivityRuntime: runtime({ overallState: 'UNKNOWN', telemetryState: 'no_signal' }),
      operationalAvailability: availability('UNKNOWN'),
    });
    expect(d.connectivity.shortLabel).toBe(de['fleetConnectivity.state.UNKNOWN']);
    expect(d.connectivity.tone).not.toBe('success');
  });

  it('11 — health PARTIALLY_EVALUABLE is not Gut', () => {
    const d = detailSurfaces({
      healthEvaluation: health('PARTIALLY_EVALUABLE', { condition: 'good' }),
      operationalAvailability: availability('AVAILABLE'),
      connectivityRuntime: runtime(),
    });
    expect(d.health.label).toBe(de['fleet.healthEvaluation.partiallyEvaluable']);
    expect(d.health.label).not.toBe('Gut');
  });

  it('12 — health NOT_EVALUABLE is not Gut', () => {
    const d = detailSurfaces({
      healthEvaluation: health('NOT_EVALUABLE'),
      operationalAvailability: availability('AVAILABLE'),
    });
    expect(d.health.label).toBe(de['fleet.healthEvaluation.notEvaluable']);
  });

  it('13 — health absent does not fabricate Gut', () => {
    const d = detailSurfaces({
      operationalAvailability: availability('AVAILABLE'),
      connectivityRuntime: runtime(),
      healthStatus: 'Good Health',
    });
    expect(d.health.label).not.toBe('Gut');
    expect(d.health.status).toBe('unknown');
  });

  it('14 — connectivity absent does not derive offline from legacy timestamps', () => {
    const vehicle = mapFleetMapVehicleResponse(
      fleetRow({
        operationalAvailability: availability('AVAILABLE'),
        onlineStatus: 'OFFLINE',
        lastSeenAt: '2010-01-01T00:00:00.000Z',
        signalAgeMs: 999_999_999,
      }),
    );
    const connectivity = resolveVehicleDetailConnectivityPresentation(vehicle, { locale: 'de' });
    expect(connectivity.shortLabel).not.toBe(de['fleetConnectivity.telemetryFreshness.offline']);
  });
});

describe('P1.4 legacy vs canonical conflict (vehicle detail)', () => {
  it('A — legacy OFFLINE + old lastSeen loses to canonical live', () => {
    const d = detailSurfaces({
      onlineStatus: 'OFFLINE',
      telemetryFreshness: 'offline',
      lastSeenAt: '2010-01-01T00:00:00.000Z',
      signalAgeMs: 999_999_999,
      connectivityRuntime: runtime({ telemetryState: 'live' }),
      operationalAvailability: availability('AVAILABLE'),
    });
    expect(d.connectivity.shortLabel).toBe(de['fleetConnectivity.telemetryFreshness.live']);
    expect(d.connectivity.shortLabel).not.toBe(de['fleetConnectivity.telemetryFreshness.offline']);
  });

  it('B — legacy ONLINE loses to canonical AUTHORIZATION_REQUIRED', () => {
    const d = detailSurfaces({
      onlineStatus: 'ONLINE',
      telemetryFreshness: 'live',
      lastSeenAt: new Date().toISOString(),
      connectivityRuntime: runtime({
        overallState: 'AUTHORIZATION_REQUIRED',
        providerLinkState: 'REAUTH_REQUIRED',
      }),
      operationalAvailability: availability('NEEDS_VERIFICATION'),
    });
    expect(d.connectivity.shortLabel).toBe(de['fleetConnectivity.state.AUTHORIZATION_REQUIRED']);
    expect(d.display.statusBadge.label).toBe('Prüfung erforderlich');
  });

  it('C — legacy 30h timestamp + canonical STANDBY stays standby/available', () => {
    const d = detailSurfaces({
      lastSeenAt: new Date(Date.now() - 30 * 3_600_000).toISOString(),
      signalAgeMs: 30 * 3_600_000,
      onlineStatus: 'OFFLINE',
      connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby' }),
      operationalAvailability: availability('AVAILABLE'),
    });
    expect(d.connectivity.shortLabel).toBe(de['fleetConnectivity.telemetryFreshness.standby']);
    expect(d.display.statusBadge.label).toBe('Verfügbar');
  });

  it('D — legacy 50h timestamp + canonical live wins', () => {
    const d = detailSurfaces({
      lastSeenAt: new Date(Date.now() - 50 * 3_600_000).toISOString(),
      signalAgeMs: 50 * 3_600_000,
      onlineStatus: 'OFFLINE',
      connectivityRuntime: runtime({ overallState: 'TELEMETRY_ACTIVE', telemetryState: 'live' }),
      operationalAvailability: availability('AVAILABLE'),
    });
    expect(d.connectivity.shortLabel).toBe(de['fleetConnectivity.telemetryFreshness.live']);
  });
});

describe('P1.4 cross-surface consistency (fleet row/map + vehicle detail)', () => {
  it('row, map, and detail agree on availability + telemetry for standby', () => {
    const row = fleetSurfaces({
      connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby' }),
      operationalAvailability: availability('AVAILABLE'),
      healthEvaluation: health('EVALUABLE'),
    });
    const detail = detailSurfaces({
      connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby' }),
      operationalAvailability: availability('AVAILABLE'),
      healthEvaluation: health('EVALUABLE'),
    });
    expect(detail.display.statusBadge.label).toBe(row.display.statusBadge.label);
    expect(detail.connectivity.shortLabel).toBe(row.display.telemetryLabel);
    expect(row.visual.mapTone).toBe('ready');
  });

  it('detail connectivity matches fleet telemetry label for SOFT_OFFLINE', () => {
    const row = fleetSurfaces({
      connectivityRuntime: runtime({
        overallState: 'SOFT_OFFLINE',
        telemetryState: 'signal_delayed',
      }),
      operationalAvailability: availability('AVAILABLE'),
    });
    const detail = detailSurfaces({
      connectivityRuntime: runtime({
        overallState: 'SOFT_OFFLINE',
        telemetryState: 'signal_delayed',
      }),
      operationalAvailability: availability('AVAILABLE'),
    });
    expect(detail.connectivity.shortLabel).toBe(row.display.telemetryLabel);
  });

  it('detail health matches fleet health for NOT_EVALUABLE', () => {
    const row = fleetSurfaces({
      healthEvaluation: health('NOT_EVALUABLE'),
      operationalAvailability: availability('AVAILABLE'),
      connectivityRuntime: runtime(),
    });
    const detail = detailSurfaces({
      healthEvaluation: health('NOT_EVALUABLE'),
      operationalAvailability: availability('AVAILABLE'),
      connectivityRuntime: runtime(),
    });
    expect(detail.health.label).toBe(row.display.healthDisplay.label);
  });
});

describe('P1.4 map position vs connectivity separation', () => {
  function vehicleWithConnectivity(
    overrides: Partial<FleetMapVehicleResponse> = {},
  ): ReturnType<typeof mapFleetMapVehicleResponse> {
    return mapFleetMapVehicleResponse(
      fleetRow({
        connectivityRuntime: runtime(),
        operationalAvailability: availability('AVAILABLE'),
        ...overrides,
      }),
    );
  }

  it('1 — livePosition + TELEMETRY_ACTIVE/live => live position badge', () => {
    const badge = resolveVehicleDetailMapTrackingBadge('livePosition', { locale: 'de' });
    expect(badge?.label).toBe(de['fleetConnectivity.telemetryFreshness.live']);
    expect(badge?.tone).toBe('live');
  });

  it('2 — lastKnownPosition + TELEMETRY_ACTIVE/live => Last known, NOT Live', () => {
    const vehicle = vehicleWithConnectivity({
      connectivityRuntime: runtime({ overallState: 'TELEMETRY_ACTIVE', telemetryState: 'live' }),
    });
    const badge = resolveVehicleDetailMapTrackingBadge('lastKnownPosition', { locale: 'de' });
    const connectivity = resolveVehicleDetailConnectivityPresentation(vehicle, { locale: 'de' });
    expect(badge?.label).toBe(de['vehicleDetail.mapBadge.lastKnown']);
    expect(badge?.label).not.toBe(connectivity.shortLabel);
    expect(badge?.tone).toBe('watch');
  });

  it('3 — lastKnownPosition + STANDBY => Last known, not fabricated connectivity', () => {
    const vehicle = vehicleWithConnectivity({
      connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby' }),
    });
    const badge = resolveVehicleDetailMapTrackingBadge('lastKnownPosition', { locale: 'de' });
    const connectivity = resolveVehicleDetailConnectivityPresentation(vehicle, { locale: 'de' });
    expect(badge?.label).toBe(de['vehicleDetail.mapBadge.lastKnown']);
    expect(badge?.label).not.toBe(connectivity.shortLabel);
  });

  it('4 — staticPositionOnly + healthy connectivity => last-known semantics, NOT Live', () => {
    const vehicle = vehicleWithConnectivity({
      connectivityRuntime: runtime({ overallState: 'TELEMETRY_ACTIVE', telemetryState: 'live' }),
    });
    const badge = resolveVehicleDetailMapTrackingBadge('staticPositionOnly', { locale: 'de' });
    const connectivity = resolveVehicleDetailConnectivityPresentation(vehicle, { locale: 'de' });
    expect(badge?.label).toBe(de['vehicleDetail.mapBadge.lastKnown']);
    expect(badge?.label).not.toBe(connectivity.shortLabel);
    expect(badge?.tone).not.toBe('live');
  });

  it('5 — telemetryUnavailable + connectivity ACTIVE/live => position unavailable semantics', () => {
    const vehicle = vehicleWithConnectivity({
      connectivityRuntime: runtime({ overallState: 'TELEMETRY_ACTIVE', telemetryState: 'live' }),
    });
    const badge = resolveVehicleDetailMapTrackingBadge('telemetryUnavailable', { locale: 'de' });
    const connectivity = resolveVehicleDetailConnectivityPresentation(vehicle, { locale: 'de' });
    expect(badge?.label).toBe(de['vehicleDetail.mapBadge.signalIssue']);
    expect(badge?.label).not.toBe(connectivity.shortLabel);
    expect(badge?.tone).toBe('muted');
  });

  it('6 — trackingUnavailable + connectivity ACTIVE/live => tracking unavailable, NOT Live', () => {
    const vehicle = vehicleWithConnectivity({
      connectivityRuntime: runtime({ overallState: 'TELEMETRY_ACTIVE', telemetryState: 'live' }),
    });
    const badge = resolveVehicleDetailMapTrackingBadge('trackingUnavailable', { locale: 'de' });
    const connectivity = resolveVehicleDetailConnectivityPresentation(vehicle, { locale: 'de' });
    expect(badge?.label).toBe(de['vehicleDetail.mapBadge.noTracking']);
    expect(badge?.label).not.toBe(connectivity.shortLabel);
    expect(badge?.tone).toBe('muted');
  });

  it('7 — noPosition + connectivity ACTIVE/live => does not claim live coordinate', () => {
    const vehicle = vehicleWithConnectivity({
      connectivityRuntime: runtime({ overallState: 'TELEMETRY_ACTIVE', telemetryState: 'live' }),
    });
    const badge = resolveVehicleDetailMapTrackingBadge('noPosition', {
      locale: 'de',
      isLiveTracking: false,
    });
    const connectivity = resolveVehicleDetailConnectivityPresentation(vehicle, { locale: 'de' });
    expect(badge).toBeNull();
    expect(connectivity.shortLabel).toBe(de['fleetConnectivity.telemetryFreshness.live']);
  });

  it('8 — DEVICE_UNPLUGGED connectivity remains critical presentation', () => {
    const vehicle = vehicleWithConnectivity({
      connectivityRuntime: runtime({
        overallState: 'DEVICE_UNPLUGGED',
        physicalDeviceState: 'UNPLUGGED_CONFIRMED',
      }),
    });
    const connectivity = resolveVehicleDetailConnectivityPresentation(vehicle, { locale: 'de' });
    expect(connectivity.tone).toBe('critical');
    expect(connectivity.dotColorClass).toContain('--status-critical');
    expect(connectivity.labelColorClass).toContain('--status-critical');
    expect(connectivity.shortLabel).toBe(de['fleetConnectivity.state.DEVICE_UNPLUGGED']);
  });

  it('9 — AUTHORIZATION_REQUIRED connectivity is not muted/no-data', () => {
    const vehicle = vehicleWithConnectivity({
      connectivityRuntime: runtime({
        overallState: 'AUTHORIZATION_REQUIRED',
        providerLinkState: 'REAUTH_REQUIRED',
      }),
      operationalAvailability: availability('NEEDS_VERIFICATION'),
    });
    const connectivity = resolveVehicleDetailConnectivityPresentation(vehicle, { locale: 'de' });
    expect(connectivity.tone).toBe('warning');
    expect(connectivity.dotColorClass).toContain('--status-watch');
    expect(connectivity.labelColorClass).toContain('--status-watch');
    expect(connectivity.dotColorClass).not.toContain('--status-nodata');
    expect(connectivity.shortLabel).toBe(de['fleetConnectivity.state.AUTHORIZATION_REQUIRED']);
  });

  it('10 — INTEGRATION_ERROR connectivity remains critical presentation', () => {
    const vehicle = vehicleWithConnectivity({
      connectivityRuntime: runtime({ overallState: 'INTEGRATION_ERROR', telemetryState: 'no_signal' }),
    });
    const connectivity = resolveVehicleDetailConnectivityPresentation(vehicle, { locale: 'de' });
    expect(connectivity.tone).toBe('critical');
    expect(connectivity.dotColorClass).toContain('--status-critical');
    expect(connectivity.shortLabel).toBe(de['fleetConnectivity.state.INTEGRATION_ERROR']);
  });

  it('11 — UNKNOWN / connectivity absent => neutral/noData, not critical', () => {
    const vehicleAbsent = mapFleetMapVehicleResponse(
      fleetRow({
        operationalAvailability: availability('AVAILABLE'),
        onlineStatus: 'OFFLINE',
        lastSeenAt: '2010-01-01T00:00:00.000Z',
      }),
    );
    const connectivityAbsent = resolveVehicleDetailConnectivityPresentation(vehicleAbsent, {
      locale: 'de',
    });
    expect(connectivityAbsent.tone).toBe('noData');
    expect(connectivityAbsent.dotColorClass).not.toContain('--status-critical');

    const vehicleUnknown = vehicleWithConnectivity({
      connectivityRuntime: runtime({ overallState: 'UNKNOWN', telemetryState: 'no_signal' }),
      operationalAvailability: availability('UNKNOWN'),
    });
    const connectivityUnknown = resolveVehicleDetailConnectivityPresentation(vehicleUnknown, {
      locale: 'de',
    });
    expect(connectivityUnknown.tone).toBe('noData');
    expect(connectivityUnknown.dotColorClass).not.toContain('--status-critical');
  });

  it('position provenance does not alter canonical operationalAvailability', () => {
    const vehicle = vehicleWithConnectivity({
      connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby' }),
      operationalAvailability: availability('AVAILABLE'),
    });
    const before = resolveVehicleDetailFleetDisplay(vehicle, { locale: 'de' });
    resolveVehicleDetailMapTrackingBadge('lastKnownPosition', { locale: 'de' });
    resolveVehicleDetailMapTrackingBadge('livePosition', { locale: 'de' });
    const after = resolveVehicleDetailFleetDisplay(vehicle, { locale: 'de' });
    expect(after.display.statusBadge.label).toBe(before.display.statusBadge.label);
    expect(after.connectivity.shortLabel).toBe(before.connectivity.shortLabel);
  });
});
