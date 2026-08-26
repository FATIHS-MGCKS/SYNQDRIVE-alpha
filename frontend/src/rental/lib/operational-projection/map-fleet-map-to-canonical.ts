/**
 * P1.1 — Single normalization entry from fleet-map API rows to the canonical contract.
 *
 * Does not consult legacy onlineStatus, telemetry age heuristics, or client runtime builders.
 *
 * Connectivity precedence:
 * `fleet_map.connectivityRuntime` is an authoritative complete P0.1 snapshot on fleet-map.
 * `fleetConnectivityDetail` is a whole-slice fallback only when `connectivityRuntime` is
 * absent — it does not enrich individual fields of an existing runtime snapshot.
 */
import type {
  FleetConnectivityDetail,
  FleetMapVehicleResponse,
  VehicleConnectivityRuntimeState,
} from '../../../lib/api';
import {
  asConnectivityAttentionState,
  asConnectivityRecommendedAction,
  asDataCoverageState,
  asOverallConnectivityState,
  asPhysicalDeviceState,
  asProviderLinkState,
  asTelemetryState,
} from './connectivity-enums';
import {
  mapConnectivityAttentionField,
  mapConnectivityRecommendedActionField,
  mapHealthConditionField,
  mapHealthEvaluabilityField,
  mapNullableSliceField,
  mapOperationalAvailabilityStateField,
  mapPipelineAvailabilityField,
  mapSliceArrayField,
  mapSliceEnumField,
} from './field-semantics';
import { absentField, presentField } from './provenance';
import type { CanonicalField, CanonicalVehicleOperationalView } from './types';

export interface MapCanonicalVehicleOperationalViewOptions {
  /**
   * Whole-slice fallback when `fleetMap.connectivityRuntime` is absent.
   * Ignored when `connectivityRuntime` is present — no field-by-field mixing.
   */
  fleetConnectivityDetail?: FleetConnectivityDetail;
}

function mapConnectivityFromRuntime(
  runtime: VehicleConnectivityRuntimeState,
): CanonicalVehicleOperationalView['connectivity'] {
  const source = 'fleet_map.connectivityRuntime' as const;

  return {
    overallState: mapSliceEnumField(runtime.overallState, asOverallConnectivityState, source),
    providerLinkState: mapSliceEnumField(runtime.providerLinkState, asProviderLinkState, source),
    telemetryState: mapSliceEnumField(runtime.telemetryState, asTelemetryState, source),
    physicalDeviceState: mapSliceEnumField(
      runtime.physicalDeviceState,
      asPhysicalDeviceState,
      source,
    ),
    dataCoverageState: mapSliceEnumField(runtime.dataCoverageState, asDataCoverageState, source),
    attentionState: mapSliceEnumField(runtime.attentionState, asConnectivityAttentionState, source),
    reasonCodes: mapSliceArrayField<string>(runtime.reasonCodes, source),
    recommendedAction: mapConnectivityRecommendedActionField(runtime.recommendedAction, source),
  };
}

function mapConnectivityFromDetail(
  detail: FleetConnectivityDetail,
): CanonicalVehicleOperationalView['connectivity'] {
  const source = 'fleet_connectivity.detail' as const;

  return {
    overallState: mapSliceEnumField(detail.overallState, asOverallConnectivityState, source),
    providerLinkState: mapSliceEnumField(detail.providerLinkState, asProviderLinkState, source),
    telemetryState: mapSliceEnumField(detail.telemetryState, asTelemetryState, source),
    physicalDeviceState: mapSliceEnumField(
      detail.physicalDeviceState,
      asPhysicalDeviceState,
      source,
    ),
    dataCoverageState: mapSliceEnumField(detail.dataCoverageState, asDataCoverageState, source),
    attentionState: mapSliceEnumField(detail.attentionState, asConnectivityAttentionState, source),
    reasonCodes: mapSliceArrayField<string>(detail.reasonCodes, source),
    recommendedAction: mapConnectivityRecommendedActionField(detail.recommendedAction, source),
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
  if (raw === undefined) return absentField();
  return mapOperationalAvailabilityStateField(raw.state, 'fleet_map.operationalAvailability');
}

function mapOperatorSlice(
  raw: FleetMapVehicleResponse['operationalAvailability'],
): Pick<
  CanonicalVehicleOperationalView['operator'],
  'primaryReason' | 'recommendedAction' | 'attention' | 'reasonCodes'
> {
  if (raw === undefined) {
    return {
      primaryReason: absentField(),
      recommendedAction: absentField(),
      attention: absentField(),
      reasonCodes: absentField(),
    };
  }

  const source = 'fleet_map.operationalAvailability' as const;

  return {
    primaryReason: mapNullableSliceField(raw.primaryReason, source),
    recommendedAction: mapConnectivityRecommendedActionField(raw.recommendedAction, source),
    attention: mapConnectivityAttentionField(raw.attention, source),
    reasonCodes: mapSliceArrayField<string>(raw.reasonCodes, source),
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

  const source = 'fleet_map.healthEvaluation' as const;

  return {
    evaluability: mapHealthEvaluabilityField(raw.evaluability, source),
    condition: mapHealthConditionField(raw.condition, source),
    pipelineAvailability: mapPipelineAvailabilityField(raw.pipelineAvailability, source),
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
