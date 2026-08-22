/**
 * Canonical Task Detail workflow presentation adapter (P2.2.16C.2A).
 * Machine action IDs, payloads, and workflow state stay unchanged.
 */
import type { TranslationKey } from '../../i18n/translations/en';
import { tdp } from './task-detail-presentation-i18n';
import type { TaskDetailActionKind } from './taskDetailActions.utils';

const ACTION_LABEL_KEYS: Record<TaskDetailActionKind, TranslationKey> = {
  start: 'tasks.detail.actions.start',
  resume: 'tasks.detail.actions.resume',
  moveToWaiting: 'tasks.detail.actions.moveToWaiting',
  complete: 'tasks.detail.actions.complete',
  comment: 'tasks.detail.actions.comment',
  cancel: 'tasks.detail.actions.cancel',
};

const RESOLUTION_CODE_KEYS: Record<string, TranslationKey> = {
  TIRE_REPLACED: 'tasks.resolution.code.TIRE_REPLACED',
  TIRE_ROTATED: 'tasks.resolution.code.TIRE_ROTATED',
  TIRE_MEASURED_OK: 'tasks.resolution.code.TIRE_MEASURED_OK',
  BRAKE_MEASURED_OK: 'tasks.resolution.code.BRAKE_MEASURED_OK',
  BRAKE_PARTS_REPLACED: 'tasks.resolution.code.BRAKE_PARTS_REPLACED',
  BATTERY_REPLACED: 'tasks.resolution.code.BATTERY_REPLACED',
  BATTERY_MEASURED_OK: 'tasks.resolution.code.BATTERY_MEASURED_OK',
  VEHICLE_CLEANED: 'tasks.resolution.code.VEHICLE_CLEANED',
  SERVICE_SCHEDULED: 'tasks.resolution.code.SERVICE_SCHEDULED',
  SERVICE_ALREADY_COMPLETED: 'tasks.resolution.code.SERVICE_ALREADY_COMPLETED',
  SERVICE_DUE_DATE_CORRECTED: 'tasks.resolution.code.SERVICE_DUE_DATE_CORRECTED',
  FALSE_POSITIVE: 'tasks.resolution.code.FALSE_POSITIVE',
  SERVICE_CASE_COMPLETED: 'tasks.resolution.code.SERVICE_CASE_COMPLETED',
  TUV_SCHEDULED: 'tasks.resolution.code.TUV_SCHEDULED',
  TUV_PASSED: 'tasks.resolution.code.TUV_PASSED',
  TUV_FAILED: 'tasks.resolution.code.TUV_FAILED',
  REPAIR_COMPLETED: 'tasks.resolution.code.REPAIR_COMPLETED',
  PARTS_REPLACED: 'tasks.resolution.code.PARTS_REPLACED',
  OTHER: 'tasks.resolution.code.OTHER',
};

export function taskDetailActionLabel(locale: string, kind: TaskDetailActionKind): string {
  return tdp(locale, ACTION_LABEL_KEYS[kind]);
}

export function taskDetailActionsMoreAriaLabel(locale: string): string {
  return tdp(locale, 'tasks.detail.actions.moreActions');
}

export function taskDetailResolutionCodeLabel(locale: string, code: string): string {
  const key = RESOLUTION_CODE_KEYS[code];
  if (key) return tdp(locale, key);
  return code.replace(/_/g, ' ');
}

export function taskDetailCompletionAutoResolvedFallback(locale: string): string {
  return tdp(locale, 'tasks.detail.summary.autoResolvedFallback');
}

export function taskDetailCompletionSupersededFallback(locale: string): string {
  return tdp(locale, 'tasks.detail.summary.supersededFallback');
}

export function taskDetailCompletionSummaryHeadline(
  locale: string,
  flags: { isCancelled: boolean; isAutoResolved: boolean; isSuperseded: boolean },
): string {
  if (flags.isCancelled) return tdp(locale, 'tasks.detail.summary.cancelled');
  if (flags.isAutoResolved) return tdp(locale, 'tasks.detail.summary.autoResolved');
  if (flags.isSuperseded) return tdp(locale, 'tasks.detail.summary.superseded');
  return tdp(locale, 'tasks.detail.summary.completed');
}

export const taskDetailCompletionHeadline = taskDetailCompletionSummaryHeadline;

export function taskDetailCompletionCompletedAtText(locale: string, dateLabel: string): string {
  return tdp(locale, 'tasks.detail.summary.completedAt', { date: dateLabel });
}

export function taskDetailCompletionCompletedByText(locale: string, name: string): string {
  return tdp(locale, 'tasks.detail.summary.completedBy', { name });
}

export function taskDetailCompletionResolutionCodeText(locale: string, codeLabel: string): string {
  return tdp(locale, 'tasks.detail.summary.resolutionCode', { code: codeLabel });
}

export function taskDetailCompletionOpenSuccessorLabel(locale: string): string {
  return tdp(locale, 'tasks.detail.summary.openSuccessor');
}

export function taskDetailToastStarted(locale: string): string {
  return tdp(locale, 'tasks.detail.toast.started');
}

export function taskDetailToastResumed(locale: string): string {
  return tdp(locale, 'tasks.detail.toast.resumed');
}

export function taskDetailToastWaiting(locale: string): string {
  return tdp(locale, 'tasks.detail.toast.waiting');
}

export function taskDetailToastCompleted(locale: string): string {
  return tdp(locale, 'tasks.detail.toast.completed');
}

export function taskDetailToastCancelled(locale: string): string {
  return tdp(locale, 'tasks.detail.toast.cancelled');
}

export function taskDetailToastActionFailed(locale: string): string {
  return tdp(locale, 'tasks.detail.toast.actionFailed');
}

export function taskDetailCompletionSubmitFailed(locale: string): string {
  return tdp(locale, 'tasks.detail.completion.submitFailed');
}

export function taskDetailValidationBlockedByChecklist(locale: string): string {
  return tdp(locale, 'tasks.detail.validation.blockedByChecklist');
}

export function taskDetailValidationResolutionCodeRequired(locale: string): string {
  return tdp(locale, 'tasks.detail.validation.resolutionCodeRequired');
}

export function taskDetailValidationResolutionNoteRequired(locale: string): string {
  return tdp(locale, 'tasks.detail.validation.resolutionNoteRequired');
}

export function taskDetailValidationInvalidCost(locale: string): string {
  return tdp(locale, 'tasks.detail.validation.invalidCost');
}

export function taskDetailValidationOverrideReasonRequired(locale: string): string {
  return tdp(locale, 'tasks.detail.validation.overrideReasonRequired');
}
