export const DOCUMENT_ACTION_REQUIREMENTS = {
  REQUIRED: 'REQUIRED',
  OPTIONAL: 'OPTIONAL',
  INFORMATIONAL: 'INFORMATIONAL',
} as const;

export type DocumentActionRequirement =
  (typeof DOCUMENT_ACTION_REQUIREMENTS)[keyof typeof DOCUMENT_ACTION_REQUIREMENTS];

export const DOCUMENT_ACTION_EXECUTION_STATUSES = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;

export type DocumentActionExecutionStatus =
  (typeof DOCUMENT_ACTION_EXECUTION_STATUSES)[keyof typeof DOCUMENT_ACTION_EXECUTION_STATUSES];

export const DOCUMENT_ACTION_PLAN_STATUSES = {
  CONFIRMED: 'CONFIRMED',
  INVALIDATED: 'INVALIDATED',
  EXECUTING: 'EXECUTING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type DocumentActionPlanStatus =
  (typeof DOCUMENT_ACTION_PLAN_STATUSES)[keyof typeof DOCUMENT_ACTION_PLAN_STATUSES];

/** Semantic action types currently supported by executor implementations. */
export const DOCUMENT_EXECUTOR_ACTION_TYPES = {
  ARCHIVE_DOCUMENT: 'ARCHIVE_DOCUMENT',
  SUGGEST_ENTITY_LINK: 'SUGGEST_ENTITY_LINK',
  CREATE_FINE_DRAFT: 'CREATE_FINE_DRAFT',
  CREATE_INVOICE_DRAFT: 'CREATE_INVOICE_DRAFT',
  CREATE_CREDIT_NOTE_DRAFT: 'CREATE_CREDIT_NOTE_DRAFT',
  CREATE_SERVICE_EVENT: 'CREATE_SERVICE_EVENT',
  CREATE_COMPLIANCE_SERVICE_EVENT: 'CREATE_COMPLIANCE_SERVICE_EVENT',
  UPDATE_VEHICLE_COMPLIANCE_DATES: 'UPDATE_VEHICLE_COMPLIANCE_DATES',
  REFRESH_VEHICLE_SERVICE_HISTORY: 'REFRESH_VEHICLE_SERVICE_HISTORY',
  CREATE_DAMAGE_DRAFT: 'CREATE_DAMAGE_DRAFT',
  CREATE_DAMAGE_RECORD: 'CREATE_DAMAGE_RECORD',
  LINK_EXISTING_DAMAGE: 'LINK_EXISTING_DAMAGE',
  APPLY_TIRE_MEASUREMENT: 'APPLY_TIRE_MEASUREMENT',
  APPLY_BRAKE_MEASUREMENT: 'APPLY_BRAKE_MEASUREMENT',
  APPLY_BATTERY_MEASUREMENT: 'APPLY_BATTERY_MEASUREMENT',
} as const;

export type DocumentExecutorActionType =
  (typeof DOCUMENT_EXECUTOR_ACTION_TYPES)[keyof typeof DOCUMENT_EXECUTOR_ACTION_TYPES];

export type DocumentPlannedAction = {
  semanticAction: string;
  requirement: DocumentActionRequirement;
  sequence: number;
};

export type DocumentActionExecutionResult = {
  status: DocumentActionExecutionStatus;
  resultEntityType?: string | null;
  resultEntityId?: string | null;
  output?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type DocumentActionExecutionRecord = {
  actionIndex: number;
  semanticAction: string;
  requirement: DocumentActionRequirement;
  idempotencyKey: string;
  status: DocumentActionExecutionStatus;
  resultEntityType?: string | null;
  resultEntityId?: string | null;
  output?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
  attemptedAt?: string | null;
  completedAt?: string | null;
};

export type DocumentActionPlanExecutionStatus =
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'PARTIALLY_COMPLETED';

export type DocumentActionPlanExecution = {
  planId: string;
  planVersion: number;
  fingerprint: string;
  status: DocumentActionPlanExecutionStatus;
  actions: DocumentActionExecutionRecord[];
  startedAt?: string;
  completedAt?: string;
};

export type AcceptedEntityLink = {
  entityType: string;
  entityId: string;
  label?: string | null;
};
