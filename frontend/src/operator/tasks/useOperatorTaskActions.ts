import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { api, type ApiTaskDetail, type CompleteTaskPayload } from '../../lib/api';
import { invalidateTaskQueries } from '../../lib/tasks/invalidate';
import { useRentalOrg } from '../../rental/RentalContext';
import { useOperatorData } from '../context/OperatorDataContext';
import { dispatchOperatorTaskUpdated } from './operatorTask.utils';

export function useOperatorTaskActions(onTaskChanged?: (task: ApiTaskDetail) => void) {
  const { orgId } = useRentalOrg();
  const { reloadTasks } = useOperatorData();
  const [mutating, setMutating] = useState(false);

  const afterMutation = useCallback(
    async (task: ApiTaskDetail, message: string) => {
      toast.success(message);
      onTaskChanged?.(task);
      dispatchOperatorTaskUpdated(task.vehicleId);
      if (orgId) {
        invalidateTaskQueries({
          orgId,
          taskId: task.id,
          vehicleId: task.vehicleId,
          bookingId: task.bookingId,
          buckets: (() => {
            const bucket = task.bucket ?? task.timing?.bucket;
            return bucket ? [bucket] : undefined;
          })(),
          lists: true,
          summary: true,
          detail: true,
        });
      }
      await reloadTasks();
      return task;
    },
    [onTaskChanged, orgId, reloadTasks],
  );

  const run = useCallback(
    async (fn: () => Promise<ApiTaskDetail>, message: string): Promise<ApiTaskDetail | null> => {
      if (!orgId || mutating) return null;
      setMutating(true);
      try {
        const updated = await fn();
        return await afterMutation(updated, message);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Aktion fehlgeschlagen';
        toast.error(msg);
        throw e;
      } finally {
        setMutating(false);
      }
    },
    [orgId, mutating, afterMutation],
  );

  const start = useCallback(
    (taskId: string) => run(() => api.tasks.start(orgId!, taskId), 'Aufgabe gestartet'),
    [orgId, run],
  );

  const waiting = useCallback(
    (taskId: string) => run(() => api.tasks.waiting(orgId!, taskId), 'Auf Wartend gesetzt'),
    [orgId, run],
  );

  const complete = useCallback(
    (taskId: string, payload?: CompleteTaskPayload) =>
      run(() => api.tasks.complete(orgId!, taskId, payload), 'Aufgabe erledigt'),
    [orgId, run],
  );

  const addComment = useCallback(
    (taskId: string, body: string) =>
      run(() => api.tasks.addComment(orgId!, taskId, body), 'Kommentar hinzugefügt'),
    [orgId, run],
  );

  const toggleChecklist = useCallback(
    (taskId: string, itemId: string, isDone: boolean) =>
      run(
        () => api.tasks.updateChecklistItem(orgId!, taskId, itemId, { isDone }),
        isDone ? 'Punkt erledigt' : 'Punkt zurückgesetzt',
      ),
    [orgId, run],
  );

  return {
    mutating,
    start,
    waiting,
    complete,
    addComment,
    toggleChecklist,
  };
}
