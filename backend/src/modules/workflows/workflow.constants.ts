import { VehicleStatus } from '@prisma/client';
import {
  WORKFLOW_DOMAIN_EVENT_TYPES,
  LEGACY_TRIGGER_TO_EVENT,
} from './registry';

/** Canonical workflow domain event types — sourced from registry. */
export const WORKFLOW_EVENT_TYPES = WORKFLOW_DOMAIN_EVENT_TYPES;

export type WorkflowEventType = (typeof WORKFLOW_EVENT_TYPES)[number];

/** @deprecated Import from `./registry` — explicit legacy adapters only. */
export { LEGACY_TRIGGER_TO_EVENT };

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
  'workflow.approval.request',
  'workflow.delay',
  'notification.prepare',
  'ai.suggest_action',
] as const;

export type WorkflowActionType = (typeof WORKFLOW_ACTION_TYPES)[number];

/** Actions that must never auto-execute without approval. */
export const APPROVAL_REQUIRED_ACTIONS = new Set<string>([
  'ai.suggest_action',
  'workflow.approval.request',
  'ai.execute',
  'ai.send_message',
  'ai.book_appointment',
  'customer.contact.send',
  'invoice.charge',
  'booking.cancel',
]);

/** Legacy UI action keys → canonical action types. */
export const LEGACY_ACTION_TO_CANONICAL: Record<string, WorkflowActionType> = {
  create_task: 'task.create',
  create_alert: 'alert.create',
  change_vehicle_status: 'vehicle.status.update',
  send_notification: 'notification.prepare',
  ai_suggest: 'ai.suggest_action',
  request_approval: 'workflow.approval.request',
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
