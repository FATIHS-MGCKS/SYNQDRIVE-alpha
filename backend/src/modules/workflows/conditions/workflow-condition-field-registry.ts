import type { WorkflowConditionFieldDefinition } from './workflow-condition.types';
import { OPERATORS_BY_DATA_TYPE } from './workflow-condition-operators';

const BOOKING_STATUS = ['PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
const TASK_STATUS = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
const HEALTH_SEVERITY = ['OK', 'WARNING', 'CRITICAL'] as const;

export const WORKFLOW_CONDITION_FIELD_REGISTRY: readonly WorkflowConditionFieldDefinition[] = [
  {
    path: 'booking.pickupAt',
    resolvePath: 'booking.pickupAt',
    dataType: 'datetime',
    label: 'Booking pickup time',
    allowedOperators: OPERATORS_BY_DATA_TYPE.datetime,
    piiClass: 'none',
  },
  {
    path: 'booking.status',
    resolvePath: 'booking.status',
    dataType: 'enum',
    label: 'Booking status',
    allowedOperators: OPERATORS_BY_DATA_TYPE.enum,
    enumValues: BOOKING_STATUS,
    piiClass: 'none',
  },
  {
    path: 'booking.pickupDelayMinutes',
    resolvePath: 'booking.pickupDelayMinutes',
    dataType: 'integer',
    label: 'Booking pickup delay (minutes)',
    allowedOperators: OPERATORS_BY_DATA_TYPE.integer,
    piiClass: 'none',
  },
  {
    path: 'vehicle.health.severity',
    resolvePath: 'vehicle.health.severity',
    dataType: 'enum',
    label: 'Vehicle health severity',
    allowedOperators: OPERATORS_BY_DATA_TYPE.enum,
    enumValues: HEALTH_SEVERITY,
    piiClass: 'none',
    legacyFieldKeys: ['severity', 'damage_severity'],
  },
  {
    path: 'vehicle.telemetry.lastSignalAt',
    resolvePath: 'vehicle.telemetry.lastSignalAt',
    dataType: 'datetime',
    label: 'Vehicle last telemetry signal',
    allowedOperators: OPERATORS_BY_DATA_TYPE.datetime,
    piiClass: 'none',
  },
  {
    path: 'customer.contact.whatsappAllowed',
    resolvePath: 'customer.contact.whatsappAllowed',
    dataType: 'boolean',
    label: 'Customer WhatsApp allowed',
    allowedOperators: OPERATORS_BY_DATA_TYPE.boolean,
    piiClass: 'pii',
    requiredPermission: 'workflow:condition:pii',
  },
  {
    path: 'invoice.amountDue',
    resolvePath: 'invoice.amountDue',
    dataType: 'decimal',
    label: 'Invoice amount due',
    allowedOperators: OPERATORS_BY_DATA_TYPE.decimal,
    piiClass: 'none',
    legacyFieldKeys: ['invoice_amount'],
  },
  {
    path: 'task.status',
    resolvePath: 'task.status',
    dataType: 'enum',
    label: 'Task status',
    allowedOperators: OPERATORS_BY_DATA_TYPE.enum,
    enumValues: TASK_STATUS,
    piiClass: 'none',
  },
  {
    path: 'payload.severity',
    resolvePath: 'severity',
    dataType: 'enum',
    label: 'Payload severity (legacy)',
    allowedOperators: OPERATORS_BY_DATA_TYPE.enum,
    enumValues: HEALTH_SEVERITY,
    piiClass: 'none',
    legacyFieldKeys: ['severity'],
  },
  {
    path: 'payload.overdueDays',
    resolvePath: 'overdueDays',
    dataType: 'integer',
    label: 'Overdue days (legacy)',
    allowedOperators: OPERATORS_BY_DATA_TYPE.integer,
    piiClass: 'none',
    legacyFieldKeys: ['overdue_days'],
  },
  {
    path: 'payload.bookingId',
    resolvePath: 'bookingId',
    dataType: 'string',
    label: 'Booking ID',
    allowedOperators: OPERATORS_BY_DATA_TYPE.string,
    piiClass: 'none',
  },
  {
    path: 'payload.vehicleStatus',
    resolvePath: 'vehicleStatus',
    dataType: 'string',
    label: 'Vehicle status (legacy)',
    allowedOperators: OPERATORS_BY_DATA_TYPE.string,
    piiClass: 'none',
    legacyFieldKeys: ['vehicle_status'],
  },
] as const;

const byPath = new Map(
  WORKFLOW_CONDITION_FIELD_REGISTRY.map((field) => [field.path, field]),
);
const byLegacy = new Map<string, WorkflowConditionFieldDefinition>();
for (const field of WORKFLOW_CONDITION_FIELD_REGISTRY) {
  for (const legacy of field.legacyFieldKeys ?? []) {
    byLegacy.set(legacy, field);
  }
}

export function resolveConditionField(
  fieldPath?: string,
  legacyField?: string,
): WorkflowConditionFieldDefinition | null {
  const trimmed = fieldPath?.trim();
  if (trimmed && byPath.has(trimmed)) {
    return byPath.get(trimmed) ?? null;
  }
  if (legacyField && byLegacy.has(legacyField)) {
    return byLegacy.get(legacyField) ?? null;
  }
  return null;
}

export function listConditionFields() {
  return WORKFLOW_CONDITION_FIELD_REGISTRY.map((field) => ({
    path: field.path,
    dataType: field.dataType,
    label: field.label,
    allowedOperators: field.allowedOperators,
    enumValues: field.enumValues,
    piiClass: field.piiClass,
    requiredPermission: field.requiredPermission,
  }));
}
