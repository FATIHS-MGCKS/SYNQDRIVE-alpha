import type { ApiTaskDetail } from './types';
import { buildChecklistBlockerLabel, getOpenRequiredItemTitles } from './taskDetailChecklist.utils';

export interface TaskCompletionControlModel {
  enabled: boolean;
  disabledReason: string | null;
  openRequiredTitles: string[];
  blockerSummary: string | null;
  canOverride: boolean;
  overrideDisabledReason: string | null;
}

export function buildTaskCompletionControlModel(detail: ApiTaskDetail): TaskCompletionControlModel {
  const complete = detail.availableActions.complete;
  const override = detail.availableActions.overrideCompletion;
  const openRequiredTitles = getOpenRequiredItemTitles(detail);

  return {
    enabled: complete.enabled,
    disabledReason: complete.disabledReason ?? null,
    openRequiredTitles,
    blockerSummary:
      openRequiredTitles.length > 0 ? buildChecklistBlockerLabel(openRequiredTitles) : null,
    canOverride: override.enabled,
    overrideDisabledReason: override.disabledReason ?? null,
  };
}
