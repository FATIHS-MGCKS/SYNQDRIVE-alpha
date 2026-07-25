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

export type WorkflowEmailLocale = 'de' | 'en';

export type WorkflowEmailTemplateKey =
  | 'booking_follow_up'
  | 'invoice_reminder'
  | 'workflow_operational';

export type WorkflowEmailRecipientRef =
  | { type: 'customer'; customerId: string }
  | { type: 'booking'; bookingId: string };

export type WorkflowEmailDeliveryStatus =
  | 'PREPARED'
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'BOUNCED'
  | 'FAILED'
  | 'SUPPRESSED';

export interface EmailSendActionConfig {
  templateId: WorkflowEmailTemplateKey;
  templateVersion: string;
  locale?: WorkflowEmailLocale;
  subject?: string;
  recipient: WorkflowEmailRecipientRef;
  /** Explicit address — requires WORKFLOW_CUSTOMER_CONTACT when entity has no email. */
  toEmail?: string;
  params?: Record<string, string>;
  attachmentDocumentIds?: string[];
  respectSendWindow?: boolean;
  verifiedDiagnosis?: boolean;
}

export type WorkflowWhatsAppRecipientRef =
  | { type: 'customer'; customerId: string }
  | { type: 'booking'; bookingId: string };

export type WorkflowWhatsAppMessageKind = 'transactional' | 'marketing' | 'support';

export type WorkflowWhatsAppDeliveryStatus =
  | 'PREPARED'
  | 'QUEUED'
  | 'ACCEPTED'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'BLOCKED';

export interface WhatsAppTemplateSendActionConfig {
  /** Org-scoped WhatsAppTemplate.id — not provider secrets. */
  templateId: string;
  /** Must match approved template language when set. */
  language?: string;
  recipient: WorkflowWhatsAppRecipientRef;
  /** Explicit E.164 — requires WORKFLOW_CUSTOMER_CONTACT when entity has no phone. */
  toPhone?: string;
  variables?: Record<string, string>;
  messageKind?: WorkflowWhatsAppMessageKind;
  respectQuietHours?: boolean;
  verifiedDiagnosis?: boolean;
}

export interface WhatsAppAiMessageSendActionConfig {
  recipient: WorkflowWhatsAppRecipientRef;
  toPhone?: string;
  /** Populated by future AI pipeline; manual override for approved runs only. */
  message?: string;
  messageKind?: WorkflowWhatsAppMessageKind;
  respectQuietHours?: boolean;
  appendAiTransparency?: boolean;
  verifiedDiagnosis?: boolean;
  /** Risk flags from AI pipeline — triggers approval gate when present. */
  sensitiveFlags?: string[];
}

export type WorkflowSmsLocale = 'de' | 'en';

export type WorkflowSmsTemplateKey =
  | 'booking_follow_up'
  | 'pickup_reminder'
  | 'workflow_operational';

export type WorkflowSmsDeliveryStatus =
  | 'PREPARED'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'UNDELIVERED'
  | 'FAILED';

export interface SmsSendActionConfig {
  templateKey: WorkflowSmsTemplateKey;
  templateVersion: string;
  locale?: WorkflowSmsLocale;
  recipient: WorkflowWhatsAppRecipientRef;
  toPhone?: string;
  params?: Record<string, string>;
  messageKind?: WorkflowWhatsAppMessageKind;
  respectQuietHours?: boolean;
  verifiedDiagnosis?: boolean;
  maxSegments?: number;
  /** Link SMS as fallback after failed WhatsApp delivery (same org). */
  fallbackFromWhatsAppMessageId?: string;
  /** Risk flags — require workflow approval when present. */
  sensitiveFlags?: string[];
}
