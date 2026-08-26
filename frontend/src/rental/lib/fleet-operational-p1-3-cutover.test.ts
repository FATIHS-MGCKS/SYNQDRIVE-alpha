/**
 * P1.3 — Fleet list/map consumer cutover tests.
 */
import { describe, expect, it } from 'vitest';
import type { FleetMapVehicleResponse, VehicleConnectivityRuntimeState } from '../../lib/api';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';
import { mapFleetMapVehicleResponse } from './fleet-map-vehicle-mapper';
import { buildFleetVehicleContexts } from './fleet-operator-panel';
import { deriveFleetVisualState } from './fleetVisualState';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import { buildFleetVehicleUiProjection } from './fleet-vehicle-ui-projection';
import {
  mapFleetStoreVehicleToCanonicalVehicleOperationalView,
  mapVehicleOperationalUiProjection,
} from './operational-projection';
import { VEHICLE_OPERATIONAL_STATUS } from './vehicle-operational-state';

function tFor() {
  return (key: TranslationKey) => de[key] ?? key;
}

function runtime(overrides: Partial<VehicleConnectivityRuntimeState> = {}): VehicleConnectivityRuntimeState {
  return {
    vehicleId: 'p13-1',
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
    lastTelemetryAt: null,
    lastProviderObservedAt: null,
    lastReceivedAt: null,
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
    id: 'p13-1',
    licensePlate: 'P13 1',
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

function surfacesForRow(row: Partial<FleetMapVehicleResponse>) {
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

function masterUiForRow(row: Partial<FleetMapVehicleResponse>) {
  const vehicle = mapFleetMapVehicleResponse(fleetRow(row));
  const canonical = mapFleetStoreVehicleToCanonicalVehicleOperationalView({
    id: vehicle.id,
    connectivityRuntime: vehicle.connectivityRuntime,
    operationalAvailability: vehicle.operationalAvailability,
    healthEvaluation: vehicle.healthEvaluation,
  });
  const ui = mapVehicleOperationalUiProjection(canonical, {
    audience: 'master_admin',
    t: tFor(),
  });
  return { vehicle, canonical, ui };
}

describe('P1.3 fleet consumer cutover', () => {
  it('1 — AVAILABLE + live + EVALUABLE/good agrees across row/map surfaces', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime(),
      operationalAvailability: availability('AVAILABLE'),
      healthEvaluation: health('EVALUABLE'),
    });
    expect(s.display.statusBadge.label).toBe('Verfügbar');
    expect(s.display.healthDisplay.label).toBe('Gut');
    expect(s.visual.mapTone).toBe('ready');
  });

  it('2 — AVAILABLE + standby stays ready (not offline)', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby' }),
      operationalAvailability: availability('AVAILABLE'),
    });
    expect(s.visual.mapTone).toBe('ready');
    expect(s.display.showTelemetryWarning).toBe(false);
  });

  it('3 — AVAILABLE + signal_delayed does not become unavailable map tone when AVAILABLE', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime({
        overallState: 'SOFT_OFFLINE',
        telemetryState: 'signal_delayed',
        attentionState: 'WATCH',
      }),
      operationalAvailability: availability('AVAILABLE'),
    });
    expect(s.visual.mapTone).not.toBe('offline');
    expect(s.display.statusBadge.label).toBe('Verfügbar');
  });

  it('4 — NEEDS_VERIFICATION + offline', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime({ overallState: 'OFFLINE', telemetryState: 'offline' }),
      operationalAvailability: availability('NEEDS_VERIFICATION', { attention: 'WATCH' }),
    });
    expect(s.display.statusBadge.label).toBe('Prüfung erforderlich');
    expect(s.visual.mapTone).toBe('stale');
  });

  it('5 — UNAVAILABLE', () => {
    const s = surfacesForRow({
      operationalAvailability: availability('UNAVAILABLE', { attention: 'ACTION_REQUIRED' }),
    });
    expect(s.display.statusBadge.label).toBe('Nicht verfügbar');
    expect(s.visual.mapTone).toBe('blocked');
  });

  it('6 — AUTHORIZATION_REQUIRED', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime({
        overallState: 'AUTHORIZATION_REQUIRED',
        providerLinkState: 'REAUTH_REQUIRED',
        recommendedAction: 'REAUTHORIZE_PROVIDER',
      }),
      operationalAvailability: availability('NEEDS_VERIFICATION'),
    });
    expect(s.visual.mapTone).toBe('blocked');
  });

  it('7 — REAUTH_REQUIRED provider link', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime({
        overallState: 'AUTHORIZATION_REQUIRED',
        providerLinkState: 'REAUTH_REQUIRED',
      }),
      operationalAvailability: availability('NEEDS_VERIFICATION'),
    });
    expect(s.ui.connectivity.providerLinkState.presentation?.state).toBe('REAUTH_REQUIRED');
  });

  it('8 — DEVICE_UNPLUGGED', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime({
        overallState: 'DEVICE_UNPLUGGED',
        physicalDeviceState: 'UNPLUGGED_CONFIRMED',
        attentionState: 'ACTION_REQUIRED',
      }),
      operationalAvailability: availability('UNAVAILABLE'),
    });
    expect(s.visual.mapTone).toBe('blocked');
  });

  it('9 — NO_ACTIVE_DATA_SOURCE', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime({
        overallState: 'NO_ACTIVE_DATA_SOURCE',
        telemetryState: 'no_signal',
      }),
      operationalAvailability: availability('UNKNOWN'),
    });
    expect(s.visual.mapTone).toBe('unknown');
  });

  it('10 — health PARTIALLY_EVALUABLE is not Gut', () => {
    const s = surfacesForRow({
      healthEvaluation: health('PARTIALLY_EVALUABLE', { condition: 'good' }),
      operationalAvailability: availability('AVAILABLE'),
      connectivityRuntime: runtime(),
    });
    expect(s.display.healthDisplay.label).not.toBe('Gut');
    expect(s.display.healthDisplay.isEvaluable).toBe(false);
  });

  it('11 — health NOT_EVALUABLE is not Gut', () => {
    const s = surfacesForRow({
      healthEvaluation: health('NOT_EVALUABLE'),
      operationalAvailability: availability('AVAILABLE'),
    });
    expect(s.display.healthDisplay.label).not.toBe('Gut');
  });

  it('12 — connectivity UNKNOWN', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime({ overallState: 'UNKNOWN', telemetryState: 'no_signal' }),
      operationalAvailability: availability('UNKNOWN'),
    });
    expect(s.visual.mapTone).toBe('unknown');
  });

  it('13 — availability UNKNOWN', () => {
    const s = surfacesForRow({
      operationalAvailability: availability('UNKNOWN'),
      connectivityRuntime: runtime(),
    });
    expect(s.display.statusBadge.label).toBe('Status unbekannt');
  });

  it('14 — missing connectivityRuntime does not derive offline from legacy timestamps', () => {
    const s = surfacesForRow({
      operationalAvailability: availability('AVAILABLE'),
      onlineStatus: 'OFFLINE',
      lastSeenAt: '2010-01-01T00:00:00.000Z',
      signalAgeMs: 999_999_999,
    });
    expect(s.visual.mapTone).not.toBe('offline');
    expect(s.display.statusBadge.label).toBe('Verfügbar');
  });

  it('15 — missing healthEvaluation does not fabricate Gut', () => {
    const s = surfacesForRow({
      operationalAvailability: availability('AVAILABLE'),
      connectivityRuntime: runtime(),
      healthStatus: 'Good Health',
    });
    expect(s.display.healthDisplay.label).not.toBe('Gut');
    expect(s.display.healthDisplay.status).toBe('unknown');
  });
});

