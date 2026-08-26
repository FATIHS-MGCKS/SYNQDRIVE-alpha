/**
 * P1.1 — Single normalization entry from fleet-map API rows to the canonical contract.
 *
 * Does not consult legacy onlineStatus, telemetry age heuristics, or client runtime builders.
 */
import type {
  ConnectivityAttentionState,
  ConnectivityRecommendedAction,
  FleetConnectivityDetail,
  FleetDataCoverageState,
  FleetMapVehicleResponse,
  FleetTelemetryFreshness,
  OverallConnectivityState,
  PhysicalDeviceState,
  ProviderLinkState,
  VehicleConnectivityRuntimeState,
} from '../../../lib/api';
import {
  normalizeFleetHealthConditionState,
  normalizeHealthEvaluabilityState,
} from '../fleet-health-evaluation/types';
import { normalizeOperationalAvailabilityState } from '../operational-availability/types';
import { absentField, presentField } from './provenance';
import type { CanonicalField, CanonicalVehicleOperationalView } from './types';

export interface MapCanonicalVehicleOperationalViewOptions {
  /** Optional fleet-connectivity detail enrichment when fleet-map runtime slice is partial. */
  fleetConnectivityDetail?: FleetConnectivityDetail;
}

function asConnectivityAttentionState(
  value: unknown,
): ConnectivityAttentionState | undefined {
  if (
    value === 'NONE' ||
    value === 'WATCH' ||
    value === 'ACTION_REQUIRED' ||
    value === 'CRITICAL'
  ) {
    return value;
  }
  return undefined;
}

function asConnectivityRecommendedAction(
  value: unknown,
): ConnectivityRecommendedAction | undefined {
  const actions: ConnectivityRecommendedAction[] = [
    'NONE',
    'CHECK_DEVICE',
    'REAUTHORIZE_PROVIDER',
    'CONNECT_DATA_SOURCE',
    'REVIEW_CONNECTIVITY',
    'WAIT_FOR_TELEMETRY',
    'CHECK_INTEGRATION',
  ];
  return actions.includes(value as ConnectivityRecommendedAction)
    ? (value as ConnectivityRecommendedAction)
    : undefined;
}

function asOverallConnectivityState(value: unknown): OverallConnectivityState | undefined {
  const states: OverallConnectivityState[] = [
    'TELEMETRY_ACTIVE',
    'STANDBY',
    'SOFT_OFFLINE',
    'OFFLINE',
    'DEVICE_UNPLUGGED',
    'AUTHORIZATION_REQUIRED',
    'NO_ACTIVE_DATA_SOURCE',
    'INTEGRATION_ERROR',
    'UNKNOWN',
  ];
  return states.includes(value as OverallConnectivityState)
    ? (value as OverallConnectivityState)
    : undefined;
}

function asProviderLinkState(value: unknown): ProviderLinkState | undefined {
  const states: ProviderLinkState[] = [
    'ACTIVE',
    'REAUTH_REQUIRED',
    'REVOKED',
    'NO_LINK',
    'ERROR',
    'UNKNOWN',
  ];
  return states.includes(value as ProviderLinkState) ? (value as ProviderLinkState) : undefined;
}

function asTelemetryState(value: unknown): FleetTelemetryFreshness | undefined {
  if (
    value === 'live' ||
    value === 'standby' ||
    value === 'signal_delayed' ||
    value === 'offline' ||
    value === 'no_signal'
  ) {
    return value;
  }
  return undefined;
}

function asPhysicalDeviceState(value: unknown): PhysicalDeviceState | undefined {
  const states: PhysicalDeviceState[] = [
    'PLUGGED_CONFIRMED',
    'PLUGGED_INFERRED',
    'UNPLUGGED_CONFIRMED',
    'UNKNOWN',
    'NOT_APPLICABLE',
  ];
  return states.includes(value as PhysicalDeviceState)
    ? (value as PhysicalDeviceState)
    : undefined;
}

function asDataCoverageState(value: unknown): FleetDataCoverageState | undefined {
  const states: FleetDataCoverageState[] = [
    'GOOD',
    'PARTIAL',
    'INSUFFICIENT',
    'UNKNOWN',
    'NOT_APPLICABLE',
  ];
  return states.includes(value as FleetDataCoverageState)
    ? (value as FleetDataCoverageState)
    : undefined;
}

function mapConnectivityFromRuntime(
  runtime: VehicleConnectivityRuntimeState,
): CanonicalVehicleOperationalView['connectivity'] {
  return {
    overallState: presentField(runtime.overallState, 'fleet_map.connectivityRuntime'),
    providerLinkState: presentField(runtime.providerLinkState, 'fleet_map.connectivityRuntime'),
    telemetryState: presentField(runtime.telemetryState, 'fleet_map.connectivityRuntime'),
    physicalDeviceState: presentField(runtime.physicalDeviceState, 'fleet_map.connectivityRuntime'),
    dataCoverageState: presentField(runtime.dataCoverageState, 'fleet_map.connectivityRuntime'),
    attentionState: presentField(runtime.attentionState, 'fleet_map.connectivityRuntime'),
    reasonCodes: presentField(
      Array.isArray(runtime.reasonCodes) ? [...runtime.reasonCodes] : [],
      'fleet_map.connectivityRuntime',
    ),
    recommendedAction: presentField(runtime.recommendedAction, 'fleet_map.connectivityRuntime'),
  };
}

