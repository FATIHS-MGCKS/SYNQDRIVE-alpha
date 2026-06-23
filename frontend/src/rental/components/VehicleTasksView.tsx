
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SupportContextButton } from '../../components/support/SupportContextButton';
import {
  EmptyState,
  ErrorState,
  PriorityBadge,
  StatusChip,
} from '../../components/patterns';
import { api } from '../../lib/api';
import type { ApiTask } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import type { VehicleData } from '../data/vehicles';
import {
  countVehicleTasks,
  formatTaskDueDate,
  matchesVehicleTaskFilter,
  vehicleTaskPriorityLabel,
  vehicleTaskStatusLabel,
  vehicleTaskStatusTone,
  type VehicleTaskFilter,
} from '../lib/task-display.utils';
import { isServiceMaintenanceTask, taskTypeLabel } from '../lib/service-task-semantics';
import { isActiveTask } from '../components/service-center/service-center.utils';
import {
  countBlockingTasks,
  deriveNextBookingContext,
  groupVehicleTasks,
  matchesBlockingFilter,
  parseVehicleOperatorTaskList,
  pickNextBestAction,
  taskSourceBadgeLabel,
  type VehicleTaskOperatorRow,
} from '../lib/task-operator.utils';
import { CreateVehicleTaskDialog } from './tasks/CreateVehicleTaskDialog';
import {
  TaskBlockingBadgePill,
  TaskDueBeforeBookingPill,
  TaskSourceBadgePill,
  VehicleTaskActionCenter,
} from './tasks/VehicleTaskActionCenter';
import { VehicleTaskDetailDrawer } from './tasks/VehicleTaskDetailDrawer';
import { Icon } from './ui/Icon';

interface VehicleTasksViewProps {
  isDarkMode: boolean;
  vehicle?: VehicleData | null;
  vehicleVin?: string | null;
  highlightTaskId?: string | null;
  onHighlightConsumed?: () => void;
  onOpenInGlobalTasks?: (taskId: string) => void;
  onOpenServiceCenter?: () => void;
  tasksRefreshToken?: number;
}

const FILTER_CHIPS: Array<{ id: VehicleTaskFilter; label: string }> = [
  { id: 'all', label: 'Alle' },
  { id: 'blocking', label: 'Blockiert' },
  { id: 'open', label: 'Offen' },
  { id: 'in-progress', label: 'In Arbeit' },
  { id: 'waiting', label: 'Wartend' },
  { id: 'overdue', label: 'Überfällig' },
  { id: 'done', label: 'Erledigt' },
  { id: 'cancelled', label: 'Storniert' },
];

const IS_DEV = import.meta.env.DEV;

function statusToneToChip(
  tone: ReturnType<typeof vehicleTaskStatusTone>,
): 'success' | 'watch' | 'warning' | 'critical' | 'info' | 'neutral' {
  if (tone === 'critical') return 'critical';
  if (tone === 'warning') return 'warning';
  if (tone === 'success') return 'success';
  if (tone === 'info') return 'info';
  return 'neutral';
}

