import type { StatusTone } from '../../../components/patterns';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  FLEET_HEALTH_CONDITION,
  HEALTH_EVALUABILITY_STATE,
  normalizeFleetHealthConditionState,
  normalizeHealthEvaluabilityState,
  type FleetHealthEvaluation,
  type FleetHealthConditionState,
  type HealthEvaluabilityState,
} from './types';

const CONDITION_LABEL_KEYS: Record<FleetHealthConditionState, TranslationKey> = {
  [FLEET_HEALTH_CONDITION.GOOD]: 'fleet.healthEvaluation.condition.good',
  [FLEET_HEALTH_CONDITION.WARNING]: 'fleet.healthEvaluation.condition.warning',
  [FLEET_HEALTH_CONDITION.CRITICAL]: 'fleet.healthEvaluation.condition.critical',
  [FLEET_HEALTH_CONDITION.UNKNOWN]: 'fleet.healthEvaluation.condition.unknown',
};

const EVALUABILITY_LABEL_KEYS: Partial<Record<HealthEvaluabilityState, TranslationKey>> = {
  [HEALTH_EVALUABILITY_STATE.PARTIALLY_EVALUABLE]:
    'fleet.healthEvaluation.partiallyEvaluable',
  [HEALTH_EVALUABILITY_STATE.NOT_EVALUABLE]: 'fleet.healthEvaluation.notEvaluable',
  [HEALTH_EVALUABILITY_STATE.UNKNOWN]: 'fleet.healthEvaluation.unknown',
};

const EVALUABILITY_TOOLTIP_KEYS: Partial<Record<HealthEvaluabilityState, TranslationKey>> = {
  [HEALTH_EVALUABILITY_STATE.PARTIALLY_EVALUABLE]:
    'fleet.healthEvaluation.tooltip.partiallyEvaluable',
  [HEALTH_EVALUABILITY_STATE.NOT_EVALUABLE]: 'fleet.healthEvaluation.tooltip.notEvaluable',
  [HEALTH_EVALUABILITY_STATE.UNKNOWN]: 'fleet.healthEvaluation.tooltip.unknown',
};

const CONDITION_TONES: Record<FleetHealthConditionState, StatusTone> = {
  [FLEET_HEALTH_CONDITION.GOOD]: 'success',
  [FLEET_HEALTH_CONDITION.WARNING]: 'watch',
  [FLEET_HEALTH_CONDITION.CRITICAL]: 'critical',
  [FLEET_HEALTH_CONDITION.UNKNOWN]: 'neutral',
};

const EVALUABILITY_TONES: Record<HealthEvaluabilityState, StatusTone> = {
  [HEALTH_EVALUABILITY_STATE.EVALUABLE]: 'success',
  [HEALTH_EVALUABILITY_STATE.PARTIALLY_EVALUABLE]: 'watch',
  [HEALTH_EVALUABILITY_STATE.NOT_EVALUABLE]: 'neutral',
  [HEALTH_EVALUABILITY_STATE.UNKNOWN]: 'neutral',
};

export interface FleetHealthPresentation {
  condition: FleetHealthConditionState;
  evaluability: HealthEvaluabilityState;
  labelKey: TranslationKey;
  label: string;
  tone: StatusTone;
  tooltip: string | null;
  isEvaluable: boolean;
  secondaryLabel: string | null;
}

export function mapFleetHealthPresentation(
  evaluation: FleetHealthEvaluation | null | undefined,
  options: { t: (key: TranslationKey) => string },
): FleetHealthPresentation {
  const evaluability = normalizeHealthEvaluabilityState(evaluation?.evaluability);
  const condition = normalizeFleetHealthConditionState(evaluation?.condition);
  const tooltipKey = EVALUABILITY_TOOLTIP_KEYS[evaluability];

  if (evaluability === HEALTH_EVALUABILITY_STATE.EVALUABLE) {
    const labelKey = CONDITION_LABEL_KEYS[condition];
    return {
      condition,
      evaluability,
      labelKey,
      label: options.t(labelKey),
      tone: CONDITION_TONES[condition],
      tooltip: tooltipKey ? options.t(tooltipKey) : null,
      isEvaluable: true,
      secondaryLabel: null,
    };
  }

  const labelKey = EVALUABILITY_LABEL_KEYS[evaluability] ?? EVALUABILITY_LABEL_KEYS.UNKNOWN!;
  return {
    condition,
    evaluability,
    labelKey,
    label: options.t(labelKey),
    tone: EVALUABILITY_TONES[evaluability],
    tooltip: tooltipKey ? options.t(tooltipKey) : null,
    isEvaluable: false,
    secondaryLabel: null,
  };
}
