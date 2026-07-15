import { isActiveTaskStatus, isTerminalTaskStatus } from '../../rental/lib/task-detail.utils';
import { isTaskActivated } from '../../operator/tasks/operatorTaskCard.utils';
import type {
  ApiTask,
  ApiTaskChecklistItem,
  ApiTaskDetail,
  TaskActionAvailability,
  TaskChecklistProgress,
  TaskCompletionMode,
} from './types';
import { inferTaskChecklistProgress } from './taskDetailView.utils';

export const LEGACY_DONE_CHECKLIST_HINT =
  'Diese Aufgabe wurde nach älterer Logik geschlossen; die Checkliste ist nur zur Dokumentation sichtbar.';

export type TaskChecklistDisplayMode = 'editable' | 'readOnly' | 'documentationOnly' | 'hidden';

export interface TaskDetailChecklistItemModel {
  id: string;
  title: string;
  description: string | null;
  hasDescription: boolean;
  isDone: boolean;
  isRequired: boolean;
  sortOrder: number;
}

export interface TaskDetailChecklistModel {
  mode: TaskChecklistDisplayMode;
  progress: TaskChecklistProgress;
  items: TaskDetailChecklistItemModel[];
  progressLabel: string;
  progressPercent: number;
  blocked: boolean;
  blockerLabel: string | null;
  openRequiredTitles: string[];
  legacyClosedHint: string | null;
  canEditItems: boolean;
  showAsInteractive: boolean;
  completeAction: TaskActionAvailability;
  overrideCompletion: TaskActionAvailability;
}

export function formatChecklistProgressLabel(progress: TaskChecklistProgress): string {
  return `${progress.completedItems} von ${progress.totalItems} erledigt`;
}

export function computeChecklistProgressPercent(progress: TaskChecklistProgress): number {
  if (progress.totalItems <= 0) return 0;
  return Math.round((progress.completedItems / progress.totalItems) * 100);
}

export function resolveTaskCompletionMode(detail: ApiTaskDetail): TaskCompletionMode | null {
  return detail.summary.completionMode ?? detail.completion.completionMode ?? null;
}

export function getOpenRequiredItemTitles(detail: ApiTaskDetail): string[] {
  return [...(detail.checklist ?? [])]
    .filter((item) => item.isRequired && !item.isDone)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'de'))
    .map((item) => item.title);
}

export function isLegacyDoneWithOpenChecklist(detail: ApiTaskDetail): boolean {
  if (detail.summary.status !== 'DONE') return false;
  const completionMode = resolveTaskCompletionMode(detail);
  if (completionMode === 'AUTO_RESOLVED' || completionMode === 'SUPERSEDED') return false;
  return (detail.checklist ?? []).some((item) => !item.isDone);
}

export function canEditChecklistByAvailableActions(detail: ApiTaskDetail, now = new Date()): boolean {
  if (!isActiveTaskStatus(detail.summary.status)) return false;
  if (!isTaskActivated(detail, now)) return false;

  const completionMode = resolveTaskCompletionMode(detail);
  if (completionMode === 'AUTO_RESOLVED' || completionMode === 'SUPERSEDED') return false;

  const actions = detail.availableActions;
  return (
    actions.comment.enabled ||
    actions.start.enabled ||
    actions.resume.enabled ||
    actions.complete.enabled ||
    actions.moveToWaiting.enabled
  );
}

export function resolveChecklistDisplayMode(detail: ApiTaskDetail, now = new Date()): TaskChecklistDisplayMode {
  const completionMode = resolveTaskCompletionMode(detail);
  if (completionMode === 'AUTO_RESOLVED' || completionMode === 'SUPERSEDED') {
    return 'documentationOnly';
  }

  const status = detail.summary.status;
  if (isTerminalTaskStatus(status)) {
    return isLegacyDoneWithOpenChecklist(detail) ? 'documentationOnly' : 'readOnly';
  }

  if (status === 'OPEN' || status === 'IN_PROGRESS' || status === 'WAITING') {
    return canEditChecklistByAvailableActions(detail, now) ? 'editable' : 'readOnly';
  }

  return 'readOnly';
}

export function buildChecklistBlockerLabel(openRequiredTitles: string[]): string {
  if (openRequiredTitles.length === 0) return 'Offene Pflichtpunkte vor Abschluss';
  if (openRequiredTitles.length === 1) {
    return `Pflichtpunkt offen: ${openRequiredTitles[0]}`;
  }
  return `${openRequiredTitles.length} Pflichtpunkte offen`;
}

function mapChecklistItem(item: ApiTaskChecklistItem): TaskDetailChecklistItemModel {
  const description = item.description?.trim() || null;
  return {
    id: item.id,
    title: item.title,
    description,
    hasDescription: Boolean(description),
    isDone: item.isDone,
    isRequired: item.isRequired,
    sortOrder: item.sortOrder,
  };
}

export function buildTaskDetailChecklistModel(
  detail: ApiTaskDetail,
  now = new Date(),
): TaskDetailChecklistModel | null {
  const progress = detail.checklistProgress ?? inferTaskChecklistProgress(detail);
  const items = [...(detail.checklist ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'de'),
  );

  if (!progress.hasChecklist || items.length === 0) return null;

  const mode = resolveChecklistDisplayMode(detail, now);
  if (mode === 'hidden') return null;

  const openRequiredTitles = getOpenRequiredItemTitles(detail);
  const canEditItems = mode === 'editable';
  const isActive = isActiveTaskStatus(detail.summary.status);
  const blocked = isActive && !progress.canCompleteByChecklist;

  let legacyClosedHint: string | null = null;
  if (isLegacyDoneWithOpenChecklist(detail)) {
    legacyClosedHint = LEGACY_DONE_CHECKLIST_HINT;
  }

  return {
    mode,
    progress,
    items: items.map(mapChecklistItem),
    progressLabel: formatChecklistProgressLabel(progress),
    progressPercent: computeChecklistProgressPercent(progress),
    blocked,
    blockerLabel: blocked ? buildChecklistBlockerLabel(openRequiredTitles) : null,
    openRequiredTitles,
    legacyClosedHint,
    canEditItems,
    showAsInteractive: canEditItems,
    completeAction: detail.availableActions.complete,
    overrideCompletion: detail.availableActions.overrideCompletion,
  };
}

export function patchTaskChecklistItem(
  task: ApiTaskDetail,
  itemId: string,
  isDone: boolean,
): ApiTaskDetail {
  const checklist = (task.checklist ?? []).map((item) =>
    item.id === itemId
      ? {
          ...item,
          isDone,
          completedAt: isDone ? new Date().toISOString() : null,
          completedByUserId: isDone ? item.completedByUserId : null,
        }
      : item,
  );

  const patched: ApiTaskDetail = {
    ...task,
    checklist,
  };
  return {
    ...patched,
    checklistProgress: inferTaskChecklistProgress({
      ...(patched as ApiTask),
      checklistProgress: undefined,
    }),
  };
}
