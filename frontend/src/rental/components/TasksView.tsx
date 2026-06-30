import { AlertTriangle, Calendar, Car, CheckCircle, FileText, ListTodo } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useMemo, useRef } from 'react';

import { useFleetVehicles } from '../FleetContext';
import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';
import type { ApiTask, ApiTaskSummary, CreateTaskPayload, Station } from '../../lib/api';
import { getStoredUser } from '../../lib/auth';
import { checklistPreviewForType } from '../lib/task-templates';
import {
  CATEGORY_TO_TASK_TYPE,
  TASK_CATEGORIES,
  VIEW_PRIORITY_TO_API,
  type TaskCategory,
} from '../lib/task-create.utils';
import {
  mapApiTaskToTaskListRow,
  sortTaskListRows,
  taskPriorityLabelDe,
  taskStatusLabelDe,
  type TaskListPriority,
  type TaskListRow,
  type TaskListStatus,
  type OrgMemberRef,
} from '../lib/task-list.utils';
import { PageHeader, EmptyState, ErrorState, FormDialog } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { GlobalTaskDetailPanel } from './tasks/GlobalTaskDetailPanel';
import { TaskWorkItemCard } from './tasks/TaskWorkItemCard';
import { TaskCategoryChip, TaskPriorityBadge } from './tasks/task-display';

interface TasksViewProps {
  autoOpenNewTask?: boolean;
  onAutoOpenConsumed?: () => void;
  highlightedTaskId?: string | null;
  onHighlightConsumed?: () => void;
}

type TaskPriority = TaskListPriority;
type Task = TaskListRow;

