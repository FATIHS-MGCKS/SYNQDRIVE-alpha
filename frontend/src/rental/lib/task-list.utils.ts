import type { ApiTask } from '../../lib/api';
import type { TaskBucket, TaskCompletionMode } from '../../lib/tasks/types';
import { resolveTaskResponsibility, type OrgMemberForRouting } from './task-responsibility.utils';
import {
  TASK_CATEGORIES,
  type TaskCategory,
  type TaskPriorityView,
} from './task-create.utils';

export type TaskListStatus = 'Open' | 'In Progress' | 'Waiting' | 'Completed' | 'Overdue';
export type TaskListPriority = TaskPriorityView;

export interface TaskListRow {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  type: string;
  status: TaskListStatus;
  priority: TaskListPriority;
  source: string | null;
  sourceType: string;
  displaySource: string;
  isSystemTask: boolean;
  vehicleId: string;
  vehicleLicense: string;
  vehicleModel: string;
  station: string;
  assignedUserId: string;
  assignedUserName: string;
  createdByUserId: string | null;
  createdByUserName: string;
  createdAtRaw: string | null;
  createdDate: string;
  dueDateRaw: string | null;
  dueDate: string;
  completedAtRaw: string | null;
  completedDate?: string;
  estimatedDuration: string;
  notes?: string;
  linkedObjectLabel: string;
  linkedObjectSecondary: string | null;
  checklistProgressPercent: number | null;
  checklistProgressLabel: string | null;
  completionMode: TaskCompletionMode | null;
  completionModeLabel: string | null;
  isOverdue: boolean;
  serverBucket: TaskBucket | null;
}

export type OrgMemberRef = OrgMemberForRouting;

export interface FleetVehicleRef {
  id: string;
  license: string;
  model: string;
  station?: string;
}

export interface StationRef {
  id: string;
  name: string;
}

const KNOWN_CATEGORIES: TaskCategory[] = [...TASK_CATEGORIES];

export function shortTaskId(id: string): string {
  if (!id || id.length < 8) return id;
  return `#…${id.slice(-4)}`;
}

export function fmtTaskDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function mapTaskCategory(c?: string | null): TaskCategory {
  if (c && (KNOWN_CATEGORIES as string[]).includes(c)) return c as TaskCategory;
  if (c === 'BOKraft' || c === 'Service') return 'Inspection';
  return 'Maintenance';
}

export function mapTaskPriority(p?: string): TaskListPriority {
  switch ((p || '').toUpperCase()) {
    case 'CRITICAL':
    case 'URGENT':
      return 'Critical';
    case 'HIGH':
      return 'High';
    case 'LOW':
      return 'Low';
    case 'NORMAL':
    case 'MEDIUM':
    default:
      return 'Medium';
  }
}

export function mapTaskStatus(
  status: string,
  isOverdue = false,
): TaskListStatus {
  const s = (status || '').toUpperCase();
  if (s === 'DONE' || s === 'CANCELLED') return 'Completed';
  if (s === 'WAITING') return 'Waiting';
  if (s === 'IN_PROGRESS') return 'In Progress';
  if (isOverdue) return 'Overdue';
  return 'Open';
}

export function resolveDisplaySource(
  sourceType?: string | null,
  source?: string | null,
): string {
  const st = (sourceType ?? '').toUpperCase();
  const src = (source ?? '').toUpperCase();
  if (st === 'MANUAL') return 'Manuell';
  if (src.startsWith('INSIGHT_') || st === 'HEALTH') return 'SynqDrive Insights';
  if (st === 'SYSTEM') {
    if (src.includes('BOOKING')) return 'Buchung';
    if (src.includes('DOCUMENT')) return 'Dokument';
    if (src.includes('DAMAGE')) return 'Schaden';
    if (src.includes('SERVICE')) return 'Service';
    return 'SynqDrive Automation';
  }
  if (src.includes('BOOKING')) return 'Buchung';
  if (src.includes('DOCUMENT')) return 'Dokument';
  if (src.includes('DAMAGE')) return 'Schaden';
  if (src.includes('SERVICE')) return 'Service';
  return st ? st.charAt(0) + st.slice(1).toLowerCase() : 'Manuell';
}

