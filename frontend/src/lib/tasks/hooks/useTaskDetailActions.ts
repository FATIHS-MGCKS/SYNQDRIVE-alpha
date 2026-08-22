import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '../../../i18n/LanguageContext';
import { api } from '../../api';
import { invalidateTaskQueries } from '../invalidate';
import type { CompleteTaskPayload } from '../types';
import type { ApiTaskDetail } from '../types';
import type { TaskBucket } from '../types';
import type { TaskDetailActionKind } from '../taskDetailActions.utils';
import {
  taskDetailToastActionFailed,
  taskDetailToastCancelled,
  taskDetailToastCompleted,
  taskDetailToastResumed,
  taskDetailToastStarted,
  taskDetailToastWaiting,
} from '../task-detail-actions-presentation-i18n';

export interface UseTaskDetailActionsOptions {
  orgId: string | null | undefined;
  task: ApiTaskDetail | null | undefined;
  onTaskUpdated?: (task: ApiTaskDetail) => void;
  onAfterMutation?: (task: ApiTaskDetail) => void;
  buckets?: TaskBucket[];
  showSuccessToast?: boolean;
}

export interface UseTaskDetailActionsResult {
  pendingAction: TaskDetailActionKind | 'complete' | 'cancel' | null;
  isBusy: boolean;
  lastError: string | null;
  clearError: () => void;
  start: () => Promise<ApiTaskDetail | null>;
  resume: () => Promise<ApiTaskDetail | null>;
  moveToWaiting: () => Promise<ApiTaskDetail | null>;
  complete: (payload?: CompleteTaskPayload) => Promise<ApiTaskDetail | null>;
  cancel: () => Promise<ApiTaskDetail | null>;
}

export function useTaskDetailActions({
  orgId,
  task,
  onTaskUpdated,
  onAfterMutation,
  buckets,
  showSuccessToast = true,
}: UseTaskDetailActionsOptions): UseTaskDetailActionsResult {
  const { locale } = useLanguage();
  const [pendingAction, setPendingAction] = useState<UseTaskDetailActionsResult['pendingAction']>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const run = useCallback(
    async (
      kind: UseTaskDetailActionsResult['pendingAction'],
      fn: () => Promise<ApiTaskDetail>,
      successMessage: string,
    ): Promise<ApiTaskDetail | null> => {
      if (!orgId || !task || pendingAction) return null;
      setPendingAction(kind);
      setLastError(null);
      try {
        const updated = await fn();
        onTaskUpdated?.(updated);
        invalidateTaskQueries({
          orgId,
          taskId: task.id,
          vehicleId: task.vehicleId,
          bookingId: task.bookingId,
          buckets,
          lists: true,
          summary: true,
          detail: true,
        });
        onAfterMutation?.(updated);
        if (showSuccessToast) toast.success(successMessage);
        return updated;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : taskDetailToastActionFailed(locale);
        setLastError(message);
        toast.error(message);
        throw error;
      } finally {
        setPendingAction(null);
      }
    },
    [buckets, locale, onAfterMutation, onTaskUpdated, orgId, pendingAction, showSuccessToast, task],
  );

  const start = useCallback(
    () => run('start', () => api.tasks.start(orgId!, task!.id), taskDetailToastStarted(locale)),
    [locale, orgId, run, task],
  );

  const resume = useCallback(
    () => run('resume', () => api.tasks.start(orgId!, task!.id), taskDetailToastResumed(locale)),
    [locale, orgId, run, task],
  );

  const moveToWaiting = useCallback(
    () =>
      run('moveToWaiting', () => api.tasks.waiting(orgId!, task!.id), taskDetailToastWaiting(locale)),
    [locale, orgId, run, task],
  );

  const complete = useCallback(
    (payload?: CompleteTaskPayload) =>
      run('complete', () => api.tasks.complete(orgId!, task!.id, payload), taskDetailToastCompleted(locale)),
    [locale, orgId, run, task],
  );

  const cancel = useCallback(
    () => run('cancel', () => api.tasks.cancel(orgId!, task!.id), taskDetailToastCancelled(locale)),
    [locale, orgId, run, task],
  );

  return {
    pendingAction,
    isBusy: pendingAction != null,
    lastError,
    clearError: () => setLastError(null),
    start,
    resume,
    moveToWaiting,
    complete,
    cancel,
  };
}
