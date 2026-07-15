/**
 * Task Domain V2 — frontend contract aligned with backend TasksService / task-detail-view.
 * Legacy top-level fields remain for components not yet migrated to normalized sections.
 */

export type ApiTaskStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'DONE' | 'CANCELLED';
export type ApiTaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type ApiTaskType =
  | 'VEHICLE_SERVICE'
  | 'VEHICLE_INSPECTION'
  | 'TIRE_CHECK'
  | 'BRAKE_CHECK'
  | 'BATTERY_CHECK'
  | 'VEHICLE_CLEANING'
  | 'BOOKING_PREPARATION'
  | 'BOOKING_PICKUP'
  | 'BOOKING_RETURN'
  | 'DOCUMENT_REVIEW'
  | 'INVOICE_REQUIRED'
  | 'CUSTOMER_FOLLOWUP'
  | 'REPAIR'
  | 'CUSTOM';

export type ApiTaskSource = 'MANUAL' | 'SYSTEM' | 'ALERT' | 'HEALTH' | 'BOOKING' | 'DOCUMENT' | 'VENDOR';

export type TaskCompletionMode = 'MANUAL' | 'AUTO_RESOLVED' | 'SUPERSEDED';

export const TASK_BUCKETS = [
  'NOW',
  'TODAY',
  'UPCOMING',
  'PLANNED',
  'OVERDUE',
  'UNASSIGNED',
  'ALL_OPEN',
  'COMPLETED',
] as const;

export type TaskBucket = (typeof TASK_BUCKETS)[number];

export type TaskChecklistCompletionBlocker = 'REQUIRED_CHECKLIST_ITEMS_OPEN';

export interface TaskChecklistProgress {
  totalItems: number;
  completedItems: number;
  requiredItems: number;
  completedRequiredItems: number;
  remainingRequiredItems: number;
  progressPercent: number | null;
  hasChecklist: boolean;
  areRequiredItemsComplete: boolean;
  canCompleteByChecklist: boolean;
  completionBlockers: TaskChecklistCompletionBlocker[];
}

export type TaskLinkedObjectType =
  | 'VEHICLE'
  | 'BOOKING'
  | 'CUSTOMER'
  | 'INVOICE'
  | 'DOCUMENT'
  | 'ALERT'
  | 'SERVICE_CASE'
  | 'FINE'
  | 'VENDOR';

export type TaskLinkedObjectActionType =
  | 'OPEN_VEHICLE'
  | 'OPEN_BOOKING'
  | 'OPEN_CUSTOMER'
  | 'OPEN_INVOICE'
  | 'OPEN_DOCUMENT'
  | 'OPEN_ALERT'
  | 'OPEN_SERVICE_CASE'
  | 'OPEN_FINE'
  | 'OPEN_VENDOR';

export interface TaskLinkedObjectActionDescriptor {
  type: TaskLinkedObjectActionType;
  vehicleId?: string;
  bookingId?: string;
  customerId?: string;
  invoiceId?: string;
  documentId?: string;
  alertId?: string;
  serviceCaseId?: string;
  fineId?: string;
  vendorId?: string;
  module?: string;
}

export interface TaskLinkedObject {
  type: TaskLinkedObjectType;
  id: string;
  primaryLabel: string;
  secondaryLabel?: string | null;
  statusLabel?: string | null;
  iconKey: string;
  action: TaskLinkedObjectActionDescriptor;
  isAvailable: boolean;
  unavailableReason?: string | null;
}

export interface TaskUserRef {
  id: string;
  displayName: string;
  email?: string | null;
}

export interface TaskActionAvailability {
  enabled: boolean;
  disabledReason?: string;
}

export interface TaskAvailableActions {
  start: TaskActionAvailability;
  moveToWaiting: TaskActionAvailability;
  resume: TaskActionAvailability;
  complete: TaskActionAvailability;
  cancel: TaskActionAvailability;
  comment: TaskActionAvailability;
  overrideCompletion: TaskActionAvailability;
}

