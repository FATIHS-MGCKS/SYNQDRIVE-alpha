import type { TaskAutomationCatalogKey } from '@modules/tasks/automation/task-automation-rule.types';

export const TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY = 'task_automation_system';
export const TASK_AUTOMATION_MATERIALIZE_EVENT = 'task.automation.materialize';

export interface TaskAutomationWorkflowTemplateDefinition {
  catalogKey: TaskAutomationCatalogKey;
  workflowEventType: typeof TASK_AUTOMATION_MATERIALIZE_EVENT;
  workflowCategory: typeof TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY;
  workflowName: string;
}

export const TASK_AUTOMATION_WORKFLOW_TEMPLATE_CATALOG: Record<
  TaskAutomationCatalogKey,
  TaskAutomationWorkflowTemplateDefinition
> = {
  BOOKING_PREPARATION: {
    catalogKey: 'BOOKING_PREPARATION',
    workflowEventType: TASK_AUTOMATION_MATERIALIZE_EVENT,
    workflowCategory: TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY,
    workflowName: '[System] Buchung vorbereiten',
  },
  BOOKING_PICKUP: {
    catalogKey: 'BOOKING_PICKUP',
    workflowEventType: TASK_AUTOMATION_MATERIALIZE_EVENT,
    workflowCategory: TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY,
    workflowName: '[System] Fahrzeugübergabe (Pickup)',
  },
  BOOKING_RETURN: {
    catalogKey: 'BOOKING_RETURN',
    workflowEventType: TASK_AUTOMATION_MATERIALIZE_EVENT,
    workflowCategory: TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY,
    workflowName: '[System] Fahrzeugrücknahme (Return)',
  },
  DOCUMENT_PACKAGE_INCOMPLETE: {
    catalogKey: 'DOCUMENT_PACKAGE_INCOMPLETE',
    workflowEventType: TASK_AUTOMATION_MATERIALIZE_EVENT,
    workflowCategory: TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY,
    workflowName: '[System] Dokumentenpaket prüfen',
  },
  INVOICE_PAYMENT_CHECK: {
    catalogKey: 'INVOICE_PAYMENT_CHECK',
    workflowEventType: TASK_AUTOMATION_MATERIALIZE_EVENT,
    workflowCategory: TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY,
    workflowName: '[System] Zahlungsprüfung Rechnung',
  },
  VEHICLE_CLEANING_REQUIRED: {
    catalogKey: 'VEHICLE_CLEANING_REQUIRED',
    workflowEventType: TASK_AUTOMATION_MATERIALIZE_EVENT,
    workflowCategory: TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY,
    workflowName: '[System] Fahrzeugreinigung',
  },
  VEHICLE_SERVICE_OVERDUE: {
    catalogKey: 'VEHICLE_SERVICE_OVERDUE',
    workflowEventType: TASK_AUTOMATION_MATERIALIZE_EVENT,
    workflowCategory: TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY,
    workflowName: '[System] Service überfällig',
  },
  VEHICLE_INSPECTION_TUV_DUE: {
    catalogKey: 'VEHICLE_INSPECTION_TUV_DUE',
    workflowEventType: TASK_AUTOMATION_MATERIALIZE_EVENT,
    workflowCategory: TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY,
    workflowName: '[System] TÜV fällig',
  },
  VEHICLE_INSPECTION_BOKRAFT_DUE: {
    catalogKey: 'VEHICLE_INSPECTION_BOKRAFT_DUE',
    workflowEventType: TASK_AUTOMATION_MATERIALIZE_EVENT,
    workflowCategory: TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY,
    workflowName: '[System] BOKraft fällig',
  },
  REPAIR_REQUIRED: {
    catalogKey: 'REPAIR_REQUIRED',
    workflowEventType: TASK_AUTOMATION_MATERIALIZE_EVENT,
    workflowCategory: TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY,
    workflowName: '[System] Reparatur erforderlich',
  },
  TIRE_CRITICAL_HEALTH: {
    catalogKey: 'TIRE_CRITICAL_HEALTH',
    workflowEventType: TASK_AUTOMATION_MATERIALIZE_EVENT,
    workflowCategory: TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY,
    workflowName: '[System] Reifen kritisch',
  },
  BRAKE_CRITICAL_HEALTH: {
    catalogKey: 'BRAKE_CRITICAL_HEALTH',
    workflowEventType: TASK_AUTOMATION_MATERIALIZE_EVENT,
    workflowCategory: TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY,
    workflowName: '[System] Bremsen kritisch',
  },
  BATTERY_CRITICAL_HEALTH: {
    catalogKey: 'BATTERY_CRITICAL_HEALTH',
    workflowEventType: TASK_AUTOMATION_MATERIALIZE_EVENT,
    workflowCategory: TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY,
    workflowName: '[System] Batterie kritisch',
  },
};
