import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, type ApiTask } from '../../lib/api';
import { buildTaskDetailViewModel, TaskDetailShell } from '../../lib/tasks';
import { useRentalOrg } from '../../rental/RentalContext';
import { useFleetVehicles } from '../../rental/FleetContext';
import {
  isActiveTaskStatus,
  isTerminalTaskStatus,
  taskRequiresResolutionNote,
} from '../../rental/lib/task-detail.utils';
import { useOperatorTaskActions } from './useOperatorTaskActions';

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

  const vehicle = task?.vehicleId
    ? fleetVehicles.find((entry) => entry.id === task.vehicleId)
    : undefined;

  const detailModel = useMemo(() => {
    if (!task) return null;
    return buildTaskDetailViewModel(task, {
      vehicleLabel: vehicle?.license ?? undefined,
      vehicleModel: [vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || undefined,
    });
  }, [task, vehicle]);

  const handleComplete = async () => {
    if (!task) return;
    if (taskRequiresResolutionNote(task.type) && !completeNote.trim()) {
      setShowCompleteNote(true);
      return;
    }
    const updated = await complete(
      task.id,
      completeNote.trim() ? { resolutionNote: completeNote.trim() } : undefined,
    );
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

  const handlePrimaryAction = () => {
    if (!task || mutating) return;
    if (task.status === 'OPEN' || task.status === 'WAITING') {
      void start(task.id);
      return;
    }
    if (task.status === 'IN_PROGRESS') {
      void handleComplete();
    }
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

  const actionFooter = active ? (
    <div
      className="fixed inset-x-0 z-[45] border-t border-border/50 surface-frosted px-4 py-3"
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
  ) : null;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 pb-28">
        <TaskDetailShell
          variant="inline"
          model={detailModel}
          loading={false}
          density="mobile"
          bodyProps={{
            onPrimaryAction: handlePrimaryAction,
            checklistDisabled: !active || mutating,
            onChecklistToggle: (itemId, isDone) => void toggleChecklist(task.id, itemId, isDone),
            commentDraft,
            onCommentDraftChange: setCommentDraft,
            onAddComment: () => void handleAddComment(),
            commentError,
            showCommentForm: active,
            focusComment,
            afterSections: showCompleteNote && active ? (
              <div className="mt-4 space-y-2 rounded-2xl border border-[color:var(--status-watch)]/35 bg-[color:var(--status-watch)]/[0.06] p-4">
                <p className="text-sm font-semibold">Abschluss-Notiz erforderlich</p>
                <textarea
                  value={completeNote}
                  onChange={(event) => setCompleteNote(event.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-border surface-premium px-3 py-2 text-sm"
                  placeholder="Was wurde erledigt?"
                />
              </div>
            ) : null,
          }}
        />
      </div>

      {actionFooter}

      {terminal && (
        <p className="pb-4 text-center text-xs text-muted-foreground">
          {task.status === 'DONE' ? 'Aufgabe abgeschlossen' : 'Aufgabe storniert'}
        </p>
      )}
    </div>
  );
}
