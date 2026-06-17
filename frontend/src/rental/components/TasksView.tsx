import { AlertTriangle, Calendar, Camera, Car, CheckCircle, CircleDot, Clock, Eye, FileText, ListTodo, Shield, Sparkles, Timer, Wrench } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useMemo, useRef } from 'react';

import { useFleetVehicles } from '../FleetContext';
import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';
import type { ApiTask, ApiTaskSummary, ApiTaskType, CreateTaskPayload, Station } from '../../lib/api';
import { checklistPreviewForType } from '../lib/task-templates';
import { PageHeader, StatusChip, PriorityBadge, EmptyState, ErrorState, DataTable, AppDialog, FormDialog } from '../../components/patterns';
import type { StatusTone, DataTableColumn } from '../../components/patterns';

// View category → canonical backend TaskType.
const CATEGORY_TO_TASK_TYPE: Record<string, ApiTaskType> = {
  Cleaning: 'VEHICLE_CLEANING',
  Maintenance: 'VEHICLE_SERVICE',
  Repair: 'REPAIR',
  Inspection: 'VEHICLE_INSPECTION',
  Damage: 'REPAIR',
  'TÜV': 'VEHICLE_INSPECTION',
  Insurance: 'CUSTOM',
  Documents: 'DOCUMENT_REVIEW',
  'Tire Change': 'TIRE_CHECK',
  'Oil Change': 'VEHICLE_SERVICE',
};

const VIEW_PRIORITY_TO_API: Record<string, CreateTaskPayload['priority']> = {
  Low: 'LOW',
  Medium: 'NORMAL',
  High: 'HIGH',
  Critical: 'CRITICAL',
};

interface TasksViewProps {
  autoOpenNewTask?: boolean;
  onAutoOpenConsumed?: () => void;
  highlightedTaskId?: string | null;
  onHighlightConsumed?: () => void;
}

type TaskStatus = 'Open' | 'In Progress' | 'Waiting' | 'Completed' | 'Overdue';
type TaskPriority = 'Low' | 'Medium' | 'High' | 'Critical';
type TaskCategory = 'Cleaning' | 'Maintenance' | 'Repair' | 'Inspection' | 'Damage' | 'TÜV' | 'Insurance' | 'Documents' | 'Tire Change' | 'Oil Change';

interface Task {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  vehicleId: string;
  vehicleLicense: string;
  vehicleModel: string;
  station: string;
  assignedUserId: string;
  assignedUserName: string;
  createdDate: string;
  dueDate: string;
  completedDate?: string;
  estimatedDuration: string;
  notes?: string;
}

// ─── Backend (OrgTask) → view-model mapping ──────────────────────────
// Tasks now come from GET /organizations/:org/tasks. The backend stores
// enum values (status OPEN/IN_PROGRESS/DONE/CANCELLED, priority
// LOW/NORMAL/HIGH/CRITICAL) and a free-form category; we map them onto the
// display vocabulary this view already uses.
interface BackendTask {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  status: string;
  priority: string;
  vehicleId?: string | null;
  assignedUserId?: string | null;
  source?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  metadata?: Record<string, unknown> | null;
}

const KNOWN_CATEGORIES: TaskCategory[] = ['Cleaning', 'Maintenance', 'Repair', 'Inspection', 'Damage', 'TÜV', 'Insurance', 'Documents', 'Tire Change', 'Oil Change'];

function mapCategory(c?: string | null): TaskCategory {
  if (c && (KNOWN_CATEGORIES as string[]).includes(c)) return c as TaskCategory;
  // Auto-task categories that have no exact display bucket.
  if (c === 'BOKraft' || c === 'Service') return 'Inspection';
  return 'Maintenance';
}

function mapPriority(p?: string): TaskPriority {
  switch ((p || '').toUpperCase()) {
    case 'CRITICAL':
    case 'URGENT': return 'Critical';
    case 'HIGH': return 'High';
    case 'LOW': return 'Low';
    case 'NORMAL':
    case 'MEDIUM':
    default: return 'Medium';
  }
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function mapStatus(status: string, dueIso?: string | null): TaskStatus {
  const s = (status || '').toUpperCase();
  if (s === 'DONE' || s === 'CANCELLED') return 'Completed';
  if (s === 'WAITING') return 'Waiting';
  if (dueIso) {
    const due = new Date(dueIso);
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now() && s !== 'IN_PROGRESS' && s !== 'WAITING') return 'Overdue';
  }
  return s === 'IN_PROGRESS' ? 'In Progress' : 'Open';
}

