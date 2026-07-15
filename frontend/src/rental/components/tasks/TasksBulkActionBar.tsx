import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '../../../components/ui/sheet';
import { api, type ApiTaskPriority } from '../../../lib/api';
import {
  bulkActionFailureMessages,
  formatBulkActionSummary,
  type BulkTaskActionType,
} from '../../lib/taskBulkActions.utils';
import { TASK_FILTER_LABELS } from './tasksListState';
import { Icon } from '../ui/Icon';

export interface TasksBulkActionBarProps {
  orgId: string;
  selectedTaskIds: string[];
  canWriteTasks: boolean;
  assigneeOptions: Array<{ value: string; label: string }>;
  onClearSelection: () => void;
  onCompleted: () => void;
}

type BulkDialogMode = 'assign' | 'priority' | 'dueDate' | 'waiting' | 'cancel' | null;

export function TasksBulkActionBar({
  orgId,
  selectedTaskIds,
  canWriteTasks,
  assigneeOptions,
  onClearSelection,
  onCompleted,
}: TasksBulkActionBarProps) {
  const [dialog, setDialog] = useState<BulkDialogMode>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<ApiTaskPriority>('NORMAL');
  const [dueDate, setDueDate] = useState('');
  const [shiftDays, setShiftDays] = useState('1');
  const [dueMode, setDueMode] = useState<'absolute' | 'shift'>('shift');
  const [loading, setLoading] = useState(false);

  if (!canWriteTasks || selectedTaskIds.length === 0) return null;

  const count = selectedTaskIds.length;

  const runBulk = async (
    action: BulkTaskActionType,
    payload: Record<string, unknown> = {},
  ) => {
    setLoading(true);
    try {
      const result = await api.tasks.bulk(orgId, {
        taskIds: selectedTaskIds,
        action,
        ...payload,
      });
      const summary = formatBulkActionSummary(result);
      if (result.failed === 0) {
        toast.success(summary);
      } else if (result.succeeded === 0) {
        toast.error(summary, {
          description: bulkActionFailureMessages(result).slice(0, 3).join('\n'),
        });
      } else {
        toast.warning(summary, {
          description: bulkActionFailureMessages(result).slice(0, 3).join('\n'),
        });
      }
      onClearSelection();
      onCompleted();
      setDialog(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Massenaktion fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        className="sticky bottom-3 z-30 mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--brand)]/30 bg-background/95 px-4 py-3 shadow-[var(--shadow-2)] backdrop-blur-md"
        data-testid="tasks-bulk-action-bar"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="rounded-full bg-[color:var(--brand-soft)] px-2.5 py-1 text-xs tabular-nums">
            {count}
          </span>
          <span>{count === 1 ? 'Aufgabe ausgewählt' : 'Aufgaben ausgewählt'}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setDialog('assign')}>
            Zuweisen
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setDialog('priority')}>
            Priorität
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setDialog('dueDate')}>
            Fälligkeit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void runBulk('set_waiting')}
          >
            Wartend
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-[color:var(--status-critical)]"
            onClick={() => setDialog('cancel')}
          >
            Abbrechen
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClearSelection}>
            Auswahl aufheben
          </Button>
        </div>
      </div>

      <Sheet open={dialog === 'assign'} onOpenChange={(open) => !open && setDialog(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6 pt-4">
          <SheetTitle className="mb-4 text-base font-semibold">Zuweisen</SheetTitle>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Verantwortlicher</span>
            <select
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
            >
              <option value="">Zuweisung aufheben</option>
              {assigneeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-5 flex gap-2">
            <Button type="button" variant="neutral" className="flex-1" onClick={() => setDialog(null)}>
              Abbrechen
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={loading}
              onClick={() =>
                void runBulk('assign', { assignedUserId: assigneeId || null })
              }
            >
              Zuweisen
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={dialog === 'priority'} onOpenChange={(open) => !open && setDialog(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6 pt-4">
          <SheetTitle className="mb-4 text-base font-semibold">Priorität ändern</SheetTitle>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as ApiTaskPriority)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
          >
            {(Object.keys(TASK_FILTER_LABELS.priority) as ApiTaskPriority[]).map((key) => (
              <option key={key} value={key}>
                {TASK_FILTER_LABELS.priority[key]}
              </option>
            ))}
          </select>
          <div className="mt-5 flex gap-2">
            <Button type="button" variant="neutral" className="flex-1" onClick={() => setDialog(null)}>
              Abbrechen
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={loading}
              onClick={() => void runBulk('set_priority', { priority })}
            >
              Speichern
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={dialog === 'dueDate'} onOpenChange={(open) => !open && setDialog(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6 pt-4">
          <SheetTitle className="mb-4 text-base font-semibold">Fälligkeit verschieben</SheetTitle>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={dueMode === 'shift' ? 'primary' : 'outline'}
                onClick={() => setDueMode('shift')}
              >
                Tage verschieben
              </Button>
              <Button
                type="button"
                size="sm"
                variant={dueMode === 'absolute' ? 'primary' : 'outline'}
                onClick={() => setDueMode('absolute')}
              >
                Datum setzen
              </Button>
            </div>
            {dueMode === 'shift' ? (
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">Tage (+/-)</span>
                <input
                  type="number"
                  value={shiftDays}
                  onChange={(event) => setShiftDays(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </label>
            ) : (
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">Neues Fälligkeitsdatum</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </label>
            )}
          </div>
          <div className="mt-5 flex gap-2">
            <Button type="button" variant="neutral" className="flex-1" onClick={() => setDialog(null)}>
              Abbrechen
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={loading}
              onClick={() =>
                void runBulk(
                  'shift_due_date',
                  dueMode === 'shift'
                    ? { dueDateShiftDays: Number(shiftDays) }
                    : { dueDate: dueDate ? new Date(dueDate).toISOString() : undefined },
                )
              }
            >
              Anwenden
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={dialog === 'cancel'} onOpenChange={(open) => !open && setDialog(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6 pt-4">
          <SheetTitle className="mb-4 flex items-center gap-2 text-base font-semibold text-[color:var(--status-critical)]">
            <Icon name="alert-triangle" className="h-4 w-4" />
            {count === 1 ? '1 Aufgabe abbrechen?' : `${count} Aufgaben abbrechen?`}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Abgebrochene Aufgaben können nicht mehr bearbeitet werden. Teilweise Fehler werden pro Aufgabe gemeldet.
          </p>
          <div className="mt-5 flex gap-2">
            <Button type="button" variant="neutral" className="flex-1" onClick={() => setDialog(null)}>
              Zurück
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              disabled={loading}
              onClick={() => void runBulk('cancel')}
            >
              Abbrechen
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
