/**
 * Canonical tasks-domain copy helpers for non-React builders and display mappers.
 * React surfaces should prefer `useLanguage().t()` where practical.
 */
import type {
  ApiTaskPriority,
  ApiTaskSource,
  ApiTaskStatus,
  ApiTaskType,
} from '../../../lib/api';
import type { TaskBucket } from '../../../lib/tasks/types';
import {
  DEFAULT_PRODUCT_LOCALE,
  getFormattingLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '../../../i18n/locales';
import { translateKey } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations/en';

export function resolveTasksProductLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function tt(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveTasksProductLocale(locale), key, vars).text;
}

export function tasksFormattingLocale(locale: string): string {
  return getFormattingLocale(resolveTasksProductLocale(locale));
}

export function tasksFormattingLocaleOrDefault(locale?: string | null): string {
  return tasksFormattingLocale(locale ?? DEFAULT_PRODUCT_LOCALE);
}

const TASKS_PAGE_VIEW_KEYS: Record<string, TranslationKey> = {
  mine: 'tasks.view.mine',
  open: 'tasks.view.open',
  overdue: 'tasks.view.overdue',
  today: 'tasks.view.today',
  planned: 'tasks.view.planned',
  unassigned: 'tasks.view.unassigned',
  completed: 'tasks.view.completed',
};

export function tasksPageViewLabel(locale: string, view: string): string {
  return tt(locale, TASKS_PAGE_VIEW_KEYS[view] ?? 'tasks.view.open');
}

const TASK_FILTER_STATUS_KEYS: Record<ApiTaskStatus, TranslationKey> = {
  OPEN: 'tasks.filter.status.OPEN',
  IN_PROGRESS: 'tasks.filter.status.IN_PROGRESS',
  WAITING: 'tasks.filter.status.WAITING',
  DONE: 'tasks.filter.status.DONE',
  CANCELLED: 'tasks.filter.status.CANCELLED',
};

const TASK_FILTER_PRIORITY_KEYS: Record<ApiTaskPriority, TranslationKey> = {
  LOW: 'tasks.filter.priority.LOW',
  NORMAL: 'tasks.filter.priority.NORMAL',
  HIGH: 'tasks.filter.priority.HIGH',
  CRITICAL: 'tasks.filter.priority.CRITICAL',
};

const TASK_FILTER_SOURCE_KEYS: Record<ApiTaskSource, TranslationKey> = {
  MANUAL: 'tasks.filter.source.MANUAL',
  SYSTEM: 'tasks.filter.source.SYSTEM',
  ALERT: 'tasks.filter.source.ALERT',
  HEALTH: 'tasks.filter.source.HEALTH',
  BOOKING: 'tasks.filter.source.BOOKING',
  DOCUMENT: 'tasks.filter.source.DOCUMENT',
  VENDOR: 'tasks.filter.source.VENDOR',
};

const TASK_FILTER_BUCKET_KEYS: Record<TaskBucket, TranslationKey> = {
  NOW: 'tasks.filter.bucket.NOW',
  TODAY: 'tasks.filter.bucket.TODAY',
  UPCOMING: 'tasks.filter.bucket.UPCOMING',
  PLANNED: 'tasks.filter.bucket.PLANNED',
  OVERDUE: 'tasks.filter.bucket.OVERDUE',
  UNASSIGNED: 'tasks.filter.bucket.UNASSIGNED',
  ALL_OPEN: 'tasks.filter.bucket.ALL_OPEN',
  COMPLETED: 'tasks.filter.bucket.COMPLETED',
};

const TASK_TYPE_KEYS: Record<ApiTaskType, TranslationKey> = {
  VEHICLE_SERVICE: 'tasks.type.VEHICLE_SERVICE',
  VEHICLE_INSPECTION: 'tasks.type.VEHICLE_INSPECTION',
  TIRE_CHECK: 'tasks.type.TIRE_CHECK',
  BRAKE_CHECK: 'tasks.type.BRAKE_CHECK',
  BATTERY_CHECK: 'tasks.type.BATTERY_CHECK',
  VEHICLE_CLEANING: 'tasks.type.VEHICLE_CLEANING',
  BOOKING_PREPARATION: 'tasks.type.BOOKING_PREPARATION',
  BOOKING_PICKUP: 'tasks.type.BOOKING_PICKUP',
  BOOKING_RETURN: 'tasks.type.BOOKING_RETURN',
  DOCUMENT_REVIEW: 'tasks.type.DOCUMENT_REVIEW',
  INVOICE_REQUIRED: 'tasks.type.INVOICE_REQUIRED',
  CUSTOMER_FOLLOWUP: 'tasks.type.CUSTOMER_FOLLOWUP',
  REPAIR: 'tasks.type.REPAIR',
  CUSTOM: 'tasks.type.CUSTOM',
};

