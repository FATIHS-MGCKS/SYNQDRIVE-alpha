import type { CanonicalVehicleOperationalView } from '../types';
import { mapOperationalAvailabilityStatePresentation } from '../../operational-availability/presentation';
import {
  mapAttentionUiPresentation,
  mapConnectivityUiPresentation,
  mapOperatorUiPresentation,
} from './map-connectivity-presentation';
import {
  mapPrimaryReasonPresentation,
  mapReasonCodeListPresentation,
  type OperationalTranslator,
} from './primary-reason-presentation';
import { recommendedActionLabel } from '../../../components/fleet-connectivity/fleet-connectivity.presentation';
import type {
  AvailabilityUiPresentation,
  EnumFieldPresentation,
  UiPresentationSlice,
  VehicleOperationalAudience,
} from './types';
import { attentionTone } from '../../../components/fleet-connectivity/fleet-connectivity.presentation';
import type { ConnectivityAttentionState } from '../../../../lib/api';

function absentSlice<T>(): UiPresentationSlice<T> {
  return { presence: 'absent' };
}

function presentSlice<T>(presentation: T): UiPresentationSlice<T> {
  return { presence: 'present', presentation };
}

function mapPrimaryReasonSlice(
  field: CanonicalVehicleOperationalView['operator']['primaryReason'],
  options: { t: OperationalTranslator; audience: VehicleOperationalAudience },
): UiPresentationSlice<ReturnType<typeof mapPrimaryReasonPresentation>> {
  if (field.presence !== 'present') return absentSlice();
  return presentSlice(mapPrimaryReasonPresentation(field.value ?? null, options));
}

function mapReasonCodesSlice(
  field: CanonicalVehicleOperationalView['operator']['reasonCodes'],
  options: { t: OperationalTranslator; audience: VehicleOperationalAudience },
): UiPresentationSlice<{ items: ReturnType<typeof mapReasonCodeListPresentation> }> {
  if (field.presence !== 'present' || field.value === undefined) return absentSlice();
  return presentSlice({
    items: mapReasonCodeListPresentation(field.value, options),
  });
}

function mapRecommendedActionSlice(
  field: CanonicalVehicleOperationalView['operator']['recommendedAction'],
  t: OperationalTranslator,
): UiPresentationSlice<{ action: import('../../../../lib/api').ConnectivityRecommendedAction; label: string }> {
  if (field.presence !== 'present' || field.value === undefined) return absentSlice();
  return presentSlice({
    action: field.value,
    label: recommendedActionLabel(field.value, t),
  });
}

function mapAttentionSlice(
  field: CanonicalVehicleOperationalView['operator']['attention'],
  t: OperationalTranslator,
): UiPresentationSlice<EnumFieldPresentation<ConnectivityAttentionState>> {
  if (field.presence !== 'present' || field.value === undefined) return absentSlice();
  const state = field.value;
  const key = `fleetConnectivity.attention.${state}` as import('../../../i18n/translations/en').TranslationKey;
  const translated = t(key);
  return presentSlice({
    state,
    label: translated !== key ? translated : state,
    tone: attentionTone(state),
  });
}

export function mapAvailabilityUiPresentation(
  canonical: CanonicalVehicleOperationalView,
  options: { t: OperationalTranslator; audience: VehicleOperationalAudience },
): UiPresentationSlice<AvailabilityUiPresentation> {
  const availabilityField = canonical.business.operationalAvailability;
  if (availabilityField.presence !== 'present' || availabilityField.value === undefined) {
    return absentSlice();
  }

  const statePresentation = mapOperationalAvailabilityStatePresentation(
    availabilityField.value,
    { t: options.t },
  );

  const presentation: AvailabilityUiPresentation = {
    ...statePresentation,
    primaryReason: mapPrimaryReasonSlice(canonical.operator.primaryReason, options),
    reasonCodes: mapReasonCodesSlice(canonical.operator.reasonCodes, options),
    recommendedAction: mapRecommendedActionSlice(canonical.operator.recommendedAction, options.t),
    attention: mapAttentionSlice(canonical.operator.attention, options.t),
  };

  return presentSlice(presentation);
}

export { mapAttentionUiPresentation, mapConnectivityUiPresentation, mapOperatorUiPresentation };
