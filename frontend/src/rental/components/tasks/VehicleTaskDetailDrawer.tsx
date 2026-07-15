import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api, type ApiTask } from '../../../lib/api';
import {
  buildTaskDetailViewModel,
  isNormalizedTaskDetail,
  matchesTaskDetailInvalidation,
  subscribeTaskQueryInvalidation,
  useTaskDetailActionsHost,
  TaskDetailShell,
  type TaskNotesActivityTab,
  useRentalTaskLinkedObjectNavigation,
  useTaskChecklistMutation,
  useTaskCommentMutation,
  useTaskLinkedObjectNavigator,
} from '../../../lib/tasks';
import { getStoredUser } from '../../../lib/auth';
import type { VehicleData } from '../../data/vehicles';
import {
  formatTaskDate,
  formatTaskDateTime,
  isActiveTaskStatus,
  isTerminalTaskStatus,
  toDateInputValue,
} from '../../lib/task-detail.utils';
import { mapApiPriority, vehicleTaskPriorityLabel } from '../../lib/task-display.utils';
import {
  deriveTaskBlockingBadge,
} from '../../lib/task-operator.utils';
import {
  TaskBlockingBadgePill,
} from './VehicleTaskActionCenter';
import { HealthTaskContextPanel } from '../health/HealthTaskContextPanel';
import { Icon } from '../ui/Icon';

export interface VehicleTaskDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  taskId: string | null;
  vehicle?: VehicleData | null;
  orgMembers: Array<{ id: string; name: string }>;
  onTaskUpdated: (task: ApiTask) => void;
  onOpenInGlobalTasks?: (taskId: string) => void;
}

