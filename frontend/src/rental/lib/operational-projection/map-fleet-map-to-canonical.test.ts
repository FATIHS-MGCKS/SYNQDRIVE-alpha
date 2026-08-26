import { describe, expect, it } from 'vitest';
import type {
  FleetConnectivityDetail,
  FleetMapVehicleResponse,
  VehicleConnectivityRuntimeState,
} from '../../../lib/api';
import {
  mapFleetMapToCanonicalVehicleOperationalView,
  readCanonicalField,
} from './map-fleet-map-to-canonical';
import { isFieldPresent } from './provenance';

const ORG_ID = 'org-p1-1';
const VEHICLE_ID = 'veh-p1-1';
const GENERATED_AT = '2026-08-26T12:00:00.000Z';

const BASE_FLEET_MAP_ROW: FleetMapVehicleResponse = {
  id: VEHICLE_ID,
  licensePlate: 'KS FH 660E',
  displayName: 'Test Vehicle',
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
  lastSeenAt: '2026-08-26T11:00:00.000Z',
  signalAgeMs: 60_000,
  isFresh: true,
  onlineStatus: 'OFFLINE',
  telemetryFreshness: 'offline',
  displayState: 'PARKED',
  displayIgnition: 'OFF',
  isLiveTracking: false,
  heading: null,
  imageUrl: null,
  odometerKm: 10_000,
  fuelPercent: 80,
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
};

function runtime(
  overrides: Partial<VehicleConnectivityRuntimeState> = {},
): VehicleConnectivityRuntimeState {
  return {
    vehicleId: VEHICLE_ID,
    organizationId: ORG_ID,
    overallState: 'TELEMETRY_ACTIVE',
    providerLinkState: 'ACTIVE',
    telemetryState: 'live',
    physicalDeviceState: 'PLUGGED_CONFIRMED',
    dataCoverageState: 'GOOD',
    attentionState: 'NONE',
    reasonCodes: [],
    recommendedAction: 'NONE',
    requiresAction: false,
    lastTelemetryAt: '2026-08-26T11:55:00.000Z',
    lastProviderObservedAt: null,
    lastReceivedAt: null,
    deviceBindingId: null,
    activeEpisodeId: null,
    evidence: {},
    calculatedAt: GENERATED_AT,
    stateVersion: 1,
    ...overrides,
  };
}