export function TasksView({ autoOpenNewTask, onAutoOpenConsumed, highlightedTaskId, onHighlightConsumed }: TasksViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [vehicleFilter, setVehicleFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'dueDate' | 'priority' | 'status' | 'created'>('dueDate');
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isVehicleOpen, setIsVehicleOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [isAssigneeOpen, setIsAssigneeOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [taskStep, setTaskStep] = useState(0);
  const [newTask, setNewTask] = useState({
    title: '', description: '', category: 'Maintenance' as TaskCategory, priority: 'Medium' as TaskPriority,
    vehicleLicense: '', stationId: '', assignedUserId: '',
    dueDate: '', estimatedDuration: '', notes: '',
  });
  const [taskFormErrors, setTaskFormErrors] = useState<Record<string, string>>({});
  const [flashingTaskId, setFlashingTaskId] = useState<string | null>(null);
  const taskRowRefs = useRef<Record<string, HTMLElement | null>>({});
  const { fleetVehicles } = useFleetVehicles();
  const { orgId, userRole, hasPermission } = useRentalOrg();
  const [rawTasks, setRawTasks] = useState<ApiTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  // Full server detail for the open task (checklist / comments / timeline).
  const [detailFull, setDetailFull] = useState<ApiTask | null>(null);
  const [taskSummary, setTaskSummary] = useState<ApiTaskSummary | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMemberRef[]>([]);
  const [orgStations, setOrgStations] = useState<Station[]>([]);

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
    api.users.listByOrg(orgId)
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
      .catch(() => { if (!cancelled) setOrgMembers([]); });
    return () => { cancelled = true; };
  }, [orgId]);

  const loadTasks = useRef<() => void>(() => {});
  loadTasks.current = () => {
    if (!orgId) return;
    setTasksLoading(true);
    setTasksError(null);
    Promise.all([api.tasks.list(orgId), api.tasks.summary(orgId)])
      .then(([rows, summary]) => {
        setRawTasks(Array.isArray(rows) ? rows : []);
        setTaskSummary(summary);
        setTasksError(null);
      })
      .catch((err) => {
        setRawTasks([]);
        setTaskSummary(null);
        setTasksError(err instanceof Error ? err.message : 'Failed to load tasks');
      })
      .finally(() => setTasksLoading(false));
  };

  // Load org tasks + summary on mount (same flow as post-mutation refresh).
  useEffect(() => {
    if (!orgId) return;
    loadTasks.current();
  }, [orgId]);

  // Run a task mutation, then refresh the list + the open detail.
  const runTaskAction = async (fn: () => Promise<ApiTask>) => {
    if (mutating) return;
    setMutating(true);
    try {
      const updated = await fn();
      loadTasks.current();
      if (updated && detailFull && updated.id === detailFull.id) {
        setDetailFull(updated);
      }
      if (updated && selectedTask && updated.id === selectedTask.id) {
        const rowCtx = {
          fleetVehicles: fleetVehicles.map((v) => ({
            id: v.id,
            license: v.license,
            model: v.model,
            station: v.station,
          })),
          orgMembers,
          orgStations: orgStations.map((s) => ({ id: s.id, name: s.name })),
        };
        setSelectedTask(mapApiTaskToTaskListRow(updated, rowCtx));
      }
      return updated;
    } catch (err) {
      console.error('Task action failed', err);
      throw err;
    } finally {
      setMutating(false);
    }
  };

  const reloadTaskDetail = () => {
    if (!orgId || !selectedTask) return;
    api.tasks.get(orgId, selectedTask.id).then(setDetailFull).catch(() => setDetailFull(null));
  };

  const currentUserLabel = useMemo(() => {
    const user = getStoredUser();
    if (!user) return 'Aktueller Benutzer';
    if (user.name?.trim()) return user.name.trim();
    if (user.email) return user.email.split('@')[0];
    return 'Aktueller Benutzer';
  }, []);

  // Enrich with vehicle metadata from the shared fleet context.
  const tasks = useMemo<Task[]>(() => {
    const ctx = {
      fleetVehicles: fleetVehicles.map((v) => ({
        id: v.id,
        license: v.license,
        model: v.model,
        station: v.station,
      })),
      orgMembers,
      orgStations: orgStations.map((s) => ({ id: s.id, name: s.name })),
    };
    return rawTasks.map((t) => mapApiTaskToTaskListRow(t, ctx));
  }, [rawTasks, fleetVehicles, orgMembers, orgStations]);

  const openNewTask = () => {
    setIsNewTaskOpen(true);
  };

  const closeNewTask = () => {
    setIsNewTaskOpen(false);
    resetNewTaskForm();
  };

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

  useEffect(() => {
    if (autoOpenNewTask) {
      openNewTask();
      onAutoOpenConsumed?.();
    }
  }, [autoOpenNewTask]);

  // Handle highlighted task from RightSidebar click
  useEffect(() => {
    if (!highlightedTaskId) return;

    // Reset filters so the task is visible
    setStatusFilter('all');
    setPriorityFilter('all');
    setCategoryFilter('all');
    setVehicleFilter('all');
    setAssigneeFilter('all');
    setSearchQuery('');

    // Flash the task row
    setFlashingTaskId(highlightedTaskId);

    // Scroll to it after a short delay (for filters to apply)
    const scrollTimer = setTimeout(() => {
      const row = taskRowRefs.current[highlightedTaskId];
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Open detail panel
      const task = tasks.find((t) => t.id === highlightedTaskId);
      if (task) {
        openTaskDetail(task);
      }
    }, 100);

    // Remove flash after 3 seconds
    const flashTimer = setTimeout(() => {
      setFlashingTaskId(null);
    }, 3000);

    onHighlightConsumed?.();

    // Cleanup: cancel pending timers if highlight changes or component
    // unmounts before they fire. Without this the timers keep a reference
    // to taskRowRefs / tasks and can setState after unmount.
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(flashTimer);
    };
  }, [highlightedTaskId]);

  const resetNewTaskForm = () => {
    setNewTask({
      title: '', description: '', category: 'Maintenance', priority: 'Medium',
      vehicleLicense: '', stationId: '', assignedUserId: '',
      dueDate: '', estimatedDuration: '', notes: '',
    });
    setTaskFormErrors({});
    setTaskStep(0);
  };

  const validateTaskStep = (step: number): boolean => {
    const errors: Record<string, string> = {};
    if (step === 0) {
      if (!newTask.title.trim()) errors.title = 'Titel erforderlich';
      if (!newTask.description.trim()) errors.description = 'Beschreibung erforderlich';
    } else if (step === 1) {
      if (!newTask.vehicleLicense) errors.vehicleLicense = 'Fahrzeug auswählen';
      if (!newTask.assignedUserId) errors.assignedUserId = 'Zuweisung erforderlich';
      if (!newTask.stationId) errors.stationId = 'Station erforderlich';
    } else if (step === 2) {
      if (!newTask.dueDate) errors.dueDate = 'Fälligkeitsdatum erforderlich';
      if (!newTask.estimatedDuration.trim()) errors.estimatedDuration = 'Geschätzte Dauer erforderlich';
    }
    setTaskFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleTaskNextStep = () => {
    if (validateTaskStep(taskStep)) {
      if (taskStep < 3) setTaskStep(taskStep + 1);
    }
  };

  const handleSubmitTask = () => {
    if (!orgId || mutating) {
      closeNewTask();
      return;
    }
    const vehicle = fleetVehicles.find((v) => v.license === newTask.vehicleLicense);
    const taskType = CATEGORY_TO_TASK_TYPE[newTask.category] ?? 'CUSTOM';
    const checklistItems = checklistPreviewForType(taskType);
    const payload: CreateTaskPayload = {
      title: newTask.title.trim(),
      description: newTask.description.trim() || undefined,
      type: taskType,
      source: 'MANUAL',
      priority: VIEW_PRIORITY_TO_API[newTask.priority] ?? 'NORMAL',
      category: newTask.category,
      dueDate: newTask.dueDate ? new Date(newTask.dueDate).toISOString() : undefined,
      assignedUserId: newTask.assignedUserId || undefined,
      vehicleId: vehicle?.id,
      stationId: newTask.stationId || undefined,
      checklist: checklistItems.length
        ? checklistItems.map((title, sortOrder) => ({ title, sortOrder }))
        : undefined,
    };
    setMutating(true);
    api.tasks
      .create(orgId, payload)
      .then(() => loadTasks.current())
      .catch((err) => console.error('Create task failed', err))
      .finally(() => {
        setMutating(false);
        closeNewTask();
      });
  };

  const closeAllDropdowns = (except?: string) => {
    if (except !== 'status') setIsStatusOpen(false);
    if (except !== 'priority') setIsPriorityOpen(false);
    if (except !== 'category') setIsCategoryOpen(false);
    if (except !== 'vehicle') setIsVehicleOpen(false);
    if (except !== 'sort') setIsSortOpen(false);
    if (except !== 'assignee') setIsAssigneeOpen(false);
  };

  const filtered = tasks.filter(t => {
    const matchesSearch = searchQuery === '' ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.vehicleLicense.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.vehicleModel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.assignedUserName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.createdByUserName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
    const matchesVehicle = vehicleFilter === 'all' || t.vehicleLicense === vehicleFilter;
    const matchesAssignee = assigneeFilter === 'all' || t.assignedUserName === assigneeFilter;
    return matchesSearch && matchesStatus && matchesPriority && matchesCategory && matchesVehicle && matchesAssignee;
  });

  const sorted = useMemo(
    () => sortTaskListRows(filtered, sortBy),
    [filtered, sortBy],
  );

  const inProgressCount = taskSummary?.inProgress ?? tasks.filter(t => t.status === 'In Progress').length;
  const summaryOpen = taskSummary?.open ?? tasks.filter(t => t.status === 'Open').length;
  const summaryDueToday = taskSummary?.dueToday ?? 0;
  const summaryOverdue = taskSummary?.overdue ?? tasks.filter(t => t.status === 'Overdue').length;
  const summaryCritical = taskSummary?.critical ?? 0;
  const summaryAssignedToMe = taskSummary?.assignedToMe ?? 0;
  const uniqueVehicles = fleetVehicles.length > 0
    ? fleetVehicles.map(v => ({ value: v.license, label: `${v.license} – ${v.model}` }))
    : [...new Set(tasks.map(t => t.vehicleLicense))].filter(Boolean).map(license => {
        const task = tasks.find(t => t.vehicleLicense === license)!;
        return { value: license, label: `${license} – ${task.vehicleModel.split(' ').slice(0, 2).join(' ')}` };
      });

  const uniqueAssignees = [...new Set(tasks.map(t => t.assignedUserName))].filter(Boolean).map(assignee => {
    return { value: assignee, label: assignee };
  });

  const hasFilters = statusFilter !== 'all' || priorityFilter !== 'all' || categoryFilter !== 'all' || vehicleFilter !== 'all' || assigneeFilter !== 'all' || searchQuery !== '';
  const statusCount = (status: string) =>
    status === 'all' ? tasks.length : tasks.filter(t => t.status === status).length;
  const priorityCount = (priority: string) =>
    priority === 'all' ? tasks.length : tasks.filter(t => t.priority === priority).length;
  const categoryCount = (category: string) =>
    category === 'all' ? tasks.length : tasks.filter(t => t.category === category).length;
  const vehicleCount = (vehicle: string) =>
    vehicle === 'all' ? tasks.length : tasks.filter(t => t.vehicleLicense === vehicle).length;
  const assigneeCount = (assignee: string) =>
    assignee === 'all' ? tasks.length : tasks.filter(t => t.assignedUserName === assignee).length;
  const activeStatusLabel = statusFilter === 'all' ? 'Alle Status' : taskStatusLabelDe(statusFilter as TaskListStatus);
  const activePriorityLabel = priorityFilter === 'all' ? 'Alle Prioritäten' : taskPriorityLabelDe(priorityFilter as TaskListPriority);
  const activeCategoryLabel = categoryFilter === 'all' ? 'Alle Kategorien' : categoryFilter;
  const activeVehicleLabel =
    vehicleFilter === 'all'
      ? 'Alle Fahrzeuge'
      : uniqueVehicles.find(v => v.value === vehicleFilter)?.label ?? vehicleFilter;
  const activeAssigneeLabel = assigneeFilter === 'all' ? 'Alle Zuständigen' : assigneeFilter;
  const activeSortLabel =
    sortBy === 'dueDate'
      ? 'Fälligkeitsdatum'
      : sortBy === 'priority'
        ? 'Priorität'
        : sortBy === 'status'
          ? 'Status'
          : 'Neueste zuerst';
  const clearFilters = () => {
    setStatusFilter('all');
    setPriorityFilter('all');
    setCategoryFilter('all');
    setVehicleFilter('all');
    setAssigneeFilter('all');
    setSearchQuery('');
    closeAllDropdowns();
  };


  const textPrimary = 'text-foreground';
  const textTertiary = 'text-muted-foreground/70';

  const DropdownFilter = ({ label, value, options, isOpen, onToggle, onSelect }: {
    label: string; value: string; options: { value: string; label: string; count?: number }[];
    isOpen: boolean; onToggle: () => void; onSelect: (v: string) => void;
  }) => (
    <div className="relative">
      <Button
        type="button"
        variant={value !== 'all' ? 'secondary' : 'outline'}
        size="sm"
        onClick={onToggle}
        className="h-8 gap-1.5 px-2.5 text-xs font-medium"
      >
        <span className="max-w-[140px] truncate">
          {value === 'all' ? label : options.find(o => o.value === value)?.label}
        </span>
        <Icon name="chevron-down" className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>
      {isOpen && (
        <div className="sq-overlay absolute top-full left-0 z-50 mt-1.5 min-w-[180px] overflow-hidden">
          {options.map(o => (
            <button key={o.value} onClick={() => { onSelect(o.value); onToggle(); }}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-medium transition-colors ${
                o.value === value
                  ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                  : 'text-foreground hover:bg-muted'
              }`}>
              <span className="truncate">{o.label}</span>
              {typeof o.count === 'number' && (
                <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums sq-tone-neutral">
                  {o.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="relative">
      {/* Main Content with zoom-out effect */}
      <div className="space-y-5">
      <PageHeader
        title="Aufgabenverwaltung"
        actions={(
          <Button type="button" variant="primary" size="sm" onClick={openNewTask}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            Neuen Task
          </Button>
        )}
      />

      {/* Segment metrics — canonical counts from GET /tasks/summary */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {[
          {
            label: 'Offen',
            value: summaryOpen,
            helper: `${inProgressCount} in Bearbeitung`,
            icon: ListTodo,
            tone: 'sq-tone-brand',
            filterVal: 'Open',
          },
          {
            label: 'Heute fällig',
            value: summaryDueToday,
            helper: 'fällig heute',
            icon: Calendar,
            tone: 'sq-tone-warning',
            filterVal: null,
          },
          {
            label: 'Überfällig',
            value: summaryOverdue,
            helper: summaryOverdue > 0 ? 'Handlungsbedarf' : 'keine überfälligen',
            icon: AlertTriangle,
            tone: summaryOverdue > 0 ? 'sq-tone-critical' : 'sq-tone-neutral',
            filterVal: 'Overdue',
          },
          {
            label: 'Kritisch',
            value: summaryCritical,
            helper: 'Priorität kritisch',
            icon: AlertTriangle,
            tone: summaryCritical > 0 ? 'sq-tone-critical' : 'sq-tone-neutral',
            filterVal: 'Critical',
          },
          {
            label: 'Mir zugewiesen',
            value: summaryAssignedToMe,
            helper: 'meine offenen Aufgaben',
            icon: CheckCircle,
            tone: 'sq-tone-info',
            filterVal: null,
          },
        ].map(card => {
          const isActive = card.filterVal === 'Critical'
            ? priorityFilter === 'Critical'
            : card.filterVal != null && statusFilter === card.filterVal;
          const MetricIcon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => {
                if (card.filterVal === 'Critical') {
                  setPriorityFilter(isActive ? 'all' : 'Critical');
                } else if (card.filterVal) {
                  setStatusFilter(isActive ? 'all' : card.filterVal);
                }
              }}
              disabled={card.filterVal == null}
              className={`group sq-card sq-press rounded-xl p-3 text-left shadow-[var(--shadow-1)] transition-all ${
                isActive ? 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_22%,transparent)]' : 'hover:bg-muted/35'
              } ${card.filterVal == null ? 'cursor-default' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-muted-foreground">{card.label}</p>
                  <p className="mt-1 truncate text-[22px] font-bold leading-none tracking-[-0.03em] text-foreground tabular-nums">
                    {card.value}
                  </p>
                  <p className="mt-1 truncate text-[10px] font-medium text-muted-foreground">{card.helper}</p>
                </div>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${card.tone}`}>
                  <MetricIcon className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className="sq-card rounded-2xl p-3 shadow-[var(--shadow-1)] md:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon name="filter" className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <h2 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Filter</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {sorted.length} von {tasks.length} Aufgaben
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {statusFilter !== 'all' && (
              <button type="button" onClick={() => setStatusFilter('all')} className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-brand">
                {activeStatusLabel} ×
              </button>
            )}
            {priorityFilter !== 'all' && (
              <button type="button" onClick={() => setPriorityFilter('all')} className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-warning">
                {activePriorityLabel} ×
              </button>
            )}
            {categoryFilter !== 'all' && (
              <button type="button" onClick={() => setCategoryFilter('all')} className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-neutral">
                {activeCategoryLabel} ×
              </button>
            )}
            {vehicleFilter !== 'all' && (
              <button type="button" onClick={() => setVehicleFilter('all')} className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-neutral">
                Fahrzeug ×
              </button>
            )}
            {assigneeFilter !== 'all' && (
              <button type="button" onClick={() => setAssigneeFilter('all')} className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-neutral">
                Zuständig ×
              </button>
            )}
            {searchQuery && (
              <span className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-neutral">
                Suche aktiv
              </span>
            )}
            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-7 gap-1 px-2 text-[10px] font-semibold text-[color:var(--status-critical)]"
              >
                <Icon name="x" className="h-3.5 w-3.5" />
                Filter zurücksetzen
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Icon name="search" className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${textTertiary}`} />
            <input
              type="text"
              placeholder="Aufgaben, Fahrzeuge, Zuständige suchen…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-[color:var(--brand)]"
            />
          </div>
          <DropdownFilter
            label="Alle Status" value={statusFilter} isOpen={isStatusOpen}
            onToggle={() => { closeAllDropdowns('status'); setIsStatusOpen(!isStatusOpen); }}
            onSelect={setStatusFilter}
            options={[
              { value: 'all', label: 'Alle Status', count: statusCount('all') },
              { value: 'Open', label: 'Offen', count: statusCount('Open') },
              { value: 'In Progress', label: 'In Bearbeitung', count: statusCount('In Progress') },
              { value: 'Waiting', label: 'Wartend', count: statusCount('Waiting') },
              { value: 'Completed', label: 'Erledigt', count: statusCount('Completed') },
              { value: 'Overdue', label: 'Überfällig', count: statusCount('Overdue') },
            ]}
          />
          <DropdownFilter
            label="Alle Prioritäten" value={priorityFilter} isOpen={isPriorityOpen}
            onToggle={() => { closeAllDropdowns('priority'); setIsPriorityOpen(!isPriorityOpen); }}
            onSelect={setPriorityFilter}
            options={[
              { value: 'all', label: 'Alle Prioritäten', count: priorityCount('all') },
              { value: 'Critical', label: 'Kritisch', count: priorityCount('Critical') },
              { value: 'High', label: 'Hoch', count: priorityCount('High') },
              { value: 'Medium', label: 'Mittel', count: priorityCount('Medium') },
              { value: 'Low', label: 'Niedrig', count: priorityCount('Low') },
            ]}
          />
          <DropdownFilter
            label="Alle Kategorien" value={categoryFilter} isOpen={isCategoryOpen}
            onToggle={() => { closeAllDropdowns('category'); setIsCategoryOpen(!isCategoryOpen); }}
            onSelect={setCategoryFilter}
            options={[
              { value: 'all', label: 'Alle Kategorien', count: categoryCount('all') },
              ...(['Cleaning', 'Maintenance', 'Repair', 'Inspection', 'Damage', 'TÜV', 'Insurance', 'Documents', 'Tire Change', 'Oil Change'] as TaskCategory[]).map(c => ({ value: c, label: c, count: categoryCount(c) })),
            ]}
          />
          <DropdownFilter
            label="Alle Fahrzeuge" value={vehicleFilter} isOpen={isVehicleOpen}
            onToggle={() => { closeAllDropdowns('vehicle'); setIsVehicleOpen(!isVehicleOpen); }}
            onSelect={setVehicleFilter}
            options={[{ value: 'all', label: 'Alle Fahrzeuge', count: vehicleCount('all') }, ...uniqueVehicles.map(v => ({ ...v, count: vehicleCount(v.value) }))]}
          />
          <DropdownFilter
            label="Alle Zuständigen" value={assigneeFilter} isOpen={isAssigneeOpen}
            onToggle={() => { closeAllDropdowns('assignee'); setIsAssigneeOpen(!isAssigneeOpen); }}
            onSelect={setAssigneeFilter}
            options={[{ value: 'all', label: 'Alle Zuständigen', count: assigneeCount('all') }, ...uniqueAssignees.map(a => ({ ...a, count: assigneeCount(a.value) }))]}
          />
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { closeAllDropdowns('sort'); setIsSortOpen(!isSortOpen); }}
              className="h-8 gap-1.5 px-2.5 text-xs font-medium"
            >
              <Icon name="arrow-up-down" className="h-3 w-3" />
              <span>Sortierung: {activeSortLabel}</span>
            </Button>
            {isSortOpen && (
              <div className="sq-overlay absolute right-0 top-full z-50 mt-1.5 min-w-[180px] overflow-hidden">
                {[
                  { value: 'dueDate', label: 'Fälligkeitsdatum' },
                  { value: 'priority', label: 'Priorität' },
                  { value: 'status', label: 'Status' },
                  { value: 'created', label: 'Neueste zuerst' },
                ].map(o => (
                  <button key={o.value} onClick={() => { setSortBy(o.value as typeof sortBy); setIsSortOpen(false); }}
                    className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors ${
                      sortBy === o.value
                        ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                        : 'text-foreground hover:bg-muted'
                    }`}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Unified task list — same component on mobile and desktop */}
      {tasksError ? (
        <div className="sq-card overflow-hidden">
          <ErrorState
            compact
            title="Aufgaben konnten nicht geladen werden"
            error={tasksError}
            onRetry={() => loadTasks.current()}
            className="py-12"
          />
        </div>
      ) : tasksLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="sq-card h-24 animate-pulse rounded-2xl md:h-20" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          compact
          icon={<Icon name="list-todo" className="h-5 w-5" />}
          title="Keine Aufgaben gefunden"
          description={hasFilters ? 'Filter oder Suche anpassen.' : 'Es sind noch keine Aufgaben vorhanden.'}
          action={hasFilters ? (
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              Filter zurücksetzen
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-2">
          {sorted.map((task) => (
            <TaskWorkItemCard
              key={task.id}
              task={task}
              isFlashing={flashingTaskId === task.id}
              onClick={() => openTaskDetail(task)}
              rowRef={(el) => { taskRowRefs.current[task.id] = el; }}
            />
          ))}
        </div>
      )}

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className={`text-xs ${textTertiary}`}>{sorted.length} von {tasks.length} Aufgaben</p>
      </div>

      </div>{/* End of main content wrapper */}

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
        onReloadDetail={reloadTaskDetail}
        onTaskUpdated={setDetailFull}
        runTaskAction={async (fn) => {
          await runTaskAction(fn);
        }}
      />


      <FormDialog
        open={isNewTaskOpen}
        onOpenChange={(open) => { if (!open) closeNewTask(); }}
        maxWidthClassName="sm:max-w-[680px]"
        title="Neuen Task anlegen"
        description={`Erstellt am ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} · Alle Pflichtfelder ausfüllen`}
        bodyClassName="p-0 flex flex-col"
        footer={(
          <div className="flex w-full items-center justify-between">
            <button
              type="button"
              onClick={closeNewTask}
              className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
            >
              Abbrechen
            </button>
            <div className="flex items-center gap-2.5">
              {taskStep > 0 && (
                <button
                  type="button"
                  onClick={() => setTaskStep(taskStep - 1)}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-all hover:bg-muted"
                >
                  <Icon name="chevron-left" className="w-3.5 h-3.5" />
                  Zurück
                </button>
              )}
              {taskStep < 3 ? (
                <button
                  type="button"
                  onClick={handleTaskNextStep}
                  className="sq-cta flex items-center gap-1.5 px-3 py-2 text-xs font-semibold"
                >
                  Weiter
                  <Icon name="chevron-right" className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmitTask}
                  className="sq-cta flex items-center gap-1.5 px-3 py-2 text-xs font-semibold"
                >
                  <Icon name="check-circle" className="w-3.5 h-3.5" />
                  Task anlegen
                </button>
              )}
            </div>
          </div>
        )}
      >
        {(() => {
        const steps = [
          { label: 'Grunddaten', icon: FileText },
          { label: 'Fahrzeug & Zuweisung', icon: Car },
          { label: 'Zeitplan', icon: Calendar },
          { label: 'Zusammenfassung', icon: CheckCircle },
        ];
        const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground outline-none transition-all text-xs focus:border-[color:var(--brand)] focus:ring-1 focus:ring-[color:var(--brand-soft)]';
        const labelClass = 'block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground';
        const sectionTitle = (icon: any, title: string) => {
          const Icon = icon;
          return (
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-5 h-5 rounded-lg flex items-center justify-center sq-tone-brand">
                <Icon className="w-5 h-5 text-[color:var(--brand)]" />
              </div>
              <h3 className={`text-base font-bold ${textPrimary}`}>{title}</h3>
            </div>
          );
        };
        const SummaryRow = ({ label, value }: { label: string; value: string }) => (
          <div className="flex items-center justify-between py-2">
            <span className={`text-xs ${textTertiary}`}>{label}</span>
            <span className={`text-xs font-medium ${textPrimary}`}>{value || '–'}</span>
          </div>
        );
        const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const allCategories: TaskCategory[] = [...TASK_CATEGORIES];
        const allPriorities: TaskPriority[] = ['Low', 'Medium', 'High', 'Critical'];
        const assigneesList = orgMembers;
        const stationsList = orgStations.filter((s) => s.status === 'ACTIVE');

        return (
          <>
              {/* Step Indicator */}
              <div className={`flex items-center gap-1 border-b shrink-0 px-5 py-3 ${'border-border'}`}>
                {steps.map((s, i) => {
                  const StepIcon = s.icon;
                  const isActive = i === taskStep;
                  const isDone = i < taskStep;
                  return (
                    <div key={i} className="flex items-center flex-1">
                      <button onClick={() => { if (isDone) setTaskStep(i); }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          isActive
                            ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                            : isDone
                              ? 'text-[color:var(--brand)] cursor-pointer hover:bg-[color:var(--brand-soft)]'
                              : 'text-muted-foreground/50'
                        }`}>
                        {isDone ? <Icon name="check-circle" className="w-3.5 h-3.5" /> : <StepIcon className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">{s.label}</span>
                      </button>
                      {i < steps.length - 1 && (
                        <div className={`flex-1 h-px mx-2 ${isDone ? 'bg-[color:var(--brand)]/40' : 'bg-border'}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-7 py-3">
                {taskStep === 0 && (
                  <div className="space-y-4">
                    {sectionTitle(FileText, 'Grunddaten')}
                    <div>
                      <label className={labelClass}>Titel *</label>
                      <input type="text" placeholder="z.B. Ölwechsel Mercedes AMG GT" value={newTask.title}
                        onChange={e => setNewTask({ ...newTask, title: e.target.value })} className={inputClass} />
                      {taskFormErrors.title && <p className="text-[11px] text-[color:var(--status-critical)] mt-1">{taskFormErrors.title}</p>}
                    </div>
                    <div>
                      <label className={labelClass}>Beschreibung *</label>
                      <textarea rows={3} placeholder="Detaillierte Beschreibung der Aufgabe..." value={newTask.description}
                        onChange={e => setNewTask({ ...newTask, description: e.target.value })} className={`${inputClass} resize-none`} />
                      {taskFormErrors.description && <p className="text-[11px] text-[color:var(--status-critical)] mt-1">{taskFormErrors.description}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Kategorie</label>
                        <select value={newTask.category} onChange={e => setNewTask({ ...newTask, category: e.target.value as TaskCategory })} className={inputClass}>
                          {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Priorität</label>
                        <div className="flex gap-1.5">
                          {allPriorities.map(p => {
                            const unselected = 'bg-card border-border text-muted-foreground';
                            const colors: Record<TaskPriority, string> = {
                              'Low': newTask.priority === p ? 'bg-[color:var(--status-nodata)] text-white border-transparent' : unselected,
                              'Medium': newTask.priority === p ? 'bg-[color:var(--status-watch)] text-white border-transparent' : unselected,
                              'High': newTask.priority === p ? 'bg-[color:var(--status-warning)] text-white border-transparent' : unselected,
                              'Critical': newTask.priority === p ? 'bg-[color:var(--status-critical)] text-white border-transparent' : unselected,
                            };
                            return (
                              <button key={p} onClick={() => setNewTask({ ...newTask, priority: p })}
                                className={`flex-1 py-2 rounded-lg border text-[11px] font-semibold transition-all ${colors[p]}`}>
                                {p}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {taskStep === 1 && (
                  <div className="space-y-4">
                    {sectionTitle(Car, 'Fahrzeug & Zuweisung')}
                    <div>
                      <label className={labelClass}>Fahrzeug *</label>
                      <select
                        value={newTask.vehicleLicense}
                        onChange={(e) => {
                          const license = e.target.value;
                          const veh = fleetVehicles.find((v) => v.license === license);
                          setNewTask({
                            ...newTask,
                            vehicleLicense: license,
                            stationId: veh?.homeStationId ?? veh?.stationId ?? newTask.stationId,
                          });
                        }}
                        className={inputClass}
                      >
                        <option value="">Fahrzeug auswählen...</option>
                        {uniqueVehicles.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                      </select>
                      {taskFormErrors.vehicleLicense && <p className="text-[11px] text-[color:var(--status-critical)] mt-1">{taskFormErrors.vehicleLicense}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Zugewiesen an *</label>
                        <select value={newTask.assignedUserId} onChange={e => setNewTask({ ...newTask, assignedUserId: e.target.value })} className={inputClass}>
                          <option value="">Mitarbeiter wählen...</option>
                          {assigneesList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        {taskFormErrors.assignedUserId && <p className="text-[11px] text-[color:var(--status-critical)] mt-1">{taskFormErrors.assignedUserId}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Station *</label>
                        <select
                          value={newTask.stationId}
                          onChange={(e) => {
                            const stationId = e.target.value;
                            setNewTask({ ...newTask, stationId });
                          }}
                          className={inputClass}
                        >
                          <option value="">{stationsList.length === 0 ? 'Keine Stationen' : 'Station wählen...'}</option>
                          {stationsList.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        {taskFormErrors.stationId && <p className="text-[11px] text-[color:var(--status-critical)] mt-1">{taskFormErrors.stationId}</p>}
                      </div>
                    </div>
                  </div>
                )}

                {taskStep === 2 && (
                  <div className="space-y-4">
                    {sectionTitle(Calendar, 'Zeitplan')}
                    <div className="rounded-lg p-3.5 mb-1 border border-transparent sq-tone-info">
                      <div className="flex items-start gap-2.5">
                        <Icon name="clock" className="w-5 h-5 mt-0.5 shrink-0" />
                        <p className="text-xs">
                          Erstellt von: <span className="font-semibold">{currentUserLabel}</span> — wird automatisch vom System gesetzt.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Fälligkeitsdatum *</label>
                        <input type="date" value={newTask.dueDate}
                          onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })} className={inputClass} />
                        {taskFormErrors.dueDate && <p className="text-[11px] text-[color:var(--status-critical)] mt-1">{taskFormErrors.dueDate}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Geschätzte Dauer *</label>
                        <select value={newTask.estimatedDuration} onChange={e => setNewTask({ ...newTask, estimatedDuration: e.target.value })} className={inputClass}>
                          <option value="">Dauer wählen...</option>
                          {['0.5h', '1h', '1.5h', '2h', '2.5h', '3h', '4h', '5h', '6h', '8h', '1 Tag', '2 Tage'].map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        {taskFormErrors.estimatedDuration && <p className="text-[11px] text-[color:var(--status-critical)] mt-1">{taskFormErrors.estimatedDuration}</p>}
                      </div>
                    </div>
                  </div>
                )}

                {taskStep === 3 && (
                  <div className="space-y-5">
                    {sectionTitle(CheckCircle, 'Zusammenfassung & Prüfung')}
                    <div className={`rounded-lg border p-4 space-y-0 divide-y ${
                      'bg-muted/40 border-border divide-border/60'
                    }`}>
                      <SummaryRow label="Titel" value={newTask.title} />
                      <SummaryRow label="Beschreibung" value={newTask.description} />
                      <div className="flex items-center justify-between py-2">
                        <span className={`text-xs ${textTertiary}`}>Kategorie</span>
                        <TaskCategoryChip category={newTask.category} />
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className={`text-xs ${textTertiary}`}>Priorität</span>
                        <TaskPriorityBadge priority={newTask.priority} />
                      </div>
                    </div>
                    <div className={`rounded-lg border p-4 space-y-0 divide-y ${
                      'bg-muted/40 border-border divide-border/60'
                    }`}>
                      <SummaryRow label="Fahrzeug" value={newTask.vehicleLicense ? (uniqueVehicles.find(v => v.value === newTask.vehicleLicense)?.label || newTask.vehicleLicense) : ''} />
                      <SummaryRow label="Zugewiesen an" value={orgMembers.find(m => m.id === newTask.assignedUserId)?.name ?? newTask.assignedUserId} />
                      <SummaryRow
                        label="Station"
                        value={orgStations.find((s) => s.id === newTask.stationId)?.name ?? '—'}
                      />
                    </div>
                    <div className={`rounded-lg border p-4 space-y-0 divide-y ${
                      'bg-muted/40 border-border divide-border/60'
                    }`}>
                      <SummaryRow label="Erstellt am" value={today} />
                      <SummaryRow label="Erstellt von" value={currentUserLabel} />
                      <SummaryRow label="Fälligkeitsdatum" value={newTask.dueDate} />
                      <SummaryRow label="Geschätzte Dauer" value={newTask.estimatedDuration} />
                    </div>
                    <div>
                      <label className={labelClass}>Notizen (optional)</label>
                      <textarea rows={2} placeholder="Zusätzliche Informationen zum Task..."
                        value={newTask.notes}
                        onChange={e => setNewTask({ ...newTask, notes: e.target.value })}
                        className={`${inputClass} resize-none`} />
                    </div>
                  </div>
                )}
              </div>
          </>
        );
      })()}
      </FormDialog>
    </div>
  );
}