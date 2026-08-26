import { describe, expect, it } from 'vitest';
import type { FleetMapVehicleResponse } from '../../../lib/api';
import { en } from '../../../i18n/translations/en';
import { de } from '../../../i18n/translations/de';
import type { TranslationKey } from '../../../i18n/translations/en';
import { mapFleetMapToCanonicalVehicleOperationalView } from '../map-fleet-map-to-canonical';
import { mapVehicleOperationalUiProjection } from './map-vehicle-operational-ui-projection';
import { mapPrimaryReasonPresentation } from './primary-reason-presentation';

function tFor(locale: 'en' | 'de') {
  const dict = locale === 'de' ? de : en;
  return (key: TranslationKey) => dict[key] ?? key;
}

function mapUi(
  row: Partial<FleetMapVehicleResponse> & { id?: string },
  audience: 'org_admin' | 'master_admin' | 'worker' = 'org_admin',
) {
  const canonical = mapFleetMapToCanonicalVehicleOperationalView(row as FleetMapVehicleResponse);
  return mapVehicleOperationalUiProjection(canonical, { audience, t: tFor('de') });
}

// Minimal fleet-map row builder (subset of P1.1 fixtures)
function fleetRow(
  overrides: Partial<FleetMapVehicleResponse> = {},
): FleetMapVehicleResponse {
  return {
    id: 'veh-ui-1',
    licensePlate: 'M-UI 1',
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
    lastSeenAt: '2020-01-01T00:00:00.000Z',
    signalAgeMs: 999_999,
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

function runtime(overrides: Record<string, unknown> = {}) {
  return {
    vehicleId: 'veh-ui-1',
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
    primaryReason: null,
    reasonCodes: [],
    recommendedAction: 'NONE',
    attention: 'NONE',
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

describe('mapVehicleOperationalUiProjection (P1.2)', () => {
  it('1 — AVAILABLE + live + ACTIVE + EVALUABLE/good', () => {
    const ui = mapUi(
      fleetRow({
        connectivityRuntime: runtime(),
        operationalAvailability: availability('AVAILABLE'),
        healthEvaluation: health('EVALUABLE'),
      }),
    );
    expect(ui.availability.presentation?.label).toBe('Verfügbar');
    expect(ui.availability.presentation?.tone).toBe('success');
    expect(ui.health.presentation?.label).toBe('Gut');
    expect(ui.health.presentation?.isEvaluable).toBe(true);
    expect(ui.connectivity.overallState.presentation?.state).toBe('TELEMETRY_ACTIVE');
  });

  it('2 — AVAILABLE + standby', () => {
    const ui = mapUi(
      fleetRow({
        connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby' }),
        operationalAvailability: availability('AVAILABLE'),
      }),
    );
    expect(ui.connectivity.telemetryState.presentation?.state).toBe('standby');
    expect(ui.connectivity.telemetryState.presentation?.tone).toBe('watch');
  });

  it('3 — NEEDS_VERIFICATION + offline', () => {
    const ui = mapUi(
      fleetRow({
        connectivityRuntime: runtime({ overallState: 'OFFLINE', telemetryState: 'offline' }),
        operationalAvailability: availability('NEEDS_VERIFICATION', {
          primaryReason: 'CONNECTIVITY_VERIFICATION_REQUIRED',
          attention: 'WATCH',
        }),
      }),
    );
    expect(ui.availability.presentation?.label).toBe('Prüfung erforderlich');
    expect(ui.availability.presentation?.tone).toBe('watch');
    expect(ui.availability.presentation?.state).toBe('NEEDS_VERIFICATION');
  });

  it('4 — UNAVAILABLE', () => {
    const ui = mapUi(
      fleetRow({
        operationalAvailability: availability('UNAVAILABLE', {
          primaryReason: 'BUSINESS_WORKFLOW_BLOCKED',
          attention: 'ACTION_REQUIRED',
        }),
      }),
    );
    expect(ui.availability.presentation?.label).toBe('Nicht verfügbar');
    expect(ui.availability.presentation?.tone).toBe('critical');
  });

  it('5 — REAUTH_REQUIRED', () => {
    const ui = mapUi(
      fleetRow({
        connectivityRuntime: runtime({
          overallState: 'AUTHORIZATION_REQUIRED',
          providerLinkState: 'REAUTH_REQUIRED',
          recommendedAction: 'REAUTHORIZE_PROVIDER',
        }),
      }),
    );
    expect(ui.connectivity.providerLinkState.presentation?.state).toBe('REAUTH_REQUIRED');
    expect(ui.connectivity.recommendedAction.presentation?.action).toBe('REAUTHORIZE_PROVIDER');
  });

  it('6 — REVOKED', () => {
    const ui = mapUi(
      fleetRow({
        connectivityRuntime: runtime({
          providerLinkState: 'REVOKED',
          overallState: 'AUTHORIZATION_REQUIRED',
        }),
      }),
    );
    expect(ui.connectivity.providerLinkState.presentation?.state).toBe('REVOKED');
  });

  it('7 — DEVICE_UNPLUGGED', () => {
    const ui = mapUi(
      fleetRow({
        connectivityRuntime: runtime({
          overallState: 'DEVICE_UNPLUGGED',
          physicalDeviceState: 'UNPLUGGED_CONFIRMED',
          attentionState: 'ACTION_REQUIRED',
        }),
      }),
    );
    expect(ui.connectivity.overallState.presentation?.state).toBe('DEVICE_UNPLUGGED');
    expect(ui.connectivity.overallState.presentation?.tone).toBe('critical');
  });

  it('8 — NO_ACTIVE_DATA_SOURCE', () => {
    const ui = mapUi(
      fleetRow({
        connectivityRuntime: runtime({
          overallState: 'NO_ACTIVE_DATA_SOURCE',
          telemetryState: 'no_signal',
        }),
      }),
    );
    expect(ui.connectivity.overallState.presentation?.tone).toBe('noData');
  });

  it('9 — INTEGRATION_ERROR', () => {
    const ui = mapUi(
      fleetRow({
        connectivityRuntime: runtime({ overallState: 'INTEGRATION_ERROR' }),
      }),
    );
    expect(ui.connectivity.overallState.presentation?.tone).toBe('critical');
  });

  it('10 — connectivity UNKNOWN', () => {
    const ui = mapUi(
      fleetRow({
        connectivityRuntime: runtime({ overallState: 'UNKNOWN' }),
      }),
    );
    expect(ui.connectivity.overallState.presentation?.state).toBe('UNKNOWN');
  });

  it('11 — availability UNKNOWN', () => {
    const ui = mapUi(
      fleetRow({
        operationalAvailability: availability('UNKNOWN'),
      }),
    );
    expect(ui.availability.presentation?.label).toBe('Status unbekannt');
    expect(ui.availability.presentation?.tone).toBe('neutral');
  });

  it('12 — EVALUABLE good', () => {
    const ui = mapUi(
      fleetRow({
        healthEvaluation: health('EVALUABLE', { condition: 'good' }),
      }),
    );
    expect(ui.health.presentation?.label).toBe('Gut');
    expect(ui.health.presentation?.tone).toBe('success');
  });

  it('13 — PARTIALLY_EVALUABLE warning', () => {
    const ui = mapUi(
      fleetRow({
        healthEvaluation: health('PARTIALLY_EVALUABLE', { condition: 'warning' }),
      }),
    );
    expect(ui.health.presentation?.label).toBe('Eingeschränkt bewertbar');
    expect(ui.health.presentation?.isEvaluable).toBe(false);
  });

  it('14 — PARTIALLY_EVALUABLE good must NOT become full-green healthy', () => {
    const ui = mapUi(
      fleetRow({
        healthEvaluation: health('PARTIALLY_EVALUABLE', { condition: 'good' }),
      }),
    );
    expect(ui.health.presentation?.label).not.toBe('Gut');
    expect(ui.health.presentation?.tone).not.toBe('success');
    expect(ui.health.presentation?.isEvaluable).toBe(false);
  });

  it('15 — NOT_EVALUABLE', () => {
    const ui = mapUi(
      fleetRow({
        healthEvaluation: health('NOT_EVALUABLE'),
      }),
    );
    expect(ui.health.presentation?.label).toBe('Nicht bewertbar');
  });

  it('16 — health UNKNOWN', () => {
    const ui = mapUi(
      fleetRow({
        healthEvaluation: health('UNKNOWN'),
      }),
    );
    expect(ui.health.presentation?.label).toBe('Status unbekannt');
  });

  it('17 — ACTION_REQUIRED attention', () => {
    const ui = mapUi(
      fleetRow({
        operationalAvailability: availability('NEEDS_VERIFICATION', {
          attention: 'ACTION_REQUIRED',
        }),
      }),
    );
    expect(ui.operator.attention.presentation?.state).toBe('ACTION_REQUIRED');
    expect(ui.operator.attention.presentation?.tone).toBe('warning');
    expect(ui.attention.attention.presentation?.tone).not.toBe('success');
  });

  it('18 — CRITICAL attention', () => {
    const ui = mapUi(
      fleetRow({
        operationalAvailability: availability('UNAVAILABLE', { attention: 'CRITICAL' }),
      }),
    );
    expect(ui.operator.attention.presentation?.tone).toBe('critical');
  });

  it('19 — primaryReason explicit null', () => {
    const ui = mapUi(
      fleetRow({
        operationalAvailability: availability('AVAILABLE', { primaryReason: null }),
      }),
    );
    expect(ui.operator.primaryReason.presence).toBe('present');
    expect(ui.operator.primaryReason.presentation?.resolution).toBe('explicit_null');
    expect(ui.operator.primaryReason.presentation?.label).toBeNull();
  });

  it('20 — primaryReason absent', () => {
    const ui = mapUi(
      fleetRow({
        operationalAvailability: {
          state: 'AVAILABLE',
          generatedAt: '2026-08-26T12:00:00.000Z',
        } as FleetMapVehicleResponse['operationalAvailability'],
      }),
    );
    expect(ui.operator.primaryReason.presence).toBe('absent');
  });

  it('21 — recommendedAction NONE', () => {
    const ui = mapUi(
      fleetRow({
        operationalAvailability: availability('AVAILABLE', { recommendedAction: 'NONE' }),
      }),
    );
    expect(ui.operator.recommendedAction.presence).toBe('present');
    expect(ui.operator.recommendedAction.presentation?.action).toBe('NONE');
  });

  it('22 — recommendedAction absent', () => {
    const ui = mapUi(
      fleetRow({
        operationalAvailability: {
          state: 'AVAILABLE',
          generatedAt: '2026-08-26T12:00:00.000Z',
        } as FleetMapVehicleResponse['operationalAvailability'],
      }),
    );
    expect(ui.operator.recommendedAction.presence).toBe('absent');
  });

  it('23 — reasonCodes explicit empty', () => {
    const ui = mapUi(
      fleetRow({
        operationalAvailability: availability('AVAILABLE', { reasonCodes: [] }),
      }),
    );
    expect(ui.operator.reasonCodes.presence).toBe('present');
    expect(ui.operator.reasonCodes.presentation?.items).toEqual([]);
  });

  it('24 — reasonCodes absent', () => {
    const ui = mapUi(
      fleetRow({
        operationalAvailability: {
          state: 'AVAILABLE',
          generatedAt: '2026-08-26T12:00:00.000Z',
        } as FleetMapVehicleResponse['operationalAvailability'],
      }),
    );
    expect(ui.operator.reasonCodes.presence).toBe('absent');
  });

  it('25 — unknown/future reason code uses safe label for org_admin', () => {
    const reason = mapPrimaryReasonPresentation('FUTURE_REASON_CODE_X', {
      t: tFor('de'),
      audience: 'org_admin',
    });
    expect(reason.resolution).toBe('unknown_safe');
    expect(reason.label).toBe('Grund nicht verfügbar');
    expect(reason.label).not.toContain('FUTURE_REASON');
  });

  it('26 — canonical availability absent => absent presentation', () => {
    const ui = mapUi(fleetRow({}));
    expect(ui.availability.presence).toBe('absent');
    expect(ui.health.presence).toBe('absent');
    expect(ui.connectivity.overallState.presence).toBe('absent');
  });

  it('27 — audience org_admin uses human labels', () => {
    const ui = mapVehicleOperationalUiProjection(
      mapFleetMapToCanonicalVehicleOperationalView(
        fleetRow({
          operationalAvailability: availability('NEEDS_VERIFICATION', {
            primaryReason: 'DEVICE_CHECK_REQUIRED',
          }),
        }),
      ),
      { audience: 'org_admin', t: tFor('de') },
    );
    expect(ui.operator.primaryReason.presentation?.label).toBe('Gerät prüfen');
    expect(ui.technicalDetail).toBeUndefined();
  });

  it('28 — audience master_admin exposes technical detail', () => {
    const ui = mapUi(
      fleetRow({
        connectivityRuntime: runtime({ providerLinkState: 'ACTIVE' }),
        operationalAvailability: availability('AVAILABLE'),
        healthEvaluation: health('EVALUABLE'),
      }),
      'master_admin',
    );
    expect(ui.technicalDetail?.connectivityProviderLinkState).toBe('ACTIVE');
    expect(ui.technicalDetail?.operationalAvailability).toBe('AVAILABLE');
  });

  it('29 — no timestamp derivation in facade', () => {
    const ui = mapUi(
      fleetRow({
        lastSeenAt: '2010-01-01T00:00:00.000Z',
        connectivityRuntime: runtime({ telemetryState: 'live' }),
        operationalAvailability: availability('AVAILABLE'),
      }),
    );
    expect(ui.connectivity.telemetryState.presentation?.state).toBe('live');
    expect(ui.availability.presentation?.label).toBe('Verfügbar');
  });

  it('30 — legacy onlineStatus does not affect projection', () => {
    const ui = mapUi(
      fleetRow({
        onlineStatus: 'OFFLINE',
        telemetryFreshness: 'offline',
        lastSeenAt: '2010-01-01T00:00:00.000Z',
        connectivityRuntime: runtime({ telemetryState: 'live' }),
        operationalAvailability: availability('AVAILABLE'),
      }),
    );
    expect(ui.connectivity.telemetryState.presentation?.state).toBe('live');
  });
});

describe('primaryReason coverage (P1.2)', () => {
  const codes = [
    'BUSINESS_WORKFLOW_BLOCKED',
    'HEALTH_RENTAL_BLOCKED',
    'DEVICE_UNPLUG_WEBHOOK',
    'CONNECTIVITY_CONFIRMED_INTERRUPTION',
    'DEVICE_CHECK_REQUIRED',
    'CONNECTIVITY_VERIFICATION_REQUIRED',
    'TELEMETRY_OFFLINE',
    'DATA_COVERAGE_INSUFFICIENT',
    'INSUFFICIENT_CROSS_DOMAIN_EVIDENCE',
  ] as const;

  for (const code of codes) {
    it(`maps ${code} for org_admin`, () => {
      const result = mapPrimaryReasonPresentation(code, { t: tFor('de'), audience: 'org_admin' });
      expect(result.resolution).toBe('mapped');
      expect(result.label).toBeTruthy();
      expect(result.label).not.toBe(code);
    });
  }
});
