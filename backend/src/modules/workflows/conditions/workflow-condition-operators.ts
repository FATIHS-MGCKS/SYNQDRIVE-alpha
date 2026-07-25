import type {
  WorkflowConditionDataType,
  WorkflowConditionOperator,
} from './workflow-condition.types';

export interface WorkflowConditionOperatorDefinition {
  operator: WorkflowConditionOperator;
  aliases: readonly string[];
  allowedTypes: readonly WorkflowConditionDataType[];
  example: string;
  errorCases: readonly string[];
  requiresChangeContext?: boolean;
  requiresTimezone?: boolean;
}

/** Canonical operator matrix — source of truth for docs and validation. */
export const WORKFLOW_CONDITION_OPERATOR_MATRIX: readonly WorkflowConditionOperatorDefinition[] = [
  {
    operator: 'equals',
    aliases: ['EQUALS'],
    allowedTypes: ['boolean', 'integer', 'decimal', 'datetime', 'enum', 'string'],
    example: 'booking.status equals CONFIRMED',
    errorCases: ['Type mismatch', 'Invalid enum value', 'Null actual for comparison'],
  },
  {
    operator: 'notEquals',
    aliases: ['NOT_EQUALS', 'not_equals'],
    allowedTypes: ['boolean', 'integer', 'decimal', 'datetime', 'enum', 'string'],
    example: 'booking.status notEquals CANCELLED',
    errorCases: ['Type mismatch', 'Invalid enum value'],
  },
  {
    operator: 'greaterThan',
    aliases: ['GT', 'gt', 'greater_than'],
    allowedTypes: ['integer', 'decimal', 'datetime'],
    example: 'booking.pickupDelayMinutes greaterThan 30',
    errorCases: ['Used on string/boolean', 'Invalid number/datetime'],
  },
  {
    operator: 'greaterThanOrEqual',
    aliases: ['GTE', 'gte'],
    allowedTypes: ['integer', 'decimal', 'datetime'],
    example: 'invoice.amountDue greaterThanOrEqual 10.00',
    errorCases: ['Used on incompatible type'],
  },
  {
    operator: 'lessThan',
    aliases: ['LT', 'lt', 'less_than'],
    allowedTypes: ['integer', 'decimal', 'datetime'],
    example: 'booking.pickupDelayMinutes lessThan 60',
    errorCases: ['Used on incompatible type'],
  },
  {
    operator: 'lessThanOrEqual',
    aliases: ['LTE', 'lte'],
    allowedTypes: ['integer', 'decimal', 'datetime'],
    example: 'booking.pickupDelayMinutes lessThanOrEqual 45',
    errorCases: ['Used on incompatible type'],
  },
  {
    operator: 'in',
    aliases: ['IN'],
    allowedTypes: ['integer', 'decimal', 'enum', 'string'],
    example: 'booking.status in [CONFIRMED, READY_FOR_PICKUP]',
    errorCases: ['Expected value not array', 'Empty array → always false'],
  },
  {
    operator: 'notIn',
    aliases: ['NOT_IN', 'not_in'],
    allowedTypes: ['integer', 'decimal', 'enum', 'string'],
    example: 'booking.status notIn [CANCELLED]',
    errorCases: ['Expected value not array', 'Empty array → always true'],
  },
  {
    operator: 'exists',
    aliases: ['EXISTS'],
    allowedTypes: ['boolean', 'integer', 'decimal', 'datetime', 'enum', 'string', 'array'],
    example: 'payload.bookingId exists',
    errorCases: ['None — null/undefined fails, other values pass'],
  },
  {
    operator: 'notExists',
    aliases: ['NOT_EXISTS', 'not_exists'],
    allowedTypes: ['boolean', 'integer', 'decimal', 'datetime', 'enum', 'string', 'array'],
    example: 'booking.cancelled notExists',
    errorCases: ['None — null/undefined passes'],
  },
  {
    operator: 'contains',
    aliases: ['CONTAINS'],
    allowedTypes: ['string', 'array'],
    example: 'payload.vehicleStatus contains ACTIVE (string) or tags contains fleet (array)',
    errorCases: ['Used on number/datetime', 'Case-sensitive substring match'],
  },
  {
    operator: 'startsWith',
    aliases: ['STARTS_WITH', 'starts_with'],
    allowedTypes: ['string'],
    example: 'payload.bookingId startsWith BK-',
    errorCases: ['Used on non-string', 'Case-sensitive'],
  },
  {
    operator: 'endsWith',
    aliases: ['ENDS_WITH', 'ends_with'],
    allowedTypes: ['string'],
    example: 'payload.bookingId endsWith -EU',
    errorCases: ['Used on non-string', 'Case-sensitive'],
  },
  {
    operator: 'before',
    aliases: ['BEFORE'],
    allowedTypes: ['datetime'],
    example: 'booking.pickupAt before 2026-07-25T10:00:00Z',
    errorCases: ['Non-datetime field', 'Invalid ISO timestamp'],
  },
  {
    operator: 'after',
    aliases: ['AFTER'],
    allowedTypes: ['datetime'],
    example: 'booking.pickupAt after 2026-07-25T08:00:00Z',
    errorCases: ['Non-datetime field', 'Invalid ISO timestamp'],
  },
  {
    operator: 'between',
    aliases: ['BETWEEN'],
    allowedTypes: ['datetime', 'integer', 'decimal'],
    example: 'booking.pickupAt between { from: ..., to: ... } (UTC inclusive)',
    errorCases: ['from > to', 'Invalid bound type'],
  },
  {
    operator: 'changedFrom',
    aliases: ['CHANGED_FROM', 'changed_from'],
    allowedTypes: ['boolean', 'integer', 'decimal', 'datetime', 'enum', 'string'],
    example: 'booking.status changedFrom PENDING (requires previous context)',
    errorCases: ['Missing previous context', 'Type mismatch'],
    requiresChangeContext: true,
  },
  {
    operator: 'changedTo',
    aliases: ['CHANGED_TO', 'changed_to'],
    allowedTypes: ['boolean', 'integer', 'decimal', 'datetime', 'enum', 'string'],
    example: 'booking.status changedTo CONFIRMED (requires previous context)',
    errorCases: ['Missing previous context', 'Type mismatch'],
    requiresChangeContext: true,
  },
  {
    operator: 'durationExceeded',
    aliases: ['DURATION_EXCEEDED', 'duration_exceeded'],
    allowedTypes: ['datetime'],
    example: 'booking.pickupAt durationExceeded { minutes: 30 } vs evaluatedAtUtc',
    errorCases: ['Missing/invalid duration spec', 'Non-UTC datetime'],
    requiresTimezone: false,
  },
  {
    operator: 'withinTimeWindow',
    aliases: ['WITHIN_TIME_WINDOW', 'within_time_window'],
    allowedTypes: ['datetime'],
    example: 'booking.pickupAt withinTimeWindow { start: "09:00", end: "17:00" } + context.timezone',
    errorCases: ['Missing context.timezone', 'Invalid HH:mm window'],
    requiresTimezone: true,
  },
  {
    operator: 'is_true',
    aliases: ['IS_TRUE', 'is_true'],
    allowedTypes: ['boolean'],
    example: 'customer.contact.whatsappAllowed is_true',
    errorCases: ['Non-boolean actual'],
  },
  {
    operator: 'is_false',
    aliases: ['IS_FALSE', 'is_false'],
    allowedTypes: ['boolean'],
    example: 'booking.cancelled is_false',
    errorCases: ['Non-boolean actual'],
  },
] as const;

