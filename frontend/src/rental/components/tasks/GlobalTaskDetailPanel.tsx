import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { api, type ApiTask } from '../../../lib/api';
import { getStoredUser } from '../../../lib/auth';
import {
  buildTaskCompletionControlModel,
  buildTaskDetailViewModel,
  isNormalizedTaskDetail,
  TaskDetailChecklistOverrideDialog,
  TaskDetailShell,
  useRentalTaskLinkedObjectNavigation,
  useTaskChecklistMutation,
  useTaskCommentMutation,
  useTaskLinkedObjectNavigator,
} from '../../../lib/tasks';
import {
  isActiveTaskStatus,
  isTerminalTaskStatus,
  taskRequiresResolutionNote,
} from '../../lib/task-detail.utils';
import type { OrgMemberRef, TaskListRow } from '../../lib/task-list.utils';
import { mapApiPriority, vehicleTaskPriorityLabel } from '../../lib/task-display.utils';
import {
  canAssignTasks,
  resolveTaskResponsibility,
  resolveTaskStationId,
} from '../../lib/task-responsibility.utils';
import { Icon } from '../ui/Icon';

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
  onReloadDetail: () => void;
  onTaskUpdated: (task: ApiTask) => void;
  runTaskAction: (fn: () => Promise<ApiTask>) => Promise<void>;
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
  onReloadDetail,
  onTaskUpdated,
  runTaskAction,
}: GlobalTaskDetailPanelProps) {
  const [completeOpen, setCompleteOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [assignDraft, setAssignDraft] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCompleteOpen(false);
      setOverrideOpen(false);
      setCancelOpen(false);
      setAssignOpen(false);
      setResolutionNote('');
      setResolutionError(null);
      setCommentDraft('');
      setCommentError(null);
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

  const completionControl = useMemo(
    () => (normalizedDetail ? buildTaskCompletionControlModel(normalizedDetail) : null),
    [normalizedDetail],
  );

  const handleCompleteClick = () => {
    if (!detail || !completionControl?.enabled) return;
    if (taskRequiresResolutionNote(detail.type)) {
      setResolutionNote(detail.resolutionNote ?? '');
      setResolutionError(null);
      setCompleteOpen(true);
      return;
    }
    void runTaskAction(() => api.tasks.complete(orgId!, detail.id)).then(() => {
      toast.success('Aufgabe abgeschlossen');
    });
  };

  const handleOverrideConfirm = async (overrideReason: string) => {
    if (!orgId || !detail) return;
    await runTaskAction(() =>
      api.tasks.complete(orgId, detail.id, {
        overrideIncompleteChecklist: true,
        overrideReason,
        ...(resolutionNote.trim() ? { resolutionNote: resolutionNote.trim() } : {}),
      }),
    );
    setOverrideOpen(false);
    toast.success('Aufgabe mit Override abgeschlossen');
  };

  const handleCompleteConfirm = async () => {
    if (!orgId || !detail) return;
    const note = resolutionNote.trim();
    if (taskRequiresResolutionNote(detail.type) && !note) {
      setResolutionError('Abschluss-Notiz ist für diesen Aufgabentyp erforderlich.');
      return;
    }
    await runTaskAction(() =>
      api.tasks.complete(orgId, detail.id, note ? { resolutionNote: note } : undefined),
    );
    setCompleteOpen(false);
    toast.success('Aufgabe abgeschlossen');
  };

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

  const handlePrimaryAction = () => {
    if (!orgId || !detail || mutating) return;
    if (detail.status === 'OPEN' || detail.status === 'WAITING') {
      void runTaskAction(() => api.tasks.start(orgId, detail.id));
      return;
    }
    if (detail.status === 'IN_PROGRESS') {
      handleCompleteClick();
    }
  };

  const footer =
    detail && !detailLoading && !isTerminalTaskStatus(detail.status) ? (
      <div className="flex w-full flex-wrap items-center gap-1.5">
        {(detail.status === 'OPEN' || detail.status === 'WAITING') && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={mutating}
            onClick={() => void runTaskAction(() => api.tasks.start(orgId!, detail.id))}
          >
            <Icon name="play" className="h-3.5 w-3.5" />
            {detail.status === 'WAITING' ? 'Fortsetzen' : 'Starten'}
          </Button>
        )}
        {detail.status === 'IN_PROGRESS' && (
          <Button
            type="button"
            variant="neutral"
            size="sm"
            disabled={mutating}
            onClick={() => void runTaskAction(() => api.tasks.waiting(orgId!, detail.id))}
          >
            <Icon name="pause" className="h-3.5 w-3.5" />
            Wartend
          </Button>
        )}
        {isActiveTaskStatus(detail.status) && (
          <Button
            type="button"
            variant="success"
            size="sm"
            disabled={mutating || !completionControl?.enabled}
            title={completionControl?.disabledReason ?? undefined}
            onClick={handleCompleteClick}
          >
            <Icon name="check-circle" className="h-3.5 w-3.5" />
            Abschließen
          </Button>
        )}
        {completionControl && !completionControl.enabled && completionControl.blockerSummary && (
          <span
            className="w-full text-[10px] text-[color:var(--status-watch)]"
            role="status"
            title={completionControl.disabledReason ?? undefined}
          >
            {completionControl.blockerSummary}
          </span>
        )}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={mutating}
          className="ml-auto"
          onClick={() => setCancelOpen(true)}
        >
          <Icon name="x" className="h-3.5 w-3.5" />
          Stornieren
        </Button>
      </div>
    ) : null;

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
        footer={footer}
        bodyProps={{
          onPrimaryAction: handlePrimaryAction,
          onLinkedObjectClick: navigateLinkedObject,
          pendingChecklistItemIds: pendingItemIds,
          onChecklistToggle: (itemId, isDone) => void toggleItem(itemId, isDone),
          onChecklistOverride: completionControl?.canOverride ? () => setOverrideOpen(true) : undefined,
          commentDraft,
          onCommentDraftChange: setCommentDraft,
          onAddComment: () => void handleAddComment(),
          commentError,
          commentPending,
          showCommentForm: Boolean(detail && isActiveTaskStatus(detail.status)),
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
              <button
                type="button"
                onClick={onReloadDetail}
                className="text-[10px] font-semibold text-[color:var(--brand)]"
              >
                Detail aktualisieren
              </button>
            </div>
          ) : null,
        }}
      />

      <ConfirmDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        title="Aufgabe abschließen"
        description={
          detail && taskRequiresResolutionNote(detail.type)
            ? 'Für diesen Aufgabentyp ist eine Abschluss-Notiz erforderlich.'
            : 'Optional können Sie eine Abschluss-Notiz hinterlegen.'
        }
        confirmLabel="Abschließen"
        loading={mutating}
        onConfirm={() => void handleCompleteConfirm()}
      >
        <label className="mt-3 block text-[11px] font-semibold text-muted-foreground">
          Abschluss-Notiz
          {detail && taskRequiresResolutionNote(detail.type) ? ' *' : ''}
          <textarea
            value={resolutionNote}
            onChange={(e) => {
              setResolutionNote(e.target.value);
              setResolutionError(null);
            }}
            disabled={mutating}
            className="mt-1.5 min-h-[80px] w-full resize-y rounded-lg border border-border surface-premium px-3 py-2 text-xs"
            placeholder="Ergebnis / durchgeführte Maßnahmen dokumentieren"
          />
        </label>
        {resolutionError ? (
          <p className="mt-1 text-[10px] font-medium text-[color:var(--status-critical)]">{resolutionError}</p>
        ) : null}
      </ConfirmDialog>

      <TaskDetailChecklistOverrideDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        loading={mutating}
        openRequiredTitles={completionControl?.openRequiredTitles ?? []}
        onConfirm={handleOverrideConfirm}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Aufgabe stornieren?"
        description="Die Aufgabe wird als storniert markiert."
        confirmLabel="Stornieren"
        tone="critical"
        loading={mutating}
        onConfirm={() =>
          void runTaskAction(() => api.tasks.cancel(orgId!, detail!.id)).then(() => {
            setCancelOpen(false);
            onOpenChange(false);
          })
        }
      />

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
