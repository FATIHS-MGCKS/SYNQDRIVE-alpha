import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../api';
import { invalidateTaskQueries } from '../invalidate';
import { patchTaskChecklistItem } from '../taskDetailChecklist.utils';
import type { ApiTaskDetail } from '../types';
import type { TaskBucket } from '../types';

export interface UseTaskChecklistMutationOptions {
  orgId: string | null | undefined;
  task: ApiTaskDetail | null | undefined;
  onTaskUpdated?: (task: ApiTaskDetail) => void;
  buckets?: TaskBucket[];
}

export interface UseTaskChecklistMutationResult {
  pendingItemIds: ReadonlySet<string>;
  toggleItem: (itemId: string, isDone: boolean) => Promise<void>;
}

export function useTaskChecklistMutation({
  orgId,
  task,
  onTaskUpdated,
  buckets,
}: UseTaskChecklistMutationOptions): UseTaskChecklistMutationResult {
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(() => new Set());

  const toggleItem = useCallback(
    async (itemId: string, isDone: boolean) => {
      if (!orgId || !task) return;
      if (pendingItemIds.has(itemId)) return;

      const snapshot = task;
      const optimistic = patchTaskChecklistItem(task, itemId, isDone);

      setPendingItemIds((current) => new Set(current).add(itemId));
      onTaskUpdated?.(optimistic);

      try {
        const updated = await api.tasks.updateChecklistItem(orgId, task.id, itemId, { isDone });
        onTaskUpdated?.(updated);
        invalidateTaskQueries({
          orgId,
          taskId: task.id,
          vehicleId: task.vehicleId,
          bookingId: task.bookingId,
          buckets,
          lists: true,
          detail: true,
        });
      } catch (error) {
        onTaskUpdated?.(snapshot);
        const message = error instanceof Error ? error.message : 'Checklistenpunkt konnte nicht gespeichert werden';
        toast.error(message);
      } finally {
        setPendingItemIds((current) => {
          const next = new Set(current);
          next.delete(itemId);
          return next;
        });
      }
    },
    [buckets, onTaskUpdated, orgId, pendingItemIds, task],
  );

  return { pendingItemIds, toggleItem };
}
