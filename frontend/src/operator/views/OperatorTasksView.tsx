import { useCallback, useEffect, useMemo, useState } from 'react';
import { ListTodo, Plus } from 'lucide-react';
import type { ApiTask, ApiTaskPriority } from '../../lib/api';
import { EmptyState, ErrorState, SkeletonRows } from '../../components/patterns';
import { useFleetVehicles } from '../../rental/FleetContext';
import { useOperatorData } from '../context/OperatorDataContext';
import { useOperatorShell } from '../context/OperatorShellContext';
import { OperatorTabletFrame } from '../components/OperatorTabletFrame';
import { useOperatorTabletLayout } from '../hooks/useOperatorTabletLayout';
import { OperatorTaskCard } from '../tasks/OperatorTaskCard';
import { OperatorTaskDetail } from '../tasks/OperatorTaskDetail';
import {
  DEFAULT_OPERATOR_TASK_FILTERS,
  filterOperatorTasks,
  getOperatorUserId,
  type OperatorTaskViewFilters,
} from '../tasks/operatorTask.utils';
import { useOperatorTaskActions } from '../tasks/useOperatorTaskActions';
import { taskRequiresResolutionNote } from '../../rental/lib/task-detail.utils';

type FilterChip = 'today' | 'overdue' | 'vehicle' | 'booking';

const PRIORITY_OPTIONS: Array<ApiTaskPriority | 'all'> = ['all', 'CRITICAL', 'HIGH', 'NORMAL', 'LOW'];