function availability(
  state: 'AVAILABLE' | 'NEEDS_VERIFICATION' | 'UNAVAILABLE' | 'UNKNOWN',
  overrides: Partial<NonNullable<FleetMapVehicleResponse['operationalAvailability']>> = {},
): NonNullable<FleetMapVehicleResponse['operationalAvailability']> {
  return {
    state,
    primaryReason: null,
    reasonCodes: [],
    recommendedAction: 'NONE',
    attention: 'NONE',
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

function healthEvaluation(
  evaluability: 'EVALUABLE' | 'PARTIALLY_EVALUABLE' | 'NOT_EVALUABLE' | 'UNKNOWN',
  overrides: Partial<NonNullable<FleetMapVehicleResponse['healthEvaluation']>> = {},
): NonNullable<FleetMapVehicleResponse['healthEvaluation']> {
  return {
    condition: 'good',
    evaluability,
    pipelineAvailability: 'ready',
    generatedAt: GENERATED_AT,
    healthEvidenceAt: GENERATED_AT,
    anyModuleDataStale: false,
    source: 'p0.2_projection',
    ...overrides,
  };
}

function fleetMapRow(
  overrides: Partial<FleetMapVehicleResponse> = {},
): FleetMapVehicleResponse {
  return { ...BASE_FLEET_MAP_ROW, ...overrides };
}

function fleetConnectivityDetail(
  overrides: Partial<FleetConnectivityDetail> = {},
): FleetConnectivityDetail {
  return {
    vehicle: {
      vehicleId: VEHICLE_ID,
      licensePlate: 'KS FH 660E',
      make: 'VW',
      model: 'Golf',
      year: 2024,
      station: 'Berlin',
    },
    overallState: 'AUTHORIZATION_REQUIRED',
    telemetryState: 'offline',
    attentionState: 'ACTION_REQUIRED',
    lastTelemetryAt: null,
    primaryReasonCode: 'AUTHORIZATION_EXPIRED',
    recommendedAction: 'REAUTHORIZE_PROVIDER',
    requiresAction: true,
    sortPriority: 1,
    providerLinkState: 'REAUTH_REQUIRED',
    physicalDeviceState: 'PLUGGED_CONFIRMED',
    dataCoverageState: 'PARTIAL',
    reasonCodes: ['AUTHORIZATION_EXPIRED'],
    activeEpisode: null,
    timeline: [],
    provider: {
      providerLabel: 'DIMO',
      deviceKind: 'OBD',
      authorizationState: 'REAUTH_REQUIRED',
      consentGranted: false,
      triggerConfigured: true,
      lastSuccessfulFetchAt: null,
    },
    capabilities: {
      coverageState: 'PARTIAL',
      coveragePercent: 50,
      freshSignalCount: 1,
      expectedSignalCount: 2,
      signals: [],
    },
    timestamps: {
      lastTelemetryAt: null,
      lastProviderObservedAt: null,
      lastReceivedAt: null,
      calculatedAt: GENERATED_AT,
      reconnectedSince: null,
      recoveryReceivedAt: null,
    },
    webhook: {
      configured: true,
      lastEventAt: null,
      openEpisode: false,
    },
    odometerKm: null,
    hasLocation: false,
    ...overrides,
  };
}

describe('mapFleetMapToCanonicalVehicleOperationalView (P1.1)', () => {
  it('1 — ACTIVE + live + AVAILABLE', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime(),
        operationalAvailability: availability('AVAILABLE'),
      }),
    );

    expect(readCanonicalField(view.connectivity.providerLinkState)).toBe('ACTIVE');
    expect(readCanonicalField(view.connectivity.telemetryState)).toBe('live');
    expect(readCanonicalField(view.business.operationalAvailability)).toBe('AVAILABLE');
    expect(view.connectivity.providerLinkState.source).toBe('fleet_map.connectivityRuntime');
    expect(view.business.operationalAvailability.source).toBe('fleet_map.operationalAvailability');
  });

  it('2 — ACTIVE + standby + AVAILABLE', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime({
          overallState: 'STANDBY',
          telemetryState: 'standby',
        }),
        operationalAvailability: availability('AVAILABLE'),
      }),
    );

    expect(readCanonicalField(view.connectivity.overallState)).toBe('STANDBY');
    expect(readCanonicalField(view.connectivity.telemetryState)).toBe('standby');
    expect(readCanonicalField(view.business.operationalAvailability)).toBe('AVAILABLE');
  });

  it('3a — ACTIVE + offline + NEEDS_VERIFICATION as supplied by backend', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime({
          overallState: 'OFFLINE',
          telemetryState: 'offline',
          reasonCodes: ['TELEMETRY_OFFLINE'],
          recommendedAction: 'WAIT_FOR_TELEMETRY',
        }),
        operationalAvailability: availability('NEEDS_VERIFICATION', {
          primaryReason: 'CONNECTIVITY_VERIFICATION_REQUIRED',
          reasonCodes: ['CONNECTIVITY_VERIFICATION_REQUIRED', 'TELEMETRY_OFFLINE'],
          recommendedAction: 'REVIEW_CONNECTIVITY',
          attention: 'WATCH',
        }),
      }),
    );

    expect(readCanonicalField(view.business.operationalAvailability)).toBe('NEEDS_VERIFICATION');
    expect(readCanonicalField(view.operator.primaryReason)).toBe('CONNECTIVITY_VERIFICATION_REQUIRED');
    expect(readCanonicalField(view.connectivity.telemetryState)).toBe('offline');
  });

  it('3b — ACTIVE + offline + UNAVAILABLE as supplied by backend', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime({
          overallState: 'OFFLINE',
          telemetryState: 'offline',
        }),
        operationalAvailability: availability('UNAVAILABLE', {
          primaryReason: 'BUSINESS_WORKFLOW_BLOCKED',
          reasonCodes: ['BUSINESS_WORKFLOW_BLOCKED'],
          recommendedAction: 'NONE',
          attention: 'CRITICAL',
        }),
      }),
    );

    expect(readCanonicalField(view.business.operationalAvailability)).toBe('UNAVAILABLE');
    expect(readCanonicalField(view.operator.attention)).toBe('CRITICAL');
  });

  it('4 — REAUTH_REQUIRED', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime({
          overallState: 'AUTHORIZATION_REQUIRED',
          providerLinkState: 'REAUTH_REQUIRED',
          recommendedAction: 'REAUTHORIZE_PROVIDER',
          reasonCodes: ['PROVIDER_REAUTH_REQUIRED'],
          attentionState: 'ACTION_REQUIRED',
        }),
        operationalAvailability: availability('NEEDS_VERIFICATION', {
          primaryReason: 'CONNECTIVITY_VERIFICATION_REQUIRED',
          recommendedAction: 'REAUTHORIZE_PROVIDER',
        }),
      }),
    );

    expect(readCanonicalField(view.connectivity.providerLinkState)).toBe('REAUTH_REQUIRED');
    expect(readCanonicalField(view.connectivity.recommendedAction)).toBe('REAUTHORIZE_PROVIDER');
  });

  it('5 — REVOKED', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime({
          overallState: 'AUTHORIZATION_REQUIRED',
          providerLinkState: 'REVOKED',
          recommendedAction: 'REAUTHORIZE_PROVIDER',
          reasonCodes: ['PROVIDER_CONSENT_REVOKED'],
        }),
        operationalAvailability: availability('UNAVAILABLE'),
      }),
    );

    expect(readCanonicalField(view.connectivity.providerLinkState)).toBe('REVOKED');
    expect(readCanonicalField(view.connectivity.reasonCodes)).toEqual(['PROVIDER_CONSENT_REVOKED']);
  });

  it('6 — DEVICE_UNPLUGGED', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime({
          overallState: 'DEVICE_UNPLUGGED',
          physicalDeviceState: 'UNPLUGGED_CONFIRMED',
          recommendedAction: 'CHECK_DEVICE',
          reasonCodes: ['DEVICE_UNPLUG_WEBHOOK'],
          attentionState: 'ACTION_REQUIRED',
        }),
        operationalAvailability: availability('UNAVAILABLE', {
          primaryReason: 'DEVICE_UNPLUG_WEBHOOK',
        }),
      }),
    );

    expect(readCanonicalField(view.connectivity.overallState)).toBe('DEVICE_UNPLUGGED');
    expect(readCanonicalField(view.connectivity.physicalDeviceState)).toBe('UNPLUGGED_CONFIRMED');
  });

  it('7 — AUTHORIZATION_REQUIRED', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime({
          overallState: 'AUTHORIZATION_REQUIRED',
          providerLinkState: 'NO_LINK',
          recommendedAction: 'CONNECT_DATA_SOURCE',
        }),
        operationalAvailability: availability('NEEDS_VERIFICATION'),
      }),
    );

    expect(readCanonicalField(view.connectivity.overallState)).toBe('AUTHORIZATION_REQUIRED');
    expect(readCanonicalField(view.connectivity.providerLinkState)).toBe('NO_LINK');
  });

  it('8 — NO_ACTIVE_DATA_SOURCE', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime({
          overallState: 'NO_ACTIVE_DATA_SOURCE',
          providerLinkState: 'NO_LINK',
          telemetryState: 'no_signal',
          recommendedAction: 'CONNECT_DATA_SOURCE',
        }),
        operationalAvailability: availability('UNAVAILABLE'),
      }),
    );

    expect(readCanonicalField(view.connectivity.overallState)).toBe('NO_ACTIVE_DATA_SOURCE');
    expect(readCanonicalField(view.connectivity.telemetryState)).toBe('no_signal');
  });

  it('9 — UNKNOWN connectivity overall state', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime({
          overallState: 'UNKNOWN',
          providerLinkState: 'UNKNOWN',
          telemetryState: 'no_signal',
          dataCoverageState: 'UNKNOWN',
        }),
        operationalAvailability: availability('UNKNOWN'),
      }),
    );

    expect(isFieldPresent(view.connectivity.overallState)).toBe(true);
    expect(readCanonicalField(view.connectivity.overallState)).toBe('UNKNOWN');
    expect(isFieldPresent(view.business.operationalAvailability)).toBe(true);
    expect(readCanonicalField(view.business.operationalAvailability)).toBe('UNKNOWN');
  });

  it('10 — EVALUABLE health', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime(),
        operationalAvailability: availability('AVAILABLE'),
        healthEvaluation: healthEvaluation('EVALUABLE', { condition: 'good' }),
      }),
    );

    expect(readCanonicalField(view.health.evaluability)).toBe('EVALUABLE');
    expect(readCanonicalField(view.health.condition)).toBe('good');
    expect(view.health.evaluability.source).toBe('fleet_map.healthEvaluation');
  });

  it('11 — PARTIALLY_EVALUABLE health (not collapsed to condition)', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime(),
        operationalAvailability: availability('AVAILABLE'),
        healthEvaluation: healthEvaluation('PARTIALLY_EVALUABLE', {
          condition: 'warning',
          pipelineAvailability: 'partial',
        }),
      }),
    );

    expect(readCanonicalField(view.health.evaluability)).toBe('PARTIALLY_EVALUABLE');
    expect(readCanonicalField(view.health.condition)).toBe('warning');
    expect(readCanonicalField(view.health.pipelineAvailability)).toBe('partial');
  });

  it('12 — NOT_EVALUABLE health', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime(),
        operationalAvailability: availability('AVAILABLE'),
        healthEvaluation: healthEvaluation('NOT_EVALUABLE', {
          condition: 'unknown',
          pipelineAvailability: 'unavailable',
        }),
      }),
    );

    expect(readCanonicalField(view.health.evaluability)).toBe('NOT_EVALUABLE');
    expect(readCanonicalField(view.health.condition)).toBe('unknown');
  });

  it('13 — missing optional connectivityRuntime (absent connectivity slice)', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        operationalAvailability: availability('AVAILABLE'),
        healthEvaluation: healthEvaluation('EVALUABLE'),
      }),
    );

    expect(view.connectivity.overallState.presence).toBe('absent');
    expect(view.connectivity.providerLinkState.presence).toBe('absent');
    expect(readCanonicalField(view.business.operationalAvailability)).toBe('AVAILABLE');
  });

  it('13b — fleet-connectivity detail whole-slice fallback when connectivityRuntime absent', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        operationalAvailability: availability('NEEDS_VERIFICATION'),
      }),
      { fleetConnectivityDetail: fleetConnectivityDetail() },
    );

    expect(readCanonicalField(view.connectivity.providerLinkState)).toBe('REAUTH_REQUIRED');
    expect(view.connectivity.providerLinkState.source).toBe('fleet_connectivity.detail');
    expect(readCanonicalField(view.connectivity.recommendedAction)).toBe('REAUTHORIZE_PROVIDER');
  });

  it('14 — missing healthEvaluation', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime(),
        operationalAvailability: availability('AVAILABLE'),
      }),
    );

    expect(view.health.evaluability.presence).toBe('absent');
    expect(view.health.condition.presence).toBe('absent');
    expect(view.health.pipelineAvailability.presence).toBe('absent');
  });

  it('15 — backend UNKNOWN vs field absent distinction', () => {
    const backendUnknown = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime({ overallState: 'UNKNOWN' }),
        operationalAvailability: availability('UNKNOWN'),
        healthEvaluation: healthEvaluation('UNKNOWN', { condition: 'unknown' }),
      }),
    );

    const fieldAbsent = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime(),
        operationalAvailability: availability('AVAILABLE'),
      }),
    );

    expect(backendUnknown.business.operationalAvailability.presence).toBe('present');
    expect(backendUnknown.business.operationalAvailability.value).toBe('UNKNOWN');
    expect(backendUnknown.health.evaluability.presence).toBe('present');
    expect(backendUnknown.health.evaluability.value).toBe('UNKNOWN');

    expect(fieldAbsent.health.evaluability.presence).toBe('absent');
    expect(fieldAbsent.health.evaluability.value).toBeUndefined();
    expect(fieldAbsent.business.businessState.presence).toBe('absent');
  });

  it('16 — reasonCodes and recommendedAction preservation', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime({
          reasonCodes: ['TELEMETRY_OFFLINE', 'DATA_COVERAGE_INSUFFICIENT'],
          recommendedAction: 'REVIEW_CONNECTIVITY',
        }),
        operationalAvailability: availability('NEEDS_VERIFICATION', {
          reasonCodes: ['CONNECTIVITY_VERIFICATION_REQUIRED', 'TELEMETRY_OFFLINE'],
          recommendedAction: 'REVIEW_CONNECTIVITY',
        }),
      }),
    );

    expect(readCanonicalField(view.connectivity.reasonCodes)).toEqual([
      'TELEMETRY_OFFLINE',
      'DATA_COVERAGE_INSUFFICIENT',
    ]);
    expect(readCanonicalField(view.connectivity.recommendedAction)).toBe('REVIEW_CONNECTIVITY');
    expect(readCanonicalField(view.operator.reasonCodes)).toEqual([
      'CONNECTIVITY_VERIFICATION_REQUIRED',
      'TELEMETRY_OFFLINE',
    ]);
    expect(readCanonicalField(view.operator.recommendedAction)).toBe('REVIEW_CONNECTIVITY');
  });

  it('17 — no timestamp-derived availability fallback', () => {
    const staleRow = fleetMapRow({
      lastSeenAt: '2020-01-01T00:00:00.000Z',
      signalAgeMs: 999_999_999,
      onlineStatus: 'OFFLINE',
      telemetryFreshness: 'offline',
      isFresh: false,
      connectivityRuntime: undefined,
      operationalAvailability: availability('AVAILABLE'),
    });

    const view = mapFleetMapToCanonicalVehicleOperationalView(staleRow);

    expect(readCanonicalField(view.business.operationalAvailability)).toBe('AVAILABLE');
    expect(view.connectivity.overallState.presence).toBe('absent');
    expect(view.connectivity.telemetryState.presence).toBe('absent');
  });

  it('does not convert NEEDS_VERIFICATION into AVAILABLE or UNAVAILABLE', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime({ telemetryState: 'offline', overallState: 'OFFLINE' }),
        operationalAvailability: availability('NEEDS_VERIFICATION'),
      }),
    );

    expect(readCanonicalField(view.business.operationalAvailability)).toBe('NEEDS_VERIFICATION');
  });

  it('businessState remains absent — not inferred from legacy fleet-map status', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        status: 'Out of Service',
        rawVehicleStatus: 'OUT_OF_SERVICE',
        connectivityRuntime: runtime(),
        operationalAvailability: availability('UNAVAILABLE'),
      }),
    );

    expect(view.business.businessState.presence).toBe('absent');
    expect(view.business.businessState.source).toBe('absent');
  });
});

