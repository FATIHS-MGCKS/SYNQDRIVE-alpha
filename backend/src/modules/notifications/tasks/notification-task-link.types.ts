import type { TaskSource, TaskType } from '@prisma/client';

/** Canonical provenance stored on OrgTask rows created from notification workflows. */
export interface NotificationTaskLink {
  organizationId: string;
  notificationId: string;
  workflowRunId: string;
  sourceEventType: string;
  idempotencyKey: string;
  workflowId?: string;
  actionDefinitionId?: string;
  notificationGeneration?: number;
  notificationFingerprint?: string;
}

export interface NotificationTaskUpsertInput {
  title: string;
  description?: string;
  category?: string;
  type?: TaskType;
  sourceType?: TaskSource;
  source: string;
  priority?: import('@prisma/client').TaskPriority;
  vehicleId?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
  invoiceId?: string | null;
  dueDate?: Date | null;
  activatesAt?: Date | null;
  checklist?: Array<{
    title: string;
    description?: string;
    sortOrder?: number;
    isRequired?: boolean;
  }>;
  metadata?: Record<string, unknown>;
  link: NotificationTaskLink;
}
