import { VehicleStatus } from '@prisma/client';

/** Canonical MVP workflow event types. */
export const WORKFLOW_EVENT_TYPES = [
  'booking.returned',
  'booking.completed',
  'vehicle.health.warning',
  'vehicle.health.critical',
  'vehicle.dtc.critical',
  'invoice.overdue',
  'customer.complaint.created',
  'manual.test',
  'task.automation.materialize',
] as const;

export type WorkflowEventType = (typeof WORKFLOW_EVENT_TYPES)[number];

/** Legacy UI trigger keys → canonical event types. */
export const LEGACY_TRIGGER_TO_EVENT: Record<string, WorkflowEventType> = {
  vehicle_returned: 'booking.returned',
  manual: 'manual.test',
  invoice_overdue: 'invoice.overdue',
  health_threshold: 'vehicle.health.warning',
  fine_created: 'customer.complaint.created',
};

export const WORKFLOW_CATEGORIES = [
  'vehicle_return',
  'geofencing',
  'cleaning',
  'maintenance',
  'finance',
  'ai_permissions',
  'support',
] as const;

export const WORKFLOW_ACTION_TYPES = [
  'task.create',
  'alert.create',
  'vehicle.status.update',
  'approval.request',
  'workflow.approval.request',
  'notification.in_app.send',
  'notification.prepare',
  'email.send',
  'whatsapp.template.send',
  'whatsapp.ai_message.send',
  'sms.send',
  'booking.flag',
  'ai.suggest_action',
] as const;

export type WorkflowActionType = (typeof WORKFLOW_ACTION_TYPES)[number];

/** Actions that must never auto-execute without approval. */
export const APPROVAL_REQUIRED_ACTIONS = new Set<string>([
  'ai.suggest_action',
  'ai.execute',
  'ai.send_message',
  'ai.book_appointment',
  'customer.contact.send',
  'customer.contact.email',
  'whatsapp.template.send',
  'whatsapp.ai_message.send',
  'sms.send',
  'invoice.charge',
  'booking.cancel',
]);

/** Approval gate actions — they create the gate; executor must not double-gate. */
export const WORKFLOW_APPROVAL_GATE_ACTIONS = new Set<string>([
  'approval.request',
  'workflow.approval.request',
]);

/** Legacy UI action keys → canonical action types. */
export const LEGACY_ACTION_TO_CANONICAL: Record<string, WorkflowActionType> = {
  create_task: 'task.create',
  create_alert: 'alert.create',
  change_vehicle_status: 'vehicle.status.update',
  send_notification: 'notification.in_app.send',
  send_in_app_notification: 'notification.in_app.send',
  notification_send: 'notification.in_app.send',
  send_email: 'email.send',
  email_send: 'email.send',
  customer_contact_email: 'email.send',
  customer_contact_send: 'email.send',
  whatsapp_template_send: 'whatsapp.template.send',
  whatsapp_ai_message_send: 'whatsapp.ai_message.send',
  customer_contact_whatsapp: 'whatsapp.template.send',
  sms_send: 'sms.send',
  customer_contact_sms: 'sms.send',
  ai_suggest: 'ai.suggest_action',
  request_approval: 'approval.request',
  workflow_approval: 'workflow.approval.request',
};

export const ALLOWED_VEHICLE_STATUSES = new Set<string>(Object.values(VehicleStatus));

export const CONDITION_OPERATORS = [
  'equals',
  'notEquals',
  'in',
  'notIn',
  'gt',
  'gte',
  'lt',
  'lte',
  'exists',
  'contains',
  // legacy aliases
  'not_equals',
  'greater_than',
  'less_than',
  'is_true',
  'is_false',
] as const;
