import type { CanonicalField, CanonicalVehicleOperationalView } from '../types';
import type { TechnicalDetailProjection, UiPresentationSlice } from './types';

function absentSlice<T>(): UiPresentationSlice<T> {
  return { presence: 'absent' };
}

function presentSlice<T>(presentation: T): UiPresentationSlice<T> {
  return { presence: 'present', presentation };
}

/** Maps a canonical field to a technical-detail slice without absent→null/[] coercion. */
export function mapCanonicalFieldToTechnicalSlice<T>(
  field: CanonicalField<T>,
): UiPresentationSlice<T> {
  if (field.presence !== 'present') return absentSlice();
  return presentSlice(field.value as T);
}

export function mapTechnicalDetail(
  canonical: CanonicalVehicleOperationalView,
): TechnicalDetailProjection {
  return {
    businessState: mapCanonicalFieldToTechnicalSlice(canonical.business.businessState),
    connectivityOverallState: mapCanonicalFieldToTechnicalSlice(canonical.connectivity.overallState),
    connectivityProviderLinkState: mapCanonicalFieldToTechnicalSlice(
      canonical.connectivity.providerLinkState,
    ),
    connectivityTelemetryState: mapCanonicalFieldToTechnicalSlice(
      canonical.connectivity.telemetryState,
    ),
    operationalAvailability: mapCanonicalFieldToTechnicalSlice(
      canonical.business.operationalAvailability,
    ),
    healthEvaluability: mapCanonicalFieldToTechnicalSlice(canonical.health.evaluability),
    healthCondition: mapCanonicalFieldToTechnicalSlice(canonical.health.condition),
    attention: mapCanonicalFieldToTechnicalSlice(canonical.operator.attention),
    primaryReason: mapCanonicalFieldToTechnicalSlice(canonical.operator.primaryReason),
    recommendedAction: mapCanonicalFieldToTechnicalSlice(canonical.operator.recommendedAction),
    reasonCodes: mapCanonicalFieldToTechnicalSlice(canonical.operator.reasonCodes),
  };
}
