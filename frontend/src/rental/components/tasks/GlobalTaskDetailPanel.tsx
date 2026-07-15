import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { api, type ApiTask } from '../../../lib/api';
import { getStoredUser } from '../../../lib/auth';
import {
  buildTaskDetailViewModel,
  isNormalizedTaskDetail,
  useTaskDetailActionsHost,
  TaskDetailShell,
  type TaskNotesActivityTab,
  useRentalTaskLinkedObjectNavigation,
  useTaskChecklistMutation,
  useTaskCommentMutation,
  useTaskLinkedObjectNavigator,
} from '../../../lib/tasks';
import { isActiveTaskStatus } from '../../lib/task-detail.utils';
import type { OrgMemberRef, TaskListRow } from '../../lib/task-list.utils';
import { mapApiPriority, vehicleTaskPriorityLabel } from '../../lib/task-display.utils';
import {
  canAssignTasks,
  resolveTaskResponsibility,
  resolveTaskStationId,
} from '../../lib/task-responsibility.utils';

export interface GlobalTaskDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskRow: TaskListRow | null;
  detail: ApiTask | null;
  detailLoading: boolean;
  orgId: string | null;
  orgMembers: OrgMemberRef[];
  userRole: string | null;
  canManageTasks: boolean;
  canWriteTasks: boolean;
  mutating: boolean;
  onTaskUpdated: (task: ApiTask) => void;
  runTaskAction: (fn: () => Promise<ApiTask>) => Promise<void>;
  onOpenSuccessorTask?: (taskId: string) => void;
}

