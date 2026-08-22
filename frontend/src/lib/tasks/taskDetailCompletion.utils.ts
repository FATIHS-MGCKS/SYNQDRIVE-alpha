import type { ApiTaskDetail } from './types';
import { resolveTaskDetailPresentationLocale } from './task-detail-presentation-i18n';
import { buildChecklistBlockerLabel, getOpenRequiredItemTitles } from './taskDetailChecklist.utils';

export interface TaskCompletionControlModel {
  enabled: boolean;
  disabledReason: string | null;
  openRequiredTitles: string[];
  blockerSummary: string | null;
  canOverride: boolean;
  overrideDisabledReason: string | null;
}

export function buildTaskCompletionControlModel(
  detail: ApiTaskDetail,
  locale: string,
): TaskCompletionControlModel {
  const complete = detail.availableActions.complete;
  const override = detail.availableActions.overrideCompletion;
  const openRequiredTitles = getOpenRequiredItemTitles(detail);

  return {
    enabled: complete.enabled,
    disabledReason: complete.disabledReason ?? null,
    openRequiredTitles,
    blockerSummary:
      openRequiredTitles.length > 0
        ? buildChecklistBlockerLabel(resolveTaskDetailPresentationLocale(locale), openRequiredTitles)
        : null,
    canOverride: override.enabled,
    overrideDisabledReason: override.disabledReason ?? null,
  };
}