export function isSystemTask(
  task: Pick<ApiTask, 'sourceType' | 'source' | 'createdByUserId'>,
): boolean {
  if (task.createdByUserId) return false;
  const st = (task.sourceType ?? '').toUpperCase();
  return st === 'SYSTEM' || st === 'HEALTH' || !!(task.source && task.source.startsWith('INSIGHT_'));
}

export function resolveUserName(
  userId: string | null | undefined,
  members: OrgMemberRef[],
  fallback: string,
): string {
  if (!userId) return fallback;
  const member = members.find((m) => m.id === userId);
  if (member) return member.name;
  return fallback;
}

export function resolveCreatorName(
  task: Pick<ApiTask, 'createdByUserId' | 'sourceType' | 'source'>,
  members: OrgMemberRef[],
): string {
  if (task.createdByUserId) {
    return resolveUserName(task.createdByUserId, members, 'Unbekannt');
  }
  if (isSystemTask(task)) {
    const src = (task.source ?? '').toUpperCase();
    if (src.startsWith('INSIGHT_') || (task.sourceType ?? '').toUpperCase() === 'HEALTH') {
      return 'SynqDrive Insights';
    }
    return 'SynqDrive Automation';
  }
  return 'Unbekannt';
}

export function resolveAssigneeName(
  assignedUserId: string | null | undefined,
  members: OrgMemberRef[],
): string {
  if (assignedUserId) {
    return resolveUserName(assignedUserId, members, 'Unbekannt');
  }
  return 'Nicht zugewiesen';
}

export function userInitials(name: string): string {
  if (
    !name ||
    name === 'Nicht zugewiesen' ||
    name === 'SynqDrive Automation' ||
    name === 'System' ||
    name === 'Unbekannt'
  ) {
    return '?';
  }
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return '?';
}

export function resolvePrimaryLinkedObjectLabel(
  task: Pick<ApiTask, 'linkedObjects' | 'vehicleId' | 'bookingId' | 'invoiceId' | 'documentId'>,
  vehicle?: FleetVehicleRef,
): { primary: string; secondary: string | null } {
  const linked = task.linkedObjects?.[0];
  if (linked?.primaryLabel) {
    return {
      primary: linked.primaryLabel,
      secondary: linked.secondaryLabel ?? null,
    };
  }
  if (vehicle?.license) {
    return {
      primary: vehicle.license,
      secondary: vehicle.model || null,
    };
  }
  if (task.bookingId) return { primary: 'Buchung', secondary: null };
  if (task.invoiceId) return { primary: 'Rechnung', secondary: null };
  if (task.documentId) return { primary: 'Dokument', secondary: null };
  return { primary: '—', secondary: null };
}

function formatChecklistProgressLabel(
  progress: ApiTask['checklistProgress'],
): { percent: number | null; label: string | null } {
  if (!progress?.hasChecklist) return { percent: null, label: null };
  const percent = progress.progressPercent;
  const label = `${progress.completedItems} von ${progress.totalItems}`;
  return { percent, label };
}

function resolveCompletionModeLabel(mode: TaskCompletionMode | null | undefined): string | null {
  if (!mode || mode === 'MANUAL') return null;
  if (mode === 'AUTO_RESOLVED') return 'Automatisch aufgelöst';
  if (mode === 'SUPERSEDED') return 'Ersetzt';
  return null;
}

function formatEstimatedDuration(minutes?: number | null): string {
  if (!minutes || minutes < 1) return '—';
  if (minutes < 60) return `${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} Std. ${rest} Min.` : `${hours} Std.`;
}

