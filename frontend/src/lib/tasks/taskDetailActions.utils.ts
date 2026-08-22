import { isTerminalTaskStatus } from '../../rental/lib/task-detail.utils';
import {
  taskDetailCompletionAutoResolvedFallback,
  taskDetailCompletionSupersededFallback,
  taskDetailActionLabel,
  taskDetailResolutionCodeLabel,
} from './task-detail-actions-presentation-i18n';
import {
  formatTaskDetailDateTime,
  taskDetailStatusLabel,
} from './task-detail-presentation-i18n';
import { buildTaskCompletionControlModel } from './taskDetailCompletion.utils';
import type { ApiTaskDetail, TaskActionAvailability, TaskCompletionMode } from './types';
import { humanizeResolutionReason } from './taskTimeline.utils';

export type TaskDetailActionKind =
  | 'start'
  | 'resume'
  | 'moveToWaiting'
  | 'complete'
  | 'comment'
  | 'cancel';

export interface TaskDetailActionItem {
  kind: TaskDetailActionKind;
  label: string;
  enabled: boolean;
  disabledReason?: string | null;
  emphasis: 'primary' | 'secondary' | 'overflow';
}

export interface TaskDetailActionPlan {
  primary: TaskDetailActionItem | null;
  secondaries: TaskDetailActionItem[];
  overflow: TaskDetailActionItem[];
  isTerminal: boolean;
  completionControl: ReturnType<typeof buildTaskCompletionControlModel>;
}

export interface TaskDetailCompletionSummaryModel {
  status: ApiTaskDetail['status'];
  statusLabel: string;
  completionMode: TaskCompletionMode | null;
  completedAtLabel: string | null;
  completedByLabel: string | null;
  resolutionNote: string | null;
  resolutionCodeLabel: string | null;
  autoResolvedReason: string | null;
  supersededByTaskId: string | null;
  supersededReason: string | null;
  isAutoResolved: boolean;
  isSuperseded: boolean;
  isCancelled: boolean;
}

function actionItem(
  locale: string,
  kind: TaskDetailActionKind,
  availability: TaskActionAvailability,
  emphasis: TaskDetailActionItem['emphasis'],
): TaskDetailActionItem {
  return {
    kind,
    label: taskDetailActionLabel(locale, kind),
    enabled: availability.enabled,
    disabledReason: availability.disabledReason ?? null,
    emphasis,
  };
}

export function buildTaskDetailActionPlan(
  detail: ApiTaskDetail,
  locale: string,
): TaskDetailActionPlan {
  const actions = detail.availableActions;
  const completionControl = buildTaskCompletionControlModel(detail, locale);
  const isTerminal = isTerminalTaskStatus(detail.summary.status);

  if (isTerminal) {
    return {
      primary: null,
      secondaries: [],
      overflow: actions.comment.enabled
        ? [actionItem(locale, 'comment', actions.comment, 'secondary')]
        : [],
      isTerminal: true,
      completionControl,
    };
  }

  const start = actionItem(locale, 'start', actions.start, 'primary');
  const resume = actionItem(locale, 'resume', actions.resume, 'primary');
  const waiting = actionItem(locale, 'moveToWaiting', actions.moveToWaiting, 'secondary');
  const completeAvailability =
    actions.complete.enabled || actions.overrideCompletion.enabled
      ? {
          ...actions.complete,
          enabled: actions.complete.enabled || actions.overrideCompletion.enabled,
        }
      : actions.complete;
  const complete = actionItem(locale, 'complete', completeAvailability, 'primary');
  const comment = actionItem(locale, 'comment', actions.comment, 'secondary');
  const cancel = actionItem(locale, 'cancel', actions.cancel, 'overflow');

  let primary: TaskDetailActionItem | null = null;
  const secondaries: TaskDetailActionItem[] = [];
  const overflow: TaskDetailActionItem[] = [];

  if (detail.summary.status === 'IN_PROGRESS') {
    primary = { ...complete, emphasis: 'primary' };
    if (waiting.enabled) secondaries.push(waiting);
  } else if (resume.enabled) {
    primary = resume;
  } else if (start.enabled) {
    primary = start;
  } else if (complete.enabled) {
    primary = complete;
  }

  if (!primary && (start.enabled || resume.enabled || complete.enabled)) {
    primary = resume.enabled ? resume : start.enabled ? start : complete;
  }

  if (comment.enabled) {
    if (secondaries.length < 2) {
      secondaries.push(comment);
    } else {
      overflow.push(comment);
    }
  }

  if (cancel.enabled) {
    overflow.push(cancel);
  }

  return {
    primary,
    secondaries,
    overflow,
    isTerminal: false,
    completionControl,
  };
}

export function buildTaskDetailCompletionSummary(
  detail: ApiTaskDetail,
  locale: string,
  options?: {
    formatDateTime?: (iso: string | null | undefined) => string;
    statusLabel?: string;
  },
): TaskDetailCompletionSummaryModel {
  const formatDateTime =
    options?.formatDateTime ?? ((iso) => formatTaskDetailDateTime(locale, iso));
  const completionMode =
    detail.summary.completionMode ?? detail.completion.completionMode ?? null;
  const resolutionCodeLabel = detail.completion.resolutionCode
    ? taskDetailResolutionCodeLabel(locale, detail.completion.resolutionCode)
    : null;
  const resolutionNote = detail.completion.resolutionNote ?? detail.resolutionNote ?? null;

  const autoResolvedReason =
    completionMode === 'AUTO_RESOLVED'
      ? resolutionCodeLabel ??
        (resolutionNote ? humanizeResolutionReason(resolutionNote) : null) ??
        taskDetailCompletionAutoResolvedFallback(locale)
      : null;

  const supersededReason =
    completionMode === 'SUPERSEDED'
      ? resolutionCodeLabel ??
        (resolutionNote ? humanizeResolutionReason(resolutionNote) : null) ??
        taskDetailCompletionSupersededFallback(locale)
      : null;

  return {
    status: detail.summary.status,
    statusLabel: options?.statusLabel ?? taskDetailStatusLabel(locale, detail.summary.status),
    completionMode,
    completedAtLabel: formatDateTime(detail.timing.completedAt ?? detail.completedAt),
    completedByLabel: detail.completion.completedBy?.displayName ?? null,
    resolutionNote,
    resolutionCodeLabel,
    autoResolvedReason,
    supersededByTaskId: detail.completion.supersededByTaskId ?? detail.supersededByTaskId ?? null,
    supersededReason,
    isAutoResolved: completionMode === 'AUTO_RESOLVED',
    isSuperseded: completionMode === 'SUPERSEDED',
    isCancelled: detail.summary.status === 'CANCELLED',
  };
}
