import type { TaskCompletionMode, TaskStatus, TaskType } from '@prisma/client';
import type { TaskDiagnosticReport } from './task-data-diagnostic.types';

export const TASK_DATA_REPAIR_SCRIPT_VERSION = '1.0.0';

export type TaskRepairActionId =
  | 'backfill_completion_mode'
  | 'backfill_completed_at'
  | 'backfill_completion_event'
  | 'backfill_auto_resolved_event'
  | 'backfill_assigned_event'
  | 'supersede_duplicate_task'
  | 'reassign_task_resources'
  | 'fix_timing_activates_after_due'
  | 'fix_timing_completed_before_created'
  | 'document_legacy_checklist_inconsistency';

export interface TaskRepairRunOptions {
  organizationId?: string;
  /** When false (default), only plan repairs without writes. */
  apply?: boolean;
  batchSize?: number;
  referenceNow?: Date;
}

export interface TaskRepairAction {
  actionId: TaskRepairActionId;
  organizationId: string;
  taskId: string;
  relatedTaskId?: string;
  description: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  applied: boolean;
}

export interface TaskRepairUnresolved {
  organizationId: string;
  taskId: string;
  rule: string;
  reason: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface TaskRepairSkipped {
  organizationId: string;
  taskId?: string;
  rule: string;
  reason: string;
}

export interface TaskRepairAuditLogEntry {
  at: string;
  level: 'info' | 'action' | 'skip' | 'error';
  message: string;
  actionId?: TaskRepairActionId;
  taskId?: string;
}

export interface TaskRepairReport {
  mode: 'repair';
  dryRun: boolean;
  apply: boolean;
  scriptVersion: string;
  generatedAt: string;
  organizationId: string | null;
  organizationCount: number;
  tasksScanned: number;
  summary: {
    planned: number;
    applied: number;
    skipped: number;
    unresolved: number;
    errors: number;
    byAction: Partial<Record<TaskRepairActionId, number>>;
  };
  actions: TaskRepairAction[];
  unresolved: TaskRepairUnresolved[];
  skipped: TaskRepairSkipped[];
  auditLog: TaskRepairAuditLogEntry[];
  diagnosticBefore: TaskDiagnosticReport;
  diagnosticAfter?: TaskDiagnosticReport;
}

export interface RepairTaskRow {
  id: string;
  organizationId: string;
  title: string;
  status: TaskStatus;
  type: TaskType;
  completionMode: TaskCompletionMode | null;
  completedAt: Date | null;
  completedByUserId: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activatesAt: Date | null;
  dueDate: Date | null;
  resolutionNote: string | null;
  resolutionCode: string | null;
  assignedUserId: string | null;
  supersededByTaskId: string | null;
  bookingId: string | null;
  vehicleId: string | null;
  invoiceId: string | null;
  documentId: string | null;
  source: string | null;
  dedupKey: string | null;
  metadata: unknown;
  checklistItems: Array<{ id: string; isDone: boolean; isRequired: boolean }>;
  events: Array<{
    type: string;
    actorUserId?: string | null;
    oldValue: string | null;
    newValue: string | null;
    createdAt: Date;
  }>;
  _count?: { comments: number; attachments: number };
}
