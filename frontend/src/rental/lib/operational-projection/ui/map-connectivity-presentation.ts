import type { StatusTone } from '../../../../components/patterns';
import type { ConnectivityRecommendedAction } from '../../../../lib/api';
import {
  attentionTone,
  coverageStateLabel,
  coverageStateTone,
  overallStateLabel,
  overallStateTone,
  physicalDeviceLabel,
  providerLinkLabel,
  recommendedActionLabel,
  telemetryFreshnessTone,
} from '../../../components/fleet-connectivity/fleet-connectivity.presentation';
import type { CanonicalField, CanonicalVehicleOperationalView } from '../types';
import {
  mapPrimaryReasonPresentation,
  mapReasonCodeListPresentation,
  type OperationalTranslator,
} from './primary-reason-presentation';
import type {
  ConnectivityUiPresentation,
  EnumFieldPresentation,
  UiPresentationSlice,
  VehicleOperationalAudience,
} from './types';

function absentSlice<T>(): UiPresentationSlice<T> {
  return { presence: 'absent' };
}

function presentSlice<T>(presentation: T): UiPresentationSlice<T> {
  return { presence: 'present', presentation };
}

function mapEnumField<T extends string>(
  field: CanonicalField<T>,
  label: (state: T) => string,
  tone: (state: T) => StatusTone,
): UiPresentationSlice<EnumFieldPresentation<T>> {
  if (field.presence !== 'present' || field.value === undefined) return absentSlice();
  const state = field.value;
  return presentSlice({ state, label: label(state), tone: tone(state) });
}

function telemetryLabel(state: import('../../../../lib/api').FleetTelemetryFreshness, t: OperationalTranslator): string {
  const key = `fleetConnectivity.telemetryFreshness.${state}` as import('../../../i18n/translations/en').TranslationKey;
  const translated = t(key);
  if (translated !== key) return translated;
  return state;
}

export function mapConnectivityUiPresentation(
  connectivity: CanonicalVehicleOperationalView['connectivity'],
  options: { t: OperationalTranslator; audience: VehicleOperationalAudience },
): ConnectivityUiPresentation {
  const { t } = options;

  return {
    overallState: mapEnumField(
      connectivity.overallState,
      (state) => overallStateLabel(state, t),
      overallStateTone,
    ),
    providerLinkState: mapEnumField(
      connectivity.providerLinkState,
      (state) => providerLinkLabel(state, t),
      () => 'neutral',
    ),
    telemetryState: mapEnumField(
      connectivity.telemetryState,
      (state) => telemetryLabel(state, t),
      telemetryFreshnessTone,
    ),
    physicalDeviceState: mapEnumField(
      connectivity.physicalDeviceState,
      (state) => physicalDeviceLabel(state, t),
      () => 'neutral',
    ),
    dataCoverageState: mapEnumField(
      connectivity.dataCoverageState,
      (state) => coverageStateLabel(state, t),
      coverageStateTone,
    ),
    recommendedAction: mapRecommendedActionField(connectivity.recommendedAction, t),
    reasonCodes: mapReasonCodesField(connectivity.reasonCodes, options),
  };
}

function mapRecommendedActionField(
  field: CanonicalField<ConnectivityRecommendedAction>,
  t: OperationalTranslator,
): UiPresentationSlice<{ action: ConnectivityRecommendedAction; label: string }> {
  if (field.presence !== 'present' || field.value === undefined) return absentSlice();
  return presentSlice({
    action: field.value,
    label: recommendedActionLabel(field.value, t),
  });
}

function mapReasonCodesField(
  field: CanonicalField<readonly string[]>,
  options: { t: OperationalTranslator; audience: VehicleOperationalAudience },
): UiPresentationSlice<{ items: ReturnType<typeof mapReasonCodeListPresentation> }> {
  if (field.presence !== 'present' || field.value === undefined) return absentSlice();
  return presentSlice({
    items: mapReasonCodeListPresentation(field.value, options),
  });
}

export function mapAttentionUiPresentation(
  canonical: CanonicalVehicleOperationalView,
  options: { t: OperationalTranslator; audience: VehicleOperationalAudience },
): import('./types').AttentionUiPresentation {
  const connectivityAttention = canonical.connectivity.attentionState;
  const operatorAttention = canonical.operator.attention;

  const attentionField =
    operatorAttention.presence === 'present'
      ? operatorAttention
      : connectivityAttention;

  return {
    attention: mapEnumField(attentionField, (state) => {
      const key = `fleetConnectivity.attention.${state}` as import('../../../i18n/translations/en').TranslationKey;
      const translated = options.t(key);
      return translated !== key ? translated : state;
    }, attentionTone),
    primaryReason: mapPrimaryReasonSlice(canonical.operator.primaryReason, options),
    recommendedAction: mapRecommendedActionField(canonical.operator.recommendedAction, options.t),
    reasonCodes: mapReasonCodesField(canonical.operator.reasonCodes, options),
  };
}

function mapPrimaryReasonSlice(
  field: CanonicalField<string | null>,
  options: { t: OperationalTranslator; audience: VehicleOperationalAudience },
): UiPresentationSlice<ReturnType<typeof mapPrimaryReasonPresentation>> {
  if (field.presence !== 'present') return absentSlice();
  return presentSlice(mapPrimaryReasonPresentation(field.value ?? null, options));
}

export function mapOperatorUiPresentation(
  operator: CanonicalVehicleOperationalView['operator'],
  options: { t: OperationalTranslator; audience: VehicleOperationalAudience },
): import('./types').OperatorUiPresentation {
  return {
    primaryReason: mapPrimaryReasonSlice(operator.primaryReason, options),
    recommendedAction: mapRecommendedActionField(operator.recommendedAction, options.t),
    attention: mapEnumField(operator.attention, (state) => {
      const key = `fleetConnectivity.attention.${state}` as import('../../../i18n/translations/en').TranslationKey;
      const translated = options.t(key);
      return translated !== key ? translated : state;
    }, attentionTone),
    reasonCodes: mapReasonCodesField(operator.reasonCodes, options),
  };
}
