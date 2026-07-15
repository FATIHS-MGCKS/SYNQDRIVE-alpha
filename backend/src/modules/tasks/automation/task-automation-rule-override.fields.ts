import type { TaskAutomationOrgOverrideFieldKey } from './task-automation-rule.types';

export const BOOKING_LIFECYCLE_ORG_OVERRIDE_FIELDS: TaskAutomationOrgOverrideFieldKey[] = [
  'enabled',
  'activationOffsetMinutes',
  'dueOffsetMinutes',
  'priority',
  'assignmentStrategy',
  'assignedUserId',
  'assignedRoleKey',
  'stationScope',
  'checklistOverrides',
];

export const DOCUMENT_PACKAGE_ORG_OVERRIDE_FIELDS: TaskAutomationOrgOverrideFieldKey[] = [
  'enabled',
  'priority',
  'assignedUserId',
  'assignedRoleKey',
  'checklistOverrides',
];

export const INVOICE_PAYMENT_ORG_OVERRIDE_FIELDS: TaskAutomationOrgOverrideFieldKey[] = [
  'enabled',
  'dueOffsetMinutes',
  'priority',
  'assignedUserId',
  'assignedRoleKey',
  'notificationConfig',
];

export const VEHICLE_CLEANING_ORG_OVERRIDE_FIELDS: TaskAutomationOrgOverrideFieldKey[] = [
  'enabled',
  'priority',
  'assignmentStrategy',
  'assignedUserId',
  'assignedRoleKey',
  'stationScope',
];

export const INSIGHT_HEALTH_ORG_OVERRIDE_FIELDS: TaskAutomationOrgOverrideFieldKey[] = [
  'enabled',
  'priority',
  'assignedUserId',
  'assignedRoleKey',
  'escalationConfig',
  'notificationConfig',
];

export const REPAIR_ORG_OVERRIDE_FIELDS: TaskAutomationOrgOverrideFieldKey[] = [
  'enabled',
  'priority',
  'assignmentStrategy',
  'assignedUserId',
  'assignedRoleKey',
];

export function markOrgOverridableConfigurableFields<
  T extends { field: string; orgOverridable?: boolean },
>(fields: T[]): T[] {
  return fields.map((field) => ({ ...field, orgOverridable: true }));
}
