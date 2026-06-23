import type { ApiTask, ApiTaskPriority } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import {
  deriveTaskIsOverdue,
  isActiveVehicleTask,
  mapApiPriority,
  mapApiTaskToDisplayStatus,
  type VehicleTaskRow,
} from './task-display.utils';

export type TaskSourceBadge =
  | 'Manual'
  | 'Booking'
  | 'Health'
  | 'Damage'
  | 'Document'
  | 'Service'
  | 'Cleaning'
  | 'Vendor'
  | 'System';

export type TaskBlockingBadge = 'blocks_rental' | 'attention' | 'no_block';

export type NextBestActionKind = 'start' | 'resume' | 'complete' | 'assign' | 'inspect' | 'review';

export type VehicleTaskGroupId =
  | 'blocking_critical'
  | 'due_today_overdue'
  | 'in_progress'
  | 'waiting'
  | 'upcoming'
  | 'completed';

export interface VehicleNextBookingContext {
  pickupAt: string;
  pickupLabel: string;
  customerLabel: string | null;
  hoursUntilPickup: number;
}

export interface VehicleTaskOperatorRow extends VehicleTaskRow {
  apiType: ApiTask['type'];
  metadata: ApiTask['metadata'];
  sourceBadge: TaskSourceBadge;
  blockingBadge: TaskBlockingBadge;
  blocksVehicleAvailability: boolean;
  isDueBeforeNextBooking: boolean;
  operatorRank: number;
}

export interface NextBestAction {
  task: VehicleTaskOperatorRow;
  kind: NextBestActionKind;
  label: string;
  reason: string;
}

export interface VehicleTaskGroup {
  id: VehicleTaskGroupId;
  label: string;
  tasks: VehicleTaskOperatorRow[];
}

const SOURCE_LABEL_DE: Record<TaskSourceBadge, string> = {
  Manual: 'Manuell',
  Booking: 'Buchung',
  Health: 'Health',
  Damage: 'Schaden',
  Document: 'Dokument',
  Service: 'Service',
  Cleaning: 'Reinigung',
  Vendor: 'Lieferant',
  System: 'System',
};

const BLOCKING_LABEL_DE: Record<TaskBlockingBadge, string> = {
  blocks_rental: 'Blockiert Vermietung',
  attention: 'Aufmerksamkeit',
  no_block: 'Kein Vermietungsblock',
};

const GROUP_LABEL_DE: Record<VehicleTaskGroupId, string> = {
  blocking_critical: 'Blockierend / Kritisch',
  due_today_overdue: 'Heute fällig / Überfällig',
  in_progress: 'In Bearbeitung',
  waiting: 'Wartend',
  upcoming: 'Anstehend',
  completed: 'Abgeschlossen',
};

function taskMeta(task: ApiTask): Record<string, unknown> | null {
  return task.metadata && typeof task.metadata === 'object' ? (task.metadata as Record<string, unknown>) : null;
}

export function deriveTaskSourceBadge(task: ApiTask): TaskSourceBadge {
  const meta = taskMeta(task);
  if (meta?.origin === 'DAMAGE' || typeof meta?.damageId === 'string') return 'Damage';

  const source = (task.source ?? '').toUpperCase();
  if (task.sourceType === 'BOOKING' || task.bookingId) return 'Booking';
  if (task.sourceType === 'DOCUMENT' || task.documentId) return 'Document';
  if (task.sourceType === 'VENDOR' || task.vendorId) return 'Vendor';
  if (task.sourceType === 'HEALTH' || source === 'INSIGHT_HEALTH') return 'Health';
  if (source === 'INSIGHT_SERVICE' || source === 'INSIGHT_COMPLIANCE') return 'Service';
  if (task.type === 'VEHICLE_CLEANING' || source === 'VEHICLE_CLEANING') return 'Cleaning';
  if (
    task.sourceType === 'SYSTEM' ||
    task.sourceType === 'ALERT' ||
    source.startsWith('INSIGHT_')
  ) {
    return 'System';
  }
  return 'Manual';
}

export function taskSourceBadgeLabel(badge: TaskSourceBadge): string {
  return SOURCE_LABEL_DE[badge];
}

export function deriveTaskBlockingBadge(
  task: Pick<ApiTask, 'blocksVehicleAvailability' | 'priority' | 'status' | 'isOverdue' | 'dueDate'>,
): TaskBlockingBadge {
  const terminal = task.status === 'DONE' || task.status === 'CANCELLED';
  if (terminal) return 'no_block';
  if (task.blocksVehicleAvailability === true) return 'blocks_rental';
  const overdue = deriveTaskIsOverdue(task);
  const priority = (task.priority ?? 'NORMAL').toUpperCase();
  if (overdue || priority === 'CRITICAL' || priority === 'HIGH') return 'attention';
  return 'no_block';
}

