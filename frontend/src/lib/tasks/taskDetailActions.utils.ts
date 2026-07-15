import {
  formatTaskDateTime,
  isTerminalTaskStatus,
  taskStatusLabelDe,
} from '../../rental/lib/task-detail.utils';
import { buildTaskCompletionControlModel } from './taskDetailCompletion.utils';
import type { ApiTaskDetail, TaskActionAvailability, TaskCompletionMode } from './types';
import { formatResolutionCodeLabel } from './taskResolution.utils';
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
  kind: TaskDetailActionKind,
  label: string,
  availability: TaskActionAvailability,
  emphasis: TaskDetailActionItem['emphasis'],
): TaskDetailActionItem {
  return {
    kind,
    label,
    enabled: availability.enabled,
    disabledReason: availability.disabledReason ?? null,
    emphasis,
  };
}

export function buildTaskDetailActionPlan(detail: ApiTaskDetail): TaskDetailActionPlan {
  const actions = detail.availableActions;
  const completionControl = buildTaskCompletionControlModel(detail);
  const isTerminal = isTerminalTaskStatus(detail.summary.status);

  if (isTerminal) {
    return {
      primary: null,
      secondaries: [],
      overflow: actions.comment.enabled
        ? [actionItem('comment', 'Kommentar', actions.comment, 'secondary')]
        : [],
      isTerminal: true,
      completionControl,
    };
  }

  const start = actionItem('start', 'Starten', actions.start, 'primary');
  const resume = actionItem('resume', 'Fortsetzen', actions.resume, 'primary');
  const waiting = actionItem('moveToWaiting', 'Warten', actions.moveToWaiting, 'secondary');
  const complete = actionItem('complete', 'Erledigen', actions.complete, 'primary');
  const comment = actionItem('comment', 'Kommentar', actions.comment, 'secondary');
  const cancel = actionItem('cancel', 'Abbrechen', actions.cancel, 'overflow');

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
  options?: {
    formatDateTime?: (iso: string | null | undefined) => string;
    statusLabel?: string;
  },
): TaskDetailCompletionSummaryModel {
  const formatDateTime = options?.formatDateTime ?? (() => null);
  const completionMode =
    detail.summary.completionMode ?? detail.completion.completionMode ?? null;
  const resolutionCodeLabel = formatResolutionCodeLabel(detail.completion.resolutionCode);
  const resolutionNote = detail.completion.resolutionNote ?? detail.resolutionNote ?? null;

  const autoResolvedReason =
    completionMode === 'AUTO_RESOLVED'
      ? resolutionCodeLabel ??
        (resolutionNote ? humanizeResolutionReason(resolutionNote) : null) ??
        'Automatisch aufgelöst'
      : null;

  const supersededReason =
    completionMode === 'SUPERSEDED'
      ? resolutionCodeLabel ??
        (resolutionNote ? humanizeResolutionReason(resolutionNote) : null) ??
        'Durch Nachfolge-Aufgabe ersetzt'
      : null;

  return {
    status: detail.summary.status,
    statusLabel: options?.statusLabel ?? taskStatusLabelDe(detail.summary.status),
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