const categoryIcons: Record<TaskCategory, typeof Wrench> = {
  'Cleaning': Sparkles,
  'Maintenance': Wrench,
  'Repair': Wrench,
  'Inspection': Eye,
  'Damage': Camera,
  'TÜV': Shield,
  'Insurance': FileText,
  'Documents': FileText,
  'Tire Change': CircleDot,
  'Oil Change': Timer,
};

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
    vehicleLicense: '', stationId: '', assignedUserId: '', createdBy: '',
    dueDate: '', estimatedDuration: '', notes: '',
  });
  const [taskFormErrors, setTaskFormErrors] = useState<Record<string, string>>({});
  const [flashingTaskId, setFlashingTaskId] = useState<string | null>(null);
  const taskRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const { fleetVehicles } = useFleetVehicles();
  const { orgId } = useRentalOrg();
  const [rawTasks, setRawTasks] = useState<BackendTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  // Full server detail for the open task (checklist / comments / timeline).
  const [detailFull, setDetailFull] = useState<ApiTask | null>(null);
  const [taskSummary, setTaskSummary] = useState<ApiTaskSummary | null>(null);
  const [orgMembers, setOrgMembers] = useState<{ id: string; name: string }[]>([]);
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
        setRawTasks(Array.isArray(rows) ? (rows as unknown as BackendTask[]) : []);
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

  // Load org tasks from the API (replaces the previous empty mock array).
  // V4.7.59 auto-tasks (source INSIGHT_*) show up here alongside manual ones.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setTasksLoading(true);
    setTasksError(null);
    api.tasks.list(orgId)
      .then((rows) => {
        if (!cancelled) {
          setRawTasks(Array.isArray(rows) ? (rows as unknown as BackendTask[]) : []);
          setTasksError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRawTasks([]);
          setTasksError(err instanceof Error ? err.message : 'Failed to load tasks');
        }
      })
      .finally(() => { if (!cancelled) setTasksLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);

  // Run a task mutation, then refresh the list + the open detail.
  const runTaskAction = async (fn: () => Promise<ApiTask>) => {
    if (mutating) return;
    setMutating(true);
    try {
      const updated = await fn();
      loadTasks.current();
      if (updated && detailFull && updated.id === detailFull.id) setDetailFull(updated);
    } catch (err) {
      console.error('Task action failed', err);
    } finally {
      setMutating(false);
    }
  };

  const RESOLUTION_REQUIRED: ApiTaskType[] = [
    'REPAIR', 'BRAKE_CHECK', 'TIRE_CHECK', 'BATTERY_CHECK', 'VEHICLE_SERVICE', 'VEHICLE_INSPECTION',
  ];

  const handleComplete = async () => {
    if (!orgId || !detailFull) return;
    let resolutionNote: string | undefined;
    if (RESOLUTION_REQUIRED.includes(detailFull.type)) {
      const entered = window.prompt('Abschluss-Notiz (erforderlich):', detailFull.resolutionNote ?? '');
      if (entered === null || !entered.trim()) return;
      resolutionNote = entered.trim();
    }
    await runTaskAction(() => api.tasks.complete(orgId, detailFull.id, resolutionNote ? { resolutionNote } : undefined));
    closeTaskDetail();
  };

  const handleCancelTask = async () => {
    if (!orgId || !detailFull) return;
    await runTaskAction(() => api.tasks.cancel(orgId, detailFull.id));
    closeTaskDetail();
  };

  const toggleChecklistItem = (itemId: string, isDone: boolean) => {
    if (!orgId || !detailFull) return;
    void runTaskAction(() => api.tasks.updateChecklistItem(orgId, detailFull.id, itemId, { isDone }));
  };

  // Enrich with vehicle metadata from the shared fleet context.
  const tasks = useMemo<Task[]>(() => {
    const vById = new Map(fleetVehicles.map((v) => [v.id, v]));
    const stationById = new Map(orgStations.map((s) => [s.id, s]));
    return rawTasks.map((t) => {
      const veh = t.vehicleId ? vById.get(t.vehicleId) : undefined;
      const metaStationId =
        typeof t.metadata?.stationId === 'string' ? t.metadata.stationId : null;
      const stationName =
        (metaStationId ? stationById.get(metaStationId)?.name : null) ??
        veh?.station ??
        '';
      const isAuto = !!t.source && t.source.startsWith('INSIGHT_');
      return {
        id: t.id,
        title: t.title,
        description: t.description || '',
        category: mapCategory(t.category),
        status: mapStatus(t.status, t.dueDate),
        priority: mapPriority(t.priority),
        vehicleId: t.vehicleId || '',
        vehicleLicense: veh?.license || '',
        vehicleModel: veh?.model || '',
        station: stationName,
        assignedUserId: t.assignedUserId ?? '',
        assignedUserName: (() => {
          const uid = t.assignedUserId;
          if (uid) return orgMembers.find((m) => m.id === uid)?.name ?? uid;
          return isAuto ? 'System' : 'Unassigned';
        })(),
        createdDate: fmtDate(t.createdAt),
        dueDate: fmtDate(t.dueDate),
        completedDate: t.completedAt ? fmtDate(t.completedAt) : undefined,
        estimatedDuration: '—',
        notes: isAuto ? 'Automatisch erzeugt durch SynqDrive Insights.' : undefined,
      };
    });
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
      vehicleLicense: '', stationId: '', assignedUserId: '', createdBy: '',
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
      if (!newTask.createdBy.trim()) errors.createdBy = 'Ersteller erforderlich';
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
      t.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
    const matchesVehicle = vehicleFilter === 'all' || t.vehicleLicense === vehicleFilter;
    const matchesAssignee = assigneeFilter === 'all' || t.assignedUserName === assigneeFilter;
    return matchesSearch && matchesStatus && matchesPriority && matchesCategory && matchesVehicle && matchesAssignee;
  });

  const priorityOrder: Record<TaskPriority, number> = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
  const statusOrder: Record<TaskStatus, number> = { 'Overdue': 0, 'Open': 1, 'Waiting': 2, 'In Progress': 3, 'Completed': 4 };

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'priority') return priorityOrder[a.priority] - priorityOrder[b.priority];
    if (sortBy === 'status') return statusOrder[a.status] - statusOrder[b.status];
    if (sortBy === 'created') return b.id.localeCompare(a.id);
    // dueDate default
    return a.dueDate.split('.').reverse().join('').localeCompare(b.dueDate.split('.').reverse().join(''));
  });

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
  const activeStatusLabel = statusFilter === 'all' ? 'All Status' : statusFilter;
  const activePriorityLabel = priorityFilter === 'all' ? 'All Priorities' : priorityFilter;
  const activeCategoryLabel = categoryFilter === 'all' ? 'All Categories' : categoryFilter;
  const activeVehicleLabel =
    vehicleFilter === 'all'
      ? 'All Vehicles'
      : uniqueVehicles.find(v => v.value === vehicleFilter)?.label ?? vehicleFilter;
  const activeAssigneeLabel = assigneeFilter === 'all' ? 'All Assignees' : assigneeFilter;
  const activeSortLabel =
    sortBy === 'dueDate'
      ? 'Due Date'
      : sortBy === 'priority'
        ? 'Priority'
        : sortBy === 'status'
          ? 'Status'
          : 'Newest First';
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
  const textSecondary = 'text-muted-foreground';
  const textTertiary = 'text-muted-foreground/70';

  const taskStatusTone = (status: TaskStatus): StatusTone => {
    switch (status) {
      case 'In Progress': return 'info';
      case 'Completed': return 'success';
      case 'Overdue': return 'critical';
      case 'Waiting': return 'watch';
      default: return 'watch';
    }
  };

  const TaskStatusChip = ({ status }: { status: TaskStatus }) => (
    <StatusChip tone={taskStatusTone(status)} dot>{status}</StatusChip>
  );

  const TaskPriorityBadge = ({ priority }: { priority: TaskPriority }) => (
    <PriorityBadge
      priority={priority === 'Critical' ? 'urgent' : priority.toLowerCase()}
      label={priority}
    />
  );

  const TaskCategoryChip = ({ category }: { category: TaskCategory }) => {
    const CatIcon = categoryIcons[category];
    return (
      <StatusChip tone="neutral" icon={<CatIcon className="h-3 w-3" />}>
        {category}
      </StatusChip>
    );
  };

  const taskColumns = useMemo<DataTableColumn<Task>[]>(() => [
    {
      key: 'task',
      header: 'Task',
      cell: (task) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-muted-foreground/70">{task.id}</span>
            {task.priority === 'Critical' && <Icon name="alert-triangle" className="w-3 h-3 text-[color:var(--status-critical)]" />}
          </div>
          <p className="text-xs font-semibold mt-0.5 text-foreground">{task.title}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      cell: (task) => <TaskCategoryChip category={task.category} />,
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      cell: (task) => (
        <>
          <p className="text-xs font-medium text-foreground">{task.vehicleLicense}</p>
          <p className="text-[11px] text-muted-foreground/70">{task.vehicleModel.split(' ').slice(0, 2).join(' ')}</p>
        </>
      ),
    },
    {
      key: 'station',
      header: 'Station',
      cell: (task) => <span className="text-xs text-muted-foreground">{task.station}</span>,
    },
    {
      key: 'assignee',
      header: 'Assigned To',
      cell: (task) => (
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-brand text-brand-foreground">
            {task.assignedUserName.split(' ').map((n) => n[0]).join('')}
          </div>
          <span className="text-xs text-muted-foreground">{task.assignedUserName}</span>
        </div>
      ),
    },
    {
      key: 'due',
      header: 'Due Date',
      cell: (task) => (
        <>
          <span className={`text-xs font-medium ${task.status === 'Overdue' ? 'text-[color:var(--status-critical)]' : 'text-foreground'}`}>{task.dueDate}</span>
          <p className="text-[11px] text-muted-foreground/70">{task.estimatedDuration}</p>
        </>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      cell: (task) => <TaskPriorityBadge priority={task.priority} />,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (task) => <TaskStatusChip status={task.status} />,
    },
  ], []);

  const DropdownFilter = ({ label, value, options, isOpen, onToggle, onSelect }: {
    label: string; value: string; options: { value: string; label: string; count?: number }[];
    isOpen: boolean; onToggle: () => void; onSelect: (v: string) => void;
  }) => (
    <div className="relative">
      <button onClick={onToggle} className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-medium transition-all ${
        value !== 'all'
          ? 'bg-[color:var(--brand-soft)] border-transparent text-[color:var(--brand-ink)]'
          : 'bg-card border-border text-foreground hover:bg-muted'
      }`}>
        <span>{value === 'all' ? label : options.find(o => o.value === value)?.label}</span>
        <Icon name="chevron-down" className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="sq-overlay absolute top-full mt-2 left-0 z-50 min-w-[180px] overflow-hidden">
          {options.map(o => (
            <button key={o.value} onClick={() => { onSelect(o.value); onToggle(); }}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-medium transition-colors ${
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
        title="Task Management"
        actions={(
          <button
            type="button"
            className="sq-press flex items-center gap-2 rounded-xl bg-[color:var(--brand)] px-3 py-2 text-[10px] font-semibold text-white shadow-[var(--shadow-1)] transition-all hover:opacity-90"
            onClick={openNewTask}
          >
            <Icon name="plus" className="h-4 w-4" />
            New Task
          </button>
        )}
      />

      {/* Segment metrics — canonical counts from GET /tasks/summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {[
          {
            label: 'Open',
            value: summaryOpen,
            helper: `${inProgressCount} in progress`,
            icon: ListTodo,
            tone: 'sq-tone-brand',
            filterVal: 'Open',
          },
          {
            label: 'Due Today',
            value: summaryDueToday,
            helper: 'fällig heute',
            icon: Calendar,
            tone: 'sq-tone-warning',
            filterVal: null,
          },
          {
            label: 'Overdue',
            value: summaryOverdue,
            helper: summaryOverdue > 0 ? 'needs attention' : 'no overdue tasks',
            icon: AlertTriangle,
            tone: summaryOverdue > 0 ? 'sq-tone-critical' : 'sq-tone-neutral',
            filterVal: 'Overdue',
          },
          {
            label: 'Critical',
            value: summaryCritical,
            helper: 'priority CRITICAL',
            icon: AlertTriangle,
            tone: summaryCritical > 0 ? 'sq-tone-critical' : 'sq-tone-neutral',
            filterVal: 'Critical',
          },
          {
            label: 'Assigned To Me',
            value: summaryAssignedToMe,
            helper: 'my open tasks',
            icon: CheckCircle,
            tone: 'sq-tone-info',
            filterVal: null,
          },
        ].map(card => {
          const isActive = card.filterVal != null && statusFilter === card.filterVal;
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
              disabled={card.filterVal == null && card.label !== 'Due Today'}
              className={`group sq-card sq-press rounded-2xl p-4 text-left shadow-[var(--shadow-1)] transition-all ${
                isActive ? 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_22%,transparent)]' : 'hover:bg-muted/35'
              } ${card.filterVal == null ? 'cursor-default' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-muted-foreground">{card.label}</p>
                  <p className="mt-1 truncate text-[20px] font-bold leading-none tracking-[-0.03em] text-foreground tabular-nums">
                    {card.value}
                  </p>
                  <p className="mt-2 truncate text-[10px] font-medium text-muted-foreground">{card.helper}</p>
                </div>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${card.tone}`}>
                  <MetricIcon className="h-4 w-4" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon name="filter" className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <h2 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Filters</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Showing {sorted.length} of {tasks.length} tasks
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {statusFilter !== 'all' && (
              <button type="button" onClick={() => setStatusFilter('all')} className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-brand">
                {activeStatusLabel} active ×
              </button>
            )}
            {priorityFilter !== 'all' && (
              <button type="button" onClick={() => setPriorityFilter('all')} className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-warning">
                {activePriorityLabel} active ×
              </button>
            )}
            {categoryFilter !== 'all' && (
              <button type="button" onClick={() => setCategoryFilter('all')} className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-neutral">
                {activeCategoryLabel} active ×
              </button>
            )}
            {vehicleFilter !== 'all' && (
              <button type="button" onClick={() => setVehicleFilter('all')} className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-neutral">
                Vehicle active ×
              </button>
            )}
            {assigneeFilter !== 'all' && (
              <button type="button" onClick={() => setAssigneeFilter('all')} className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-neutral">
                Assignee active ×
              </button>
            )}
            {searchQuery && (
              <span className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-neutral">
                Search active
              </span>
            )}
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-[10px] font-semibold transition-all sq-tone-critical hover:opacity-90"
              >
                <Icon name="x" className="h-3.5 w-3.5" />
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[240px] relative">
            <Icon name="search" className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 ${textTertiary}`} />
            <input
              type="text"
              placeholder="Search tasks, vehicles, assignees..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground outline-none transition-all text-xs focus:border-[color:var(--brand)]"
            />
          </div>
          <DropdownFilter
            label="Status" value={statusFilter} isOpen={isStatusOpen}
            onToggle={() => { closeAllDropdowns('status'); setIsStatusOpen(!isStatusOpen); }}
            onSelect={setStatusFilter}
            options={[
              { value: 'all', label: 'All Status', count: statusCount('all') },
              { value: 'Open', label: 'Open', count: statusCount('Open') },
              { value: 'In Progress', label: 'In Progress', count: statusCount('In Progress') },
              { value: 'Waiting', label: 'Waiting', count: statusCount('Waiting') },
              { value: 'Completed', label: 'Completed', count: statusCount('Completed') },
              { value: 'Overdue', label: 'Overdue', count: statusCount('Overdue') },
            ]}
          />
          <DropdownFilter
            label="Priority" value={priorityFilter} isOpen={isPriorityOpen}
            onToggle={() => { closeAllDropdowns('priority'); setIsPriorityOpen(!isPriorityOpen); }}
            onSelect={setPriorityFilter}
            options={[
              { value: 'all', label: 'All Priorities', count: priorityCount('all') },
              { value: 'Critical', label: 'Critical', count: priorityCount('Critical') },
              { value: 'High', label: 'High', count: priorityCount('High') },
              { value: 'Medium', label: 'Medium', count: priorityCount('Medium') },
              { value: 'Low', label: 'Low', count: priorityCount('Low') },
            ]}
          />
          <DropdownFilter
            label="Category" value={categoryFilter} isOpen={isCategoryOpen}
            onToggle={() => { closeAllDropdowns('category'); setIsCategoryOpen(!isCategoryOpen); }}
            onSelect={setCategoryFilter}
            options={[
              { value: 'all', label: 'All Categories', count: categoryCount('all') },
              ...(['Cleaning', 'Maintenance', 'Repair', 'Inspection', 'Damage', 'TÜV', 'Insurance', 'Documents', 'Tire Change', 'Oil Change'] as TaskCategory[]).map(c => ({ value: c, label: c, count: categoryCount(c) })),
            ]}
          />
          <DropdownFilter
            label="Vehicle" value={vehicleFilter} isOpen={isVehicleOpen}
            onToggle={() => { closeAllDropdowns('vehicle'); setIsVehicleOpen(!isVehicleOpen); }}
            onSelect={setVehicleFilter}
            options={[{ value: 'all', label: 'All Vehicles', count: vehicleCount('all') }, ...uniqueVehicles.map(v => ({ ...v, count: vehicleCount(v.value) }))]}
          />
          <DropdownFilter
            label="Assignee" value={assigneeFilter} isOpen={isAssigneeOpen}
            onToggle={() => { closeAllDropdowns('assignee'); setIsAssigneeOpen(!isAssigneeOpen); }}
            onSelect={setAssigneeFilter}
            options={[{ value: 'all', label: 'All Assignees', count: assigneeCount('all') }, ...uniqueAssignees.map(a => ({ ...a, count: assigneeCount(a.value) }))]}
          />
          {/* Sort */}
          <div className="relative">
            <button onClick={() => { closeAllDropdowns('sort'); setIsSortOpen(!isSortOpen); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted text-xs font-medium transition-all">
              <Icon name="arrow-up-down" className="w-3 h-3" />
              <span>Sort: {activeSortLabel}</span>
            </button>
            {isSortOpen && (
              <div className="sq-overlay absolute top-full mt-2 right-0 z-50 min-w-[160px] overflow-hidden">
                {[
                  { value: 'dueDate', label: 'Due Date' },
                  { value: 'priority', label: 'Priority' },
                  { value: 'status', label: 'Status' },
                  { value: 'created', label: 'Newest First' },
                ].map(o => (
                  <button key={o.value} onClick={() => { setSortBy(o.value as any); setIsSortOpen(false); }}
                    className={`w-full px-3 py-2.5 text-left text-xs font-medium transition-colors ${
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

      {/* Tasks Table */}
      {tasksError ? (
        <div className="sq-card overflow-hidden">
          <ErrorState
            compact
            title="Could not load tasks"
            error={tasksError}
            onRetry={() => loadTasks.current()}
            className="py-12"
          />
        </div>
      ) : (
        <DataTable
          columns={taskColumns}
          rows={sorted}
          getRowKey={(task) => task.id}
          loading={tasksLoading}
          skeletonRows={8}
          dense
          stickyHeader
          onRowClick={openTaskDetail}
          getRowClassName={(task) => {
            if (flashingTaskId === task.id) {
              return 'bg-[color:var(--brand-soft)] ring-1 ring-[color:var(--brand-soft)]';
            }
            if (task.status === 'Overdue') {
              return 'bg-[color:var(--status-critical-soft)]';
            }
            return undefined;
          }}
          rowRef={(task, el) => {
            taskRowRefs.current[task.id] = el;
          }}
          rowActions={() => (
            <Icon name="chevron-right" className="w-5 h-5 text-muted-foreground/50" />
          )}
          empty={(
            <EmptyState
              compact
              icon={<Icon name="list-todo" className="h-5 w-5" />}
              title="No tasks match your filters"
              description="Try adjusting your search or filter criteria."
            />
          )}
        />
      )}

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className={`text-xs ${textTertiary}`}>Showing {sorted.length} of {tasks.length} tasks</p>
      </div>

      </div>{/* End of main content wrapper */}

      <AppDialog
        open={!!selectedTask}
        onOpenChange={(open) => { if (!open) closeTaskDetail(); }}
        maxWidthClassName="sm:max-w-3xl"
      >
        {selectedTask && (
          <>
            <div className="sticky top-0 z-10 border-b border-border bg-card px-6 pb-5 pt-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-mono ${textTertiary}`}>{selectedTask.id}</span>
                    <TaskStatusChip status={selectedTask.status} />
                    <TaskPriorityBadge priority={selectedTask.priority} />
                  </div>
                  <h2 className={`text-base font-bold ${textPrimary}`}>{selectedTask.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  {detailFull && detailFull.status === 'WAITING' && (
                    <button
                      disabled={mutating}
                      onClick={() => runTaskAction(() => api.tasks.start(orgId!, detailFull.id))}
                      className="px-3 py-2 rounded-lg bg-brand hover:bg-[color:var(--brand-hover)] text-brand-foreground text-xs font-semibold transition-all shadow-sm disabled:opacity-50"
                    >
                      Resume
                    </button>
                  )}
                  {detailFull && detailFull.status === 'OPEN' && (
                    <button
                      disabled={mutating}
                      onClick={() => runTaskAction(() => api.tasks.start(orgId!, detailFull.id))}
                      className="px-3 py-2 rounded-lg bg-brand hover:bg-[color:var(--brand-hover)] text-brand-foreground text-xs font-semibold transition-all shadow-sm disabled:opacity-50"
                    >
                      Start Task
                    </button>
                  )}
                  {detailFull && (detailFull.status === 'OPEN' || detailFull.status === 'IN_PROGRESS' || detailFull.status === 'WAITING') && (
                    <button
                      disabled={mutating}
                      onClick={handleComplete}
                      className="px-3 py-2 rounded-lg bg-[color:var(--status-positive)] hover:opacity-90 text-white text-xs font-semibold transition-all shadow-sm disabled:opacity-50"
                    >
                      Complete
                    </button>
                  )}
                  {detailFull && detailFull.status === 'IN_PROGRESS' && (
                    <button
                      disabled={mutating}
                      onClick={() => runTaskAction(() => api.tasks.waiting(orgId!, detailFull.id))}
                      className="px-3 py-2 rounded-lg bg-[color:var(--status-watch)] hover:opacity-90 text-white text-xs font-semibold transition-all shadow-sm disabled:opacity-50"
                    >
                      Set Waiting
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="max-h-[min(70vh,100dvh-12rem)] overflow-y-auto p-6 space-y-5">
              {/* Description */}
              <div>
                <h4 className={`text-xs uppercase tracking-wider font-semibold mb-2 ${textTertiary}`}>Description</h4>
                <p className={`text-xs ${textSecondary}`}>{selectedTask.description || '—'}</p>
              </div>

              {detailFull && (
                <div className={`rounded-lg border p-4 ${'bg-muted/40 border-border'}`}>
                  <h4 className={`text-xs uppercase tracking-wider font-semibold mb-3 ${textTertiary}`}>Task Meta</h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><span className={textSecondary}>Type</span><p className={`font-medium ${textPrimary}`}>{detailFull.type.replace(/_/g, ' ')}</p></div>
                    <div><span className={textSecondary}>Source</span><p className={`font-medium ${textPrimary}`}>{detailFull.sourceType}{detailFull.source ? ` · ${detailFull.source}` : ''}</p></div>
                    <div><span className={textSecondary}>Priority</span><p className={`font-medium ${textPrimary}`}>{detailFull.priority}</p></div>
                    <div><span className={textSecondary}>Status</span><p className={`font-medium ${textPrimary}`}>{detailFull.status}</p></div>
                    {(detailFull.estimatedCostCents != null || detailFull.actualCostCents != null) && (
                      <>
                        <div><span className={textSecondary}>Est. Cost</span><p className={`font-medium ${textPrimary}`}>{detailFull.estimatedCostCents != null ? `${(detailFull.estimatedCostCents / 100).toFixed(2)} €` : '—'}</p></div>
                        <div><span className={textSecondary}>Actual Cost</span><p className={`font-medium ${textPrimary}`}>{detailFull.actualCostCents != null ? `${(detailFull.actualCostCents / 100).toFixed(2)} €` : '—'}</p></div>
                      </>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detailFull.vehicleId && <span className="text-[10px] px-2 py-1 rounded-full border border-border bg-card">Vehicle · {detailFull.vehicleId.slice(0, 8)}…</span>}
                    {detailFull.bookingId && <span className="text-[10px] px-2 py-1 rounded-full border border-border bg-card">Booking · {detailFull.bookingId.slice(0, 8)}…</span>}
                    {detailFull.customerId && <span className="text-[10px] px-2 py-1 rounded-full border border-border bg-card">Customer · {detailFull.customerId.slice(0, 8)}…</span>}
                    {detailFull.vendorId && <span className="text-[10px] px-2 py-1 rounded-full border border-border bg-card">Vendor · {detailFull.vendorId.slice(0, 8)}…</span>}
                    {detailFull.alertId && <span className="text-[10px] px-2 py-1 rounded-full border border-border bg-card">Alert · {detailFull.alertId.slice(0, 8)}…</span>}
                    {detailFull.documentId && <span className="text-[10px] px-2 py-1 rounded-full border border-border bg-card">Document · {detailFull.documentId.slice(0, 8)}…</span>}
                  </div>
                </div>
              )}

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-lg border p-4 ${'bg-muted/40 border-border'}`}>
                  <h4 className={`text-xs uppercase tracking-wider font-semibold mb-3 ${textTertiary}`}>Task Details</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${textSecondary}`}>Category</span>
                      <TaskCategoryChip category={selectedTask.category} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${textSecondary}`}>Created</span>
                      <span className={`text-xs font-medium ${textPrimary}`}>{selectedTask.createdDate}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${textSecondary}`}>Due Date</span>
                      <span className={`text-xs font-medium ${selectedTask.status === 'Overdue' ? 'text-[color:var(--status-critical)]' : textPrimary}`}>{selectedTask.dueDate}</span>
                    </div>
                    {selectedTask.completedDate && (
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${textSecondary}`}>Completed</span>
                        <span className="text-[10px] font-medium text-[color:var(--status-positive)]">{selectedTask.completedDate}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${textSecondary}`}>Est. Duration</span>
                      <span className={`text-xs font-medium ${textPrimary}`}>{selectedTask.estimatedDuration}</span>
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg border p-4 ${'bg-muted/40 border-border'}`}>
                  <h4 className={`text-xs uppercase tracking-wider font-semibold mb-3 ${textTertiary}`}>Assignment</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${textSecondary}`}>Assigned To</span>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-brand text-brand-foreground">
                          {selectedTask.assignedUserName.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className={`text-xs font-medium ${textPrimary}`}>{selectedTask.assignedUserName}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${textSecondary}`}>Station</span>
                      <span className={`text-xs font-medium ${textPrimary}`}>{selectedTask.station}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Vehicle Info */}
              <div className="rounded-lg border p-4 border-l-4 bg-[color:var(--brand-soft)]/50 border-border border-l-[color:var(--brand)]">
                <div className="flex items-center gap-3">
                  <Icon name="car" className="w-5 h-5 text-[color:var(--brand)]" />
                  <div>
                    <p className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Linked Vehicle</p>
                    <p className={`text-xs font-semibold mt-0.5 ${textPrimary}`}>{selectedTask.vehicleModel}</p>
                    <p className={`text-xs ${textSecondary}`}>{selectedTask.vehicleLicense} · {selectedTask.station}</p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedTask.notes && (
                <div className="rounded-lg border p-4 border-l-4 bg-[color:var(--status-watch-soft)] border-border border-l-[color:var(--status-watch)]">
                  <div className="flex items-start gap-3">
                    <Icon name="file-text" className="w-5 h-5 mt-0.5 text-[color:var(--status-watch)]" />
                    <div>
                      <p className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Notes</p>
                      <p className={`text-xs mt-1 ${'text-foreground/80'}`}>{selectedTask.notes}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Checklist (from server detail) */}
              {detailFull && detailFull.checklist && detailFull.checklist.length > 0 && (
                <div>
                  <h4 className={`text-xs uppercase tracking-wider font-semibold mb-2 ${textTertiary}`}>Checklist</h4>
                  <div className="space-y-1.5">
                    {detailFull.checklist.map((item) => (
                      <label key={item.id} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer ${'bg-muted/40 border-border'}`}>
                        <input
                          type="checkbox"
                          checked={item.isDone}
                          disabled={mutating || detailFull.status === 'DONE' || detailFull.status === 'CANCELLED'}
                          onChange={(e) => toggleChecklistItem(item.id, e.target.checked)}
                          className="w-4 h-4 rounded accent-[color:var(--status-positive)]"
                        />
                        <span className={`text-xs ${item.isDone ? 'line-through ' + textTertiary : textPrimary}`}>{item.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Resolution note (when completed) */}
              {detailFull && detailFull.resolutionNote && (
                <div className="rounded-lg border p-4 border-l-4 bg-[color:var(--status-positive-soft)] border-border border-l-[color:var(--status-positive)]">
                  <p className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Resolution</p>
                  <p className={`text-xs mt-1 ${'text-foreground/80'}`}>{detailFull.resolutionNote}</p>
                </div>
              )}

              {detailFull && detailFull.comments && detailFull.comments.length > 0 && (
                <div>
                  <h4 className={`text-xs uppercase tracking-wider font-semibold mb-2 ${textTertiary}`}>Comments</h4>
                  <div className="space-y-2">
                    {detailFull.comments.map((c) => (
                      <div key={c.id} className={`rounded-lg border px-3 py-2 text-xs ${'bg-muted/40 border-border'}`}>
                        <p className={textPrimary}>{c.body}</p>
                        <p className={`mt-1 ${textTertiary}`}>{fmtDate(c.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailFull && detailFull.attachments && detailFull.attachments.length > 0 && (
                <div>
                  <h4 className={`text-xs uppercase tracking-wider font-semibold mb-2 ${textTertiary}`}>Attachments</h4>
                  <div className="space-y-1.5">
                    {detailFull.attachments.map((a) => (
                      <a key={a.id} href={a.fileUrl} target="_blank" rel="noopener noreferrer" className={`block text-xs underline ${textSecondary}`}>
                        {a.fileName ?? a.fileUrl}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline (from server detail) */}
              {detailFull && detailFull.timeline && detailFull.timeline.length > 0 && (
                <div>
                  <h4 className={`text-xs uppercase tracking-wider font-semibold mb-2 ${textTertiary}`}>Timeline</h4>
                  <div className="space-y-1.5">
                    {detailFull.timeline.slice(0, 8).map((ev) => (
                      <div key={ev.id} className="flex items-center justify-between text-[11px]">
                        <span className={textSecondary}>
                          {ev.type.replace(/_/g, ' ')}{ev.oldValue || ev.newValue ? `: ${ev.oldValue ?? '—'} → ${ev.newValue ?? '—'}` : ''}
                        </span>
                        <span className={textTertiary}>{fmtDate(ev.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {detailFull && detailFull.status !== 'DONE' && detailFull.status !== 'CANCELLED' && (
                <div className="flex items-center gap-3 pt-2">
                  <button
                    disabled={mutating}
                    onClick={handleCancelTask}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-[color:var(--status-critical)] hover:opacity-90 text-white text-xs font-semibold transition-all shadow-sm disabled:opacity-50"
                  >
                    <Icon name="x" className="w-5 h-5" />
                    Cancel Task
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </AppDialog>

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
        const allCategories: TaskCategory[] = ['Cleaning', 'Maintenance', 'Repair', 'Inspection', 'Damage', 'TÜV', 'Insurance', 'Documents', 'Tire Change', 'Oil Change'];
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
                    {sectionTitle(Calendar, 'Zeitplan & Ersteller')}
                    <div className="rounded-lg p-3.5 mb-1 border border-transparent sq-tone-info">
                      <div className="flex items-start gap-2.5">
                        <Icon name="clock" className="w-5 h-5 mt-0.5 shrink-0" />
                        <p className="text-xs">
                          Erstellungsdatum: <span className="font-semibold">{today}</span> – wird automatisch gesetzt.
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
                    <div>
                      <label className={labelClass}>Erstellt von *</label>
                      <div className="relative">
                        <Icon name="user" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/50" />
                        <select value={newTask.createdBy} onChange={e => setNewTask({ ...newTask, createdBy: e.target.value })} className={`${inputClass} pl-9`}>
                          <option value="">Ersteller wählen...</option>
                          {assigneesList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      {taskFormErrors.createdBy && <p className="text-[11px] text-[color:var(--status-critical)] mt-1">{taskFormErrors.createdBy}</p>}
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
                      <SummaryRow label="Erstellt von" value={newTask.createdBy} />
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