export function OperatorTasksView() {
  const { tasks, taskSummary, tasksLoading, tasksError, reloadTasks } = useOperatorData();
  const { fleetVehicles } = useFleetVehicles();
  const { openSheet } = useOperatorShell();
  const isTablet = useOperatorTabletLayout();
  const userId = getOperatorUserId();

  const [filters, setFilters] = useState<OperatorTaskViewFilters>(DEFAULT_OPERATOR_TASK_FILTERS);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [focusComment, setFocusComment] = useState(false);
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);

  const { mutating, start, complete } = useOperatorTaskActions(() => {
    void reloadTasks();
  });

  useEffect(() => {
    if (!userId) {
      setFilters((f) => (f.scope === 'mine' ? { ...f, scope: 'all' } : f));
    }
  }, [userId]);

  const vehicleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of fleetVehicles) m.set(v.id, v.license || v.model);
    return m;
  }, [fleetVehicles]);

  const vehicleOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tasks) if (t.vehicleId) ids.add(t.vehicleId);
    return [...ids].map((id) => ({ id, label: vehicleMap.get(id) ?? id.slice(0, 8) }));
  }, [tasks, vehicleMap]);

  const bookingOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tasks) if (t.bookingId) ids.add(t.bookingId);
    return [...ids];
  }, [tasks]);

  const filtered = useMemo(
    () => filterOperatorTasks(tasks, filters, userId),
    [tasks, filters, userId],
  );

  const selectedTask = filtered.find((t) => t.id === selectedTaskId) ?? tasks.find((t) => t.id === selectedTaskId) ?? null;

  const listTitle =
    filters.scope === 'mine' && userId ? 'Meine Aufgaben' : 'Offene operative Aufgaben';

  const toggleChip = (chip: FilterChip) => {
    setFilters((f) => {
      if (chip === 'vehicle') {
        if (f.vehicleId) return { ...f, vehicleId: null };
        setVehiclePickerOpen(true);
        return f;
      }
      if (chip === 'booking') {
        const next = bookingOptions[0] ?? null;
        return { ...f, bookingId: f.bookingId ? null : next };
      }
      if (chip === 'today') return { ...f, today: !f.today };
      if (chip === 'overdue') return { ...f, overdue: !f.overdue };
      return f;
    });
  };

  const handleQuickComplete = useCallback(
    async (task: ApiTask) => {
      if (taskRequiresResolutionNote(task.type)) {
        setSelectedTaskId(task.id);
        setFocusComment(false);
        return;
      }
      await complete(task.id);
    },
    [complete],
  );

  const summaryRow = taskSummary && (
    <div className="grid grid-cols-3 gap-2 shrink-0">
      {[
        { label: 'Offen', value: taskSummary.open },
        { label: 'Heute', value: taskSummary.dueToday },
        { label: 'Überfällig', value: taskSummary.overdue },
      ].map((s) => (
        <div key={s.label} className="rounded-xl border border-border/50 bg-muted/20 px-2 py-2 text-center">
          <p className="text-lg font-bold tabular-nums text-foreground">{s.value}</p>
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );

  const filterBar = (
    <div className="shrink-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{listTitle}</p>
        {userId && (
          <button
            type="button"
            onClick={() =>
              setFilters((f) => ({ ...f, scope: f.scope === 'mine' ? 'all' : 'mine' }))
            }
            className="text-xs font-semibold text-[color:var(--brand-ink)]"
          >
            {filters.scope === 'mine' ? 'Alle anzeigen' : 'Nur meine'}
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(['today', 'overdue', 'vehicle', 'booking'] as FilterChip[]).map((chip) => {
          const active =
            (chip === 'today' && filters.today) ||
            (chip === 'overdue' && filters.overdue) ||
            (chip === 'vehicle' && Boolean(filters.vehicleId)) ||
            (chip === 'booking' && Boolean(filters.bookingId));
          const labels: Record<FilterChip, string> = {
            today: 'Heute',
            overdue: 'Überfällig',
            vehicle: filters.vehicleId
              ? vehicleMap.get(filters.vehicleId) ?? 'Fahrzeug'
              : 'Fahrzeug',
            booking: filters.bookingId ? 'Buchung ✓' : 'Buchung',
          };
          return (
            <button
              key={chip}
              type="button"
              onClick={() => toggleChip(chip)}
              className={`sq-press shrink-0 rounded-full border px-3 py-2 text-xs font-semibold ${
                active
                  ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                  : 'border-border surface-premium text-foreground'
              }`}
            >
              {labels[chip]}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PRIORITY_OPTIONS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setFilters((f) => ({ ...f, priority: p }))}
            className={`sq-press shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase ${
              filters.priority === p
                ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                : 'border-border surface-premium text-muted-foreground'
            }`}
          >
            {p === 'all' ? 'Priorität' : p}
          </button>
        ))}
      </div>
      {vehiclePickerOpen && vehicleOptions.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-border surface-premium p-2">
          {vehicleOptions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setFilters((f) => ({ ...f, vehicleId: v.id }));
                setVehiclePickerOpen(false);
              }}
              className="sq-press rounded-lg border border-border px-2 py-1 text-xs font-semibold"
            >
              {v.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setVehiclePickerOpen(false)}
            className="text-xs text-muted-foreground"
          >
            Schließen
          </button>
        </div>
      )}
    </div>
  );

  const listContent = (
    <div className="flex h-full min-h-0 flex-col space-y-3">
      {summaryRow}
      {filterBar}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-2">
        {tasksLoading && <SkeletonRows rows={5} />}
        {!tasksLoading && tasksError && (
          <ErrorState compact error={tasksError} onRetry={() => void reloadTasks()} />
        )}
        {!tasksLoading && !tasksError && filtered.length === 0 && (
          <EmptyState
            compact
            icon={<ListTodo className="h-5 w-5" />}
            title="Keine offenen Aufgaben"
            description={
              filters.scope === 'mine'
                ? 'Dir sind keine offenen Aufgaben zugewiesen.'
                : 'Alle Aufgaben erledigt — oder Filter zu eng.'
            }
          />
        )}
        {!tasksLoading &&
          filtered.map((task) => (
            <OperatorTaskCard
              key={task.id}
              task={task}
              vehicleLabel={task.vehicleId ? vehicleMap.get(task.vehicleId) : null}
              bookingLabel={task.bookingId ? `Buchung ${task.bookingId.slice(0, 8)}…` : null}
              disabled={mutating}
              onOpen={() => {
                setFocusComment(false);
                setSelectedTaskId(task.id);
              }}
              onStart={() => void start(task.id)}
              onComplete={() => void handleQuickComplete(task)}
              onComment={() => {
                setFocusComment(true);
                setSelectedTaskId(task.id);
              }}
            />
          ))}
      </div>
    </div>
  );

  const detailContent = selectedTask ? (
    <OperatorTaskDetail
      taskId={selectedTask.id}
      initialTask={selectedTask}
      focusComment={focusComment}
      onTaskUpdated={() => void reloadTasks()}
    />
  ) : (
    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
      Aufgabe für Details wählen
    </div>
  );

  const createFab = (
    <button
      type="button"
      onClick={() => openSheet({ type: 'task-create', vehicleLabel: 'Neue Aufgabe' })}
      className="sq-press fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--brand)] text-white shadow-lg"
      style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom))' }}
      aria-label="Aufgabe erstellen"
    >
      <Plus className="h-6 w-6" />
    </button>
  );

  if (isTablet) {
    return (
      <>
        <OperatorTabletFrame list={listContent} detail={detailContent} showDetail={Boolean(selectedTask)} />
        {createFab}
      </>
    );
  }

  if (selectedTask) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          className="min-h-[44px] text-sm font-semibold text-[color:var(--brand-ink)]"
          onClick={() => {
            setSelectedTaskId(null);
            setFocusComment(false);
          }}
        >
          ← Zurück zur Liste
        </button>
        {detailContent}
      </div>
    );
  }

  return (
    <>
      {listContent}
      {createFab}
    </>
  );
}
