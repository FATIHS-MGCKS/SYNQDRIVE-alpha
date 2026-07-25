import type { TaskPriority, TaskSource, TaskType } from '@prisma/client';
import type { TaskAutomationCatalogKey } from '@modules/tasks/automation/task-automation-rule.types';

export interface TaskAutomationWorkflowSystemMetadata {
  systemTemplate: true;
  catalogRuleId: string;
  catalogKey: TaskAutomationCatalogKey;
  templateVersion: number;
  catalogRuleVersion: number;
}

export interface TaskAutomationMaterializationPayload {
  organizationId: string;
  catalogKey: TaskAutomationCatalogKey;
  ruleId: string;
  dedupKey: string;
  title: string;
  description?: string;
  category?: string;
  type: TaskType;
  sourceType: TaskSource;
  source: string;
  priority?: TaskPriority;
  vehicleId?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
  vendorId?: string | null;
  documentId?: string | null;
  dueDate?: Date | null;
  activatesAt?: Date | null;
  withChecklist?: boolean;
  checklist?: Array<{
    title: string;
    description?: string;
    sortOrder?: number;
    isRequired?: boolean;
  }>;
  metadata?: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
  eventType?: string;
}

export interface TaskAutomationExecutionRouteInput {
  payload: TaskAutomationMaterializationPayload;
  legacyExecute: () => Promise<void>;
}

export interface TaskAutomationShadowResult {
  catalogKey: TaskAutomationCatalogKey;
  ruleId: string;
  dedupKey: string;
  previewSummary: string;
  plannedEffects: string[];
}
