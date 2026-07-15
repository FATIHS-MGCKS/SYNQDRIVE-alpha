import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, type ApiTask } from '../../lib/api';
import {
  buildTaskDetailViewModel,
  isNormalizedTaskDetail,
  matchesTaskDetailInvalidation,
  subscribeTaskQueryInvalidation,
  TaskDetailActionsHost,
  TaskDetailShell,
  type TaskNotesActivityTab,
  useOperatorTaskLinkedObjectNavigation,
  useTaskChecklistMutation,
  useTaskCommentMutation,
  useTaskLinkedObjectNavigator,
} from '../../lib/tasks';
import { getStoredUser } from '../../lib/auth';
import { useRentalOrg } from '../../rental/RentalContext';
import { isActiveTaskStatus } from '../../rental/lib/task-detail.utils';

interface Props {
  taskId: string;
  initialTask?: ApiTask | null;
  onTaskUpdated?: (task: ApiTask) => void;
  focusComment?: boolean;
  /** `tab` = above bottom nav; `sheet` = full-screen overlay */
  layout?: 'tab' | 'sheet';
  onOpenSuccessorTask?: (taskId: string) => void;
}

export function OperatorTaskDetail({
  taskId,
  initialTask,
  onTaskUpdated,
  focusComment: focusCommentProp,
  layout = 'tab',
  onOpenSuccessorTask,
}: Props) {
  const { orgId } = useRentalOrg();
  const [task, setTask] = useState<ApiTask | null>(initialTask ?? null);
  const [loading, setLoading] = useState(!initialTask);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [notesActivityTab, setNotesActivityTab] = useState<TaskNotesActivityTab>('notes');
  const [focusComment, setFocusComment] = useState(focusCommentProp ?? false);

  const handleChanged = useCallback(
    (updated: ApiTask) => {
      setTask(updated);
      onTaskUpdated?.(updated);
    },
    [onTaskUpdated],
  );

  const normalizedTask = task && isNormalizedTaskDetail(task) ? task : null;

  const { pendingItemIds, toggleItem } = useTaskChecklistMutation({
    orgId,
    task: normalizedTask,
    onTaskUpdated: handleChanged,
  });

  const { pending: commentPending, addComment: addTaskComment } = useTaskCommentMutation({
    orgId,
    task: normalizedTask,
    authorUserId: getStoredUser()?.id ?? null,
    onTaskUpdated: handleChanged,
  });

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const full = await api.tasks.get(orgId, taskId);
      setTask(full);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeTaskQueryInvalidation((detail) => {
      if (!matchesTaskDetailInvalidation(detail, orgId, taskId)) return;
      void load();
    });
  }, [orgId, taskId, load]);

  useEffect(() => {
    if (initialTask && initialTask.id === taskId) {
      setTask(initialTask);
    }
  }, [initialTask, taskId]);

  useEffect(() => {
    if (focusCommentProp) {
      setNotesActivityTab('notes');
      setFocusComment(true);
    }
  }, [focusCommentProp]);

  const operatorNavigation = useOperatorTaskLinkedObjectNavigation();
  const navigateLinkedObject = useTaskLinkedObjectNavigator(operatorNavigation, {
    taskVehicleId: task?.vehicleId ?? null,
  });

  const detailModel = useMemo(() => {
    if (!task || !isNormalizedTaskDetail(task)) return null;
    return buildTaskDetailViewModel(task);
  }, [task]);

  const handleAddComment = async () => {
    if (!task) return;
    const body = commentDraft.trim();
    if (!body) {
      setCommentError('Kommentar eingeben.');
      return;
    }
    setCommentError(null);
    const saved = await addTaskComment(body);
    if (saved) setCommentDraft('');
  };

  const handleCommentFromBar = () => {
    setNotesActivityTab('notes');
    setFocusComment(true);
  };

  if (loading && !task) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !task) {
    return (
      <div className="rounded-2xl border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] px-4 py-3 text-sm">
        {loadError ?? 'Aufgabe nicht gefunden'}
      </div>
    );
  }

  const active = isActiveTaskStatus(task.status);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 flex-1 pb-28">
        <TaskDetailShell
          variant="inline"
          model={detailModel}
          loading={false}
          density="mobile"
          bodyProps={{
            onLinkedObjectClick: navigateLinkedObject,
            pendingChecklistItemIds: pendingItemIds,
            onChecklistToggle: (itemId, isDone) => void toggleItem(itemId, isDone),
            commentDraft,
            onCommentDraftChange: setCommentDraft,
            onAddComment: () => void handleAddComment(),
            commentError,
            commentPending,
            showCommentForm: active,
            focusComment,
            notesActivityTab,
            onNotesActivityTabChange: setNotesActivityTab,
          }}
        />
      </div>

      {normalizedTask && (
        <TaskDetailActionsHost
          detail={normalizedTask}
          orgId={orgId}
          variant="mobile-sticky"
          mobileBottomOffset={layout}
          onTaskUpdated={handleChanged}
          onComment={handleCommentFromBar}
          onOpenSuccessorTask={onOpenSuccessorTask}
        />
      )}
    </div>
  );
}
