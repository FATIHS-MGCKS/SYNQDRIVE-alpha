import type { TaskAutomationCatalogKey } from '@modules/tasks/automation/task-automation-rule.types';

export interface TaskAutomationWorkflowTemplateDefinition {
  catalogKey: TaskAutomationCatalogKey;
  workflowEventType: 'task.automation.materialize';
  workflowCategory: 'task_automation_system';
  /** Stable display name — system templates are marked via systemMetadata. */
  workflowName: string;
  conditionCatalogKeyField: 'payload.catalogKey';
}

export const TASK_AUTOMATION_WORKFLOW_TEMPLATE_CATALOG: Record<
  TaskAutomationCatalogKey,
  TaskAutomationWorkflowTemplateDefinition
> = {
  BOOKING_PREPARATION: {
    catalogKey: 'BOOKING_PREPARATION',
    workflowEventType: 'task.automation.materialize',
    workflowCategory: 'task_automation_system',
    workflowName: '[System] Buchung vorbereiten',
    conditionCatalogKeyField: 'payload.catalogKey',
  },
  BOOKING_PICKUP: {
    catalogKey: 'BOOKING_PICKUP',
    workflowEventType: 'task.automation.materialize',
    workflowCategory: 'task_automation_system',
    workflowName: '[System] Fahrzeugübergabe (Pickup)',
    conditionCatalogKeyField: 'payload.catalogKey',
  },
  BOOKING_RETURN: {
    catalogKey: 'BOOKING_RETURN',
    workflowEventType: 'task.automation.materialize',
    workflowCategory: 'task_automation_system',
    workflowName: '[System] Fahrzeugrücknahme (Return)',
    conditionCatalogKeyField: 'payload.catalogKey',
  },
  DOCUMENT_PACKAGE_INCOMPLETE: {
    catalogKey: 'DOCUMENT_PACKAGE_INCOMPLETE',
    workflowEventType: 'task.automation.materialize',
    workflowCategory: 'task_automation_system',
    workflowName: '[System] Dokumentenpaket prüfen',
    conditionCatalogKeyField: 'payload.catalogKey',
  },
  INVOICE_PAYMENT_CHECK: {
    catalogKey: 'INVOICE_PAYMENT_CHECK',
    workflowEventType: 'task.automation.materialize',
    workflowCategory: 'task_automation_system',
    workflowName: '[System] Zahlungsprüfung Rechnung',
    conditionCatalogKeyField: 'payload.catalogKey',
  },
  VEHICLE_CLEANING_REQUIRED: {
    catalogKey: 'VEHICLE_CLEANING_REQUIRED',
    workflowEventType: 'task.automation.materialize',
    workflowCategory: 'task_automation_system',
    workflowName: '[System] Fahrzeugreinigung',
    conditionCatalogKeyField: 'payload.catalogKey',
  },
  VEHICLE_SERVICE_OVERDUE: {
    catalogKey: 'VEHICLE_SERVICE_OVERDUE',
    workflowEventType: 'task.automation.materialize',
    workflowCategory: 'task_automation_system',
    workflowName: '[System] Service überfällig',
    conditionCatalogKeyField: 'payload.catalogKey',
  },
  VEHICLE_INSPECTION_TUV_DUE: {
    catalogKey: 'VEHICLE_INSPECTION_TUV_DUE',
    workflowEventType: 'task.automation.materialize',
    workflowCategory: 'task_automation_system',
    workflowName: '[System] TÜV fällig',
    conditionCatalogKeyField: 'payload.catalogKey',
  },
  VEHICLE_INSPECTION_BOKRAFT_DUE: {
    catalogKey: 'VEHICLE_INSPECTION_BOKRAFT_DUE',
    workflowEventType: 'task.automation.materialize',
    workflowCategory: 'task_automation_system',
    workflowName: '[System] BOKraft fällig',
    conditionCatalogKeyField: 'payload.catalogKey',
  },
  REPAIR_REQUIRED: {
    catalogKey: 'REPAIR_REQUIRED',
    workflowEventType: 'task.automation.materialize',
    workflowCategory: 'task_automation_system',
    workflowName: '[System] Reparatur erforderlich',
    conditionCatalogKeyField: 'payload.catalogKey',
  },
  TIRE_CRITICAL_HEALTH: {
    catalogKey: 'TIRE_CRITICAL_HEALTH',
    workflowEventType: 'task.automation.materialize',
    workflowCategory: 'task_automation_system',
    workflowName: '[System] Reifen kritisch',
    conditionCatalogKeyField: 'payload.catalogKey',
  },
  BRAKE_CRITICAL_HEALTH: {
    catalogKey: 'BRAKE_CRITICAL_HEALTH',
    workflowEventType: 'task.automation.materialize',
    workflowCategory: 'task_automation_system',
    workflowName: '[System] Bremsen kritisch',
    conditionCatalogKeyField: 'payload.catalogKey',
  },
  BATTERY_CRITICAL_HEALTH: {
    catalogKey: 'BATTERY_CRITICAL_HEALTH',
    workflowEventType: 'task.automation.materialize',
    workflowCategory: 'task_automation_system',
    workflowName: '[System] Batterie kritisch',
    conditionCatalogKeyField: 'payload.catalogKey',
  },
};
