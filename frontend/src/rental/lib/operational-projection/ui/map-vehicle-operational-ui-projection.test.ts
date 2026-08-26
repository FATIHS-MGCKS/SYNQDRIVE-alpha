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
    expect(ui.availability.presentation?.primaryReason.presence).toBe('present');
    expect(ui.availability.presentation?.primaryReason.presentation?.resolution).toBe('explicit_null');
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
    expect(ui.availability.presentation?.primaryReason.presence).toBe('absent');
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
    expect(ui.technicalDetail?.connectivityProviderLinkState.presence).toBe('present');
    expect(ui.technicalDetail?.connectivityProviderLinkState.presentation).toBe('ACTIVE');
    expect(ui.technicalDetail?.operationalAvailability.presence).toBe('present');
    expect(ui.technicalDetail?.operationalAvailability.presentation).toBe('AVAILABLE');
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

function partialAvailabilityRow() {
  return fleetRow({
    operationalAvailability: {
      state: 'AVAILABLE',
      generatedAt: '2026-08-26T12:00:00.000Z',
    } as FleetMapVehicleResponse['operationalAvailability'],
  });
}

describe('P1.2 availability/health provenance (cross-slice)', () => {
  it('1 — availability present + primaryReason absent does not fabricate null reason semantics', () => {
    const ui = mapUi(partialAvailabilityRow());
    expect(ui.availability.presentation?.primaryReason.presence).toBe('absent');
    expect(ui.availability.presentation?.primaryReason.presentation).toBeUndefined();
  });

  it('2 — availability present + reasonCodes absent does not fabricate []', () => {
    const ui = mapUi(partialAvailabilityRow());
    expect(ui.availability.presentation?.reasonCodes.presence).toBe('absent');
    expect(ui.availability.presentation?.reasonCodes.presentation).toBeUndefined();
  });

  it('3 — availability present + recommendedAction absent does not fabricate NONE', () => {
    const ui = mapUi(partialAvailabilityRow());
    expect(ui.availability.presentation?.recommendedAction.presence).toBe('absent');
    expect(ui.availability.presentation?.recommendedAction.presentation).toBeUndefined();
  });

  it('4 — availability present + attention absent does not fabricate NONE', () => {
    const ui = mapUi(partialAvailabilityRow());
    expect(ui.availability.presentation?.attention.presence).toBe('absent');
    expect(ui.availability.presentation?.attention.presentation).toBeUndefined();
  });

  it('5 — explicit primaryReason=null distinguishable from absent', () => {
    const absentUi = mapUi(partialAvailabilityRow());
    const nullUi = mapUi(
      fleetRow({
        operationalAvailability: availability('AVAILABLE', { primaryReason: null }),
      }),
    );
    expect(absentUi.availability.presentation?.primaryReason.presence).toBe('absent');
    expect(nullUi.availability.presentation?.primaryReason.presence).toBe('present');
    expect(nullUi.availability.presentation?.primaryReason.presentation?.resolution).toBe('explicit_null');
  });

  it('6 — explicit reasonCodes=[] distinguishable from absent', () => {
    const absentUi = mapUi(partialAvailabilityRow());
    const emptyUi = mapUi(
      fleetRow({
        operationalAvailability: availability('AVAILABLE', { reasonCodes: [] }),
      }),
    );
    expect(absentUi.availability.presentation?.reasonCodes.presence).toBe('absent');
    expect(emptyUi.availability.presentation?.reasonCodes.presence).toBe('present');
    expect(emptyUi.availability.presentation?.reasonCodes.presentation?.items).toEqual([]);
  });

  it('7 — explicit recommendedAction=NONE distinguishable from absent', () => {
    const absentUi = mapUi(partialAvailabilityRow());
    const noneUi = mapUi(
      fleetRow({
        operationalAvailability: availability('AVAILABLE', { recommendedAction: 'NONE' }),
      }),
    );
    expect(absentUi.availability.presentation?.recommendedAction.presence).toBe('absent');
    expect(noneUi.availability.presentation?.recommendedAction.presence).toBe('present');
    expect(noneUi.availability.presentation?.recommendedAction.presentation?.action).toBe('NONE');
  });

  it('8 — explicit attention=NONE distinguishable from absent', () => {
    const absentUi = mapUi(partialAvailabilityRow());
    const noneUi = mapUi(
      fleetRow({
        operationalAvailability: availability('AVAILABLE', { attention: 'NONE' }),
      }),
    );
    expect(absentUi.availability.presentation?.attention.presence).toBe('absent');
    expect(noneUi.availability.presentation?.attention.presence).toBe('present');
    expect(noneUi.availability.presentation?.attention.presentation?.state).toBe('NONE');
  });

  it('9 — health evaluability present + condition absent does not fabricate unknown', () => {
    const ui = mapUi(
      fleetRow({
        healthEvaluation: {
          evaluability: 'EVALUABLE',
          generatedAt: '2026-08-26T12:00:00.000Z',
          source: 'p0.2_projection',
        } as FleetMapVehicleResponse['healthEvaluation'],
      }),
    );
    expect(ui.health.presentation?.condition.presence).toBe('absent');
    expect(ui.health.presentation?.condition.presentation).toBeUndefined();
  });

  it('10 — explicit health condition=unknown distinguishable from absent', () => {
    const absentUi = mapUi(
      fleetRow({
        healthEvaluation: {
          evaluability: 'EVALUABLE',
          generatedAt: '2026-08-26T12:00:00.000Z',
          source: 'p0.2_projection',
        } as FleetMapVehicleResponse['healthEvaluation'],
      }),
    );
    const unknownUi = mapUi(
      fleetRow({
        healthEvaluation: health('EVALUABLE', { condition: 'unknown' }),
      }),
    );
    expect(absentUi.health.presentation?.condition.presence).toBe('absent');
    expect(unknownUi.health.presentation?.condition.presence).toBe('present');
    expect(unknownUi.health.presentation?.condition.presentation?.state).toBe('unknown');
  });

  it('11 — health evaluability present + pipelineAvailability absent does not fabricate null', () => {
    const ui = mapUi(
      fleetRow({
        healthEvaluation: {
          evaluability: 'EVALUABLE',
          condition: 'good',
          generatedAt: '2026-08-26T12:00:00.000Z',
          source: 'p0.2_projection',
        } as FleetMapVehicleResponse['healthEvaluation'],
      }),
    );
    expect(ui.health.presentation?.pipelineAvailability.presence).toBe('absent');
    expect(ui.health.presentation?.pipelineAvailability.presentation).toBeUndefined();
  });

  it('12 — explicit pipelineAvailability=null distinguishable from absent', () => {
    const absentUi = mapUi(
      fleetRow({
        healthEvaluation: {
          evaluability: 'EVALUABLE',
          condition: 'good',
          generatedAt: '2026-08-26T12:00:00.000Z',
          source: 'p0.2_projection',
        } as FleetMapVehicleResponse['healthEvaluation'],
      }),
    );
    const nullUi = mapUi(
      fleetRow({
        healthEvaluation: health('EVALUABLE', {
          condition: 'good',
          pipelineAvailability: null,
        }),
      }),
    );
    expect(absentUi.health.presentation?.pipelineAvailability.presence).toBe('absent');
    expect(nullUi.health.presentation?.pipelineAvailability.presence).toBe('present');
    expect(nullUi.health.presentation?.pipelineAvailability.presentation?.value).toBeNull();
  });

  it('dumb consumer — ui.availability only cannot infer NONE from absent recommendedAction', () => {
    const ui = mapUi(partialAvailabilityRow());
    const avail = ui.availability.presentation;
    expect(avail).toBeDefined();
    const action = avail!.recommendedAction;
    expect(action.presence).toBe('absent');
    // Future consumer guard: never treat absent as NONE
    const wouldMisinterpretAsNone =
      action.presence === 'present' && action.presentation?.action === 'NONE';
    expect(wouldMisinterpretAsNone).toBe(false);
  });

  it('dumb consumer — ui.health only cannot infer unknown condition from absent', () => {
    const ui = mapUi(
      fleetRow({
        healthEvaluation: {
          evaluability: 'PARTIALLY_EVALUABLE',
          generatedAt: '2026-08-26T12:00:00.000Z',
          source: 'p0.2_projection',
        } as FleetMapVehicleResponse['healthEvaluation'],
      }),
    );
    const healthView = ui.health.presentation;
    expect(healthView).toBeDefined();
    expect(healthView!.condition.presence).toBe('absent');
    const wouldMisinterpretAsUnknown =
      healthView!.condition.presence === 'present' &&
      healthView!.condition.presentation?.state === 'unknown';
    expect(wouldMisinterpretAsUnknown).toBe(false);
  });
});