export type TaskNextActionType = 'START' | 'RESUME' | 'COMPLETE' | 'ASSIGN' | 'REVIEW' | 'NONE';

export type TaskNextActionTargetType =
  | 'TASK'
  | 'VEHICLE'
  | 'BOOKING'
  | 'CUSTOMER'
  | 'INVOICE'
  | 'DOCUMENT'
  | 'ALERT'
  | 'SERVICE_CASE'
  | 'FINE'
  | 'VENDOR';

export interface TaskDetailSummary {
  id: string;
  title: string;
  type: ApiTaskType;
  status: ApiTaskStatus;
  priority: ApiTaskPriority;
  sourceType: ApiTaskSource;
  humanReadableSource: string;
  completionMode: TaskCompletionMode | null;
}

export interface TaskDetailReason {
  title: string;
  description: string;
  detectedAt?: string | null;
  basis?: string | null;
}

export interface TaskDetailNextAction {
  label: string;
  description?: string | null;
  actionType: TaskNextActionType;
  targetType: TaskNextActionTargetType;
  targetId: string;
  enabled: boolean;
  disabledReason?: string | null;
}

export interface TaskDetailAssignment {
  assignedUser: TaskUserRef | null;
  createdBy: TaskUserRef | null;
  responsibleRoleLabel?: string | null;
}

export interface TaskDetailTiming {
  createdAt: string;
  activatesAt: string;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  isActive: boolean;
  isOverdue: boolean;
  bucket: TaskBucket;
}

export interface TaskDetailCompletion {
  completionMode: TaskCompletionMode | null;
  resolutionCode: string | null;
  resolutionNote: string | null;
  completedBy: TaskUserRef | null;
  supersededByTaskId: string | null;
}