export function VehicleTasksView({
  isDarkMode: _isDarkMode,
  vehicle,
  vehicleVin,
  highlightTaskId,
  onHighlightConsumed,
  onOpenInGlobalTasks,
  onOpenServiceCenter,
  tasksRefreshToken,
}: VehicleTasksViewProps) {
  const { orgId } = useRentalOrg();
  const [filter, setFilter] = useState<VehicleTaskFilter>('all');
  const [rows, setRows] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [orgMembers, setOrgMembers] = useState<{ id: string; name: string }[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const canCreate = Boolean(orgId && vehicle?.id);

  const assigneeNameById = useMemo(
    () => new Map(orgMembers.map((m) => [m.id, m.name])),
    [orgMembers],
  );

  const nextBooking = useMemo(() => deriveNextBookingContext(vehicle), [vehicle]);

  const checklistByTaskId = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const task of rows) {
      const items = task.checklist ?? [];
      if (items.length > 0) {
        map.set(task.id, {
          done: items.filter((i) => i.isDone).length,
          total: items.length,
        });
      }
    }
    return map;
  }, [rows]);

  const loadTasks = useCallback(async (opts?: { silent?: boolean }) => {
    if (!orgId || !vehicle?.id) {
      setRows([]);
      setError(null);
      return;
    }
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const res = await api.tasks.forVehicle(orgId, vehicle.id);
      setRows(Array.isArray(res) ? res : []);
    } catch {
      setRows([]);
      setError('Aufgaben für dieses Fahrzeug konnten nicht geladen werden.');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [orgId, vehicle?.id]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks, tasksRefreshToken]);

  useEffect(() => {
    setDetailOpen(false);
    setSelectedTaskId(null);
    setFilter('all');
  }, [vehicle?.id]);

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

  const tasks = useMemo(() => {
    if (!vehicle?.id) return [];
    return parseVehicleOperatorTaskList(rows, nextBooking, assigneeNameById);
  }, [rows, vehicle?.id, nextBooking, assigneeNameById]);

  const counts = useMemo(() => {
    const base = countVehicleTasks(tasks);
    return { ...base, blocking: countBlockingTasks(tasks) };
  }, [tasks]);

  const nextBestAction = useMemo(() => pickNextBestAction(tasks), [tasks]);

  const filteredTasks = useMemo(() => {
    if (filter === 'blocking') return tasks.filter(matchesBlockingFilter);
    return tasks.filter((t) => matchesVehicleTaskFilter(t, filter));
  }, [filter, tasks]);

  const taskGroups = useMemo(() => {
    if (filter !== 'all') return [];
    return groupVehicleTasks(filteredTasks);
  }, [filter, filteredTasks]);

  const maintenanceOpenCount = useMemo(
    () => rows.filter((t) => isActiveTask(t) && isServiceMaintenanceTask(t)).length,
    [rows],
  );

  const vehicleLabel = vehicle
    ? [vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.license
    : 'Kein Fahrzeug ausgewählt';

  const plateLabel = vehicle?.license ?? '';

  const openTaskDetail = (taskId: string) => {
    setSelectedTaskId(taskId);
    setDetailOpen(true);
  };

  const handleTaskUpdated = useCallback((updated: ApiTask) => {
    setRows((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }, []);

  const handleTaskCreated = useCallback(
    (created: ApiTask) => {
      setRows((prev) => {
        if (prev.some((t) => t.id === created.id)) return prev;
        return [created, ...prev];
      });
      setFilter('all');
      void loadTasks({ silent: true });
    },
    [loadTasks],
  );

  const openCreate = () => {
    if (!canCreate) return;
    setCreateOpen(true);
  };

  useEffect(() => {
    if (!highlightTaskId || !tasks.some((t) => t.id === highlightTaskId)) return;
    openTaskDetail(highlightTaskId);
    const el = document.querySelector(`[data-vehicle-task-id="${highlightTaskId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const timer = window.setTimeout(() => onHighlightConsumed?.(), 4000);
    return () => window.clearTimeout(timer);
  }, [highlightTaskId, onHighlightConsumed, tasks]);

  if (error && !loading && tasks.length === 0) {
    return (
      <ErrorState
        title="Aufgaben konnten nicht geladen werden"
        description="Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut."
        error={IS_DEV ? error : undefined}
        onRetry={() => void loadTasks()}
        retryLabel="Erneut laden"
        className="sq-card rounded-xl shadow-[var(--shadow-1)]"
      />
    );
  }

  const hasOpenTasks = counts.active > 0;

  return (
    <div className="space-y-4 animate-fade-up">
      {/* ── Operational header ── */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="sq-section-label">Fahrzeugbetrieb</p>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground font-display mt-0.5">
            Aufgaben &amp; Aktionen
          </h3>
          <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
            {vehicleLabel}
            {plateLabel ? (
              <span className="text-muted-foreground/70"> · {plateLabel}</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SupportContextButton
            kind="task"
            contextData={{
              vehicleId: vehicle?.id,
              licensePlate: plateLabel,
              selectedTab: 'vehicle-tasks',
            }}
          />
          {onOpenServiceCenter && maintenanceOpenCount > 0 && (
            <button
              type="button"
              onClick={onOpenServiceCenter}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-card px-3 py-2 text-[11px] font-semibold hover:bg-muted/40 sq-press"
            >
              <Icon name="wrench" className="w-3.5 h-3.5" />
              Service Center ({maintenanceOpenCount})
            </button>
          )}
          <button
            type="button"
            onClick={openCreate}
            disabled={!canCreate}
            className="sm:hidden w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50 sq-press"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            Neue Aufgabe erstellen
          </button>
        </div>
      </header>

      {/* ── Summary metric strip ── */}
      <div
        className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 snap-x snap-mandatory scrollbar-thin"
        role="tablist"
        aria-label="Aufgabenfilter"
      >
        {FILTER_CHIPS.map((chip) => {
          const value =
            chip.id === 'all'
              ? counts.total
              : chip.id === 'blocking'
                ? counts.blocking
                : chip.id === 'open'
                  ? counts.open
                  : chip.id === 'in-progress'
                    ? counts.inProgress
                    : chip.id === 'waiting'
                      ? counts.waiting
                      : chip.id === 'overdue'
                        ? counts.overdue
                        : chip.id === 'done'
                          ? counts.done
                          : counts.cancelled;
          const isActive = filter === chip.id;
          const isAlert =
            (chip.id === 'blocking' || chip.id === 'overdue') && value > 0;

          return (
            <FilterMetric
              key={chip.id}
              label={chip.label}
              value={value}
              active={isActive}
              alert={isAlert}
              onClick={() => setFilter(chip.id)}
            />
          );
        })}
      </div>

      {/* ── Next best action + context strip ── */}
      <VehicleTaskActionCenter
        nextAction={nextBestAction}
        nextBooking={nextBooking}
        blockingCount={counts.blocking}
        activeCount={counts.active}
        overdueCount={counts.overdue}
        onOpenTask={openTaskDetail}
        onCreateTask={openCreate}
        canCreate={canCreate}
      />

      {/* ── Task queue ── */}
      <section className="sq-card rounded-xl shadow-[var(--shadow-1)] overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/70">
          <div className="min-w-0">
            <h4 className="text-[13px] font-semibold text-foreground tracking-[-0.003em]">
              Aufgabenliste
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {filter === 'all'
                ? 'Nach Dringlichkeit gruppiert'
                : `${filteredTasks.length} Aufgabe${filteredTasks.length === 1 ? '' : 'n'}`}
            </p>
          </div>
          {!loading && filteredTasks.length > 0 && (
            <span className="sq-chip sq-chip-neutral text-[10px] tabular-nums shrink-0">
              {counts.active} aktiv
            </span>
          )}
        </div>

        <div className="p-3 sm:p-4">
          {loading ? (
            <TaskRowSkeletonList count={5} />
          ) : !vehicle?.id ? (
            <EmptyState
              compact
              icon={<Icon name="car" className="w-5 h-5" />}
              title="Kein Fahrzeug ausgewählt"
              description="Wählen Sie ein Fahrzeug aus, um dessen Aufgaben zu sehen."
            />
          ) : filteredTasks.length === 0 ? (
            <EmptyState
              compact
              icon={
                <Icon
                  name={tasks.length === 0 ? 'check-circle-2' : 'filter'}
                  className="w-5 h-5"
                />
              }
              title={
                tasks.length === 0
                  ? 'Keine Aufgaben für dieses Fahrzeug.'
                  : 'Keine Aufgaben in dieser Auswahl'
              }
              description={
                tasks.length === 0
                  ? 'Dieses Fahrzeug hat aktuell keine operativen Blocker.'
                  : 'Wählen Sie einen anderen Filter.'
              }
              action={
                tasks.length === 0 && canCreate ? (
                  <button
                    type="button"
                    onClick={openCreate}
                    className="sq-cta inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold"
                  >
                    <Icon name="plus" className="w-3.5 h-3.5" />
                    Neue Aufgabe erstellen
                  </button>
                ) : undefined
              }
            />
          ) : filter === 'all' && taskGroups.length > 0 ? (
            <div className="space-y-2">
              {taskGroups.map((group) => {
                const collapsed = collapsedGroups[group.id] ?? group.id === 'completed';
                return (
                  <div key={group.id} className="rounded-lg border border-border/70 overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedGroups((prev) => ({ ...prev, [group.id]: !collapsed }))
                      }
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-muted/30 text-left sq-press transition-colors hover:bg-muted/50"
                      aria-expanded={!collapsed}
                    >
                      <span className="text-[11px] font-semibold text-foreground">{group.label}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-1">
                        {group.tasks.length}
                        <Icon
                          name={collapsed ? 'chevron-down' : 'chevron-up'}
                          className="w-3.5 h-3.5"
                        />
                      </span>
                    </button>
                    {!collapsed && (
                      <div className="divide-y divide-border/50">
                        {group.tasks.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            selected={selectedTaskId === task.id && detailOpen}
                            highlighted={highlightTaskId === task.id}
                            checklist={checklistByTaskId.get(task.id)}
                            onClick={() => openTaskDetail(task.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-border/70 overflow-hidden divide-y divide-border/50">
              {filteredTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  selected={selectedTaskId === task.id && detailOpen}
                  highlighted={highlightTaskId === task.id}
                  checklist={checklistByTaskId.get(task.id)}
                  onClick={() => openTaskDetail(task.id)}
                />
              ))}
            </div>
          )}

          {error && tasks.length > 0 && (
            <div
              className="mt-3 rounded-lg border border-[color:var(--status-attention)]/30 bg-[color:var(--status-attention-soft)] px-3 py-2 text-[11px] text-foreground"
              role="status"
            >
              Die Liste konnte nicht aktualisiert werden. Angezeigt werden die zuletzt geladenen
              Daten.{' '}
              <button
                type="button"
                onClick={() => void loadTasks()}
                className="font-semibold underline sq-press"
              >
                Erneut laden
              </button>
            </div>
          )}
        </div>
      </section>

      {!loading && !hasOpenTasks && tasks.length > 0 && filter === 'all' && (
        <p className="text-[11px] text-center text-muted-foreground px-4">
          Alle Aufgaben abgeschlossen oder storniert — Fahrzeug operativ frei.
        </p>
      )}

      <CreateVehicleTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        vehicle={vehicle}
        vehicleVin={vehicleVin}
        onCreated={handleTaskCreated}
      />

      <VehicleTaskDetailDrawer
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelectedTaskId(null);
        }}
        orgId={orgId}
        taskId={selectedTaskId}
        vehicle={vehicle}
        orgMembers={orgMembers}
        onTaskUpdated={handleTaskUpdated}
        onOpenInGlobalTasks={onOpenInGlobalTasks}
      />
    </div>
  );
}

/* ── Filter metric chip ── */

function FilterMetric({
  label,
  value,
  active,
  alert,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  alert: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'snap-start shrink-0 rounded-lg px-3 py-2 text-left min-w-[76px] transition-all duration-200 sq-press',
        'border',
        active
          ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)] shadow-[var(--shadow-xs)]'
          : 'border-border/70 bg-card hover:bg-muted/40 hover:border-border',
      ].join(' ')}
    >
      <p
        className={[
          'text-[15px] leading-none font-semibold tabular-nums',
          alert && !active ? 'text-[color:var(--status-critical)]' : 'text-foreground',
        ].join(' ')}
      >
        {value}
      </p>
      <p className="text-[9px] mt-1 font-medium uppercase tracking-wider text-muted-foreground truncate">
        {label}
      </p>
    </button>
  );
}

/* ── Task row ── */

function TaskRow({
  task,
  selected,
  highlighted,
  checklist,
  onClick,
}: {
  task: VehicleTaskOperatorRow;
  selected?: boolean;
  highlighted?: boolean;
  checklist?: { done: number; total: number };
  onClick: () => void;
}) {
  const tone = vehicleTaskStatusTone(task.displayStatus, task.isOverdue);
  const label = vehicleTaskStatusLabel(task.displayStatus, task.isOverdue);
  const chipTone = statusToneToChip(tone);

  return (
    <button
      type="button"
      data-vehicle-task-id={task.id}
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={[
        'group w-full text-left px-3 py-2.5 transition-all duration-200 sq-press',
        'hover:bg-muted/40',
        selected
          ? 'bg-[color:var(--brand-soft)] border-l-2 border-l-[color:var(--brand)]'
          : 'border-l-2 border-l-transparent',
        highlighted && !selected
          ? 'ring-1 ring-inset ring-[color:var(--brand)]/25 bg-[color:var(--brand-soft)]/50'
          : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Badge row */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <StatusChip tone={chipTone} className="text-[10px] py-0">
              {label}
            </StatusChip>
            <PriorityBadge
              priority={task.priority}
              label={vehicleTaskPriorityLabel(task.priority)}
              className="text-[10px] py-0"
            />
            <TaskSourceBadgePill label={taskSourceBadgeLabel(task.sourceBadge)} />
            {isServiceMaintenanceTask({ type: task.apiType, category: task.category }) && (
              <span className="inline-flex items-center rounded-md border border-[color:var(--brand)]/20 bg-[color:var(--brand-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[color:var(--brand-ink)]">
                Wartung
              </span>
            )}
            <TaskBlockingBadgePill badge={task.blockingBadge} />
            {task.isDueBeforeNextBooking && <TaskDueBeforeBookingPill />}
          </div>

          {/* Title */}
          <p className="text-[13px] font-semibold text-foreground leading-snug truncate group-hover:text-foreground">
            {task.title}
          </p>
          {isServiceMaintenanceTask({ type: task.apiType, category: task.category }) && (
            <p className="text-[10px] text-muted-foreground truncate">
              {taskTypeLabel({ type: task.apiType, category: task.category, metadata: task.metadata })}
            </p>
          )}

          {/* Meta row */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            <span
              className={[
                'inline-flex items-center gap-1 tabular-nums',
                task.isOverdue ? 'text-[color:var(--status-critical)] font-medium' : '',
              ].join(' ')}
            >
              <Icon name="calendar" className="w-3 h-3 shrink-0" />
              {task.isOverdue ? 'Überfällig · ' : ''}
              {formatTaskDueDate(task.dueDate)}
            </span>
            <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
              <Icon name="user" className="w-3 h-3 shrink-0" />
              {task.assigneeLabel}
            </span>
            {checklist && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Icon name="clipboard-check" className="w-3 h-3 shrink-0" />
                {checklist.done}/{checklist.total}
              </span>
            )}
            <span className="hidden sm:inline-flex items-center gap-1 truncate max-w-[120px]">
              {task.category}
            </span>
          </div>
        </div>

        <Icon
          name="chevron-right"
          className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
          aria-hidden
        />
      </div>
    </button>
  );
}

/* ── Loading skeletons shaped like task rows ── */

function TaskRowSkeletonList({ count }: { count: number }) {
  return (
    <div className="rounded-lg border border-border/70 overflow-hidden divide-y divide-border/50" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="px-3 py-2.5 flex items-start gap-3 animate-pulse">
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <div className="h-5 w-14 rounded-full bg-muted" />
              <div className="h-5 w-12 rounded-full bg-muted" />
              <div className="h-5 w-16 rounded-full bg-muted/70" />
            </div>
            <div className="h-3.5 rounded bg-muted" style={{ width: `${55 + (i % 3) * 12}%` }} />
            <div className="flex gap-3">
              <div className="h-2.5 w-20 rounded bg-muted/70" />
              <div className="h-2.5 w-16 rounded bg-muted/70" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
