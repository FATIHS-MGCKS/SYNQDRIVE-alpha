/** API/UI semantic types for LV behavioural health scores — not workshop SOH. */
export const ESTIMATED_LV_HEALTH_SCORE_SEMANTIC = 'ESTIMATED_LV_HEALTH_SCORE' as const;
export const LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC = 'LEGACY_ESTIMATED_LV_HEALTH' as const;

export const ESTIMATED_LV_HEALTH_SCORE_LABEL_DE = 'Geschätzter 12V-Batteriezustand';

export type LvHealthScoreSemantic =
  | typeof ESTIMATED_LV_HEALTH_SCORE_SEMANTIC
  | typeof LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC;

export function mapLvEvidenceValueType(
  valueType: string,
  scope: 'LV' | 'HV',
): { valueType: string; semanticValueType: string | null; displayLabel: string } {
  if (scope === 'LV' && valueType === 'SOH_PERCENT') {
    return {
      valueType,
      semanticValueType: LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC,
      displayLabel: ESTIMATED_LV_HEALTH_SCORE_LABEL_DE,
    };
  }
  if (valueType === 'SOH_PERCENT') {
    return { valueType, semanticValueType: null, displayLabel: 'SOH' };
  }
  return { valueType, semanticValueType: null, displayLabel: valueType };
}
