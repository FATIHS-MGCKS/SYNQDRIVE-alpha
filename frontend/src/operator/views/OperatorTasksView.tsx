import { useCallback, useEffect, useMemo, useState } from 'react';
import { ListTodo, Plus } from 'lucide-react';
import { apiTaskPriorityLabelDe } from '../../lib/tasks/task-labels';
import { api, type ApiTask, type ApiTaskPriority } from '../../lib/api';
import { EmptyState, ErrorState, SkeletonRows } from '../../components/patterns';
import { bookingRef } from '../../rental/components/bookings/bookingUtils';
import { useFleetVehicles } from '../../rental/FleetContext';
import { useRentalOrg } from '../../rental/RentalContext';
import { useOperatorData } from '../context/OperatorDataContext';
import { useOperatorShell } from '../context/OperatorShellContext';
import { OperatorTabletFrame } from '../components/OperatorTabletFrame';
import { useOperatorTabletLayout } from '../hooks/useOperatorTabletLayout';
import { OperatorTaskCardConnected } from '../tasks/OperatorTaskCardConnected';
import { OperatorTaskDetail } from '../tasks/OperatorTaskDetail';
import { filterCanonicalOperatorTasks } from '../tasks/operatorTodayTasks';
import {
  buildFleetVehicleById,
  formatFleetVehicleLabel,
} from '../tasks/operatorTaskDisplay.utils';
import {
  buildTaskListApiFilters,
  DEFAULT_OPERATOR_TASK_FILTERS,
  filterOperatorTasks,
  getOperatorUserId,
  sortOperatorTasks,
  type OperatorTaskViewFilters,
} from '../tasks/operatorTask.utils';

type FilterChip = 'today' | 'overdue' | 'vehicle' | 'booking';

const PRIORITY_OPTIONS: Array<ApiTaskPriority | 'all'> = ['all', 'CRITICAL', 'HIGH', 'NORMAL', 'LOW'];

export function OperatorTasksView() {
  const { orgId } = useRentalOrg();
  const { taskSummary, tasksLoading, tasksError, reloadTasks } = useOperatorData();
  const { fleetVehicles } = useFleetVehicles();
  const { openSheet, pendingTasksBookingId, setPendingTasksBookingId } = useOperatorShell();
  const isTablet = useOperatorTabletLayout();
  const userId = getOperatorUserId();

  const [filters, setFilters] = useState<OperatorTaskViewFilters>(DEFAULT_OPERATOR_TASK_FILTERS);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [focusComment, setFocusComment] = useState(false);
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const [remoteTasks, setRemoteTasks] = useState<ApiTask[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);

  const apiFilters = useMemo(() => buildTaskListApiFilters(filters, userId), [filters, userId]);

  const listFilters = useMemo(
    () => ({ bucket: 'ALL_OPEN' as const, ...apiFilters }),
    [apiFilters],
  );

  const fetchRemoteTasks = useCallback(async () => {
    if (!orgId) {
      setRemoteTasks([]);
      return;
    }
    setRemoteLoading(true);
    try {
      const response = await api.tasks.list(orgId, listFilters);
      setRemoteTasks(sortOperatorTasks(response));
    } catch {
      setRemoteTasks([]);
    } finally {
      setRemoteLoading(false);
    }
  }, [listFilters, orgId]);

  const reloadTaskLists = useCallback(async () => {
    await Promise.all([reloadTasks(), fetchRemoteTasks()]);
  }, [fetchRemoteTasks, reloadTasks]);

  useEffect(() => {
    if (!pendingTasksBookingId) return;
    setFilters((current) => ({ ...current, bookingId: pendingTasksBookingId }));
    setPendingTasksBookingId(null);
  }, [pendingTasksBookingId, setPendingTasksBookingId]);

  useEffect(() => {
    if (!userId) {
      setFilters((f) => (f.scope === 'mine' ? { ...f, scope: 'all' } : f));
    }
  }, [userId]);

  useEffect(() => {
    void fetchRemoteTasks();
  }, [fetchRemoteTasks]);

  const vehicleById = useMemo(() => buildFleetVehicleById(fleetVehicles), [fleetVehicles]);

  const sourceTasks = remoteTasks;
  const canonicalTasks = useMemo(
    () => filterCanonicalOperatorTasks(sourceTasks),
    [sourceTasks],
  );

  const vehicleOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const t of canonicalTasks) if (t.vehicleId) ids.add(t.vehicleId);
    return [...ids].map((id) => ({
      id,
      label: formatFleetVehicleLabel(vehicleById.get(id)) ?? 'Fahrzeug',
    }));
  }, [canonicalTasks, vehicleById]);

  const bookingOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const t of canonicalTasks) if (t.bookingId) ids.add(t.bookingId);
    return [...ids];
  }, [canonicalTasks]);

  const filtered = useMemo(
    () => filterOperatorTasks(canonicalTasks, filters, userId),
    [canonicalTasks, filters, userId],
  );

  const selectedTask =
    filtered.find((t) => t.id === selectedTaskId) ??
    sourceTasks.find((t) => t.id === selectedTaskId) ??
    null;

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

  const openTask = useCallback(
    (task: ApiTask, options?: { focusComment?: boolean }) => {
      setFocusComment(Boolean(options?.focusComment));
      setSelectedTaskId(task.id);
    },
    [],
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
            className="sq-btn sq-btn-secondary min-h-8 px-2.5 text-[11px]"
          >
            {filters.scope === 'mine' ? 'Alle anzeigen' : 'Nur meine'}
          </button>
        )}
      </div>
      {filters.bookingId && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border surface-premium px-3 py-2">
          <p className="text-xs text-foreground">
            Buchung <span className="font-mono">{bookingRef(filters.bookingId)}</span>
          </p>
          <button
            type="button"
            className="sq-btn sq-btn-secondary px-2 py-1 text-[10px]"
            onClick={() => setFilters((f) => ({ ...f, bookingId: null }))}
          >
            Entfernen
          </button>
        </div>
      )}
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
              ? formatFleetVehicleLabel(vehicleById.get(filters.vehicleId)) ?? 'Fahrzeug'
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
            {p === 'all' ? 'Priorität' : apiTaskPriorityLabelDe(p)}
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
        {(tasksLoading || remoteLoading) && <SkeletonRows rows={5} />}
        {!tasksLoading && !remoteLoading && tasksError && (
          <ErrorState compact error={tasksError} onRetry={() => void reloadTasks()} />
        )}
        {!tasksLoading && !remoteLoading && !tasksError && filtered.length === 0 && (
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
          !remoteLoading &&
          filtered.map((task) => (
            <OperatorTaskCardConnected
              key={task.id}
              task={task}
              vehicleById={vehicleById}
              onOpenTask={openTask}
              onTaskChanged={() => void reloadTaskLists()}
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
      onTaskUpdated={() => {
        void reloadTasks();
        void fetchRemoteTasks();
      }}
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
