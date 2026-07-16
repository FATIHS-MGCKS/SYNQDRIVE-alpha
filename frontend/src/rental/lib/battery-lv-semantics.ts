/** Shared LV health score semantics for API types and UI labels. */
export const ESTIMATED_LV_HEALTH_SCORE_SEMANTIC = 'ESTIMATED_LV_HEALTH_SCORE' as const;
export const LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC = 'LEGACY_ESTIMATED_LV_HEALTH' as const;
export const ESTIMATED_LV_HEALTH_SCORE_LABEL_DE = 'Geschätzter 12V-Batteriezustand';

export type LvHealthScoreSemantic =
  | typeof ESTIMATED_LV_HEALTH_SCORE_SEMANTIC
  | typeof LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC;

export interface LvEstimatedHealthScoreRef {
  value: number | null;
  semanticType: typeof ESTIMATED_LV_HEALTH_SCORE_SEMANTIC;
  label: typeof ESTIMATED_LV_HEALTH_SCORE_LABEL_DE;
}
