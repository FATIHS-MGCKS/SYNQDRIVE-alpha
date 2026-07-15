import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../api';
import { invalidateTaskQueries } from '../invalidate';
import type { ApiTaskComment, ApiTaskDetail } from '../types';
import type { TaskBucket } from '../types';

export interface UseTaskCommentMutationOptions {
  orgId: string | null | undefined;
  task: ApiTaskDetail | null | undefined;
  authorUserId?: string | null;
  onTaskUpdated?: (task: ApiTaskDetail) => void;
  buckets?: TaskBucket[];
}

export interface UseTaskCommentMutationResult {
  pending: boolean;
  addComment: (body: string) => Promise<boolean>;
}

export function patchTaskComment(
  task: ApiTaskDetail,
  body: string,
  optimisticId: string,
  userId: string | null,
): ApiTaskDetail {
  const comment: ApiTaskComment = {
    id: optimisticId,
    userId,
    body: body.trim(),
    createdAt: new Date().toISOString(),
  };
  return {
    ...task,
    comments: [...(task.comments ?? []), comment],
  };
}

export function useTaskCommentMutation({
  orgId,
  task,
  authorUserId = null,
  onTaskUpdated,
  buckets,
}: UseTaskCommentMutationOptions): UseTaskCommentMutationResult {
  const [pending, setPending] = useState(false);

  const addComment = useCallback(
    async (body: string): Promise<boolean> => {
      const trimmed = body.trim();
      if (!orgId || !task || !trimmed || pending) return false;

      const snapshot = task;
      const optimisticId = `optimistic-comment-${Date.now()}`;
      const optimistic = patchTaskComment(task, trimmed, optimisticId, authorUserId ?? null);

      setPending(true);
      onTaskUpdated?.(optimistic);

      try {
        const updated = await api.tasks.addComment(orgId, task.id, trimmed);
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
        return true;
      } catch (error) {
        onTaskUpdated?.(snapshot);
        const message = error instanceof Error ? error.message : 'Notiz konnte nicht gespeichert werden';
        toast.error(message);
        return false;
      } finally {
        setPending(false);
      }
    },
    [authorUserId, buckets, onTaskUpdated, orgId, pending, task],
  );

  return { pending, addComment };
}