const matrixByOperator = new Map(
  WORKFLOW_CONDITION_OPERATOR_MATRIX.map((entry) => [entry.operator, entry]),
);

export const OPERATORS_BY_DATA_TYPE: Record<
  WorkflowConditionDataType,
  readonly WorkflowConditionOperator[]
> = {
  boolean: ['equals', 'notEquals', 'is_true', 'is_false', 'exists', 'notExists', 'changedFrom', 'changedTo'],
  integer: [
    'equals', 'notEquals', 'in', 'notIn', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual',
    'exists', 'notExists', 'between', 'changedFrom', 'changedTo',
  ],
  decimal: [
    'equals', 'notEquals', 'in', 'notIn', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual',
    'exists', 'notExists', 'between', 'changedFrom', 'changedTo',
  ],
  datetime: [
    'equals', 'notEquals', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual',
    'before', 'after', 'between', 'exists', 'notExists', 'durationExceeded', 'withinTimeWindow',
    'changedFrom', 'changedTo',
  ],
  enum: ['equals', 'notEquals', 'in', 'notIn', 'exists', 'notExists', 'changedFrom', 'changedTo'],
  string: [
    'equals', 'notEquals', 'contains', 'startsWith', 'endsWith', 'in', 'notIn', 'exists', 'notExists',
    'changedFrom', 'changedTo',
  ],
  array: ['contains', 'in', 'notIn', 'exists', 'notExists'],
};

const PRISMA_OPERATOR_MAP: Record<string, WorkflowConditionOperator> = {};
for (const entry of WORKFLOW_CONDITION_OPERATOR_MATRIX) {
  PRISMA_OPERATOR_MAP[entry.operator] = entry.operator;
  PRISMA_OPERATOR_MAP[entry.operator.toUpperCase()] = entry.operator;
  for (const alias of entry.aliases) {
    PRISMA_OPERATOR_MAP[alias] = entry.operator;
    PRISMA_OPERATOR_MAP[alias.toUpperCase()] = entry.operator;
  }
}

export function normalizeConditionOperator(raw: string): WorkflowConditionOperator | null {
  return PRISMA_OPERATOR_MAP[raw] ?? PRISMA_OPERATOR_MAP[raw.toUpperCase()] ?? null;
}

export function isOperatorAllowedForType(
  dataType: WorkflowConditionDataType,
  operator: WorkflowConditionOperator,
): boolean {
  return OPERATORS_BY_DATA_TYPE[dataType].includes(operator);
}

export function getOperatorDefinition(
  operator: WorkflowConditionOperator,
): WorkflowConditionOperatorDefinition | undefined {
  return matrixByOperator.get(operator);
}

/** Operators intentionally not supported (security / scope). */
export const WORKFLOW_CONDITION_UNSUPPORTED_OPERATORS = [
  'matches',
  'regex',
  'notRegex',
  'customScript',
] as const;