export function taskBlockingBadgeLabel(badge: TaskBlockingBadge): string {
  return BLOCKING_LABEL_DE[badge];
}

export function deriveNextBookingContext(vehicle?: VehicleData | null): VehicleNextBookingContext | null {
  if (!vehicle?.reservedPickupAt) return null;
  const pickup = new Date(vehicle.reservedPickupAt);
  if (Number.isNaN(pickup.getTime()) || pickup.getTime() <= Date.now()) return null;
  const hoursUntilPickup = (pickup.getTime() - Date.now()) / (1000 * 60 * 60);
  return {
    pickupAt: vehicle.reservedPickupAt,
    pickupLabel: pickup.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
    customerLabel: vehicle.reservedCustomerName ?? null,
    hoursUntilPickup,
  };
}

export function isTaskDueBeforeNextBooking(
  task: Pick<ApiTask, 'dueDate' | 'status'>,
  nextBooking: VehicleNextBookingContext | null,
): boolean {
  if (!nextBooking || !task.dueDate) return false;
  if (task.status === 'DONE' || task.status === 'CANCELLED') return false;
  const due = new Date(task.dueDate);
  const pickup = new Date(nextBooking.pickupAt);
  if (Number.isNaN(due.getTime()) || Number.isNaN(pickup.getTime())) return false;
  return due.getTime() <= pickup.getTime();
}

function isDueToday(iso: string | null): boolean {
  if (!iso) return false;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return false;
  const now = new Date();
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

function isDueSoon(iso: string | null, withinHours = 48): boolean {
  if (!iso) return false;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return false;
  const delta = due.getTime() - Date.now();
  return delta >= 0 && delta <= withinHours * 60 * 60 * 1000;
}

export function computeOperatorRank(
  task: Pick<
    ApiTask,
    'status' | 'priority' | 'isOverdue' | 'dueDate' | 'blocksVehicleAvailability'
  > & { isDueBeforeNextBooking?: boolean },
): number {
  const active = task.status !== 'DONE' && task.status !== 'CANCELLED';
  if (!active) return 900;
  const overdue = deriveTaskIsOverdue(task);
  const blocking = task.blocksVehicleAvailability === true;
  const priority = (task.priority ?? 'NORMAL').toUpperCase() as ApiTaskPriority;
  if (overdue && blocking) return 0;
  if (blocking && (priority === 'CRITICAL' || priority === 'HIGH')) return 1;
  if (task.isDueBeforeNextBooking) return 2;
  if (overdue) return 3;
  if (task.status === 'IN_PROGRESS') return 4;
  if (priority === 'CRITICAL') return 5;
  if (isDueToday(task.dueDate)) return 6;
  if (isDueSoon(task.dueDate)) return 7;
  if (task.status === 'OPEN') return 8;
  if (task.status === 'WAITING') return 9;
  return 10;
}

export function enrichVehicleTaskRow(
  task: ApiTask,
  nextBooking: VehicleNextBookingContext | null,
  assigneeLabel?: string,
): VehicleTaskOperatorRow | null {
  if (!task?.id) return null;
  const apiStatus = task.status ?? 'OPEN';
  const isDueBeforeNextBooking = isTaskDueBeforeNextBooking(task, nextBooking);
  const base: VehicleTaskRow = {
    id: task.id,
    title: task.title?.trim() || 'Ohne Titel',
    description: task.description?.trim() || '',
    apiStatus,
    displayStatus: mapApiTaskToDisplayStatus(apiStatus),
    isOverdue: deriveTaskIsOverdue(task),
    priority: mapApiPriority(task.priority),
    category: task.category?.trim() || task.type || 'Allgemein',
    assigneeLabel:
      assigneeLabel ??
      (task.assignedUserId?.trim() ? 'Zugewiesen' : 'Nicht zugewiesen'),
    dueDate: task.dueDate,
    createdAt: task.createdAt ?? null,
  };
  const operatorRank = computeOperatorRank({
    ...task,
    isDueBeforeNextBooking,
  });
  return {
    ...base,
    apiType: task.type,
    metadata: task.metadata ?? null,
    sourceBadge: deriveTaskSourceBadge(task),
    blockingBadge: deriveTaskBlockingBadge(task),
    blocksVehicleAvailability: task.blocksVehicleAvailability === true,
    isDueBeforeNextBooking,
    operatorRank,
  };
}

export function parseVehicleOperatorTaskList(
  rows: unknown,
  nextBooking: VehicleNextBookingContext | null,
  assigneeNameById?: Map<string, string>,
): VehicleTaskOperatorRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const task = row as ApiTask;
      const assignee =
        task.assignedUserId && assigneeNameById?.get(task.assignedUserId)
          ? assigneeNameById.get(task.assignedUserId)!
          : undefined;
      return enrichVehicleTaskRow(task, nextBooking, assignee);
    })
    .filter((t): t is VehicleTaskOperatorRow => t != null)
    .sort((a, b) => {
      const rank = a.operatorRank - b.operatorRank;
      if (rank !== 0) return rank;
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });
}