export function GlobalTaskDetailPanel({
  open,
  onOpenChange,
  taskRow,
  detail,
  detailLoading,
  orgId,
  orgMembers,
  userRole,
  canManageTasks,
  canWriteTasks,
  mutating,
  onTaskUpdated,
  runTaskAction,
  onOpenSuccessorTask,
}: GlobalTaskDetailPanelProps) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignDraft, setAssignDraft] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [notesActivityTab, setNotesActivityTab] = useState<TaskNotesActivityTab>('notes');
  const [focusComment, setFocusComment] = useState(false);

  useEffect(() => {
    if (!open) {
      setAssignOpen(false);
      setCommentDraft('');
      setCommentError(null);
      setNotesActivityTab('notes');
      setFocusComment(false);
    }
  }, [open]);

  useEffect(() => {
    setAssignDraft(detail?.assignedUserId ?? '');
  }, [detail?.assignedUserId, detail?.id]);

  const stationId = detail
    ? resolveTaskStationId(detail, typeof detail.metadata?.stationId === 'string' ? detail.metadata.stationId : null)
    : null;

  const responsibility = useMemo(() => {
    if (!detail) return null;
    return resolveTaskResponsibility(detail, orgMembers, stationId);
  }, [detail, orgMembers, stationId]);

  const currentUserId = getStoredUser()?.id ?? null;
  const currentMember = orgMembers.find((m) => m.id === currentUserId) ?? null;
  const mayAssign = canAssignTasks(userRole, canManageTasks, canWriteTasks, currentMember, stationId);

  const rentalNavigation = useRentalTaskLinkedObjectNavigation();
  const navigateLinkedObject = useTaskLinkedObjectNavigator(rentalNavigation, {
    taskVehicleId: detail?.vehicleId ?? null,
    onNavigated: () => onOpenChange(false),
  });

  const detailModel = useMemo(() => {
    if (!detail || !isNormalizedTaskDetail(detail)) return null;
    return buildTaskDetailViewModel(detail, {
      category: taskRow?.category ?? detail.category,
      priorityLabel: vehicleTaskPriorityLabel(mapApiPriority(detail.priority)),
      orgMembers,
      stationLabel: taskRow?.station || undefined,
    });
  }, [detail, orgMembers, taskRow]);

  const normalizedDetail = detail && isNormalizedTaskDetail(detail) ? detail : null;

  const { pendingItemIds, toggleItem } = useTaskChecklistMutation({
    orgId,
    task: normalizedDetail,
    onTaskUpdated,
  });

  const { pending: commentPending, addComment: addTaskComment } = useTaskCommentMutation({
    orgId,
    task: normalizedDetail,
    authorUserId: currentUserId,
    onTaskUpdated,
  });

  const handleAssignConfirm = async () => {
    if (!orgId || !detail) return;
    await runTaskAction(() => api.tasks.assign(orgId, detail.id, assignDraft || null));
    setAssignOpen(false);
    toast.success('Zuweisung gespeichert');
  };

  const handleAddComment = async () => {
    if (!detail) return;
    const body = commentDraft.trim();
    if (!body) {
      setCommentError('Notiz darf nicht leer sein.');
      return;
    }
    setCommentError(null);
    const saved = await addTaskComment(body);
    if (saved) {
      setCommentDraft('');
      toast.success('Notiz gespeichert');
    }
  };

  const handleCommentFromBar = () => {
    setNotesActivityTab('notes');
    setFocusComment(true);
  };

  const taskActions = useTaskDetailActionsHost({
    detail: normalizedDetail && !detailLoading ? normalizedDetail : null,
    orgId,
    variant: 'desktop-footer',
    onTaskUpdated,
    onComment: handleCommentFromBar,
    onOpenSuccessorTask,
    onCancelSuccess: () => onOpenChange(false),
  });

  return (
    <>
      <TaskDetailShell
        variant="drawer"
        open={open}
        onOpenChange={onOpenChange}
        model={detailModel}
        loading={detailLoading || !taskRow}
        density="desktop"
        widthClassName="sm:max-w-2xl"
        footer={taskActions.footer}
        bodyProps={{
          onChecklistOverride: taskActions.openCompleteDialog,
          onLinkedObjectClick: navigateLinkedObject,
          pendingChecklistItemIds: pendingItemIds,
          onChecklistToggle: (itemId, isDone) => void toggleItem(itemId, isDone),
          commentDraft,
          onCommentDraftChange: setCommentDraft,
          onAddComment: () => void handleAddComment(),
          commentError,
          commentPending,
          showCommentForm: Boolean(detail && isActiveTaskStatus(detail.status)),
          focusComment,
          notesActivityTab,
          onNotesActivityTabChange: setNotesActivityTab,
          afterSections: detail ? (
            <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
              {mayAssign && isActiveTaskStatus(detail.status) ? (
                <Button
                  type="button"
                  variant="neutral"
                  size="sm"
                  disabled={mutating}
                  onClick={() => setAssignOpen(true)}
                >
                  {detail.assignedUserId ? 'Weiterleiten' : 'Zuweisen'}
                </Button>
              ) : null}
              {responsibility?.requiresAssignment ? (
                <p className="text-[10px] text-[color:var(--status-watch)]">
                  Zuweisung erforderlich — kein Bearbeiter gesetzt.
                </p>
              ) : null}
            </div>
          ) : null,
        }}
      />

      {taskActions.dialogs}

      <ConfirmDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        title={detail?.assignedUserId ? 'Aufgabe weiterleiten' : 'Aufgabe zuweisen'}
        description="Wählen Sie einen Mitarbeiter aus Ihrer Organisation."
        confirmLabel="Speichern"
        loading={mutating}
        onConfirm={() => void handleAssignConfirm()}
      >
        <label className="mt-3 block text-[11px] font-semibold text-muted-foreground">
          Mitarbeiter
          <select
            value={assignDraft}
            onChange={(e) => setAssignDraft(e.target.value)}
            disabled={mutating}
            className="mt-1.5 w-full rounded-lg border border-border surface-premium px-3 py-2 text-[12px]"
          >
            <option value="">Nicht zugewiesen</option>
            {orgMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </ConfirmDialog>
    </>
  );
}