describe('P1.3 legacy vs canonical conflict', () => {
  it('legacy OFFLINE timestamps lose to canonical AVAILABLE + live', () => {
    const s = surfacesForRow({
      onlineStatus: 'OFFLINE',
      telemetryFreshness: 'offline',
      lastSeenAt: '2010-01-01T00:00:00.000Z',
      signalAgeMs: 999_999_999,
      connectivityRuntime: runtime({ telemetryState: 'live' }),
      operationalAvailability: availability('AVAILABLE'),
    });
    expect(s.display.telemetryStatus).toBe('live');
    expect(s.visual.mapTone).toBe('ready');
  });

  it('legacy ONLINE loses to canonical AUTHORIZATION_REQUIRED', () => {
    const s = surfacesForRow({
      onlineStatus: 'ONLINE',
      telemetryFreshness: 'live',
      lastSeenAt: new Date().toISOString(),
      connectivityRuntime: runtime({
        overallState: 'AUTHORIZATION_REQUIRED',
        providerLinkState: 'REAUTH_REQUIRED',
      }),
      operationalAvailability: availability('NEEDS_VERIFICATION'),
    });
    expect(s.display.statusBadge.label).toBe('Prüfung erforderlich');
    expect(s.visual.mapTone).toBe('blocked');
  });
});

