import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../../../components/patterns';
import { api, type ApiTask } from '../../../lib/api';
import { buildTaskDetailViewModel, TaskDetailShell } from '../../../lib/tasks';
import type { VehicleData } from '../../data/vehicles';
import {
  formatTaskDate,
  formatTaskDateTime,
  isActiveTaskStatus,
  isTerminalTaskStatus,
  taskRequiresResolutionNote,
  toDateInputValue,
} from '../../lib/task-detail.utils';
import { mapApiPriority, vehicleTaskPriorityLabel } from '../../lib/task-display.utils';
import {
  deriveTaskBlockingBadge,
  deriveTaskSourceBadge,
  taskSourceBadgeLabel,
} from '../../lib/task-operator.utils';
import {
  TaskBlockingBadgePill,
  TaskSourceBadgePill,
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

  const [completeOpen, setCompleteOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);

  const [assignDraft, setAssignDraft] = useState('');
  const [dueDraft, setDueDraft] = useState('');
  const [editingMeta, setEditingMeta] = useState(false);

  const [commentDraft, setCommentDraft] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);

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
    if (!open) {
      setCompleteOpen(false);
      setCancelOpen(false);
      setResolutionNote('');
      setResolutionError(null);
      setActionError(null);
      setCommentDraft('');
      setCommentError(null);
      setEditingMeta(false);
    }
  }, [open]);

  const runAction = async (
    fn: () => Promise<ApiTask>,
    successMessage: string,
  ): Promise<ApiTask | null> => {
    if (!orgId || mutating) return null;
    setMutating(true);
    setActionError(null);
    try {
      const updated = await fn();
      setDetail(updated);
      onTaskUpdated(updated);
      toast.success(successMessage);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Aktion fehlgeschlagen';
      setActionError(message);
      toast.error(message);
      return null;
    } finally {
      setMutating(false);
    }
  };

  const assigneeName = useMemo(() => {
    if (!detail?.assignedUserId) return 'Nicht zugewiesen';
    return orgMembers.find((m) => m.id === detail.assignedUserId)?.name ?? detail.assignedUserId;
  }, [detail?.assignedUserId, orgMembers]);

  const detailModel = useMemo(() => {
    if (!detail) return null;
    return buildTaskDetailViewModel(detail, {
      eyebrow: 'Fahrzeugaufgabe',
      priorityLabel: vehicleTaskPriorityLabel(mapApiPriority(detail.priority)),
      orgMembers,
      vehicleLabel: vehicle?.license ?? undefined,
      vehicleModel: [vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || undefined,
    });
  }, [detail, orgMembers, vehicle]);

  const handleStart = () => {
    if (!orgId || !detail) return;
    void runAction(() => api.tasks.start(orgId, detail.id), 'Aufgabe gestartet');
  };

  const handleWaiting = () => {
    if (!orgId || !detail) return;
    void runAction(() => api.tasks.waiting(orgId, detail.id), 'Aufgabe auf Wartend gesetzt');
  };

  const handleCompleteClick = () => {
    if (!detail) return;
    if (taskRequiresResolutionNote(detail.type)) {
      setResolutionNote(detail.resolutionNote ?? '');
      setResolutionError(null);
      setCompleteOpen(true);
      return;
    }
    void runAction(() => api.tasks.complete(orgId!, detail.id), 'Aufgabe abgeschlossen');
  };

  const handleCompleteConfirm = async () => {
    if (!orgId || !detail) return;
    const note = resolutionNote.trim();
    if (taskRequiresResolutionNote(detail.type) && !note) {
      setResolutionError('Abschluss-Notiz ist für diesen Aufgabentyp erforderlich.');
      return;
    }
    const updated = await runAction(
      () => api.tasks.complete(orgId, detail.id, note ? { resolutionNote: note } : undefined),
      'Aufgabe abgeschlossen',
    );
    if (updated) setCompleteOpen(false);
  };

  const handleCancelConfirm = async () => {
    if (!orgId || !detail) return;
    const updated = await runAction(() => api.tasks.cancel(orgId, detail.id), 'Aufgabe storniert');
    if (updated) setCancelOpen(false);
  };

  const handleChecklistToggle = (itemId: string, isDone: boolean) => {
    if (!orgId || !detail || isTerminalTaskStatus(detail.status)) return;
    void runAction(
      () => api.tasks.updateChecklistItem(orgId, detail.id, itemId, { isDone }),
      isDone ? 'Checklistenpunkt erledigt' : 'Checklistenpunkt zurückgesetzt',
    );
  };

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
    if (!orgId || !detail) return;
    const body = commentDraft.trim();
    if (!body) {
      setCommentError('Kommentar darf nicht leer sein.');
      return;
    }
    setCommentError(null);
    const updated = await runAction(
      () => api.tasks.addComment(orgId, detail.id, body),
      'Kommentar hinzugefügt',
    );
    if (updated) setCommentDraft('');
  };

  const handlePrimaryAction = () => {
    if (!detail || mutating) return;
    if (detail.status === 'OPEN' || detail.status === 'WAITING') {
      handleStart();
      return;
    }
    if (detail.status === 'IN_PROGRESS') {
      handleCompleteClick();
    }
  };

  const renderFooter = () => {
    if (!detail || loading) return null;
    if (isTerminalTaskStatus(detail.status)) {
      return (
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            {detail.status === 'DONE' ? 'Abgeschlossen' : 'Storniert'} — keine weiteren Aktionen
          </span>
          {onOpenInGlobalTasks && (
            <button
              type="button"
              onClick={() => onOpenInGlobalTasks(detail.id)}
              className="sq-press text-[10px] font-semibold text-[color:var(--brand)]"
            >
              In Tasks öffnen
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="flex w-full flex-wrap items-center gap-2">
        {(detail.status === 'OPEN' || detail.status === 'WAITING') && (
          <button
            type="button"
            disabled={mutating}
            onClick={handleStart}
            className="sq-cta inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold disabled:opacity-60"
          >
            <Icon name="play" className="w-3.5 h-3.5" />
            {detail.status === 'WAITING' ? 'Fortsetzen' : 'Starten'}
          </button>
        )}
        {detail.status === 'IN_PROGRESS' && (
          <button
            type="button"
            disabled={mutating}
            onClick={handleWaiting}
            className="sq-press inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-semibold disabled:opacity-60"
          >
            <Icon name="pause" className="w-3.5 h-3.5" />
            Wartend
          </button>
        )}
        {isActiveTaskStatus(detail.status) && (
          <button
            type="button"
            disabled={mutating}
            onClick={handleCompleteClick}
            className="sq-press inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--status-positive)]/30 bg-[color:var(--status-positive-soft)] px-3 py-2 text-[11px] font-semibold text-[color:var(--status-positive)] disabled:opacity-60"
          >
            <Icon name="check-circle" className="w-3.5 h-3.5" />
            Abschließen
          </button>
        )}
        <button
          type="button"
          disabled={mutating || detail.status === 'DONE'}
          onClick={() => setCancelOpen(true)}
          className="sq-press ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--status-critical)]/30 px-3 py-2 text-[11px] font-semibold text-[color:var(--status-critical)] disabled:opacity-60"
        >
          <Icon name="x" className="w-3.5 h-3.5" />
          Stornieren
        </button>
      </div>
    );
  };

  const vehicleContextSlot: ReactNode =
    detail && !loading && !loadError ? (
      <>
        {actionError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {actionError}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <TaskSourceBadgePill label={taskSourceBadgeLabel(deriveTaskSourceBadge(detail))} />
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
        footer={renderFooter()}
        bodyProps={{
          onPrimaryAction: handlePrimaryAction,
          checklistDisabled: mutating || !detail || isTerminalTaskStatus(detail?.status ?? 'DONE'),
          onChecklistToggle: handleChecklistToggle,
          commentDraft,
          onCommentDraftChange: setCommentDraft,
          onAddComment: () => void handleAddComment(),
          commentError,
          showCommentForm: Boolean(detail && isActiveTaskStatus(detail.status)),
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

      <ConfirmDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        title="Aufgabe abschließen"
        description={
          taskRequiresResolutionNote(detail?.type ?? 'CUSTOM')
            ? 'Für diesen Aufgabentyp ist eine Abschluss-Notiz erforderlich.'
            : 'Optional können Sie eine Abschluss-Notiz hinterlegen.'
        }
        confirmLabel="Abschließen"
        cancelLabel="Abbrechen"
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
            className="mt-1.5 min-h-[80px] w-full resize-y rounded-lg border border-border surface-premium px-3 py-2 text-xs text-foreground"
            placeholder="Ergebnis / durchgeführte Maßnahmen dokumentieren"
          />
        </label>
        {resolutionError && (
          <p className="mt-1 text-[10px] font-medium text-red-600 dark:text-red-400">{resolutionError}</p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Aufgabe stornieren?"
        description="Die Aufgabe wird als storniert markiert und kann nicht mehr bearbeitet werden."
        confirmLabel="Stornieren"
        cancelLabel="Abbrechen"
        loading={mutating}
        tone="critical"
        onConfirm={() => void handleCancelConfirm()}
      />
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
