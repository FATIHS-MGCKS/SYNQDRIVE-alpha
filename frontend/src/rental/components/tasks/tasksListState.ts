import type {
  ApiTaskPriority,
  ApiTaskSource,
  ApiTaskStatus,
  ApiTaskType,
  TaskBucket,
  TaskListFilters,
} from '../../../lib/tasks/types';
import type { TasksPageView } from '../../lib/tasks-page.utils';
import { buildTasksPageListFilters } from '../../lib/tasks-page.utils';

export type TasksListSortField = 'dueDate' | 'priority' | 'status' | 'created';

export interface TasksListFilters {
  search: string;
  view: TasksPageView;
  status: 'all' | ApiTaskStatus;
  bucket: 'all' | TaskBucket;
  priority: 'all' | ApiTaskPriority;
  type: 'all' | ApiTaskType;
  source: 'all' | ApiTaskSource;
  stationId: string;
  assignedUserId: string;
  vehicleId: string;
  bookingId: string;
  customerId: string;
  invoiceId: string;
  serviceCaseId: string;
  activatesFrom: string;
  activatesTo: string;
  dueFrom: string;
  dueTo: string;
  overdue: boolean;
  sortBy: TasksListSortField;
}

export const DEFAULT_TASKS_LIST_FILTERS: TasksListFilters = {
  search: '',
  view: 'open',
  status: 'all',
  bucket: 'all',
  priority: 'all',
  type: 'all',
  source: 'all',
  stationId: '',
  assignedUserId: '',
  vehicleId: '',
  bookingId: '',
  customerId: '',
  invoiceId: '',
  serviceCaseId: '',
  activatesFrom: '',
  activatesTo: '',
  dueFrom: '',
  dueTo: '',
  overdue: false,
  sortBy: 'dueDate',
};

const TASK_PAGE_VIEWS: TasksPageView[] = [
  'mine',
  'open',
  'overdue',
  'today',
  'planned',
  'unassigned',
  'completed',
];

const TASK_STATUSES: ApiTaskStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED'];
const TASK_PRIORITIES: ApiTaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];
const TASK_SOURCES: ApiTaskSource[] = [
  'MANUAL',
  'SYSTEM',
  'ALERT',
  'HEALTH',
  'BOOKING',
  'DOCUMENT',
  'VENDOR',
];
const TASK_TYPES: ApiTaskType[] = [
  'VEHICLE_SERVICE',
  'VEHICLE_INSPECTION',
  'TIRE_CHECK',
  'BRAKE_CHECK',
  'BATTERY_CHECK',
  'VEHICLE_CLEANING',
  'BOOKING_PREPARATION',
  'BOOKING_PICKUP',
  'BOOKING_RETURN',
  'DOCUMENT_REVIEW',
  'INVOICE_REQUIRED',
  'CUSTOMER_FOLLOWUP',
  'REPAIR',
  'CUSTOM',
];
const TASK_BUCKETS: TaskBucket[] = [
  'NOW',
  'TODAY',
  'UPCOMING',
  'PLANNED',
  'OVERDUE',
  'UNASSIGNED',
  'ALL_OPEN',
  'COMPLETED',
];
const SORT_FIELDS: TasksListSortField[] = ['dueDate', 'priority', 'status', 'created'];

const URL_KEYS = {
  search: 'taskQ',
  view: 'taskView',
  status: 'taskStatus',
  bucket: 'taskBucket',
  priority: 'taskPriority',
  type: 'taskType',
  source: 'taskSource',
  stationId: 'taskStation',
  assignedUserId: 'taskAssignee',
  vehicleId: 'taskVehicle',
  bookingId: 'taskBooking',
  customerId: 'taskCustomer',
  invoiceId: 'taskInvoice',
  serviceCaseId: 'taskServiceCase',
  activatesFrom: 'taskActFrom',
  activatesTo: 'taskActTo',
  dueFrom: 'taskDueFrom',
  dueTo: 'taskDueTo',
  overdue: 'taskOverdue',
  sortBy: 'taskSort',
} as const;

