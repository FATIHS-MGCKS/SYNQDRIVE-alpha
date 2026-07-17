export type DocumentActionPlanPreferences = {
  disabledOptionalActions: string[];
};

const EMPTY_PREFERENCES: DocumentActionPlanPreferences = {
  disabledOptionalActions: [],
};

export function readActionPlanPreferences(
  confirmedData: Record<string, unknown> | null | undefined,
): DocumentActionPlanPreferences {
  if (!confirmedData || typeof confirmedData !== 'object') {
    return EMPTY_PREFERENCES;
  }
  const raw = confirmedData.actionPlanPreferences;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return EMPTY_PREFERENCES;
  }
  const disabled = (raw as Record<string, unknown>).disabledOptionalActions;
  return {
    disabledOptionalActions: Array.isArray(disabled)
      ? [...new Set(disabled.filter((value): value is string => typeof value === 'string' && value.trim() !== ''))]
      : [],
  };
}

export function mergeActionPlanPreferences(
  confirmedData: Record<string, unknown>,
  preferences: DocumentActionPlanPreferences,
): Record<string, unknown> {
  return {
    ...confirmedData,
    actionPlanPreferences: {
      disabledOptionalActions: [...preferences.disabledOptionalActions],
    },
  };
}

export function isOptionalActionDisabled(
  semanticAction: string,
  requirement: string,
  preferences: DocumentActionPlanPreferences,
): boolean {
  if (requirement !== 'OPTIONAL') return false;
  return preferences.disabledOptionalActions.includes(semanticAction);
}