export interface NormalizedTaskTimelineEvent {
  id: string;
  type: string;
  label: string;
  actor: TaskUserRef | null;
  actorUserId: string | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TaskDetailTechnicalMetadata {
  source: string | null;
  dedupKey: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ApiTaskDetailNormalizedSections {
  summary: TaskDetailSummary;
  reason: TaskDetailReason;
  nextAction: TaskDetailNextAction;
  linkedObjects: TaskLinkedObject[];
  checklistProgress: TaskChecklistProgress;
  assignment: TaskDetailAssignment;
  timing: TaskDetailTiming;
  completion: TaskDetailCompletion;
  timeline: NormalizedTaskTimelineEvent[];
  technicalMetadata: TaskDetailTechnicalMetadata;
  availableActions: TaskAvailableActions;
}

export interface ApiTaskChecklistItem {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  isDone: boolean;
  isRequired: boolean;
  completedAt: string | null;
  completedByUserId: string | null;
}

export interface ApiTaskComment {
  id: string;
  userId: string | null;
  body: string;
  createdAt: string;
}

export interface ApiTaskAttachment {
  id: string;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  uploadedByUserId: string | null;
  createdAt: string;
}

/** Legacy flat timeline row — detail may add `label` and `actor`. */
export interface ApiTaskEvent {
  id: string;
  type: string;
  actorUserId: string | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  label?: string;
  actor?: TaskUserRef | null;
}

/**
 * Shared task read model (list + detail). Normalized detail sections are present on
 * `GET /tasks/:id` and mutation responses; omitted on list rows.
 */
export interface ApiTask {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  category: string;
  type: ApiTaskType;
  status: ApiTaskStatus;
  priority: ApiTaskPriority;
  source: string | null;
  sourceType: ApiTaskSource;
  dedupKey: string | null;
  vehicleId: string | null;
  bookingId: string | null;
  customerId: string | null;
  vendorId: string | null;
  alertId: string | null;
  documentId: string | null;
  fineId: string | null;
  invoiceId: string | null;
  serviceCaseId: string | null;
  assignedUserId: string | null;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
  assignedUserName?: string | null;
  estimatedCostCents: number | null;
  actualCostCents: number | null;
  resolutionNote: string | null;
  resolutionCode?: string | null;
  completionMode?: TaskCompletionMode | null;
  completedByUserId?: string | null;
  supersededByTaskId?: string | null;
  activatesAt?: string;
  estimatedDurationMinutes?: number | null;
  blocksVehicleAvailability: boolean;
  metadata: Record<string, unknown> | null;
  isOverdue: boolean;
  isActivated?: boolean;
  bucket?: TaskBucket;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  checklistProgress?: TaskChecklistProgress;
  checklist?: ApiTaskChecklistItem[];
  comments?: ApiTaskComment[];
  attachments?: ApiTaskAttachment[];
  timeline?: ApiTaskEvent[];
  linkedObjects?: TaskLinkedObject[];
}

/** Full task detail — legacy flat fields plus normalized sections from the backend builder. */
export type ApiTaskDetail = ApiTask & ApiTaskDetailNormalizedSections;

export type TaskBucketSummaryCounts = Record<TaskBucket, number>;

export interface ApiTaskSummary {
  open: number;
  active: number;
  inProgress: number;
  waiting: number;
  done: number;
  cancelled: number;
  dueToday: number;
  overdue: number;
  critical: number;
  assignedToMe: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  buckets?: TaskBucketSummaryCounts;
  timezone?: string;
}

export interface TaskListFilters {
  status?: ApiTaskStatus;
  priority?: ApiTaskPriority;
  type?: ApiTaskType;
  source?: ApiTaskSource;
  assignedUserId?: string;
  vehicleId?: string;
  bookingId?: string;
  customerId?: string;
  vendorId?: string;
  alertId?: string;
  documentId?: string;
  serviceCaseId?: string;
  invoiceId?: string;
  stationId?: string;
  activatesFrom?: string;
  activatesTo?: string;
  dueFrom?: string;
  dueTo?: string;
  overdue?: boolean;
  search?: string;
  bucket?: TaskBucket;
  includeCancelled?: boolean;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  type: ApiTaskType;
  source?: ApiTaskSource;
  priority?: ApiTaskPriority;
  category?: string;
  dueDate?: string;
  activatesAt?: string;
  assignedUserId?: string;
  vehicleId?: string;
  bookingId?: string;
  customerId?: string;
  vendorId?: string;
  alertId?: string;
  documentId?: string;
  serviceCaseId?: string;
  stationId?: string;
  estimatedCostCents?: number;
  estimatedDurationMinutes?: number;
  blocksVehicleAvailability?: boolean;
  metadata?: Record<string, unknown>;
  sourceKey?: string;
  initialNote?: string;
  checklist?: Array<{ title: string; description?: string; sortOrder?: number; isRequired?: boolean }>;
}

export interface CompleteTaskPayload {
  resolutionNote?: string;
  resolutionCode?: string;
  actualCostCents?: number;
  overrideIncompleteChecklist?: boolean;
  overrideReason?: string;
}

export interface UpdateChecklistItemPayload {
  title?: string;
  description?: string;
  sortOrder?: number;
  isDone?: boolean;
  isRequired?: boolean;
}

export type BulkTaskActionType =
  | 'assign'
  | 'set_priority'
  | 'shift_due_date'
  | 'set_waiting'
  | 'cancel';

export interface BulkTaskActionPayload {
  taskIds: string[];
  action: BulkTaskActionType;
  assignedUserId?: string | null;
  priority?: ApiTaskPriority;
  dueDate?: string;
  dueDateShiftDays?: number;
}

export interface BulkTaskActionItemResult {
  taskId: string;
  success: boolean;
  error?: string;
}

export interface BulkTaskActionResponse {
  results: BulkTaskActionItemResult[];
  succeeded: number;
  failed: number;
}