export function readTasksListFiltersFromUrl(): Partial<TasksListFilters> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const next: Partial<TasksListFilters> = {};

  const search = params.get(URL_KEYS.search);
  if (search) next.search = search;

  const view = params.get(URL_KEYS.view);
  if (view && TASK_PAGE_VIEWS.includes(view as TasksPageView)) {
    next.view = view as TasksPageView;
  }

  const status = params.get(URL_KEYS.status);
  if (status && TASK_STATUSES.includes(status as ApiTaskStatus)) {
    next.status = status as ApiTaskStatus;
  }

  const bucket = params.get(URL_KEYS.bucket);
  if (bucket && TASK_BUCKETS.includes(bucket as TaskBucket)) {
    next.bucket = bucket as TaskBucket;
  }

  const priority = params.get(URL_KEYS.priority);
  if (priority && TASK_PRIORITIES.includes(priority as ApiTaskPriority)) {
    next.priority = priority as ApiTaskPriority;
  }

  const type = params.get(URL_KEYS.type);
  if (type && TASK_TYPES.includes(type as ApiTaskType)) {
    next.type = type as ApiTaskType;
  }

  const source = params.get(URL_KEYS.source);
  if (source && TASK_SOURCES.includes(source as ApiTaskSource)) {
    next.source = source as ApiTaskSource;
  }

  const stationId = params.get(URL_KEYS.stationId);
  if (stationId) next.stationId = stationId;

  const assignedUserId = params.get(URL_KEYS.assignedUserId);
  if (assignedUserId) next.assignedUserId = assignedUserId;

  const vehicleId = params.get(URL_KEYS.vehicleId);
  if (vehicleId) next.vehicleId = vehicleId;

  const bookingId = params.get(URL_KEYS.bookingId);
  if (bookingId) next.bookingId = bookingId;

  const customerId = params.get(URL_KEYS.customerId);
  if (customerId) next.customerId = customerId;

  const invoiceId = params.get(URL_KEYS.invoiceId);
  if (invoiceId) next.invoiceId = invoiceId;

  const serviceCaseId = params.get(URL_KEYS.serviceCaseId);
  if (serviceCaseId) next.serviceCaseId = serviceCaseId;

  const activatesFrom = params.get(URL_KEYS.activatesFrom);
  if (activatesFrom) next.activatesFrom = activatesFrom;

  const activatesTo = params.get(URL_KEYS.activatesTo);
  if (activatesTo) next.activatesTo = activatesTo;

  const dueFrom = params.get(URL_KEYS.dueFrom);
  if (dueFrom) next.dueFrom = dueFrom;

  const dueTo = params.get(URL_KEYS.dueTo);
  if (dueTo) next.dueTo = dueTo;

  if (params.get(URL_KEYS.overdue) === '1') next.overdue = true;

  const sortBy = params.get(URL_KEYS.sortBy);
  if (sortBy && SORT_FIELDS.includes(sortBy as TasksListSortField)) {
    next.sortBy = sortBy as TasksListSortField;
  }

  return next;
}

export function syncTasksListFiltersToUrl(filters: TasksListFilters, search: string): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);

  const entries: Array<[string, string | null]> = [
    [URL_KEYS.search, search.trim() || null],
    [URL_KEYS.view, filters.view !== 'open' ? filters.view : null],
    [URL_KEYS.status, filters.status !== 'all' ? filters.status : null],
    [URL_KEYS.bucket, filters.bucket !== 'all' ? filters.bucket : null],
    [URL_KEYS.priority, filters.priority !== 'all' ? filters.priority : null],
    [URL_KEYS.type, filters.type !== 'all' ? filters.type : null],
    [URL_KEYS.source, filters.source !== 'all' ? filters.source : null],
    [URL_KEYS.stationId, filters.stationId || null],
    [URL_KEYS.assignedUserId, filters.assignedUserId || null],
    [URL_KEYS.vehicleId, filters.vehicleId || null],
    [URL_KEYS.bookingId, filters.bookingId || null],
    [URL_KEYS.customerId, filters.customerId || null],
    [URL_KEYS.invoiceId, filters.invoiceId || null],
    [URL_KEYS.serviceCaseId, filters.serviceCaseId || null],
    [URL_KEYS.activatesFrom, filters.activatesFrom || null],
    [URL_KEYS.activatesTo, filters.activatesTo || null],
    [URL_KEYS.dueFrom, filters.dueFrom || null],
    [URL_KEYS.dueTo, filters.dueTo || null],
    [URL_KEYS.overdue, filters.overdue ? '1' : null],
    [URL_KEYS.sortBy, filters.sortBy !== 'dueDate' ? filters.sortBy : null],
  ];

  for (const [key, value] of entries) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }

  window.history.replaceState({}, '', url.toString());
}

