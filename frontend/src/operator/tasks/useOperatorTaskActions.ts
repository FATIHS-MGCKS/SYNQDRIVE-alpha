import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { api, type ApiTask } from '../../lib/api';
import { useRentalOrg } from '../../rental/RentalContext';
import { useOperatorData } from '../context/OperatorDataContext';
import { dispatchOperatorTaskUpdated } from './operatorTask.utils';

export function useOperatorTaskActions(onTaskChanged?: (task: ApiTask) => void) {
  const { orgId } = useRentalOrg();
  const { reloadTasks } = useOperatorData();
  const [mutating, setMutating] = useState(false);

  const afterMutation = useCallback(
    async (task: ApiTask, message: string) => {
      toast.success(message);
      onTaskChanged?.(task);
      dispatchOperatorTaskUpdated(task.vehicleId);
      await reloadTasks();
      return task;
    },
    [onTaskChanged, reloadTasks],
  );

  const run = useCallback(
    async (fn: () => Promise<ApiTask>, message: string): Promise<ApiTask | null> => {
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
    (taskId: string, resolutionNote?: string) =>
      run(
        () => api.tasks.complete(orgId!, taskId, resolutionNote ? { resolutionNote } : undefined),
        'Aufgabe erledigt',
      ),
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