const TASK_CATEGORY_KEYS: Record<string, TranslationKey> = {
  Cleaning: 'tasks.category.cleaning',
  Maintenance: 'tasks.category.maintenance',
  Repair: 'tasks.category.repair',
  Inspection: 'tasks.category.inspection',
  Damage: 'tasks.category.damage',
  'TÜV': 'tasks.category.tuv',
  Insurance: 'tasks.category.insurance',
  Documents: 'tasks.category.documents',
  'Tire Change': 'tasks.category.tireChange',
  'Oil Change': 'tasks.category.oilChange',
};

const TASK_LIST_STATUS_KEYS: Record<string, TranslationKey> = {
  Open: 'tasks.listStatus.open',
  'In Progress': 'tasks.listStatus.inProgress',
  Waiting: 'tasks.listStatus.waiting',
  Completed: 'tasks.listStatus.completed',
  Overdue: 'tasks.listStatus.overdue',
};

const TASK_LIST_PRIORITY_KEYS: Record<string, TranslationKey> = {
  Critical: 'tasks.listPriority.critical',
  High: 'tasks.listPriority.high',
  Medium: 'tasks.listPriority.medium',
  Low: 'tasks.listPriority.low',
};

const VEHICLE_TASK_STATUS_KEYS: Record<string, TranslationKey> = {
  open: 'tasks.vehicleStatus.open',
  'in-progress': 'tasks.vehicleStatus.inProgress',
  waiting: 'tasks.vehicleStatus.waiting',
  done: 'tasks.vehicleStatus.done',
  cancelled: 'tasks.vehicleStatus.cancelled',
};

const VEHICLE_TASK_PRIORITY_KEYS: Record<string, TranslationKey> = {
  critical: 'tasks.vehiclePriority.critical',
  high: 'tasks.vehiclePriority.high',
  low: 'tasks.vehiclePriority.low',
  normal: 'tasks.vehiclePriority.normal',
};

const TASK_PRIORITY_VIEW_KEYS: Record<string, TranslationKey> = {
  Low: 'tasks.form.priorityLow',
  Medium: 'tasks.form.priorityMedium',
  High: 'tasks.form.priorityHigh',
  Critical: 'tasks.form.priorityCritical',
};

export function taskFilterStatusLabel(locale: string, status: ApiTaskStatus): string {
  return tt(locale, TASK_FILTER_STATUS_KEYS[status]);
}

export function taskFilterPriorityLabel(locale: string, priority: ApiTaskPriority): string {
  return tt(locale, TASK_FILTER_PRIORITY_KEYS[priority]);
}

export function taskFilterSourceLabel(locale: string, source: ApiTaskSource): string {
  return tt(locale, TASK_FILTER_SOURCE_KEYS[source]);
}

export function taskFilterBucketLabel(locale: string, bucket: TaskBucket): string {
  return tt(locale, TASK_FILTER_BUCKET_KEYS[bucket]);
}

export function taskTypeLabel(locale: string, type: ApiTaskType): string {
  return tt(locale, TASK_TYPE_KEYS[type]);
}

export function taskCategoryLabel(locale: string, category: string): string {
  return tt(locale, TASK_CATEGORY_KEYS[category] ?? 'tasks.category.maintenance');
}

export function taskListStatusLabel(locale: string, status: string): string {
  return tt(locale, TASK_LIST_STATUS_KEYS[status] ?? 'tasks.listStatus.open');
}

export function taskListPriorityLabel(locale: string, priority: string): string {
  return tt(locale, TASK_LIST_PRIORITY_KEYS[priority] ?? 'tasks.listPriority.medium');
}

export function vehicleTaskStatusLabelI18n(
  locale: string,
  status: string,
  isOverdue: boolean,
): string {
  if (isOverdue && status !== 'done' && status !== 'cancelled') {
    return tt(locale, 'tasks.vehicleStatus.overdue');
  }
  return tt(locale, VEHICLE_TASK_STATUS_KEYS[status]);
}

export function vehicleTaskPriorityLabelI18n(locale: string, priority: string): string {
  return tt(locale, VEHICLE_TASK_PRIORITY_KEYS[priority]);
}

export function taskPriorityViewLabel(locale: string, priority: string): string {
  return tt(locale, TASK_PRIORITY_VIEW_KEYS[priority]);
}

export function taskEstimatedDurationOptionLabel(locale: string, minutes: string): string {
  const key = `tasks.form.duration${minutes}` as TranslationKey;
  return tt(locale, key);
}