describe('P1.3 cross-surface consistency', () => {
  it('row display and map visual agree on availability label/tone', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby' }),
      operationalAvailability: availability('AVAILABLE'),
      healthEvaluation: health('EVALUABLE'),
    });
    expect(s.display.statusBadge.label).toBe(s.ui.availability.presentation?.label);
    expect(s.visual.mapTone).toBe('ready');
  });

  it('org_admin projection has no technicalDetail', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime(),
      operationalAvailability: availability('AVAILABLE'),
    });
    expect(s.ui.technicalDetail).toBeUndefined();
  });
});

describe('P1.3 critical precedence over UNKNOWN availability', () => {
  it('A — DEVICE_UNPLUGGED + availability UNKNOWN => blocked', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime({
        overallState: 'DEVICE_UNPLUGGED',
        physicalDeviceState: 'UNPLUGGED_CONFIRMED',
      }),
      operationalAvailability: availability('UNKNOWN'),
    });
    expect(s.visual.mapTone).toBe('blocked');
    expect(s.visual.visualStatus).not.toBe('unknown');
  });

  it('B — DEVICE_UNPLUGGED + availability absent => blocked', () => {
    const vehicle = mapFleetMapVehicleResponse(
      fleetRow({
        connectivityRuntime: runtime({
          overallState: 'DEVICE_UNPLUGGED',
          physicalDeviceState: 'UNPLUGGED_CONFIRMED',
        }),
      }),
    );
    const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
    const visual = deriveFleetVisualState(vehicle, {
      uiProjection: ui,
      requireLocation: true,
      locale: 'de',
    });
    expect(visual.mapTone).toBe('blocked');
  });

  it('C — AUTHORIZATION_REQUIRED + availability UNKNOWN => blocked', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime({
        overallState: 'AUTHORIZATION_REQUIRED',
        providerLinkState: 'REAUTH_REQUIRED',
      }),
      operationalAvailability: availability('UNKNOWN'),
    });
    expect(s.visual.mapTone).toBe('blocked');
  });

  it('D — INTEGRATION_ERROR + availability absent => blocked', () => {
    const vehicle = mapFleetMapVehicleResponse(
      fleetRow({
        connectivityRuntime: runtime({ overallState: 'INTEGRATION_ERROR' }),
      }),
    );
    const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
    const visual = deriveFleetVisualState(vehicle, {
      uiProjection: ui,
      requireLocation: true,
      locale: 'de',
    });
    expect(visual.mapTone).toBe('blocked');
  });

  it('E — CRITICAL attention + availability UNKNOWN => blocked', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime({ attentionState: 'CRITICAL' }),
      operationalAvailability: availability('UNKNOWN'),
    });
    expect(s.visual.mapTone).toBe('blocked');
  });

  it('F — availability UNKNOWN + connectivity UNKNOWN => unknown', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime({ overallState: 'UNKNOWN', telemetryState: 'no_signal' }),
      operationalAvailability: availability('UNKNOWN'),
    });
    expect(s.visual.mapTone).toBe('unknown');
  });

  it('G — availability absent + connectivity absent => unknown', () => {
    const vehicle = mapFleetMapVehicleResponse(fleetRow({}));
    const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
    const visual = deriveFleetVisualState(vehicle, {
      uiProjection: ui,
      requireLocation: true,
      locale: 'de',
    });
    expect(visual.mapTone).toBe('unknown');
  });
});

describe('P1.3 health evaluability does not force map attention', () => {
  it('NOT_EVALUABLE + AVAILABLE + healthy connectivity stays ready on map', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime(),
      operationalAvailability: availability('AVAILABLE'),
      healthEvaluation: health('NOT_EVALUABLE'),
    });
    expect(s.visual.mapTone).toBe('ready');
    expect(s.display.healthDisplay.label).not.toBe('Gut');
  });

  it('PARTIALLY_EVALUABLE + AVAILABLE + good stays ready on map', () => {
    const s = surfacesForRow({
      connectivityRuntime: runtime(),
      operationalAvailability: availability('AVAILABLE'),
      healthEvaluation: health('PARTIALLY_EVALUABLE', { condition: 'good' }),
    });
    expect(s.visual.mapTone).toBe('ready');
    expect(s.display.healthDisplay.label).not.toBe('Gut');
  });
});

