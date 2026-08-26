import type { CanonicalVehicleOperationalView } from '../types';
import { readCanonicalField } from '../map-fleet-map-to-canonical';
import { mapFleetHealthPresentation } from '../../fleet-health-evaluation/presentation';
import type { FleetHealthEvaluation } from '../../fleet-health-evaluation/types';
import { mapOperationalAvailabilityPresentation } from '../../operational-availability/presentation';
import type { FleetOperationalAvailability } from '../../operational-availability/types';
import {
  mapAttentionUiPresentation,
  mapConnectivityUiPresentation,
  mapOperatorUiPresentation,
} from './map-connectivity-presentation';
import { mapPrimaryReasonPresentation } from './primary-reason-presentation';
import type {
  MapVehicleOperationalUiProjectionOptions,
  TechnicalDetailProjection,
  UiPresentationSlice,
  VehicleOperationalUiProjection,
} from './types';

function absentSlice<T>(): UiPresentationSlice<T> {
  return { presence: 'absent' };
}

function presentSlice<T>(presentation: T): UiPresentationSlice<T> {
  return { presence: 'present', presentation };
}

function mapAvailabilityPresentation(
  canonical: CanonicalVehicleOperationalView,
  options: MapVehicleOperationalUiProjectionOptions,
): UiPresentationSlice<ReturnType<typeof mapOperationalAvailabilityPresentation>> {
  const field = canonical.business.operationalAvailability;
  if (field.presence !== 'present' || field.value === undefined) {
    return absentSlice();
  }

  const availabilityDto: FleetOperationalAvailability = {
    state: field.value,
    primaryReason:
      canonical.operator.primaryReason.presence === 'present'
        ? (canonical.operator.primaryReason.value ?? null)
        : null,
    reasonCodes:
      canonical.operator.reasonCodes.presence === 'present'
        ? [...canonical.operator.reasonCodes.value!]
        : [],
    recommendedAction:
      canonical.operator.recommendedAction.presence === 'present'
        ? canonical.operator.recommendedAction.value!
        : 'NONE',
    attention:
      canonical.operator.attention.presence === 'present'
        ? canonical.operator.attention.value!
        : 'NONE',
    generatedAt: '',
  };

  const presentation = mapOperationalAvailabilityPresentation(availabilityDto, {
    t: options.t,
  });

  if (
    canonical.operator.primaryReason.presence === 'present' &&
    canonical.operator.primaryReason.value
  ) {
    const reasonPresentation = mapPrimaryReasonPresentation(
      canonical.operator.primaryReason.value,
      options,
    );
    if (reasonPresentation.label) {
      return presentSlice({
        ...presentation,
        reasonLabel: reasonPresentation.label,
      });
    }
  }

  return presentSlice(presentation);
}

function mapHealthPresentation(
  canonical: CanonicalVehicleOperationalView,
  options: MapVehicleOperationalUiProjectionOptions,
): UiPresentationSlice<ReturnType<typeof mapFleetHealthPresentation>> {
  const evaluabilityField = canonical.health.evaluability;
  if (evaluabilityField.presence !== 'present' || evaluabilityField.value === undefined) {
    return absentSlice();
  }

  const evaluation: FleetHealthEvaluation = {
    evaluability: evaluabilityField.value,
    condition:
      canonical.health.condition.presence === 'present'
        ? canonical.health.condition.value!
        : 'unknown',
    pipelineAvailability:
      canonical.health.pipelineAvailability.presence === 'present'
        ? canonical.health.pipelineAvailability.value!
        : null,
    generatedAt: '',
    healthEvidenceAt: null,
    anyModuleDataStale: null,
    source: 'p0.2_projection',
  };

  return presentSlice(mapFleetHealthPresentation(evaluation, { t: options.t }));
}

function mapTechnicalDetail(
  canonical: CanonicalVehicleOperationalView,
): TechnicalDetailProjection {
  return {
    businessState: readCanonicalField(canonical.business.businessState) ?? null,
    connectivityOverallState: readCanonicalField(canonical.connectivity.overallState) ?? null,
    connectivityProviderLinkState:
      readCanonicalField(canonical.connectivity.providerLinkState) ?? null,
    connectivityTelemetryState: readCanonicalField(canonical.connectivity.telemetryState) ?? null,
    operationalAvailability: readCanonicalField(canonical.business.operationalAvailability) ?? null,
    healthEvaluability: readCanonicalField(canonical.health.evaluability) ?? null,
    healthCondition: readCanonicalField(canonical.health.condition) ?? null,
    attention: readCanonicalField(canonical.operator.attention) ?? null,
    primaryReason: readCanonicalField(canonical.operator.primaryReason) ?? null,
    recommendedAction: readCanonicalField(canonical.operator.recommendedAction) ?? null,
    reasonCodes:
      canonical.operator.reasonCodes.presence === 'present'
        ? [...(canonical.operator.reasonCodes.value ?? [])]
        : [],
  };
}

/**
 * P1.2 — Canonical presentation facade over {@link CanonicalVehicleOperationalView}.
 *
 * Pure, deterministic, no timestamp derivation, no legacy onlineStatus.
 * Audience changes presentation only — never canonical state.
 */
export function mapVehicleOperationalUiProjection(
  canonical: CanonicalVehicleOperationalView,
  options: MapVehicleOperationalUiProjectionOptions,
): VehicleOperationalUiProjection {
  const { audience } = options;
  const includeTechnical = audience === 'master_admin';
  const connectivityOptions = { t: options.t, audience };

  return {
    vehicleId: canonical.vehicleId,
    audience,
    availability: mapAvailabilityPresentation(canonical, options),
    health: mapHealthPresentation(canonical, options),
    connectivity:
      audience === 'worker'
        ? mapWorkerConnectivityPresentation(canonical.connectivity, connectivityOptions)
        : mapConnectivityUiPresentation(canonical.connectivity, connectivityOptions),
    attention: mapAttentionUiPresentation(canonical, connectivityOptions),
    operator: mapOperatorUiPresentation(canonical.operator, connectivityOptions),
    technicalDetail: includeTechnical ? mapTechnicalDetail(canonical) : undefined,
  };
}

function mapWorkerConnectivityPresentation(
  connectivity: CanonicalVehicleOperationalView['connectivity'],
  options: Parameters<typeof mapConnectivityUiPresentation>[1],
): ReturnType<typeof mapConnectivityUiPresentation> {
  const full = mapConnectivityUiPresentation(connectivity, options);
  return {
    overallState: full.overallState,
    providerLinkState: absentSlice(),
    telemetryState: absentSlice(),
    physicalDeviceState: absentSlice(),
    dataCoverageState: absentSlice(),
    recommendedAction: full.recommendedAction,
    reasonCodes: absentSlice(),
  };
}
