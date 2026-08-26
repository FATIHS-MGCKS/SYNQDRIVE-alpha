import type { CanonicalVehicleOperationalView } from '../types';
import { readCanonicalField } from '../map-fleet-map-to-canonical';
import {
  mapAttentionUiPresentation,
  mapAvailabilityUiPresentation,
  mapConnectivityUiPresentation,
  mapOperatorUiPresentation,
} from './map-availability-ui-presentation';
import { mapHealthUiPresentation } from './map-health-ui-presentation';
import type {
  MapVehicleOperationalUiProjectionOptions,
  TechnicalDetailProjection,
  UiPresentationSlice,
  VehicleOperationalUiProjection,
} from './types';

function absentSlice<T>(): UiPresentationSlice<T> {
  return { presence: 'absent' };
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
    availability: mapAvailabilityUiPresentation(canonical, connectivityOptions),
    health: mapHealthUiPresentation(canonical, { t: options.t }),
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
