import type {
  TaskCompletionMode,
  TaskPriority,
  TaskSource,
  TaskStatus,
  TaskType,
} from '@prisma/client';
import type { ChecklistProgress } from './checklist-progress.util';
import type { TaskOperatorBucket } from './task-bucket.util';
import type { TaskLinkedObject } from './task-linked-object.types';

/** Legacy flat detail payload from `TasksService.format()` (detail includes). */
export interface TaskDetailLegacyFields {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  category: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  source: string | null;
  sourceType: TaskSource;
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
  createdByUserId: string | null;
  updatedByUserId: string | null;
  estimatedCostCents: number | null;
  actualCostCents: number | null;
  resolutionNote: string | null;
  activatesAt: string;
  completionMode: TaskCompletionMode | null;
  resolutionCode: string | null;
  completedByUserId: string | null;
  supersededByTaskId: string | null;
  estimatedDurationMinutes: number | null;
  blocksVehicleAvailability: boolean;
  metadata: unknown;
  isOverdue: boolean;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  checklistProgress: ChecklistProgress;
  checklist?: Array<{
    id: string;
    title: string;
    description: string;
    sortOrder: number;
    isDone: boolean;
    isRequired: boolean;
    completedAt: string | null;
    completedByUserId: string | null;
  }>;
  comments?: Array<{
    id: string;
    userId: string | null;
    body: string;
    createdAt: string;
  }>;
  attachments?: Array<{
    id: string;
    fileUrl: string;
    fileName: string | null;
    mimeType: string | null;
    size: number | null;
    uploadedByUserId: string | null;
    createdAt: string;
  }>;
  /** Legacy + normalized event stream (additive fields on the same array). */
  timeline?: NormalizedTaskTimelineEvent[];
}

/** Full task detail API response: legacy flat fields + normalized sections. */
export type TaskDetailResponse = TaskDetailLegacyFields & TaskDetailNormalizedSections;

/** Operator timing bucket (Task Domain V2 §I). */
export type { TaskOperatorBucket as TaskTimingBucket } from './task-bucket.util';
export { TASK_OPERATOR_BUCKETS } from './task-bucket.util';

export type TaskNextActionType =
  | 'START'
  | 'RESUME'
  | 'COMPLETE'
  | 'ASSIGN'
  | 'REVIEW'
  | 'NONE';

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

export interface TaskDetailSummary {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  sourceType: TaskSource;
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
  bucket: TaskOperatorBucket;
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
  /** Normalized actor projection for new clients. */
  actor: TaskUserRef | null;
  /** Preserved for legacy clients — same value as `actor?.id`. */
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

/** Normalized detail sections layered on top of the legacy flat response. */
export interface TaskDetailNormalizedSections {
  summary: TaskDetailSummary;
  reason: TaskDetailReason;
  nextAction: TaskDetailNextAction;
  linkedObjects: TaskLinkedObject[];
  checklistProgress: ChecklistProgress;
  assignment: TaskDetailAssignment;
  timing: TaskDetailTiming;
  completion: TaskDetailCompletion;
  timeline: NormalizedTaskTimelineEvent[];
  technicalMetadata: TaskDetailTechnicalMetadata;
  availableActions: TaskAvailableActions;
}