function mapMasterUi(
  row: Partial<FleetMapVehicleResponse> & { id?: string },
) {
  return mapUi(row, 'master_admin');
}

describe('P1.2 technical detail provenance (master_admin)', () => {
  it('1 — primaryReason absent -> technical field absent', () => {
    const ui = mapMasterUi(partialAvailabilityRow());
    expect(ui.technicalDetail?.primaryReason.presence).toBe('absent');
    expect(ui.technicalDetail?.primaryReason.presentation).toBeUndefined();
  });

  it('2 — primaryReason explicit null -> present + null', () => {
    const ui = mapMasterUi(
      fleetRow({
        operationalAvailability: availability('AVAILABLE', { primaryReason: null }),
      }),
    );
    expect(ui.technicalDetail?.primaryReason.presence).toBe('present');
    expect(ui.technicalDetail?.primaryReason.presentation).toBeNull();
  });

  it('3 — reasonCodes absent -> absent', () => {
    const ui = mapMasterUi(partialAvailabilityRow());
    expect(ui.technicalDetail?.reasonCodes.presence).toBe('absent');
    expect(ui.technicalDetail?.reasonCodes.presentation).toBeUndefined();
  });

  it('4 — reasonCodes explicit [] -> present + []', () => {
    const ui = mapMasterUi(
      fleetRow({
        operationalAvailability: availability('AVAILABLE', { reasonCodes: [] }),
      }),
    );
    expect(ui.technicalDetail?.reasonCodes.presence).toBe('present');
    expect(ui.technicalDetail?.reasonCodes.presentation).toEqual([]);
  });

  it('5 — recommendedAction absent -> absent', () => {
    const ui = mapMasterUi(partialAvailabilityRow());
    expect(ui.technicalDetail?.recommendedAction.presence).toBe('absent');
    expect(ui.technicalDetail?.recommendedAction.presentation).toBeUndefined();
  });

  it('6 — recommendedAction NONE -> present + NONE', () => {
    const ui = mapMasterUi(
      fleetRow({
        operationalAvailability: availability('AVAILABLE', { recommendedAction: 'NONE' }),
      }),
    );
    expect(ui.technicalDetail?.recommendedAction.presence).toBe('present');
    expect(ui.technicalDetail?.recommendedAction.presentation).toBe('NONE');
  });

  it('7 — healthCondition absent -> absent', () => {
    const ui = mapMasterUi(
      fleetRow({
        healthEvaluation: {
          evaluability: 'EVALUABLE',
          generatedAt: '2026-08-26T12:00:00.000Z',
          source: 'p0.2_projection',
        } as FleetMapVehicleResponse['healthEvaluation'],
      }),
    );
    expect(ui.technicalDetail?.healthCondition.presence).toBe('absent');
    expect(ui.technicalDetail?.healthCondition.presentation).toBeUndefined();
  });

  it('8 — healthCondition unknown -> present', () => {
    const ui = mapMasterUi(
      fleetRow({
        healthEvaluation: health('EVALUABLE', { condition: 'unknown' }),
      }),
    );
    expect(ui.technicalDetail?.healthCondition.presence).toBe('present');
    expect(ui.technicalDetail?.healthCondition.presentation).toBe('unknown');
  });

  it('9 — operationalAvailability absent -> absent', () => {
    const ui = mapMasterUi(fleetRow({}));
    expect(ui.technicalDetail?.operationalAvailability.presence).toBe('absent');
    expect(ui.technicalDetail?.operationalAvailability.presentation).toBeUndefined();
  });

  it('10 — operationalAvailability UNKNOWN -> present + UNKNOWN', () => {
    const ui = mapMasterUi(
      fleetRow({
        operationalAvailability: availability('UNKNOWN'),
      }),
    );
    expect(ui.technicalDetail?.operationalAvailability.presence).toBe('present');
    expect(ui.technicalDetail?.operationalAvailability.presentation).toBe('UNKNOWN');
  });

  it('11 — connectivity overallState absent -> absent', () => {
    const ui = mapMasterUi(fleetRow({}));
    expect(ui.technicalDetail?.connectivityOverallState.presence).toBe('absent');
    expect(ui.technicalDetail?.connectivityOverallState.presentation).toBeUndefined();
  });

  it('12 — connectivity overallState UNKNOWN -> present + UNKNOWN', () => {
    const ui = mapMasterUi(
      fleetRow({
        connectivityRuntime: runtime({ overallState: 'UNKNOWN' }),
      }),
    );
    expect(ui.technicalDetail?.connectivityOverallState.presence).toBe('present');
    expect(ui.technicalDetail?.connectivityOverallState.presentation).toBe('UNKNOWN');
  });

  it('org_admin receives no technicalDetail', () => {
    const ui = mapUi(
      fleetRow({
        connectivityRuntime: runtime(),
        operationalAvailability: availability('AVAILABLE'),
      }),
      'org_admin',
    );
    expect(ui.technicalDetail).toBeUndefined();
  });

  it('worker receives no technicalDetail', () => {
    const ui = mapUi(
      fleetRow({
        connectivityRuntime: runtime(),
        operationalAvailability: availability('AVAILABLE'),
      }),
      'worker',
    );
    expect(ui.technicalDetail).toBeUndefined();
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