export function VehicleTaskDetailDrawer({
  open,
  onOpenChange,
  orgId,
  taskId,
  vehicle,
  orgMembers,
  onTaskUpdated,
  onOpenInGlobalTasks,
}: VehicleTaskDetailDrawerProps) {
  const [detail, setDetail] = useState<ApiTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [assignDraft, setAssignDraft] = useState('');
  const [dueDraft, setDueDraft] = useState('');
  const [editingMeta, setEditingMeta] = useState(false);

  const [commentDraft, setCommentDraft] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [notesActivityTab, setNotesActivityTab] = useState<TaskNotesActivityTab>('notes');
  const [focusComment, setFocusComment] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!orgId || !taskId || !open) {
      setDetail(null);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const full = await api.tasks.get(orgId, taskId);
      setDetail(full);
      setAssignDraft(full.assignedUserId ?? '');
      setDueDraft(toDateInputValue(full.dueDate));
    } catch (err) {
      setDetail(null);
      setLoadError(err instanceof Error ? err.message : 'Aufgabe konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [open, orgId, taskId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    return subscribeTaskQueryInvalidation((detail) => {
      if (!matchesTaskDetailInvalidation(detail, orgId, taskId)) return;
      void loadDetail();
    });
  }, [orgId, taskId, loadDetail]);

  useEffect(() => {
    if (!open) {
      setActionError(null);
      setCommentDraft('');
      setCommentError(null);
      setEditingMeta(false);
      setNotesActivityTab('notes');
      setFocusComment(false);
    }
  }, [open]);

  const assigneeName = useMemo(() => {
    if (!detail?.assignedUserId) return 'Nicht zugewiesen';
    return orgMembers.find((m) => m.id === detail.assignedUserId)?.name ?? detail.assignedUserId;
  }, [detail?.assignedUserId, orgMembers]);

  const rentalNavigation = useRentalTaskLinkedObjectNavigation();
  const navigateLinkedObject = useTaskLinkedObjectNavigator(rentalNavigation, {
    taskVehicleId: detail?.vehicleId ?? vehicle?.id ?? null,
    onNavigated: () => onOpenChange(false),
  });

  const detailModel = useMemo(() => {
    if (!detail || !isNormalizedTaskDetail(detail)) return null;
    return buildTaskDetailViewModel(detail, {
      eyebrow: 'Fahrzeugaufgabe',
      priorityLabel: vehicleTaskPriorityLabel(mapApiPriority(detail.priority)),
      orgMembers,
      stationLabel: vehicle?.station || undefined,
    });
  }, [detail, orgMembers, vehicle]);

  const normalizedDetail = detail && isNormalizedTaskDetail(detail) ? detail : null;

  const handleDetailUpdated = useCallback(
    (updated: ApiTask) => {
      setDetail(updated);
      onTaskUpdated(updated);
    },
    [onTaskUpdated],
  );

  const { pendingItemIds, toggleItem } = useTaskChecklistMutation({
    orgId,
    task: normalizedDetail,
    onTaskUpdated: handleDetailUpdated,
  });

  const { pending: commentPending, addComment: addTaskComment } = useTaskCommentMutation({
    orgId,
    task: normalizedDetail,
    authorUserId: getStoredUser()?.id ?? null,
    onTaskUpdated: handleDetailUpdated,
  });

  const handleSaveMeta = async () => {
    if (!orgId || !detail || isTerminalTaskStatus(detail.status)) return;
    setMutating(true);
    setActionError(null);
    try {
      let current = detail;
      const nextAssignee = assignDraft || null;
      if (nextAssignee !== (detail.assignedUserId ?? null)) {
        current = await api.tasks.assign(orgId, detail.id, nextAssignee);
      }
      const nextDueIso = dueDraft ? new Date(dueDraft).toISOString() : null;
      const prevDueIso = detail.dueDate ?? null;
      if (nextDueIso !== prevDueIso) {
        current = await api.tasks.update(orgId, current.id, {
          dueDate: nextDueIso ?? undefined,
        });
      }
      setDetail(current);
      onTaskUpdated(current);
      setEditingMeta(false);
      toast.success('Aufgabe aktualisiert');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Aktualisierung fehlgeschlagen';
      setActionError(message);
      toast.error(message);
    } finally {
      setMutating(false);
    }
  };

  const handleAddComment = async () => {
    if (!detail) return;
    const body = commentDraft.trim();
    if (!body) {
      setCommentError('Kommentar darf nicht leer sein.');
      return;
    }
    setCommentError(null);
    const saved = await addTaskComment(body);
    if (saved) {
      setCommentDraft('');
      toast.success('Kommentar hinzugefügt');
    }
  };

  const handleCommentFromBar = () => {
    setNotesActivityTab('notes');
    setFocusComment(true);
  };

  const taskActions = useTaskDetailActionsHost({
    detail: normalizedDetail && !loading ? normalizedDetail : null,
    orgId,
    variant: 'desktop-footer',
    onTaskUpdated: handleDetailUpdated,
    onComment: handleCommentFromBar,
    onOpenSuccessorTask: onOpenInGlobalTasks,
  });

  const vehicleContextSlot: ReactNode =
    detail && !loading && !loadError ? (
      <>
        {actionError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {actionError}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <TaskBlockingBadgePill badge={deriveTaskBlockingBadge(detail)} />
          <span className="sq-chip sq-tone-neutral text-[10px]">{detail.category || '—'}</span>
        </div>

        {onOpenInGlobalTasks && (
          <button
            type="button"
            onClick={() => onOpenInGlobalTasks(detail.id)}
            className="sq-press mb-4 inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--brand)]"
          >
            <Icon name="external-link" className="w-3 h-3" />
            In Tasks öffnen
          </button>
        )}

        <VehicleMetaSection title="Fahrzeug">
          <p className="text-[12px] font-semibold text-foreground">{vehicle?.license ?? '—'}</p>
          <p className="text-[11px] text-muted-foreground">
            {[vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || '—'}
          </p>
        </VehicleMetaSection>

        <VehicleMetaSection title="Zuweisung & Termine">
          {isActiveTaskStatus(detail.status) && (
            <button
              type="button"
              onClick={() => setEditingMeta((value) => !value)}
              className="sq-press mb-2 text-[10px] font-semibold text-[color:var(--brand)]"
            >
              {editingMeta ? 'Bearbeitung abbrechen' : 'Bearbeiten'}
            </button>
          )}
          {editingMeta && isActiveTaskStatus(detail.status) ? (
            <div className="space-y-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Zuständig
                <select
                  value={assignDraft}
                  onChange={(e) => setAssignDraft(e.target.value)}
                  disabled={mutating}
                  className="mt-1 w-full rounded-lg border border-border surface-premium px-2.5 py-2 text-xs"
                >
                  <option value="">Nicht zugewiesen</option>
                  {orgMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Fällig am
                <input
                  type="date"
                  value={dueDraft}
                  onChange={(e) => setDueDraft(e.target.value)}
                  disabled={mutating}
                  className="mt-1 w-full rounded-lg border border-border surface-premium px-2.5 py-2 text-xs"
                />
              </label>
              <button
                type="button"
                disabled={mutating}
                onClick={() => void handleSaveMeta()}
                className="sq-cta px-3 py-2 text-[11px] font-semibold disabled:opacity-60"
              >
                Speichern
              </button>
            </div>
          ) : (
            <div className="space-y-1.5 text-[11px]">
              <MetaRow label="Zuständig" value={assigneeName} />
              <MetaRow label="Fällig" value={formatTaskDate(detail.dueDate)} highlight={detail.isOverdue} />
              <MetaRow label="Erstellt" value={formatTaskDateTime(detail.createdAt)} />
              <MetaRow label="Aktualisiert" value={formatTaskDateTime(detail.updatedAt)} />
              {detail.startedAt && <MetaRow label="Gestartet" value={formatTaskDateTime(detail.startedAt)} />}
              {detail.completedAt && (
                <MetaRow label="Abgeschlossen" value={formatTaskDateTime(detail.completedAt)} />
              )}
              {detail.cancelledAt && (
                <MetaRow label="Storniert" value={formatTaskDateTime(detail.cancelledAt)} />
              )}
            </div>
          )}
        </VehicleMetaSection>

        <HealthTaskContextPanel
          task={detail}
          onOpenVehicleHealth={vehicle?.id ? () => onOpenChange(false) : undefined}
        />
      </>
    ) : null;

  return (
    <>
      <TaskDetailShell
        variant="drawer"
        open={open}
        onOpenChange={onOpenChange}
        model={detailModel}
        loading={loading}
        density="desktop"
        widthClassName="sm:max-w-xl"
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
          beforeSections: vehicleContextSlot,
        }}
      >
        {!loading && loadError && (
          <div className="rounded-xl border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical-soft)] px-3 py-3 text-[12px] text-foreground">
            <p className="font-medium">Aufgabe konnte nicht geladen werden</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {import.meta.env.DEV ? loadError : 'Bitte versuchen Sie es erneut.'}
            </p>
            <button
              type="button"
              onClick={() => void loadDetail()}
              className="mt-2.5 inline-flex items-center gap-1 rounded-lg border border-border surface-premium px-3 py-1.5 text-[11px] font-semibold sq-press hover:bg-muted"
            >
              Erneut laden
            </button>
          </div>
        )}
      </TaskDetailShell>

      {taskActions.dialogs}
    </>
  );
}

function VehicleMetaSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-border/50 bg-muted/10 p-3">
      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

function MetaRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`font-medium tabular-nums ${highlight ? 'text-[color:var(--status-critical)]' : 'text-foreground'}`}
      >
        {value}
      </span>
    </div>
  );
}