export function mapApiTaskToTaskListRow(
  task: ApiTask,
  ctx: {
    fleetVehicles: FleetVehicleRef[];
    orgMembers: OrgMemberRef[];
    orgStations: StationRef[];
  },
): TaskListRow {
  const veh = task.vehicleId
    ? ctx.fleetVehicles.find((v) => v.id === task.vehicleId)
    : undefined;
  const metaStationId =
    typeof task.metadata?.stationId === 'string' ? task.metadata.stationId : null;
  const stationName =
    (metaStationId ? ctx.orgStations.find((s) => s.id === metaStationId)?.name : null) ??
    veh?.station ??
    '';
  const systemTask = isSystemTask(task);
  const stationId =
    typeof task.metadata?.stationId === 'string' ? task.metadata.stationId : null;
  const responsibility = resolveTaskResponsibility(task, ctx.orgMembers, stationId);
  const linked = resolvePrimaryLinkedObjectLabel(task, veh);
  const checklist = formatChecklistProgressLabel(task.checklistProgress);

  return {
    id: task.id,
    title: task.title,
    description: task.description || '',
    category: mapTaskCategory(task.category),
    type: task.type,
    status: mapTaskStatus(task.status, task.isOverdue),
    priority: mapTaskPriority(task.priority),
    source: task.source,
    sourceType: task.sourceType,
    displaySource: resolveDisplaySource(task.sourceType, task.source),
    isSystemTask: systemTask,
    vehicleId: task.vehicleId || '',
    vehicleLicense: veh?.license || '',
    vehicleModel: veh?.model || '',
    station: stationName,
    assignedUserId: task.assignedUserId ?? '',
    assignedUserName: responsibility.displayName,
    createdByUserId: task.createdByUserId ?? null,
    createdByUserName: resolveCreatorName(task, ctx.orgMembers),
    createdAtRaw: task.createdAt ?? null,
    createdDate: fmtTaskDate(task.createdAt),
    dueDateRaw: task.dueDate ?? null,
    dueDate: fmtTaskDate(task.dueDate),
    completedAtRaw: task.completedAt ?? null,
    completedDate: task.completedAt ? fmtTaskDate(task.completedAt) : undefined,
    estimatedDuration: formatEstimatedDuration(task.estimatedDurationMinutes),
    notes: systemTask && task.source?.startsWith('INSIGHT_')
      ? 'Automatisch erzeugt durch SynqDrive Insights.'
      : undefined,
    linkedObjectLabel: linked.primary,
    linkedObjectSecondary: linked.secondary,
    checklistProgressPercent: checklist.percent,
    checklistProgressLabel: checklist.label,
    completionMode: task.completionMode ?? null,
    completionModeLabel: resolveCompletionModeLabel(task.completionMode),
    isOverdue: task.isOverdue,
    serverBucket: task.bucket ?? null,
  };
}

export const TASK_STATUS_LABEL_DE: Record<TaskListStatus, string> = {
  Open: 'Offen',
  'In Progress': 'In Bearbeitung',
  Waiting: 'Wartend',
  Completed: 'Erledigt',
  Overdue: 'Überfällig',
};

export const TASK_PRIORITY_LABEL_DE: Record<TaskListPriority, string> = {
  Critical: 'Kritisch',
  High: 'Hoch',
  Medium: 'Mittel',
  Low: 'Niedrig',
};

export function taskStatusLabelDe(status: TaskListStatus): string {
  return TASK_STATUS_LABEL_DE[status] ?? status;
}

export function taskPriorityLabelDe(priority: TaskListPriority): string {
  return TASK_PRIORITY_LABEL_DE[priority] ?? priority;
}

export function sortTaskListRows(
  rows: TaskListRow[],
  sortBy: 'dueDate' | 'priority' | 'status' | 'created',
): TaskListRow[] {
  const priorityOrder: Record<TaskListPriority, number> = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Low: 3,
  };
  const statusOrder: Record<TaskListStatus, number> = {
    Overdue: 0,
    Open: 1,
    Waiting: 2,
    'In Progress': 3,
    Completed: 4,
  };

  return [...rows].sort((a, b) => {
    if (sortBy === 'priority') return priorityOrder[a.priority] - priorityOrder[b.priority];
    if (sortBy === 'status') return statusOrder[a.status] - statusOrder[b.status];
    if (sortBy === 'created') {
      const aTime = a.createdAtRaw ? new Date(a.createdAtRaw).getTime() : 0;
      const bTime = b.createdAtRaw ? new Date(b.createdAtRaw).getTime() : 0;
      return bTime - aTime;
    }
    const aDue = a.dueDateRaw ? new Date(a.dueDateRaw).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueDateRaw ? new Date(b.dueDateRaw).getTime() : Number.POSITIVE_INFINITY;
    return aDue - bDue;
  });
}
