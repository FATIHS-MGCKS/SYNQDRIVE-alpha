import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  DetailDrawer,
  PriorityBadge,
  StatusChip,
  Timeline,
  type TimelineItem,
} from '../../../components/patterns';
import { api, type ApiTask } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import {
  formatTaskDate,
  formatTaskDateTime,
  isActiveTaskStatus,
  isTerminalTaskStatus,
  taskRequiresResolutionNote,
  taskStatusLabelDe,
  taskStatusTone,
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

  const timelineItems = useMemo((): TimelineItem[] => {
    if (!detail?.timeline?.length) return [];
    return detail.timeline.map((ev) => ({
      id: ev.id,
      title: ev.type.replace(/_/g, ' '),
      time: formatTaskDateTime(ev.createdAt),
      description:
        ev.oldValue || ev.newValue ? `${ev.oldValue ?? '—'} → ${ev.newValue ?? '—'}` : undefined,
    }));
  }, [detail?.timeline]);

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
    void runAction(
      () => api.tasks.complete(orgId!, detail.id),
      'Aufgabe abgeschlossen',
    );
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

  const statusChip = detail ? (
    <StatusChip tone={taskStatusTone(detail.status, detail.isOverdue)}>
      {taskStatusLabelDe(detail.status)}
      {detail.isOverdue && detail.status !== 'DONE' && detail.status !== 'CANCELLED' ? ' · Überfällig' : ''}
    </StatusChip>
  ) : null;

  return (
    <>
      <DetailDrawer
        open={open}
        onOpenChange={onOpenChange}
        eyebrow="Fahrzeugaufgabe"
        title={detail?.title ?? 'Aufgabe'}
        description={detail?.description?.trim() || undefined}
        status={statusChip}
        widthClassName="sm:max-w-xl"
        footer={renderFooter()}
      >
        {loading && (
          <div className="space-y-3" aria-hidden>
            <div className="flex gap-2">
              <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
              <div className="h-5 w-14 rounded-full bg-muted animate-pulse" />
            </div>
            <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
            <div className="h-24 rounded-xl bg-muted/60 animate-pulse" />
            <div className="h-24 rounded-xl bg-muted/60 animate-pulse" />
          </div>
        )}

        {!loading && loadError && (
          <div className="rounded-xl border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical-soft)] px-3 py-3 text-[12px] text-foreground">
            <p className="font-medium">Aufgabe konnte nicht geladen werden</p>
            <p className="mt-1 text-muted-foreground text-[11px]">
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

        {!loading && detail && (
          <div className="space-y-4">
            {actionError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {actionError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <PriorityBadge
                priority={detail.priority}
                label={vehicleTaskPriorityLabel(mapApiPriority(detail.priority))}
              />
              <TaskSourceBadgePill label={taskSourceBadgeLabel(deriveTaskSourceBadge(detail))} />
              <TaskBlockingBadgePill badge={deriveTaskBlockingBadge(detail)} />
              <span className="sq-chip sq-tone-neutral text-[10px]">{detail.category || '—'}</span>
              <span className="sq-chip sq-tone-neutral text-[10px]">{detail.type.replace(/_/g, ' ')}</span>
            </div>

            {onOpenInGlobalTasks && (
              <button
                type="button"
                onClick={() => onOpenInGlobalTasks(detail.id)}
                className="sq-press inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--brand)]"
              >
                <Icon name="external-link" className="w-3 h-3" />
                In Tasks öffnen
              </button>
            )}

            <MetaSection title="Fahrzeug">
              <p className="text-[12px] font-semibold text-foreground">{vehicle?.license ?? '—'}</p>
              <p className="text-[11px] text-muted-foreground">
                {[vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || '—'}
              </p>
            </MetaSection>

            <MetaSection title="Zuweisung & Termine">
              {isActiveTaskStatus(detail.status) && (
                <button
                  type="button"
                  onClick={() => setEditingMeta((v) => !v)}
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
                      {orgMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
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
            </MetaSection>

            <MetaSection title="Quelle">
              <div className="space-y-1.5 text-[11px]">
                <MetaRow label="Quelltyp" value={detail.sourceType} />
                {detail.source && <MetaRow label="Quelle" value={detail.source} />}
              </div>
            </MetaSection>

            <HealthTaskContextPanel
              task={detail}
              onOpenVehicleHealth={
                vehicle?.id
                  ? () => onOpenChange(false)
                  : undefined
              }
            />

            {detail.resolutionNote && (
              <MetaSection title="Abschluss-Notiz">
                <p className="text-[12px] text-foreground/90">{detail.resolutionNote}</p>
              </MetaSection>
            )}

            <MetaSection title="Checkliste">
              {detail.checklist && detail.checklist.length > 0 ? (
                <div className="space-y-1.5">
                  {detail.checklist.map((item) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        checked={item.isDone}
                        disabled={mutating || isTerminalTaskStatus(detail.status)}
                        onChange={(e) => handleChecklistToggle(item.id, e.target.checked)}
                        className="h-4 w-4 rounded accent-[color:var(--status-positive)]"
                      />
                      <span
                        className={`text-[11px] ${item.isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                      >
                        {item.title}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Keine Checkliste für diese Aufgabe.</p>
              )}
            </MetaSection>

            <MetaSection title="Kommentare">
              {detail.comments && detail.comments.length > 0 ? (
                <div className="mb-3 space-y-2">
                  {detail.comments.map((c) => (
                    <div key={c.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                      <p className="text-[11px] text-foreground">{c.body}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{formatTaskDateTime(c.createdAt)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mb-3 text-[11px] text-muted-foreground">Noch keine Kommentare.</p>
              )}
              {isActiveTaskStatus(detail.status) && (
                <div className="space-y-2">
                  <textarea
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    disabled={mutating}
                    placeholder="Neuer Kommentar…"
                    className="min-h-[64px] w-full resize-y rounded-lg border border-border surface-premium px-3 py-2 text-xs"
                  />
                  {commentError && (
                    <p className="text-[10px] font-medium text-red-600 dark:text-red-400">{commentError}</p>
                  )}
                  <button
                    type="button"
                    disabled={mutating || !commentDraft.trim()}
                    onClick={() => void handleAddComment()}
                    className="sq-press rounded-lg border border-border px-3 py-2 text-[11px] font-semibold disabled:opacity-60"
                  >
                    Kommentar hinzufügen
                  </button>
                </div>
              )}
            </MetaSection>

            <MetaSection title="Anhänge">
              {detail.attachments && detail.attachments.length > 0 ? (
                <div className="space-y-1.5">
                  {detail.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={a.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-[11px] font-medium text-[color:var(--brand)] underline"
                    >
                      {a.fileName ?? a.fileUrl}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Keine Anhänge vorhanden.</p>
              )}
            </MetaSection>

            {timelineItems.length > 0 && (
              <MetaSection title="Verlauf">
                <Timeline items={timelineItems} />
              </MetaSection>
            )}
          </div>
        )}
      </DetailDrawer>

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

function MetaSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-muted/20 p-3">
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
      <span className={`font-medium tabular-nums ${highlight ? 'text-[color:var(--status-critical)]' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}
