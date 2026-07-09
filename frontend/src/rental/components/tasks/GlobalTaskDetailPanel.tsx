import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  DetailDrawer,
  PriorityBadge,
  StatusChip,
  Timeline,
  type TimelineItem,
} from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { api, type ApiTask } from '../../../lib/api';
import { getStoredUser } from '../../../lib/auth';
import {
  formatTaskDate,
  formatTaskDateTime,
  isActiveTaskStatus,
  isTerminalTaskStatus,
  taskRequiresResolutionNote,
  taskStatusLabelDe,
  taskStatusTone,
} from '../../lib/task-detail.utils';
import type { OrgMemberRef, TaskListRow } from '../../lib/task-list.utils';
import { resolveCreatorName, resolveDisplaySource, shortTaskId } from '../../lib/task-list.utils';
import { mapApiPriority, vehicleTaskPriorityLabel } from '../../lib/task-display.utils';
import {
  canAssignTasks,
  resolveTaskResponsibility,
  resolveTaskStationId,
} from '../../lib/task-responsibility.utils';
import { formatTaskTimelineTitle } from '../../lib/task-timeline-display.utils';
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

  const timelineItems = useMemo((): TimelineItem[] => {
    if (!detail?.timeline?.length) return [];
    return detail.timeline.map((ev) => ({
      id: ev.id,
      title: formatTaskTimelineTitle(ev, orgMembers),
      time: formatTaskDateTime(ev.createdAt),
    }));
  }, [detail?.timeline, orgMembers]);

  const handleCompleteClick = () => {
    if (!detail) return;
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
    if (!orgId || !detail) return;
    const body = commentDraft.trim();
    if (!body) {
      setCommentError('Notiz darf nicht leer sein.');
      return;
    }
    setCommentError(null);
    await runTaskAction(() => api.tasks.addComment(orgId, detail.id, body));
    setCommentDraft('');
    toast.success('Notiz gespeichert');
  };

  const statusChip =
    detail && taskRow ? (
      <StatusChip tone={taskStatusTone(detail.status, detail.isOverdue)}>
        {taskStatusLabelDe(detail.status)}
        {detail.isOverdue && !isTerminalTaskStatus(detail.status) ? ' · Überfällig' : ''}
      </StatusChip>
    ) : null;

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
          <Button type="button" variant="success" size="sm" disabled={mutating} onClick={handleCompleteClick}>
            <Icon name="check-circle" className="h-3.5 w-3.5" />
            Abschließen
          </Button>
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
      <DetailDrawer
        open={open}
        onOpenChange={onOpenChange}
        title={taskRow?.title ?? 'Aufgabe'}
        description={
          taskRow ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground" title={taskRow.id}>
                {shortTaskId(taskRow.id)}
              </span>
              <span className="text-muted-foreground">·</span>
              <span>Quelle: {taskRow.displaySource}</span>
            </span>
          ) : undefined
        }
        status={statusChip}
        widthClassName="sm:max-w-2xl"
        footer={footer}
      >
        {detailLoading && (
          <div className="space-y-3" aria-busy="true">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-20 animate-pulse rounded-xl bg-muted/60" />
            <div className="h-20 animate-pulse rounded-xl bg-muted/60" />
          </div>
        )}

        {!detailLoading && taskRow && detail && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="space-y-4 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <PriorityBadge
                  priority={detail.priority}
                  label={vehicleTaskPriorityLabel(mapApiPriority(detail.priority))}
                />
                <span className="sq-chip sq-tone-neutral text-[10px]">{taskRow.category}</span>
              </div>

              <Section title="Beschreibung">
                <p className="text-[12px] leading-relaxed text-foreground/90">
                  {taskRow.description?.trim() || '—'}
                </p>
                {taskRow.notes ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">{taskRow.notes}</p>
                ) : null}
              </Section>

              {detail.checklist && detail.checklist.length > 0 && (
                <Section title="Checkliste">
                  <div className="space-y-1.5">
                    {detail.checklist.map((item) => (
                      <label
                        key={item.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2"
                      >
                        <input
                          type="checkbox"
                          checked={item.isDone}
                          disabled={mutating || isTerminalTaskStatus(detail.status)}
                          onChange={(e) =>
                            void runTaskAction(() =>
                              api.tasks.updateChecklistItem(orgId!, detail.id, item.id, {
                                isDone: e.target.checked,
                              }),
                            )
                          }
                          className="h-4 w-4 accent-[color:var(--status-positive)]"
                        />
                        <span
                          className={`text-[12px] ${item.isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                        >
                          {item.title}
                        </span>
                      </label>
                    ))}
                  </div>
                </Section>
              )}

              <Section title="Notizen">
                {detail.comments && detail.comments.length > 0 ? (
                  <div className="mb-3 space-y-2">
                    {detail.comments.map((c) => (
                      <div key={c.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                        <p className="text-[12px] text-foreground">{c.body}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {c.userId
                            ? orgMembers.find((m) => m.id === c.userId)?.name ?? 'Unbekannter Nutzer'
                            : 'Unbekannter Nutzer'}
                          {' · '}
                          {formatTaskDateTime(c.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mb-3 text-[11px] text-muted-foreground">Noch keine Notizen.</p>
                )}
                {isActiveTaskStatus(detail.status) && (
                  <div className="space-y-2">
                    <textarea
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      disabled={mutating}
                      placeholder="Notiz hinzufügen …"
                      className="min-h-[72px] w-full resize-y rounded-lg border border-border surface-premium px-3 py-2 text-[12px]"
                    />
                    {commentError ? (
                      <p className="text-[10px] font-medium text-[color:var(--status-critical)]">{commentError}</p>
                    ) : null}
                    <Button
                      type="button"
                      variant="neutral"
                      size="sm"
                      disabled={mutating || !commentDraft.trim()}
                      onClick={() => void handleAddComment()}
                    >
                      Notiz speichern
                    </Button>
                  </div>
                )}
              </Section>

              {timelineItems.length > 0 && (
                <Section title="Aktivität">
                  <Timeline items={timelineItems} />
                </Section>
              )}

              {detail.attachments && detail.attachments.length > 0 && (
                <Section title="Anhänge">
                  <div className="space-y-1.5">
                    {detail.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={a.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-[12px] font-medium text-[color:var(--brand)] underline"
                      >
                        {a.fileName ?? a.fileUrl}
                      </a>
                    ))}
                  </div>
                </Section>
              )}
            </div>

            <div className="space-y-3 min-w-0">
              <Section title="Kurzinfo">
                <dl className="space-y-2 text-[12px]">
                  <InfoRow label="Fällig am" value={formatTaskDate(detail.dueDate)} highlight={detail.isOverdue} />
                  <InfoRow label="Erstellt am" value={formatTaskDateTime(detail.createdAt)} />
                  {detail.completedAt && (
                    <InfoRow label="Abgeschlossen" value={formatTaskDateTime(detail.completedAt)} />
                  )}
                  <InfoRow label="Geschätzte Dauer" value={taskRow.estimatedDuration} />
                  <InfoRow label="Station" value={taskRow.station || '—'} />
                </dl>
              </Section>

              <Section title="Verantwortlichkeit">
                <dl className="space-y-2 text-[12px]">
                  <InfoRow
                    label="Zugewiesen an"
                    value={responsibility?.displayName ?? '—'}
                    hint={responsibility?.hint}
                  />
                  <InfoRow
                    label="Erstellt von"
                    value={resolveCreatorName(detail, orgMembers)}
                  />
                  <InfoRow
                    label="Quelle"
                    value={resolveDisplaySource(detail.sourceType, detail.source)}
                  />
                </dl>
                {mayAssign && isActiveTaskStatus(detail.status) ? (
                  <Button
                    type="button"
                    variant="neutral"
                    size="sm"
                    className="mt-3"
                    disabled={mutating}
                    onClick={() => setAssignOpen(true)}
                  >
                    {detail.assignedUserId ? 'Weiterleiten' : 'Zuweisen'}
                  </Button>
                ) : null}
                {responsibility?.requiresAssignment ? (
                  <p className="mt-2 text-[10px] text-[color:var(--status-watch)]">
                    Zuweisung erforderlich — kein Bearbeiter gesetzt.
                  </p>
                ) : null}
              </Section>

              <Section title="Verknüpftes Objekt">
                {taskRow.vehicleId ? (
                  <div className="flex items-start gap-2">
                    <Icon name="car" className="mt-0.5 h-4 w-4 text-[color:var(--brand)]" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-foreground">
                        {taskRow.vehicleLicense || 'Kennzeichen wird geladen…'}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {taskRow.vehicleModel || 'Fahrzeugdaten werden geladen…'}
                        {taskRow.station ? ` · ${taskRow.station}` : ''}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Kein Fahrzeug verknüpft</p>
                )}
              </Section>

              {detail.resolutionNote && (
                <Section title="Abschluss-Notiz">
                  <p className="text-[12px] text-foreground/90">{detail.resolutionNote}</p>
                </Section>
              )}

              <details className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2">
                <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Technische Details
                </summary>
                <dl className="mt-2 space-y-1.5 text-[10px] text-muted-foreground">
                  <InfoRow label="Referenz" value={shortTaskId(detail.id)} />
                  <InfoRow label="Typ" value={detail.type.replace(/_/g, ' ')} />
                  <InfoRow label="Rohquelle" value={detail.source ?? '—'} />
                </dl>
              </details>

              <button
                type="button"
                onClick={onReloadDetail}
                className="text-[10px] font-semibold text-[color:var(--brand)]"
              >
                Detail aktualisieren
              </button>
            </div>
          </div>
        )}
      </DetailDrawer>

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/60 surface-premium p-3">
      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

function InfoRow({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={`text-right font-medium ${highlight ? 'text-[color:var(--status-critical)]' : 'text-foreground'}`}
        >
          {value}
        </span>
      </div>
      {hint ? <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
