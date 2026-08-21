import type { ApiTask } from '../../../../lib/api';
import type { TranslationKey } from '../../../i18n/translations/en';
import { mapTaskCategory, mapTaskPriority, type TaskListPriority } from '../../../lib/task-list.utils';
import { isServiceMaintenanceTask } from '../../../lib/service-task-semantics';
import { deriveTaskIsOverdue } from '../../../lib/task-display.utils';
import { isTaskDueToday } from '../dashboardTasksOverview.utils';
import {
  NOTIFICATION_CARD_NEUTRAL_SURFACE,
  notificationCriticalSurface,
  notificationWatchSurface,
} from '../notifications/notificationCardSurface';

export type TaskPreviewDueTone = 'critical' | 'watch' | 'neutral' | 'muted';

export type TaskPreviewPriorityTone = 'critical-strong' | 'critical' | 'watch' | 'neutral';

export function resolveDashboardTaskDomainKey(task: ApiTask): TranslationKey {
  const type = task.type ?? 'CUSTOM';
  if (task.invoiceId || type === 'INVOICE_REQUIRED') {
    return 'dashboardTasksOverview.domain.finance';
  }
  if (task.documentId || type === 'DOCUMENT_REVIEW') {
    return 'dashboardTasksOverview.domain.documents';
  }
  if (task.customerId || type === 'CUSTOMER_FOLLOWUP') {
    return 'dashboardTasksOverview.domain.customer';
  }
  if (
    task.bookingId ||
    type === 'BOOKING_PREPARATION' ||
    type === 'BOOKING_PICKUP' ||
    type === 'BOOKING_RETURN'
  ) {
    return 'dashboardTasksOverview.domain.booking';
  }

  // Maintenance / service semantics before generic vehicleId — vehicleId must not downgrade these.
  if (task.vendorId || task.serviceCaseId || isServiceMaintenanceTask(task)) {
    return 'dashboardTasksOverview.domain.maintenance';
  }

  const category = mapTaskCategory(task.category);
  if (category === 'Insurance' || category === 'Documents') {
    return 'dashboardTasksOverview.domain.documents';
  }
  if (category === 'Damage' || category === 'Repair' || category === 'Maintenance' || category === 'TÜV') {
    return 'dashboardTasksOverview.domain.maintenance';
  }

  // Generic vehicle-linked tasks (no maintenance/service semantics).
  if (task.vehicleId || type.startsWith('VEHICLE_')) {
    return 'dashboardTasksOverview.domain.vehicle';
  }
  if (category === 'Cleaning') {
    return 'dashboardTasksOverview.domain.vehicle';
  }

  return 'dashboardTasksOverview.domain.operations';
}

export function resolveTaskPreviewPriority(task: ApiTask): TaskListPriority {
  return mapTaskPriority(task.priority);
}

export function taskPreviewPriorityLabelKey(priority: TaskListPriority): TranslationKey {
  switch (priority) {
    case 'Critical':
      return 'dashboardTasksOverview.priorityCritical';
    case 'High':
      return 'dashboardTasksOverview.priorityHigh';
    case 'Low':
      return 'dashboardTasksOverview.priorityLow';
    case 'Medium':
    default:
      return 'dashboardTasksOverview.priorityMedium';
  }
}

export function taskPreviewPriorityBadgeTone(priority: TaskListPriority): TaskPreviewPriorityTone {
  switch (priority) {
    case 'Critical':
      return 'critical-strong';
    case 'High':
      return 'critical';
    case 'Medium':
      return 'watch';
    default:
      return 'neutral';
  }
}

export function priorityBadgeClassName(tone: TaskPreviewPriorityTone): string {
  if (tone === 'critical-strong') {
    return 'bg-[color:color-mix(in_srgb,var(--status-critical)_16%,transparent)] text-[color:var(--status-critical)] font-semibold';
  }
  if (tone === 'critical') {
    return 'bg-[color:color-mix(in_srgb,var(--status-critical)_12%,transparent)] text-[color:var(--status-critical)]';
  }
  if (tone === 'watch') {
    return 'bg-[color:color-mix(in_srgb,var(--status-watch)_12%,transparent)] text-[color:var(--status-watch)]';
  }
  return 'bg-muted/60 text-muted-foreground';
}

/** Notification-aligned card surface driven by task priority (not due state). */
export function taskPreviewCardSurfaceClass(priority: TaskListPriority): string {
  switch (priority) {
    case 'Critical':
      return notificationCriticalSurface('strong');
    case 'High':
      return notificationCriticalSurface('default');
    case 'Medium':
      return notificationWatchSurface();
    default:
      return NOTIFICATION_CARD_NEUTRAL_SURFACE;
  }
}

export function taskPreviewDueTone(task: ApiTask): TaskPreviewDueTone {
  if (deriveTaskIsOverdue(task)) return 'critical';
  if (isTaskDueToday(task)) return 'watch';
  if (!task.dueDate) return 'muted';
  return 'neutral';
}

export function dueToneClassName(tone: TaskPreviewDueTone): string {
  if (tone === 'critical') return 'font-medium text-[color:var(--status-critical)]';
  if (tone === 'watch') return 'font-medium text-[color:var(--status-watch)]';
  if (tone === 'muted') return 'text-muted-foreground';
  return 'text-muted-foreground';
}
