import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListTodo } from 'lucide-react';
import { PageHeader, EmptyState, ErrorState } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { api, type ApiServiceCase, type ApiTask, type Station } from '../../lib/api';
import { getStoredUser } from '../../lib/auth';
import {
  matchesTaskDetailInvalidation,
  subscribeTaskQueryInvalidation,
} from '../../lib/tasks';
import { taskEntityOptionLabel } from '../../lib/tasks/entity-label.utils';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useFleetVehicles } from '../FleetContext';
import { useRentalOrg } from '../RentalContext';
import {
  canViewUnassignedTasksBucket,
  tasksPageEmptyState,
  type TasksPageView,
} from '../lib/tasks-page.utils';
import {
  mapApiTaskToTaskListRow,
  type OrgMemberRef,
  type TaskListRow,
} from '../lib/task-list.utils';
import { isActiveApiTask } from '../lib/taskBulkActions.utils';
import { GlobalTaskDetailPanel } from './tasks/GlobalTaskDetailPanel';
import { TaskWorkItemCard } from './tasks/TaskWorkItemCard';
import {
  DEFAULT_TASKS_FILTER_STATE,
  hasActiveTaskFilters,
  TasksFilterPanel,
} from './tasks/TasksFilterPanel';
import { TasksBulkActionBar } from './tasks/TasksBulkActionBar';
import { TasksKpiStrip } from './tasks/TasksKpiStrip';
import { TasksNewTaskDialog } from './tasks/TasksNewTaskDialog';
import { TasksPageViews } from './tasks/TasksPageViews';
import {
  buildTasksListApiParams,
  readTasksListFiltersFromUrl,
  syncTasksListFiltersToUrl,
  type TasksListFilters,
} from './tasks/tasksListState';
import { useTasksPageViewModel } from './tasks/useTasksPageViewModel';
import type { Invoice } from './invoices/invoiceTypes';
import { Icon } from './ui/Icon';

interface TasksViewProps {
  autoOpenNewTask?: boolean;
  onAutoOpenConsumed?: () => void;
  highlightedTaskId?: string | null;
  onHighlightConsumed?: () => void;
}

type Task = TaskListRow;

interface EntityLookupState {
  bookings: Array<{ value: string; label: string }>;
  customers: Array<{ value: string; label: string }>;
  invoices: Array<{ value: string; label: string }>;
  serviceCases: Array<{ value: string; label: string }>;
}

const EMPTY_LOOKUP: EntityLookupState = {
  bookings: [],
  customers: [],
  invoices: [],
  serviceCases: [],
};

