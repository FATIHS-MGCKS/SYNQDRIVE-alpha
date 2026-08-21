/**
 * Operator Handover presentation helpers.
 * Machine handover kinds, enums, and persisted values stay unchanged.
 */
import type {
  TechnicalObservationAffectedArea,
  TechnicalObservationCategory,
  TechnicalObservationSeverity,
} from '../../lib/api';
import type { HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import {
  HANDOVER_REPORTED_BY_FALLBACK,
  handoverFormattingLocale,
  ho,
  labelHandoverDamageSeverity,
  labelHandoverDamageType,
} from '../../rental/components/handover/handover-i18n';
import type { TranslationKey } from '../../i18n/translations/en';
import type { OperatorHandoverStepId, OperatorHandoverValidationIssue } from './operatorHandoverPayload';
import { OPERATOR_HANDOVER_TIRE_MEASUREMENT_NOTE } from './operatorHandoverPayload';

/** Persisted protocol note — never translate for API payload append. */
export { OPERATOR_HANDOVER_TIRE_MEASUREMENT_NOTE };

export { HANDOVER_REPORTED_BY_FALLBACK };

export function oh(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return ho(locale, key, vars);
}

export const OPERATOR_HANDOVER_STEP_KEYS: Record<OperatorHandoverStepId, TranslationKey> = {
  vehicle: 'handover.operator.step.vehicle',
  condition: 'handover.operator.step.condition',
  damages: 'handover.operator.step.damages',
  documents: 'handover.operator.step.documents',
  signatures: 'handover.operator.step.signatures',
  review: 'handover.operator.step.review',
};

export function labelOperatorHandoverStep(locale: string, step: OperatorHandoverStepId): string {
  return oh(locale, OPERATOR_HANDOVER_STEP_KEYS[step]);
}

export function labelOperatorHandoverKind(locale: string, kind: HandoverDialogKind): string {
  return kind === 'PICKUP'
    ? oh(locale, 'bookings.handover.pickupTitle')
    : oh(locale, 'bookings.handover.returnTitle');
}

export function resolveOperatorValidationMessage(
  locale: string,
  issue: OperatorHandoverValidationIssue,
): string {
  return oh(locale, issue.messageKey, issue.messageParams);
}

export function operatorFormattingLocale(locale: string): string {
  return handoverFormattingLocale(locale);
}

export function formatOperatorDateTime(locale: string, iso: string): string {
  return new Date(iso).toLocaleString(operatorFormattingLocale(locale), {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function formatOperatorNumber(locale: string, value: number): string {
  return value.toLocaleString(operatorFormattingLocale(locale));
}

const OBS_CATEGORY_KEYS: Record<TechnicalObservationCategory, TranslationKey> = {
  exterior: 'handover.operator.observation.category.exterior',
  interior: 'handover.operator.observation.category.interior',
  lights: 'handover.operator.observation.category.lights',
  wipers_windows: 'handover.operator.observation.category.wipers_windows',
  wheels_tires: 'handover.operator.observation.category.wheels_tires',
  electronics_controls: 'handover.operator.observation.category.electronics_controls',
  noise_vibration: 'handover.operator.observation.category.noise_vibration',
  driving_behavior: 'handover.operator.observation.category.driving_behavior',
  comfort: 'handover.operator.observation.category.comfort',
  other: 'handover.operator.observation.category.other',
};

const OBS_AREA_KEYS: Record<TechnicalObservationAffectedArea, TranslationKey> = {
  front: 'handover.operator.observation.area.front',
  rear: 'handover.operator.observation.area.rear',
  left: 'handover.operator.observation.area.left',
  right: 'handover.operator.observation.area.right',
  interior: 'handover.operator.observation.area.interior',
  dashboard: 'handover.operator.observation.area.dashboard',
  lights: 'handover.operator.observation.area.lights',
  wheels: 'handover.operator.observation.area.wheels',
  tires: 'handover.operator.observation.area.tires',
  engine_bay: 'handover.operator.observation.area.engine_bay',
  trunk: 'handover.operator.observation.area.trunk',
  unknown: 'handover.operator.observation.area.unknown',
};

const OBS_SEVERITY_KEYS: Record<TechnicalObservationSeverity, TranslationKey> = {
  low: 'handover.operator.observation.severity.low',
  medium: 'handover.operator.observation.severity.medium',
  high: 'handover.operator.observation.severity.high',
  critical: 'handover.operator.observation.severity.critical',
};

export function labelOperatorObservationCategory(
  locale: string,
  category: TechnicalObservationCategory,
): string {
  return oh(locale, OBS_CATEGORY_KEYS[category] ?? OBS_CATEGORY_KEYS.other);
}

export function labelOperatorObservationArea(
  locale: string,
  area: TechnicalObservationAffectedArea,
): string {
  return oh(locale, OBS_AREA_KEYS[area] ?? OBS_AREA_KEYS.unknown);
}

export function labelOperatorObservationSeverity(
  locale: string,
  severity: TechnicalObservationSeverity,
): string {
  return oh(locale, OBS_SEVERITY_KEYS[severity] ?? OBS_SEVERITY_KEYS.medium);
}

export function labelOperatorDamageType(locale: string, damageType: string): string {
  return labelHandoverDamageType(locale, damageType);
}

export function labelOperatorDamageSeverity(locale: string, severity: string): string {
  return labelHandoverDamageSeverity(locale, severity);
}

export function labelOperatorHandoverSource(locale: string, kind: HandoverDialogKind): string {
  return kind === 'RETURN'
    ? oh(locale, 'handover.operator.observations.sourceReturn')
    : oh(locale, 'handover.operator.observations.sourcePickup');
}