describe('P1.1 contract hardening — absent vs UNKNOWN vs NONE', () => {
  it('preserves explicit backend NONE, null, and empty arrays when slice is present', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime({
          reasonCodes: [],
          recommendedAction: 'NONE',
          attentionState: 'NONE',
        }),
        operationalAvailability: {
          state: 'AVAILABLE',
          primaryReason: null,
          reasonCodes: [],
          recommendedAction: 'NONE',
          attention: 'NONE',
          generatedAt: GENERATED_AT,
        },
      }),
    );

    expect(view.connectivity.reasonCodes.presence).toBe('present');
    expect(readCanonicalField(view.connectivity.reasonCodes)).toEqual([]);
    expect(readCanonicalField(view.connectivity.recommendedAction)).toBe('NONE');
    expect(readCanonicalField(view.connectivity.attentionState)).toBe('NONE');
    expect(view.operator.primaryReason.presence).toBe('present');
    expect(readCanonicalField(view.operator.primaryReason)).toBeNull();
    expect(view.operator.reasonCodes.presence).toBe('present');
    expect(readCanonicalField(view.operator.reasonCodes)).toEqual([]);
    expect(readCanonicalField(view.operator.recommendedAction)).toBe('NONE');
    expect(readCanonicalField(view.operator.attention)).toBe('NONE');
  });

  it('marks omitted operator fields absent instead of coercing to NONE or []', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        operationalAvailability: {
          state: 'AVAILABLE',
          generatedAt: GENERATED_AT,
        } as FleetMapVehicleResponse['operationalAvailability'],
      }),
    );

    expect(view.operator.recommendedAction.presence).toBe('absent');
    expect(view.operator.attention.presence).toBe('absent');
    expect(view.operator.reasonCodes.presence).toBe('absent');
    expect(view.operator.primaryReason.presence).toBe('absent');
  });

  it('marks omitted connectivity reasonCodes absent instead of coercing to []', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: {
          ...runtime(),
          reasonCodes: undefined as unknown as string[],
        },
      }),
    );

    expect(view.connectivity.reasonCodes.presence).toBe('absent');
  });

  it('marks invalid pipelineAvailability absent instead of coercing to null', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        healthEvaluation: healthEvaluation('EVALUABLE', {
          pipelineAvailability: 'future_value' as 'ready',
        }),
      }),
    );

    expect(view.health.pipelineAvailability.presence).toBe('absent');
  });

  it('marks invalid operational availability state absent instead of coercing to UNKNOWN', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        operationalAvailability: {
          state: 'MAYBE_AVAILABLE' as 'AVAILABLE',
          primaryReason: null,
          reasonCodes: [],
          recommendedAction: 'NONE',
          attention: 'NONE',
          generatedAt: GENERATED_AT,
        },
      }),
    );

    expect(view.business.operationalAvailability.presence).toBe('absent');
  });

  it('marks invalid health evaluability absent instead of coercing to UNKNOWN', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        healthEvaluation: healthEvaluation('EVALUABLE', {
          evaluability: 'FUTURE_STATE' as 'EVALUABLE',
        }),
      }),
    );

    expect(view.health.evaluability.presence).toBe('absent');
  });

  it('marks invalid operator recommendedAction absent instead of coercing to NONE', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        operationalAvailability: availability('AVAILABLE', {
          recommendedAction: 'DO_NOTHING' as 'NONE',
        }),
      }),
    );

    expect(view.operator.recommendedAction.presence).toBe('absent');
  });

  it('runtime present + detail present => fleet-map connectivityRuntime wins entirely', () => {
    const view = mapFleetMapToCanonicalVehicleOperationalView(
      fleetMapRow({
        connectivityRuntime: runtime({
          providerLinkState: 'ACTIVE',
          recommendedAction: 'NONE',
          overallState: 'TELEMETRY_ACTIVE',
        }),
        operationalAvailability: availability('AVAILABLE'),
      }),
      {
        fleetConnectivityDetail: fleetConnectivityDetail({
          providerLinkState: 'REAUTH_REQUIRED',
          recommendedAction: 'REAUTHORIZE_PROVIDER',
          overallState: 'AUTHORIZATION_REQUIRED',
        }),
      },
    );

    expect(readCanonicalField(view.connectivity.providerLinkState)).toBe('ACTIVE');
    expect(readCanonicalField(view.connectivity.recommendedAction)).toBe('NONE');
    expect(readCanonicalField(view.connectivity.overallState)).toBe('TELEMETRY_ACTIVE');
    expect(view.connectivity.providerLinkState.source).toBe('fleet_map.connectivityRuntime');
  });
});
