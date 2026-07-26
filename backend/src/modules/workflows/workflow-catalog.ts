import {
  APPROVAL_REQUIRED_ACTIONS,
  CONDITION_OPERATORS,
  WORKFLOW_ACTION_TYPES,
  WORKFLOW_CATEGORIES,
  WORKFLOW_EVENT_TYPES,
} from './workflow.constants';

export const WORKFLOW_SCOPE_TYPES = ['organization', 'station', 'vehicle', 'territory'] as const;

export const WORKFLOW_CONDITION_FIELDS = [
  { key: 'vehicle_status', path: 'payload.vehicleStatus', dataType: 'string' as const },
  { key: 'cleaning_status', path: 'payload.cleaningStatus', dataType: 'string' as const },
  { key: 'health_score', path: 'payload.healthScore', dataType: 'number' as const, min: 0, max: 100 },
  { key: 'mileage', path: 'payload.mileage', dataType: 'number' as const, min: 0 },
  { key: 'booking_type', path: 'payload.bookingType', dataType: 'string' as const },
  { key: 'vehicle_group', path: 'payload.vehicleGroup', dataType: 'string' as const },
  { key: 'station', path: 'payload.stationId', dataType: 'string' as const },
  {
    key: 'days_since_last_service',
    path: 'payload.daysSinceLastService',
    dataType: 'number' as const,
    min: 0,
    unit: 'days',
  },
  {
    key: 'invoice_amount',
    path: 'payload.invoiceAmountCents',
    dataType: 'number' as const,
    min: 0,
    unit: 'cents',
  },
  { key: 'overdue_days', path: 'payload.overdueDays', dataType: 'number' as const, min: 0, unit: 'days' },
  { key: 'damage_severity', path: 'payload.damageSeverity', dataType: 'string' as const },
  { key: 'notification_severity', path: 'payload.severity', dataType: 'string' as const },
  { key: 'notification_event_type', path: 'payload.eventType', dataType: 'string' as const },
  {
    key: 'notification_lifecycle_generation',
    path: 'payload.lifecycleGeneration',
    dataType: 'number' as const,
    min: 1,
  },
  {
    key: 'notification_reopen_count',
    path: 'payload.reopenCount',
    dataType: 'number' as const,
    min: 0,
  },
] as const;

const OPERATORS_BY_TYPE: Record<string, readonly string[]> = {
  string: ['equals', 'notEquals', 'in', 'notIn', 'contains', 'exists'],
  number: ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte', 'exists'],
  boolean: ['equals', 'exists'],
};

export function getWorkflowCatalog() {
  return {
    triggers: WORKFLOW_EVENT_TYPES.map((type) => ({ type, legacy: false })),
    actions: WORKFLOW_ACTION_TYPES.map((type) => ({
      type,
      requiresApproval: APPROVAL_REQUIRED_ACTIONS.has(type),
    })),
    categories: [...WORKFLOW_CATEGORIES],
    scopeTypes: [...WORKFLOW_SCOPE_TYPES],
    conditionFields: WORKFLOW_CONDITION_FIELDS.map((field) => ({
      ...field,
      operators: OPERATORS_BY_TYPE[field.dataType] ?? CONDITION_OPERATORS,
    })),
    operators: CONDITION_OPERATORS.filter(
      (op) => !['not_equals', 'greater_than', 'less_than', 'is_true', 'is_false'].includes(op),
    ),
    conditionLogicModes: ['all', 'any'] as const,
    statuses: ['DRAFT', 'ACTIVE', 'DISABLED'] as const,
    vehicleStatuses: [
      'AVAILABLE',
      'RENTED',
      'IN_SERVICE',
      'OUT_OF_SERVICE',
      'RESERVED',
      'NEEDS_CLEANING',
    ],
    taskPriorities: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
    alertSeverities: ['info', 'warning', 'high', 'critical'],
    notificationTargets: ['admin', 'assignee', 'station'],
    systemTemplateEditableFields: ['enabled', 'description'] as const,
  };
}

export type WorkflowCatalogDto = ReturnType<typeof getWorkflowCatalog>;
