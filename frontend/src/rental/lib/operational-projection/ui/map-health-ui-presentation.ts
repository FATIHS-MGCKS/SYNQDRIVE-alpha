import type { CanonicalVehicleOperationalView } from '../types';
import {
  mapHealthConditionStatePresentation,
  mapHealthEvaluabilityStatePresentation,
} from '../../fleet-health-evaluation/presentation';
import { HEALTH_EVALUABILITY_STATE } from '../../fleet-health-evaluation/types';
import type { HealthUiPresentation, UiPresentationSlice } from './types';
import type { OperationalTranslator } from './primary-reason-presentation';

function absentSlice<T>(): UiPresentationSlice<T> {
  return { presence: 'absent' };
}

function presentSlice<T>(presentation: T): UiPresentationSlice<T> {
  return { presence: 'present', presentation };
}

export function mapHealthUiPresentation(
  canonical: CanonicalVehicleOperationalView,
  options: { t: OperationalTranslator },
): UiPresentationSlice<HealthUiPresentation> {
  const evaluabilityField = canonical.health.evaluability;
  if (evaluabilityField.presence !== 'present' || evaluabilityField.value === undefined) {
    return absentSlice();
  }

  const evaluability = evaluabilityField.value;
  const conditionField = canonical.health.condition;
  const pipelineField = canonical.health.pipelineAvailability;

  let base: Pick<
    HealthUiPresentation,
    'evaluability' | 'labelKey' | 'label' | 'tone' | 'tooltip' | 'isEvaluable' | 'secondaryLabel'
  >;

  if (
    evaluability === HEALTH_EVALUABILITY_STATE.EVALUABLE &&
    conditionField.presence === 'present' &&
    conditionField.value !== undefined
  ) {
    const conditionPresentation = mapHealthConditionStatePresentation(conditionField.value, options);
    base = {
      evaluability,
      labelKey: conditionPresentation.labelKey,
      label: conditionPresentation.label,
      tone: conditionPresentation.tone,
      tooltip: null,
      isEvaluable: true,
      secondaryLabel: null,
    };
  } else if (evaluability === HEALTH_EVALUABILITY_STATE.EVALUABLE) {
    const unknownKey = 'fleet.healthEvaluation.unknown' as import('../../../i18n/translations/en').TranslationKey;
    base = {
      evaluability,
      labelKey: unknownKey,
      label: options.t(unknownKey),
      tone: 'neutral',
      tooltip: null,
      isEvaluable: true,
      secondaryLabel: null,
    };
  } else {
    base = mapHealthEvaluabilityStatePresentation(evaluability, options);
  }

  const conditionSlice: HealthUiPresentation['condition'] =
    conditionField.presence === 'present' && conditionField.value !== undefined
      ? presentSlice({
          state: conditionField.value,
          label: mapHealthConditionStatePresentation(conditionField.value, options).label,
          tone: mapHealthConditionStatePresentation(conditionField.value, options).tone,
        })
      : absentSlice();

  const pipelineSlice: HealthUiPresentation['pipelineAvailability'] =
    pipelineField.presence === 'present'
      ? presentSlice({ value: pipelineField.value! })
      : absentSlice();

  return presentSlice({
    ...base,
    condition: conditionSlice,
    pipelineAvailability: pipelineSlice,
  });
}