export function buildTasksListApiParams(
  filters: TasksListFilters,
  search: string,
  currentUserId: string | null | undefined,
): TaskListFilters {
  const viewFilters = buildTasksPageListFilters(filters.view, currentUserId, {});
  const bucket = filters.bucket !== 'all' ? filters.bucket : viewFilters.bucket;

  const params: TaskListFilters = {
    bucket,
    search: search.trim() || undefined,
  };

  if (filters.status !== 'all') params.status = filters.status;
  if (filters.priority !== 'all') params.priority = filters.priority;
  if (filters.type !== 'all') params.type = filters.type;
  if (filters.source !== 'all') params.source = filters.source;
  if (filters.stationId) params.stationId = filters.stationId;
  if (filters.vehicleId) params.vehicleId = filters.vehicleId;
  if (filters.bookingId) params.bookingId = filters.bookingId;
  if (filters.customerId) params.customerId = filters.customerId;
  if (filters.invoiceId) params.invoiceId = filters.invoiceId;
  if (filters.serviceCaseId) params.serviceCaseId = filters.serviceCaseId;
  if (filters.activatesFrom) params.activatesFrom = filters.activatesFrom;
  if (filters.activatesTo) params.activatesTo = filters.activatesTo;
  if (filters.dueFrom) params.dueFrom = filters.dueFrom;
  if (filters.dueTo) params.dueTo = filters.dueTo;
  if (filters.overdue) params.overdue = true;

  if (filters.assignedUserId) {
    params.assignedUserId = filters.assignedUserId;
  } else if (viewFilters.assignedUserId) {
    params.assignedUserId = viewFilters.assignedUserId;
  }

  return params;
}

export function hasActiveTasksListFilters(filters: TasksListFilters, search: string): boolean {
  return (
    Boolean(search.trim()) ||
    filters.status !== 'all' ||
    filters.bucket !== 'all' ||
    filters.priority !== 'all' ||
    filters.type !== 'all' ||
    filters.source !== 'all' ||
    Boolean(filters.stationId) ||
    Boolean(filters.assignedUserId) ||
    Boolean(filters.vehicleId) ||
    Boolean(filters.bookingId) ||
    Boolean(filters.customerId) ||
    Boolean(filters.invoiceId) ||
    Boolean(filters.serviceCaseId) ||
    Boolean(filters.activatesFrom) ||
    Boolean(filters.activatesTo) ||
    Boolean(filters.dueFrom) ||
    Boolean(filters.dueTo) ||
    filters.overdue
  );
}

export const TASK_FILTER_LABELS = {
  status: {
    OPEN: 'Offen',
    IN_PROGRESS: 'In Bearbeitung',
    WAITING: 'Wartend',
    DONE: 'Erledigt',
    CANCELLED: 'Abgebrochen',
  },
  priority: {
    LOW: 'Niedrig',
    NORMAL: 'Mittel',
    HIGH: 'Hoch',
    CRITICAL: 'Kritisch',
  },
  source: {
    MANUAL: 'Manuell',
    SYSTEM: 'System',
    ALERT: 'Alert',
    HEALTH: 'Health',
    BOOKING: 'Buchung',
    DOCUMENT: 'Dokument',
    VENDOR: 'Lieferant',
  },
  bucket: {
    NOW: 'Jetzt',
    TODAY: 'Heute',
    UPCOMING: 'Demnächst',
    PLANNED: 'Geplant',
    OVERDUE: 'Überfällig',
    UNASSIGNED: 'Unzugewiesen',
    ALL_OPEN: 'Alle offenen',
    COMPLETED: 'Erledigt',
  },
} as const;
