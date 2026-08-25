/**
 * Semantic fixtures for P0.2 contract tests — no production database IDs.
 */
import {
  AttentionState,
  ConnectivityReasonCode,
  ConnectivityRecommendedAction,
  DataCoverageState,
  OverallConnectivityState,
  PhysicalDeviceState,
  ProviderLinkState,
  type VehicleConnectivityRuntimeState,
} from '../../connectivity/domain/connectivity-domain.types';
import { BusinessOperationalState } from './vehicle-operational-projection.types';
import type { HealthConditionSnapshot } from './vehicle-operational-projection.types';

const GENERATED_AT = '2026-08-25T12:00:00.000Z';
const ORG_ID = 'org-fixture-1';

function baseConnectivity(
  overrides: Partial<VehicleConnectivityRuntimeState> = {},
): VehicleConnectivityRuntimeState {
  return {
    vehicleId: overrides.vehicleId ?? 'vehicle-fixture',
    organizationId: ORG_ID,
    providerLinkState: ProviderLinkState.ACTIVE,
    telemetryState: 'live',
    physicalDeviceState: PhysicalDeviceState.PLUGGED_INFERRED,
    dataCoverageState: DataCoverageState.GOOD,
    attentionState: AttentionState.NONE,
    overallState: OverallConnectivityState.TELEMETRY_ACTIVE,
    reasonCodes: [ConnectivityReasonCode.TELEMETRY_FRESH, ConnectivityReasonCode.LINK_ACTIVE],
    lastTelemetryAt: '2026-08-25T11:55:00.000Z',
    lastProviderObservedAt: '2026-08-25T11:55:00.000Z',
    lastReceivedAt: '2026-08-25T11:55:00.000Z',
    lastRecoveryEvidenceAt: null,
    lastRecoveryReceivedAt: null,
    lastRecoveryResolvedAt: null,
    deviceBindingId: 'binding-fixture',
    activeEpisodeId: null,
    requiresAction: false,
    recommendedAction: ConnectivityRecommendedAction.NONE,
    evidence: {},
    calculatedAt: GENERATED_AT,
    stateVersion: 1,
    ...overrides,
  };
}

/** HMÜ C 215 — historical unplug recovered; standby; PLUGGED_INFERRED. */
export function fixtureHmueC215(): {
  vehicleId: string;
  businessState: BusinessOperationalState;
  connectivity: VehicleConnectivityRuntimeState;
  health: HealthConditionSnapshot;
  episodeEvidenceReliable: boolean;
} {
  return {
    vehicleId: 'fixture-hmue-c-215',
    businessState: BusinessOperationalState.AVAILABLE,
    connectivity: baseConnectivity({
      vehicleId: 'fixture-hmue-c-215',
      telemetryState: 'standby',
      physicalDeviceState: PhysicalDeviceState.PLUGGED_INFERRED,
      overallState: OverallConnectivityState.STANDBY,
      attentionState: AttentionState.NONE,
      reasonCodes: [
        ConnectivityReasonCode.TELEMETRY_STANDBY,
        ConnectivityReasonCode.DEVICE_RECONNECTED_SNAPSHOT,
        ConnectivityReasonCode.LINK_ACTIVE,
      ],
      lastTelemetryAt: '2026-08-24T20:30:48.000Z',
      lastProviderObservedAt: '2026-08-24T20:30:48.000Z',
      lastReceivedAt: '2026-08-24T20:30:48.000Z',
      recommendedAction: ConnectivityRecommendedAction.NONE,
    }),
    health: {
      overallState: 'good',
      pipelineAvailability: 'ready',
      rentalBlocked: false,
      generatedAt: GENERATED_AT,
      anyModuleDataStale: false,
    },
    episodeEvidenceReliable: true,
  };
}

/** WOB L 7503 — recovered then >30d silence; obdIsPluggedIn=true at last snapshot. */
export function fixtureWobL7503(): {
  vehicleId: string;
  businessState: BusinessOperationalState;
  connectivity: VehicleConnectivityRuntimeState;
  health: HealthConditionSnapshot;
  episodeEvidenceReliable: boolean;
} {
  return {
    vehicleId: 'fixture-wob-l-7503',
    businessState: BusinessOperationalState.AVAILABLE,
    connectivity: baseConnectivity({
      vehicleId: 'fixture-wob-l-7503',
      telemetryState: 'offline',
      physicalDeviceState: PhysicalDeviceState.UNKNOWN,
      dataCoverageState: DataCoverageState.INSUFFICIENT,
      overallState: OverallConnectivityState.OFFLINE,
      attentionState: AttentionState.ACTION_REQUIRED,
      reasonCodes: [
        ConnectivityReasonCode.TELEMETRY_OFFLINE,
        ConnectivityReasonCode.DEVICE_CHECK_REQUIRED,
        ConnectivityReasonCode.DATA_COVERAGE_INSUFFICIENT,
      ],
      lastTelemetryAt: '2026-07-23T14:43:38.000Z',
      lastProviderObservedAt: '2026-07-23T14:43:38.000Z',
      lastReceivedAt: '2026-07-23T14:43:38.000Z',
      requiresAction: true,
      recommendedAction: ConnectivityRecommendedAction.CHECK_DEVICE,
    }),
    health: {
      overallState: 'unknown',
      pipelineAvailability: 'unavailable',
      rentalBlocked: null,
      generatedAt: null,
      anyModuleDataStale: true,
    },
    episodeEvidenceReliable: false,
  };
}

/** WOB L 9755 — communication recovery only; obdIsPluggedIn=false; >30d silence. */
export function fixtureWobL9755(): {
  vehicleId: string;
  businessState: BusinessOperationalState;
  connectivity: VehicleConnectivityRuntimeState;
  health: HealthConditionSnapshot;
  episodeEvidenceReliable: boolean;
} {
  return {
    vehicleId: 'fixture-wob-l-9755',
    businessState: BusinessOperationalState.AVAILABLE,
    connectivity: baseConnectivity({
      vehicleId: 'fixture-wob-l-9755',
      telemetryState: 'offline',
      physicalDeviceState: PhysicalDeviceState.UNKNOWN,
      dataCoverageState: DataCoverageState.INSUFFICIENT,
      overallState: OverallConnectivityState.OFFLINE,
      attentionState: AttentionState.ACTION_REQUIRED,
      reasonCodes: [
        ConnectivityReasonCode.TELEMETRY_OFFLINE,
        ConnectivityReasonCode.DEVICE_CHECK_REQUIRED,
        ConnectivityReasonCode.DATA_COVERAGE_INSUFFICIENT,
      ],
      lastTelemetryAt: '2026-07-18T13:42:28.000Z',
      lastProviderObservedAt: '2026-07-18T13:42:28.000Z',
      lastReceivedAt: '2026-07-18T13:42:28.000Z',
      requiresAction: true,
      recommendedAction: ConnectivityRecommendedAction.CHECK_DEVICE,
    }),
    health: {
      overallState: 'unknown',
      pipelineAvailability: 'unavailable',
      rentalBlocked: null,
      generatedAt: null,
      anyModuleDataStale: true,
    },
    episodeEvidenceReliable: false,
  };
}

export const FIXTURE_GENERATED_AT = GENERATED_AT;
export const FIXTURE_ORG_ID = ORG_ID;
export { baseConnectivity };
