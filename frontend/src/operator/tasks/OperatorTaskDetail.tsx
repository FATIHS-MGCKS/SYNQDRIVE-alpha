import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Paperclip } from 'lucide-react';
import { PriorityBadge, StatusChip } from '../../components/patterns';
import { api, type ApiTask } from '../../lib/api';
import { useRentalOrg } from '../../rental/RentalContext';
import { useFleetVehicles } from '../../rental/FleetContext';
import {
  formatTaskDateTime,
  isActiveTaskStatus,
  isTerminalTaskStatus,
  taskRequiresResolutionNote,
  taskStatusLabelDe,
  taskStatusTone,
} from '../../rental/lib/task-detail.utils';
import { useOperatorTaskActions } from './useOperatorTaskActions';
import { formatOperatorTaskDue } from './operatorTask.utils';

interface Props {
  taskId: string;
  initialTask?: ApiTask | null;
  onTaskUpdated?: (task: ApiTask) => void;
  focusComment?: boolean;
  /** `tab` = above bottom nav; `sheet` = full-screen overlay */
  layout?: 'tab' | 'sheet';
}

export function OperatorTaskDetail({ taskId, initialTask, onTaskUpdated, focusComment, layout = 'tab' }: Props) {
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const [task, setTask] = useState<ApiTask | null>(initialTask ?? null);
  const [loading, setLoading] = useState(!initialTask);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [completeNote, setCompleteNote] = useState('');
  const [showCompleteNote, setShowCompleteNote] = useState(false);

  const handleChanged = useCallback(
    (updated: ApiTask) => {
      setTask(updated);
      onTaskUpdated?.(updated);
    },
    [onTaskUpdated],
  );

  const { mutating, start, waiting, complete, addComment, toggleChecklist } =
    useOperatorTaskActions(handleChanged);

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
    if (initialTask && initialTask.id === taskId) {
      setTask(initialTask);
    }
  }, [initialTask, taskId]);

  const vehicleLabel = task?.vehicleId
    ? fleetVehicles.find((v) => v.id === task.vehicleId)?.license ?? task.vehicleId.slice(0, 8)
    : null;

  const handleComplete = async () => {
    if (!task) return;
    if (taskRequiresResolutionNote(task.type) && !completeNote.trim()) {
      setShowCompleteNote(true);
      return;
    }
    const updated = await complete(task.id, completeNote.trim() || undefined);
    if (updated) {
      setShowCompleteNote(false);
      setCompleteNote('');
    }
  };

  const handleAddComment = async () => {
    if (!task) return;
    const body = commentDraft.trim();
    if (!body) {
      setCommentError('Kommentar eingeben.');
      return;
    }
    setCommentError(null);
    const updated = await addComment(task.id, body);
    if (updated) setCommentDraft('');
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

  const terminal = isTerminalTaskStatus(task.status);
  const active = isActiveTaskStatus(task.status);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 pb-28">
        <div>
          <h2 className="text-lg font-bold text-foreground">{task.title}</h2>
          {task.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{task.description}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusChip tone={taskStatusTone(task.status, task.isOverdue)} dot>
            {taskStatusLabelDe(task.status)}
          </StatusChip>
          <PriorityBadge priority={task.priority} />
          {task.blocksVehicleAvailability && <StatusChip tone="critical">Blockiert Verfügbarkeit</StatusChip>}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {task.dueDate && (
            <Meta label="Fällig" value={formatOperatorTaskDue(task.dueDate)} warn={task.isOverdue} />
          )}
          {vehicleLabel && <Meta label="Fahrzeug" value={vehicleLabel} />}
          {task.bookingId && <Meta label="Buchung" value={`${task.bookingId.slice(0, 8)}…`} />}
          {task.customerId && <Meta label="Kunde" value={`${task.customerId.slice(0, 8)}…`} />}
          <Meta label="Typ" value={task.type.replace(/_/g, ' ')} />
          <Meta label="Aktualisiert" value={formatTaskDateTime(task.updatedAt)} />
        </div>

        {task.checklist && task.checklist.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Checkliste</p>
            <div className="space-y-2">
              {task.checklist.map((item) => (
                <label
                  key={item.id}
                  className={`flex min-h-[52px] cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 ${
                    item.isDone ? 'border-[color:var(--status-success)]/30 bg-[color:var(--status-success)]/[0.05]' : 'border-border bg-card'
                  } ${!active || mutating ? 'pointer-events-none opacity-60' : ''}`}
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 ${
                      item.isDone
                        ? 'border-[color:var(--status-success)] bg-[color:var(--status-success)] text-white'
                        : 'border-border bg-background'
                    }`}
                  >
                    {item.isDone && <Check className="h-4 w-4" />}
                  </span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={item.isDone}
                    disabled={!active || mutating}
                    onChange={() => void toggleChecklist(task.id, item.id, !item.isDone)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium ${item.isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {item.title}
                    </span>
                    {item.description && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}

        {task.attachments && task.attachments.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Anhänge</p>
            <div className="space-y-2">
              {task.attachments.map((a) => (
                <a
                  key={a.id}
                  href={a.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-[color:var(--brand-ink)]"
                >
                  <Paperclip className="h-4 w-4 shrink-0" />
                  <span className="truncate">{a.fileName ?? 'Datei'}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        <section>
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Kommentare</p>
          {task.comments && task.comments.length > 0 ? (
            <div className="mb-3 space-y-2">
              {task.comments.map((c) => (
                <div key={c.id} className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-sm">
                  <p className="text-foreground">{c.body}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{formatTaskDateTime(c.createdAt)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-3 text-sm text-muted-foreground">Noch keine Kommentare.</p>
          )}
          {active && (
            <div className="space-y-2">
              <textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                rows={3}
                autoFocus={focusComment}
                placeholder="Kommentar hinzufügen…"
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm resize-y"
              />
              {commentError && <p className="text-xs text-[color:var(--status-critical)]">{commentError}</p>}
              <button
                type="button"
                disabled={mutating}
                onClick={() => void handleAddComment()}
                className="sq-press min-h-[44px] w-full rounded-xl border border-border text-sm font-semibold disabled:opacity-50"
              >
                Kommentar speichern
              </button>
            </div>
          )}
        </section>

        {showCompleteNote && active && (
          <div className="rounded-2xl border border-[color:var(--status-watch)]/35 bg-[color:var(--status-watch)]/[0.06] p-4 space-y-2">
            <p className="text-sm font-semibold">Abschluss-Notiz erforderlich</p>
            <textarea
              value={completeNote}
              onChange={(e) => setCompleteNote(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              placeholder="Was wurde erledigt?"
            />
          </div>
        )}
      </div>

      {active && (
        <div
          className="fixed inset-x-0 z-[45] border-t border-border/50 bg-background/95 px-4 py-3 backdrop-blur-sm"
          style={{
            bottom:
              layout === 'sheet'
                ? 'env(safe-area-inset-bottom)'
                : 'calc(4.5rem + env(safe-area-inset-bottom))',
          }}
        >
          <div className="mx-auto flex max-w-lg gap-2 md:max-w-none">
            {(task.status === 'OPEN' || task.status === 'WAITING') && (
              <button
                type="button"
                disabled={mutating}
                onClick={() => void start(task.id)}
                className="sq-press min-h-[52px] flex-1 rounded-2xl border border-border text-sm font-semibold disabled:opacity-50"
              >
                Starten
              </button>
            )}
            {task.status === 'IN_PROGRESS' && (
              <button
                type="button"
                disabled={mutating}
                onClick={() => void waiting(task.id)}
                className="sq-press min-h-[52px] flex-1 rounded-2xl border border-border text-sm font-semibold disabled:opacity-50"
              >
                Warten
              </button>
            )}
            <button
              type="button"
              disabled={mutating || terminal}
              onClick={() => void handleComplete()}
              className="sq-press min-h-[52px] flex-[2] rounded-2xl bg-[color:var(--status-success)] text-sm font-bold text-white disabled:opacity-50"
            >
              {mutating ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Erledigt markieren'}
            </button>
          </div>
        </div>
      )}

      {terminal && (
        <p className="text-center text-xs text-muted-foreground pb-4">
          {task.status === 'DONE' ? 'Aufgabe abgeschlossen' : 'Aufgabe storniert'}
        </p>
      )}
    </div>
  );
}

function Meta({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-medium ${warn ? 'text-[color:var(--status-critical)]' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}