export function pickNextBestAction(tasks: VehicleTaskOperatorRow[]): NextBestAction | null {
  const active = tasks.filter(isActiveVehicleTask);
  if (active.length === 0) return null;
  const task = active[0];

  if (!task.assigneeLabel || task.assigneeLabel === 'Nicht zugewiesen') {
    return {
      task,
      kind: 'assign',
      label: 'Zuweisen',
      reason: 'Keine verantwortliche Person hinterlegt.',
    };
  }
  if (task.displayStatus === 'waiting') {
    return {
      task,
      kind: 'resume',
      label: 'Fortsetzen',
      reason: 'Aufgabe wartet auf Fortführung.',
    };
  }
  if (task.displayStatus === 'open') {
    return {
      task,
      kind: 'start',
      label: 'Starten',
      reason: task.blocksVehicleAvailability
        ? 'Blockiert die Fahrzeugverfügbarkeit.'
        : task.isDueBeforeNextBooking
          ? 'Fällig vor der nächsten Buchung.'
          : 'Offene Aufgabe mit höchster Priorität.',
    };
  }
  if (task.displayStatus === 'in-progress') {
    return {
      task,
      kind: 'complete',
      label: 'Abschließen',
      reason: 'Aufgabe ist bereits in Bearbeitung.',
    };
  }
  return {
    task,
    kind: 'review',
    label: 'Prüfen',
    reason: 'Nächste operative Aufgabe im Backlog.',
  };
}

export function groupVehicleTasks(tasks: VehicleTaskOperatorRow[]): VehicleTaskGroup[] {
  const buckets: Record<VehicleTaskGroupId, VehicleTaskOperatorRow[]> = {
    blocking_critical: [],
    due_today_overdue: [],
    in_progress: [],
    waiting: [],
    upcoming: [],
    completed: [],
  };

  for (const task of tasks) {
    if (task.displayStatus === 'done' || task.displayStatus === 'cancelled') {
      buckets.completed.push(task);
      continue;
    }
    if (
      task.blocksVehicleAvailability ||
      task.priority === 'critical' ||
      (task.isOverdue && isActiveVehicleTask(task))
    ) {
      buckets.blocking_critical.push(task);
      continue;
    }
    if (task.isOverdue || isDueToday(task.dueDate)) {
      buckets.due_today_overdue.push(task);
      continue;
    }
    if (task.displayStatus === 'in-progress') {
      buckets.in_progress.push(task);
      continue;
    }
    if (task.displayStatus === 'waiting') {
      buckets.waiting.push(task);
      continue;
    }
    buckets.upcoming.push(task);
  }

  const order: VehicleTaskGroupId[] = [
    'blocking_critical',
    'due_today_overdue',
    'in_progress',
    'waiting',
    'upcoming',
    'completed',
  ];

  return order
    .map((id) => ({ id, label: GROUP_LABEL_DE[id], tasks: buckets[id] }))
    .filter((g) => g.tasks.length > 0);
}

export function countBlockingTasks(tasks: VehicleTaskOperatorRow[]): number {
  return tasks.filter((t) => isActiveVehicleTask(t) && t.blocksVehicleAvailability).length;
}

export function matchesBlockingFilter(task: VehicleTaskOperatorRow): boolean {
  return isActiveVehicleTask(task) && task.blocksVehicleAvailability;
}

export function formatHoursUntilPickup(hours: number): string {
  if (hours < 1) return 'unter 1 Std.';
  if (hours < 24) return `${Math.round(hours)} Std.`;
  const days = Math.round(hours / 24);
  return `${days} Tag${days === 1 ? '' : 'e'}`;
}
