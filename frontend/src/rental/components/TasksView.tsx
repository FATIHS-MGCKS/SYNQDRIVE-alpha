import { useEffect, useMemo, useRef, useState } from 'react';
import { ListTodo } from 'lucide-react';
import { PageHeader, EmptyState, ErrorState } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { api, type ApiTask, type Station } from '../../lib/api';
import { getStoredUser } from '../../lib/auth';
import {
  matchesTaskDetailInvalidation,
  subscribeTaskQueryInvalidation,
  useTaskList,
  useTaskSummary,
} from '../../lib/tasks';
import { useFleetVehicles } from '../FleetContext';
import { useRentalOrg } from '../RentalContext';
import { VIEW_PRIORITY_TO_API } from '../lib/task-create.utils';
import {
  buildTasksPageKpis,
  buildTasksPageListFilters,
  bucketCountFromSummary,
  canViewUnassignedTasksBucket,
  getVisibleTasksPageViews,
  tasksPageEmptyState,
  tasksPageViewCountLabel,
  type TasksPageView,
} from '../lib/tasks-page.utils';
import {
  mapApiTaskToTaskListRow,
  sortTaskListRows,
  type OrgMemberRef,
  type TaskListRow,
} from '../lib/task-list.utils';
import { GlobalTaskDetailPanel } from './tasks/GlobalTaskDetailPanel';
import { TaskWorkItemCard } from './tasks/TaskWorkItemCard';
import { TasksFilterPanel, applyClientTaskFilters, DEFAULT_TASKS_FILTER_STATE, hasActiveTaskFilters, type TasksFilterState } from './tasks/TasksFilterPanel';
import { TasksKpiStrip } from './tasks/TasksKpiStrip';
import { TasksNewTaskDialog } from './tasks/TasksNewTaskDialog';
import { TasksPageViews } from './tasks/TasksPageViews';
import { Icon } from './ui/Icon';

interface TasksViewProps {
  autoOpenNewTask?: boolean;
  onAutoOpenConsumed?: () => void;
  highlightedTaskId?: string | null;
  onHighlightConsumed?: () => void;
}

type Task = TaskListRow;

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

  const [activeView, setActiveView] = useState<TasksPageView>('open');
  const [filters, setFilters] = useState<TasksFilterState>(DEFAULT_TASKS_FILTER_STATE);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailFull, setDetailFull] = useState<ApiTask | null>(null);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [flashingTaskId, setFlashingTaskId] = useState<string | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMemberRef[]>([]);
  const [orgStations, setOrgStations] = useState<Station[]>([]);
  const taskRowRefs = useRef<Record<string, HTMLElement | null>>({});

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

  const vehicleIdForFilter = useMemo(() => {
    if (filters.vehicleLicense === 'all') return undefined;
    return fleetVehicles.find((vehicle) => vehicle.license === filters.vehicleLicense)?.id;
  }, [filters.vehicleLicense, fleetVehicles]);

  const apiFilters = useMemo(
    () =>
      buildTasksPageListFilters(activeView, currentUserId, {
        search: filters.search.trim() || undefined,
        priority:
          filters.priority !== 'all'
            ? VIEW_PRIORITY_TO_API[filters.priority as keyof typeof VIEW_PRIORITY_TO_API]
            : undefined,
        vehicleId: vehicleIdForFilter,
      }),
    [activeView, currentUserId, filters.priority, filters.search, vehicleIdForFilter],
  );

  const listEnabled = Boolean(orgId) && (activeView !== 'unassigned' || canViewUnassigned);
  const {
    tasks: rawTasks,
    loading: tasksLoading,
    error: tasksError,
    reload: reloadTasks,
    isStale,
  } = useTaskList({
    orgId,
    filters: apiFilters,
    enabled: listEnabled,
  });

  const { summary: taskSummary } = useTaskSummary({ orgId });

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

  const filteredTasks = useMemo(
    () => applyClientTaskFilters(tasks, filters),
    [tasks, filters],
  );

  const sortedTasks = useMemo(
    () => sortTaskListRows(filteredTasks, filters.sortBy),
    [filteredTasks, filters.sortBy],
  );

  const viewCounts = useMemo(() => {
    const counts: Partial<Record<TasksPageView, number>> = {};
    for (const view of getVisibleTasksPageViews(canViewUnassigned)) {
      if (view.id === activeView) {
        counts[view.id] = sortedTasks.length;
      } else if (view.id === 'mine') {
        counts.mine = taskSummary?.assignedToMe ?? 0;
      } else {
        counts[view.id] = bucketCountFromSummary(taskSummary, view.bucket, 0);
      }
    }
    return counts;
  }, [activeView, canViewUnassigned, sortedTasks.length, taskSummary]);

  const kpis = useMemo(
    () => buildTasksPageKpis(taskSummary, canViewUnassigned),
    [canViewUnassigned, taskSummary],
  );

  const vehicleOptions = useMemo(
    () =>
      fleetVehicles.map((vehicle) => ({
        value: vehicle.license,
        label: `${vehicle.license} – ${vehicle.model}`,
      })),
    [fleetVehicles],
  );

  const assigneeOptions = useMemo(() => {
    const names = new Set(tasks.map((task) => task.assignedUserName).filter(Boolean));
    return [...names].map((name) => ({ value: name, label: name }));
  }, [tasks]);

  const hasActiveFilters = hasActiveTaskFilters(filters);
  const emptyCopy = tasksPageEmptyState(activeView, hasActiveFilters);
  const resultLabel = tasksPageViewCountLabel(activeView, sortedTasks.length);

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

  useEffect(() => {
    if (autoOpenNewTask) {
      setIsNewTaskOpen(true);
      onAutoOpenConsumed?.();
    }
  }, [autoOpenNewTask, onAutoOpenConsumed]);

  useEffect(() => {
    if (!highlightedTaskId || tasksLoading) return;
    setActiveView('open');
    setFilters(DEFAULT_TASKS_FILTER_STATE);
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
          onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
          onClear={() => setFilters(DEFAULT_TASKS_FILTER_STATE)}
          vehicleOptions={vehicleOptions}
          assigneeOptions={assigneeOptions}
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
      ) : sortedTasks.length === 0 ? (
        <EmptyState
          compact
          icon={<ListTodo className="h-5 w-5" />}
          title={emptyCopy.title}
          description={emptyCopy.description}
          action={
            hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFilters(DEFAULT_TASKS_FILTER_STATE)}
              >
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
          {sortedTasks.map((task) => (
            <TaskWorkItemCard
              key={task.id}
              task={task}
              isFlashing={flashingTaskId === task.id}
              onClick={() => openTaskDetail(task)}
              rowRef={(element) => {
                taskRowRefs.current[task.id] = element;
              }}
            />
          ))}
        </div>
      )}

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
        canWriteTasks={hasPermission('tasks', 'write')}
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
        mutating={mutating}
        onMutatingChange={setMutating}
        fleetVehicles={fleetVehicles}
        orgMembers={orgMembers}
        orgStations={orgStations}
        onCreated={() => void reloadTasks()}
      />
    </div>
  );
}