function mapConnectivityFromDetail(
  detail: FleetConnectivityDetail,
): CanonicalVehicleOperationalView['connectivity'] {
  const overallState = asOverallConnectivityState(detail.overallState);
  const telemetryState = asTelemetryState(detail.telemetryState);
  const attentionState = asConnectivityAttentionState(detail.attentionState);
  const providerLinkState = asProviderLinkState(detail.providerLinkState);
  const physicalDeviceState = asPhysicalDeviceState(detail.physicalDeviceState);
  const dataCoverageState = asDataCoverageState(detail.dataCoverageState);
  const recommendedAction = asConnectivityRecommendedAction(detail.recommendedAction);

  return {
    overallState: overallState
      ? presentField(overallState, 'fleet_connectivity.detail')
      : absentField(),
    providerLinkState: providerLinkState
      ? presentField(providerLinkState, 'fleet_connectivity.detail')
      : absentField(),
    telemetryState: telemetryState
      ? presentField(telemetryState, 'fleet_connectivity.detail')
      : absentField(),
    physicalDeviceState: physicalDeviceState
      ? presentField(physicalDeviceState, 'fleet_connectivity.detail')
      : absentField(),
    dataCoverageState: dataCoverageState
      ? presentField(dataCoverageState, 'fleet_connectivity.detail')
      : absentField(),
    attentionState: attentionState
      ? presentField(attentionState, 'fleet_connectivity.detail')
      : absentField(),
    reasonCodes: presentField(
      Array.isArray(detail.reasonCodes) ? [...detail.reasonCodes] : [],
      'fleet_connectivity.detail',
    ),
    recommendedAction: recommendedAction
      ? presentField(recommendedAction, 'fleet_connectivity.detail')
      : absentField(),
  };
}

function absentConnectivity(): CanonicalVehicleOperationalView['connectivity'] {
  return {
    overallState: absentField(),
    providerLinkState: absentField(),
    telemetryState: absentField(),
    physicalDeviceState: absentField(),
    dataCoverageState: absentField(),
    attentionState: absentField(),
    reasonCodes: absentField(),
    recommendedAction: absentField(),
  };
}

function mapOperationalAvailability(
  raw: FleetMapVehicleResponse['operationalAvailability'],
): CanonicalVehicleOperationalView['business']['operationalAvailability'] {
  if (raw === undefined) {
    return absentField();
  }
  return presentField(
    normalizeOperationalAvailabilityState(raw.state),
    'fleet_map.operationalAvailability',
  );
}

function mapOperatorSlice(
  raw: FleetMapVehicleResponse['operationalAvailability'],
): Pick<CanonicalVehicleOperationalView['operator'], 'primaryReason' | 'recommendedAction' | 'attention' | 'reasonCodes'> {
  if (raw === undefined) {
    return {
      primaryReason: absentField(),
      recommendedAction: absentField(),
      attention: absentField(),
      reasonCodes: absentField(),
    };
  }

  return {
    primaryReason: presentField(raw.primaryReason ?? null, 'fleet_map.operationalAvailability'),
    recommendedAction: presentField(raw.recommendedAction ?? 'NONE', 'fleet_map.operationalAvailability'),
    attention: presentField(raw.attention ?? 'NONE', 'fleet_map.operationalAvailability'),
    reasonCodes: presentField(
      Array.isArray(raw.reasonCodes) ? [...raw.reasonCodes] : [],
      'fleet_map.operationalAvailability',
    ),
  };
}

function mapHealthEvaluation(
  raw: FleetMapVehicleResponse['healthEvaluation'],
): CanonicalVehicleOperationalView['health'] {
  if (raw === undefined) {
    return {
      evaluability: absentField(),
      condition: absentField(),
      pipelineAvailability: absentField(),
    };
  }

  const pipelineAvailability =
    raw.pipelineAvailability === 'ready' ||
    raw.pipelineAvailability === 'partial' ||
    raw.pipelineAvailability === 'unavailable'
      ? raw.pipelineAvailability
      : raw.pipelineAvailability === null
        ? null
        : null;

  return {
    evaluability: presentField(
      normalizeHealthEvaluabilityState(raw.evaluability),
      'fleet_map.healthEvaluation',
    ),
    condition: presentField(
      normalizeFleetHealthConditionState(raw.condition),
      'fleet_map.healthEvaluation',
    ),
    pipelineAvailability: presentField(pipelineAvailability, 'fleet_map.healthEvaluation'),
  };
}

/**
 * Normalize a fleet-map vehicle row into {@link CanonicalVehicleOperationalView}.
 *
 * Legacy fleet-map fields (`onlineStatus`, `lastSeenAt`, `telemetryFreshness`, `status`)
 * are intentionally ignored — they must not influence this contract.
 */
export function mapFleetMapToCanonicalVehicleOperationalView(
  fleetMap: FleetMapVehicleResponse,
  options: MapCanonicalVehicleOperationalViewOptions = {},
): CanonicalVehicleOperationalView {
  const runtime = fleetMap.connectivityRuntime;
  const detail = options.fleetConnectivityDetail;

  let connectivity: CanonicalVehicleOperationalView['connectivity'];
  if (runtime) {
    connectivity = mapConnectivityFromRuntime(runtime);
  } else if (detail) {
    connectivity = mapConnectivityFromDetail(detail);
  } else {
    connectivity = absentConnectivity();
  }

  const operator = mapOperatorSlice(fleetMap.operationalAvailability);

  return {
    vehicleId: fleetMap.id,
    business: {
      // P0.2 businessState is not exposed on fleet-map — never inferred from legacy status.
      businessState: absentField(),
      operationalAvailability: mapOperationalAvailability(fleetMap.operationalAvailability),
    },
    connectivity,
    health: mapHealthEvaluation(fleetMap.healthEvaluation),
    operator,
  };
}

/** Convenience accessor for a canonical field's value when present. */
export function readCanonicalField<T>(field: CanonicalField<T>): T | undefined {
  return field.presence === 'present' ? field.value : undefined;
}
