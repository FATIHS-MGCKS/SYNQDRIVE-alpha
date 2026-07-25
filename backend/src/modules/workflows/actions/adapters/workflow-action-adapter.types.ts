/** Typed config contracts for production workflow action adapters. */

export interface TaskCreateActionConfig {
  title: string;
  description?: string;
  category?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  vehicleId?: string;
  bookingId?: string;
  customerId?: string;
  /** Catalog dedup key — when set, overrides workflow-scoped dedup. */
  dedupKey?: string;
  taskType?: string;
  sourceType?: string;
  source?: string;
  withChecklist?: boolean;
  checklist?: Array<{
    title: string;
    description?: string;
    sortOrder?: number;
    isRequired?: boolean;
  }>;
  dueDate?: string;
  activatesAt?: string;
  metadata?: Record<string, unknown>;
  automationRuleId?: string;
  automationCatalogKey?: string;
}

export type WorkflowInAppNotificationTemplateKey =
  | 'booking_attention'
  | 'vehicle_attention'
  | 'workflow_alert';

export type WorkflowRecipientRole =
  | 'ORG_ADMIN'
  | 'SUB_ADMIN'
  | 'FLEET_MANAGER'
  | 'OPERATIONS';

export interface NotificationInAppSendActionConfig {
  templateKey: WorkflowInAppNotificationTemplateKey;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  recipientRoles: WorkflowRecipientRole[];
  params?: Record<string, string | number | boolean>;
  entityType?: 'BOOKING' | 'VEHICLE' | 'CUSTOMER' | 'ORGANIZATION';
  entityId?: string;
}

export interface ApprovalRequestActionConfig {
  message?: string;
  approverRoleScope?: WorkflowRecipientRole;
  ttlHours?: number;
}

export type BookingWorkflowFlag =
  | 'pickup_overdue'
  | 'manual_review'
  | 'complaint_escalated'
  | 'workflow_hold'
  | 'payment_attention';

export interface BookingFlagActionConfig {
  flag: BookingWorkflowFlag;
  reason?: string;
  bookingId?: string;
}

export interface VehicleStatusUpdateActionConfig {
  status: string;
  force?: boolean;
  reason?: string;
  vehicleId?: string;
}