describe('P1.3 provenance through store → canonical → projection', () => {
  it('primaryReason absent remains absent', () => {
    const { ui } = masterUiForRow({
      operationalAvailability: {
        state: 'AVAILABLE',
        generatedAt: '2026-08-26T12:00:00.000Z',
      } as FleetMapVehicleResponse['operationalAvailability'],
      connectivityRuntime: runtime(),
    });
    expect(ui.operator.primaryReason.presence).toBe('absent');
    expect(ui.technicalDetail?.primaryReason.presence).toBe('absent');
  });

  it('primaryReason null remains present+null', () => {
    const { ui } = masterUiForRow({
      operationalAvailability: availability('AVAILABLE', { primaryReason: null }),
      connectivityRuntime: runtime(),
    });
    expect(ui.operator.primaryReason.presence).toBe('present');
    expect(ui.operator.primaryReason.presentation?.resolution).toBe('explicit_null');
  });

  it('reasonCodes absent remains absent', () => {
    const { ui } = masterUiForRow({
      operationalAvailability: {
        state: 'AVAILABLE',
        generatedAt: '2026-08-26T12:00:00.000Z',
      } as FleetMapVehicleResponse['operationalAvailability'],
      connectivityRuntime: runtime(),
    });
    expect(ui.operator.reasonCodes.presence).toBe('absent');
  });

  it('reasonCodes [] remains present+[]', () => {
    const { ui } = masterUiForRow({
      operationalAvailability: availability('AVAILABLE', { reasonCodes: [] }),
      connectivityRuntime: runtime(),
    });
    expect(ui.operator.reasonCodes.presence).toBe('present');
    expect(ui.operator.reasonCodes.presentation?.items).toEqual([]);
  });

  it('recommendedAction absent remains absent', () => {
    const { ui } = masterUiForRow({
      operationalAvailability: {
        state: 'AVAILABLE',
        generatedAt: '2026-08-26T12:00:00.000Z',
      } as FleetMapVehicleResponse['operationalAvailability'],
      connectivityRuntime: runtime(),
    });
    expect(ui.operator.recommendedAction.presence).toBe('absent');
  });

  it('recommendedAction NONE remains present+NONE', () => {
    const { ui } = masterUiForRow({
      operationalAvailability: availability('AVAILABLE', { recommendedAction: 'NONE' }),
      connectivityRuntime: runtime(),
    });
    expect(ui.operator.recommendedAction.presence).toBe('present');
    expect(ui.operator.recommendedAction.presentation?.action).toBe('NONE');
  });

  it('health condition absent remains absent', () => {
    const { ui } = masterUiForRow({
      operationalAvailability: availability('AVAILABLE'),
      connectivityRuntime: runtime(),
      healthEvaluation: {
        evaluability: 'EVALUABLE',
        generatedAt: '2026-08-26T12:00:00.000Z',
        healthEvidenceAt: null,
        anyModuleDataStale: false,
        source: 'p0.2_projection',
      } as FleetMapVehicleResponse['healthEvaluation'],
    });
    expect(ui.technicalDetail?.healthCondition.presence).toBe('absent');
  });

  it('health condition unknown remains present+unknown', () => {
    const { ui } = masterUiForRow({
      operationalAvailability: availability('AVAILABLE'),
      connectivityRuntime: runtime(),
      healthEvaluation: health('EVALUABLE', { condition: 'unknown' }),
    });
    expect(ui.technicalDetail?.healthCondition.presence).toBe('present');
    expect(ui.technicalDetail?.healthCondition.presentation).toBe('unknown');
  });
});

describe('P1.3 map marker labels are localized', () => {
  it('uses German connectivity label for offline map marker', () => {
    const vehicle = mapFleetMapVehicleResponse(
      fleetRow({
        connectivityRuntime: runtime({ overallState: 'OFFLINE', telemetryState: 'offline' }),
      }),
    );
    const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
    const visual = deriveFleetVisualState(vehicle, {
      uiProjection: ui,
      requireLocation: true,
      locale: 'de',
    });
    expect(visual.mapTone).toBe('offline');
    expect(visual.label).toBe(de['fleetConnectivity.state.OFFLINE']);
    expect(visual.label).toBe(en['fleetConnectivity.state.OFFLINE']);
  });
});