export function TasksView({
  autoOpenNewTask,
  onAutoOpenConsumed,
  highlightedTaskId,
  onHighlightConsumed,
}: TasksViewProps) {
  const { fleetVehicles } = useFleetVehicles();
  const { orgId, userRole, hasPermission } = useRentalOrg();
  const currentUserId = getStoredUser()?.id ?? null;
  const canViewUnassigned = canViewUnassignedTasksBucket({ userRole, hasPermission });
  const canWriteTasks = hasPermission('tasks', 'write');

  const [filters, setFilters] = useState<TasksListFilters>(() => ({
    ...DEFAULT_TASKS_FILTER_STATE,
    ...readTasksListFiltersFromUrl(),
  }));
  const [searchDraft, setSearchDraft] = useState(() => filters.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

  const activeView = filters.view;

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailFull, setDetailFull] = useState<ApiTask | null>(null);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [flashingTaskId, setFlashingTaskId] = useState<string | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMemberRef[]>([]);
  const [orgStations, setOrgStations] = useState<Station[]>([]);
  const [entityLookup, setEntityLookup] = useState<EntityLookupState>(EMPTY_LOOKUP);
  const [lookupLoaded, setLookupLoaded] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const taskRowRefs = useRef<Record<string, HTMLElement | null>>({});

  const setActiveView = useCallback((view: TasksPageView) => {
    setFilters((current) => ({ ...current, view }));
  }, []);

  useEffect(() => {
    if (!orgId) {
      setOrgStations([]);
      return;
    }
    let cancelled = false;
    api.stations
      .list(orgId)
      .then((rows) => {
        if (!cancelled) setOrgStations(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setOrgStations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!orgId) {
      setOrgMembers([]);
      return;
    }
    let cancelled = false;
    api.users
      .listByOrg(orgId)
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : [];
        setOrgMembers(
          list.map((u) => ({
            id: u.id,
            name: u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.id,
            roleKey: u.roleKey,
            membershipRole: u.membershipRole,
            roleLabel: u.roleLabel,
            position: u.position,
            organizationRoleName: u.organizationRoleName,
            stationIds: u.stationIds ?? [],
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setOrgMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!orgId || lookupLoaded) return;
    let cancelled = false;
    Promise.all([
      api.bookings.list(orgId, { limit: 100 }).catch(() => ({ data: [] })),
      api.customers.list(orgId, { limit: 100 }).catch(() => ({ data: [] })),
      api.invoices.list(orgId).catch(() => []),
      api.serviceCases.list(orgId).catch(() => []),
    ])
      .then(([bookingsRes, customersRes, invoicesRes, serviceCasesRes]) => {
        if (cancelled) return;
        const bookings = Array.isArray(bookingsRes)
          ? bookingsRes
          : (bookingsRes as { data?: Array<Record<string, unknown>> })?.data ?? [];
        const customers = Array.isArray(customersRes)
          ? customersRes
          : (customersRes as { data?: Array<Record<string, unknown>> })?.data ?? [];
        const invoices = Array.isArray(invoicesRes) ? invoicesRes : [];
        const serviceCases = Array.isArray(serviceCasesRes) ? serviceCasesRes : [];

        setEntityLookup({
          bookings: (bookings as Array<Record<string, unknown>>).map((row) => ({
            value: String(row.id ?? ''),
            label: taskEntityOptionLabel(
              row.bookingNumber != null ? String(row.bookingNumber) : null,
              'Buchung',
            ),
          })),
          customers: (customers as Array<Record<string, unknown>>).map((row) => ({
            value: String(row.id ?? ''),
            label: taskEntityOptionLabel(
              row.name != null
                ? String(row.name)
                : row.companyName != null
                  ? String(row.companyName)
                  : row.email != null
                    ? String(row.email)
                    : null,
              'Kunde',
            ),
          })),
          invoices: (invoices as Invoice[]).map((row) => ({
            value: String(row.id ?? ''),
            label: taskEntityOptionLabel(
              row.invoiceNumber != null ? String(row.invoiceNumber) : null,
              'Rechnung',
            ),
          })),
          serviceCases: (serviceCases as ApiServiceCase[]).map((row) => ({
            value: String(row.id ?? ''),
            label: taskEntityOptionLabel(row.title, 'Servicefall'),
          })),
        });
        setLookupLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLookupLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lookupLoaded, orgId]);

  const apiFilters = useMemo(
    () => buildTasksListApiParams(filters, debouncedSearch, currentUserId),
    [filters, debouncedSearch, currentUserId],
  );

  const {
    rawTasks,
    loading: tasksLoading,
    loadingMore,
    error: tasksError,
    loadMoreError,
    hasMore,
    reload: reloadTasks,
    loadMore,
    isStale,
    viewCounts,
    kpis,
    resultLabel,
  } = useTasksPageViewModel({
    orgId,
    view: activeView,
    apiFilters,
    currentUserId,
    userRole,
    hasPermission,
  });

  const rowContext = useMemo(
    () => ({
      fleetVehicles: fleetVehicles.map((vehicle) => ({
        id: vehicle.id,
        license: vehicle.license,
        model: vehicle.model,
        station: vehicle.station,
      })),
      orgMembers,
      orgStations: orgStations.map((station) => ({ id: station.id, name: station.name })),
    }),
    [fleetVehicles, orgMembers, orgStations],
  );

  const tasks = useMemo(
    () => rawTasks.map((task) => mapApiTaskToTaskListRow(task, rowContext)),
    [rawTasks, rowContext],
  );

  const selectableTaskIds = useMemo(
    () => rawTasks.filter(isActiveApiTask).map((task) => task.id),
    [rawTasks],
  );

  useEffect(() => {
    setSelectedTaskIds((current) => current.filter((id) => selectableTaskIds.includes(id)));
  }, [selectableTaskIds]);

  useEffect(() => {
    syncTasksListFiltersToUrl(filters, debouncedSearch);
  }, [filters, debouncedSearch]);

  const stationOptions = useMemo(
    () => orgStations.map((station) => ({ value: station.id, label: station.name })),
    [orgStations],
  );

  const assigneeOptions = useMemo(
    () => orgMembers.map((member) => ({ value: member.id, label: member.name })),
    [orgMembers],
  );

  const vehicleOptions = useMemo(
    () =>
      fleetVehicles.map((vehicle) => ({
        value: vehicle.id,
        label: `${vehicle.license} – ${vehicle.model}`,
      })),
    [fleetVehicles],
  );

  const hasActiveFilters = hasActiveTaskFilters(filters, debouncedSearch);
  const emptyCopy = tasksPageEmptyState(activeView, hasActiveFilters);

  const clearFilters = useCallback(() => {
    setFilters((current) => ({
      ...DEFAULT_TASKS_FILTER_STATE,
      view: current.view,
    }));
    setSearchDraft('');
  }, []);

  const openTaskDetail = (task: Task) => {
    setSelectedTask(task);
    setDetailFull(null);
    if (orgId) {
      api.tasks.get(orgId, task.id).then(setDetailFull).catch(() => setDetailFull(null));
    }
  };

  const closeTaskDetail = () => {
    setSelectedTask(null);
    setDetailFull(null);
  };

  const runTaskAction = async (fn: () => Promise<ApiTask>) => {
    if (mutating) return;
    setMutating(true);
    try {
      const updated = await fn();
      await reloadTasks();
      if (updated && detailFull && updated.id === detailFull.id) {
        setDetailFull(updated);
      }
      if (updated && selectedTask && updated.id === selectedTask.id) {
        setSelectedTask(mapApiTaskToTaskListRow(updated, rowContext));
      }
      return updated;
    } catch (error) {
      console.error('Task action failed', error);
      throw error;
    } finally {
      setMutating(false);
    }
  };

  const toggleTaskSelection = (taskId: string, selected: boolean) => {
    setSelectedTaskIds((current) => {
      if (selected) return current.includes(taskId) ? current : [...current, taskId];
      return current.filter((id) => id !== taskId);
    });
  };

  useEffect(() => {
    if (autoOpenNewTask) {
      setIsNewTaskOpen(true);
      onAutoOpenConsumed?.();
    }
  }, [autoOpenNewTask, onAutoOpenConsumed]);

  useEffect(() => {
    if (!highlightedTaskId || tasksLoading) return;
    setFlashingTaskId(highlightedTaskId);

    const scrollTimer = setTimeout(() => {
      const row = taskRowRefs.current[highlightedTaskId];
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const task = tasks.find((item) => item.id === highlightedTaskId);
      if (task) openTaskDetail(task);
    }, 150);

    const flashTimer = setTimeout(() => setFlashingTaskId(null), 3000);
    onHighlightConsumed?.();

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(flashTimer);
    };
  }, [highlightedTaskId, onHighlightConsumed, tasks, tasksLoading]);

  useEffect(() => {
    if (!orgId || !selectedTask) return;
    return subscribeTaskQueryInvalidation((detail) => {
      if (!matchesTaskDetailInvalidation(detail, orgId, selectedTask.id)) return;
      api.tasks.get(orgId, selectedTask.id).then(setDetailFull).catch(() => setDetailFull(null));
    });
  }, [orgId, selectedTask?.id]);

  return (
    <div className="mx-auto max-w-[1800px] space-y-4" data-testid="tasks-view">
      <PageHeader
        title="Aufgaben"
        status={
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground">
            {resultLabel}
          </span>
        }
        actions={(
          <Button type="button" variant="primary" size="sm" onClick={() => setIsNewTaskOpen(true)}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            <span className="hidden min-[400px]:inline">Aufgabe erstellen</span>
            <span className="min-[400px]:hidden">Neu</span>
          </Button>
        )}
      />

      <TasksKpiStrip items={kpis} activeView={activeView} onSelectView={setActiveView} />

      <TasksPageViews
        activeView={activeView}
        onViewChange={setActiveView}
        canViewUnassigned={canViewUnassigned}
        counts={viewCounts}
      />

      <div className="surface-premium rounded-2xl border border-border/50 p-3 shadow-[var(--shadow-1)] md:p-4">
        <TasksFilterPanel
          filters={filters}
          searchDraft={searchDraft}
          onSearchDraftChange={setSearchDraft}
          onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
          onClear={clearFilters}
          stationOptions={stationOptions}
          assigneeOptions={assigneeOptions}
          vehicleOptions={vehicleOptions}
          bookingOptions={entityLookup.bookings}
          customerOptions={entityLookup.customers}
          invoiceOptions={entityLookup.invoices}
          serviceCaseOptions={entityLookup.serviceCases}
          hasActiveFilters={hasActiveFilters}
          resultLabel={resultLabel}
        />
      </div>

      {tasksError && !tasks.length ? (
        <ErrorState
          compact
          title="Aufgaben konnten nicht geladen werden"
          error={tasksError}
          onRetry={() => void reloadTasks()}
          className="surface-premium rounded-2xl py-12"
        />
      ) : tasksLoading && !tasks.length ? (
        <div className="space-y-2" data-testid="tasks-loading">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="surface-premium h-20 animate-pulse rounded-2xl md:h-[4.5rem]" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          compact
          icon={<ListTodo className="h-5 w-5" />}
          title={emptyCopy.title}
          description={emptyCopy.description}
          action={
            hasActiveFilters ? (
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                Filter zurücksetzen
              </Button>
            ) : activeView !== 'open' ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setActiveView('open')}>
                Alle offenen anzeigen
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2" data-testid="tasks-list">
          {isStale ? (
            <p className="rounded-xl border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] px-3 py-2 text-[11px] text-[color:var(--status-watch)]">
              Anzeige möglicherweise veraltet —{' '}
              <button type="button" className="font-semibold underline" onClick={() => void reloadTasks()}>
                erneut laden
              </button>
            </p>
          ) : null}
          {tasks.map((task) => (
            <TaskWorkItemCard
              key={task.id}
              task={task}
              isFlashing={flashingTaskId === task.id}
              onClick={() => openTaskDetail(task)}
              selectable={canWriteTasks}
              selected={selectedTaskIds.includes(task.id)}
              onSelectedChange={(selected) => toggleTaskSelection(task.id, selected)}
              rowRef={(element) => {
                taskRowRefs.current[task.id] = element;
              }}
            />
          ))}
          {loadMoreError ? (
            <ErrorState
              compact
              title="Weitere Aufgaben konnten nicht geladen werden"
              error={loadMoreError}
              onRetry={() => void loadMore()}
              className="rounded-2xl py-6"
            />
          ) : null}
          {hasMore ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                data-testid="tasks-load-more"
              >
                {loadingMore ? 'Lädt weitere Aufgaben…' : 'Weitere Ergebnisse laden'}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {orgId && selectedTaskIds.length > 0 ? (
        <TasksBulkActionBar
          orgId={orgId}
          selectedTaskIds={selectedTaskIds}
          canWriteTasks={canWriteTasks}
          assigneeOptions={assigneeOptions}
          onClearSelection={() => setSelectedTaskIds([])}
          onCompleted={() => void reloadTasks()}
        />
      ) : null}

      <GlobalTaskDetailPanel
        open={!!selectedTask}
        onOpenChange={(open) => {
          if (!open) closeTaskDetail();
        }}
        taskRow={selectedTask}
        detail={detailFull}
        detailLoading={!!selectedTask && !detailFull && !tasksError}
        orgId={orgId}
        orgMembers={orgMembers}
        userRole={userRole}
        canManageTasks={hasPermission('tasks', 'manage')}
        canWriteTasks={canWriteTasks}
        mutating={mutating}
        onTaskUpdated={setDetailFull}
        runTaskAction={async (fn) => {
          await runTaskAction(fn);
        }}
      />

      <TasksNewTaskDialog
        open={isNewTaskOpen}
        onOpenChange={setIsNewTaskOpen}
        orgId={orgId}
        fleetVehicles={fleetVehicles}
        orgMembers={orgMembers}
        orgStations={orgStations}
        onCreated={async (task) => {
          await reloadTasks();
          setFlashingTaskId(task.id);
          openTaskDetail(mapApiTaskToTaskListRow(task, rowContext));
          setDetailFull(task);
        }}
      />
    </div>
  );
}
