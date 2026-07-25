/** Server-side capability gate — checked centrally before preview/execute. */
export type WorkflowActionCapabilityStatus =
  | 'ENABLED'
  | 'DISABLED'
  | 'DEPRECATED'
  | 'EXPERIMENTAL';

/** Risk classification — cannot be downgraded by client config. */
export type WorkflowActionRiskClass = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type WorkflowActionErrorCategory =
  | 'VALIDATION'
  | 'AUTHORIZATION'
  | 'CAPABILITY'
  | 'TENANT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TRANSIENT'
  | 'PERMANENT'
  | 'UNKNOWN';

export interface WorkflowActionConfigSchema {
  schemaVersion: string;
  properties: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      required?: boolean;
      description?: string;
      enum?: readonly string[];
    }
  >;
  additionalProperties?: boolean;
}

export interface WorkflowActionTimeoutPolicy {
  defaultMs: number;
  maxMs: number;
}

export interface WorkflowActionRetryPolicy {
  maxAttempts: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  retryableCategories?: WorkflowActionErrorCategory[];
}

export interface WorkflowActionIdempotencyPolicy {
  /** Execution dedup is scoped to the action run / provider key — never PII. */
  scope: 'action_run' | 'provider';
  keyField: 'idempotencyKey' | 'providerIdempotencyKey';
}

export interface WorkflowActionDefinition {
  type: string;
  version: string;
  capabilityStatus: WorkflowActionCapabilityStatus;
  configSchema: WorkflowActionConfigSchema;
  riskClass: WorkflowActionRiskClass;
  requiredPermission?: string;
  requiresApproval: boolean;
  timeoutPolicy: WorkflowActionTimeoutPolicy;
  retryPolicy: WorkflowActionRetryPolicy;
  idempotencyPolicy: WorkflowActionIdempotencyPolicy;
}

export interface WorkflowActionValidationResult {
  valid: boolean;
  errors: string[];
  normalizedConfig?: Record<string, unknown>;
}

export interface WorkflowActionAuthorizationResult {
  authorized: boolean;
  reason?: string;
}

export interface WorkflowActionPreviewResult {
  sideEffectFree: true;
  summary: string;
  plannedEffects: string[];
  metadata?: Record<string, unknown>;
}

export interface WorkflowActionExecuteResult {
  status: 'SUCCESS' | 'WAITING_APPROVAL' | 'FAILED';
  output?: Record<string, unknown>;
  errorMessage?: string;
  errorCategory?: WorkflowActionErrorCategory;
  idempotentReplay?: boolean;
}

export interface WorkflowActionClassifiedError {
  category: WorkflowActionErrorCategory;
  message: string;
  retryable: boolean;
}

export interface WorkflowActionCompensateResult {
  compensated: boolean;
  summary: string;
}

export interface WorkflowActionHandler {
  readonly definition: WorkflowActionDefinition;
  validate(
    config: unknown,
    ctx: import('./workflow-action-execution.context').WorkflowActionExecutionContext,
  ): WorkflowActionValidationResult;
  authorize(
    config: Record<string, unknown>,
    ctx: import('./workflow-action-execution.context').WorkflowActionExecutionContext,
  ): Promise<WorkflowActionAuthorizationResult>;
  preview(
    config: Record<string, unknown>,
    ctx: import('./workflow-action-execution.context').WorkflowActionExecutionContext,
  ): Promise<WorkflowActionPreviewResult>;
  execute(
    config: Record<string, unknown>,
    ctx: import('./workflow-action-execution.context').WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult>;
  classifyError(error: unknown): WorkflowActionClassifiedError;
  compensate?(
    config: Record<string, unknown>,
    ctx: import('./workflow-action-execution.context').WorkflowActionExecutionContext,
    executeOutput: Record<string, unknown>,
  ): Promise<WorkflowActionCompensateResult>;
}

export class WorkflowActionRegistryError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'UNKNOWN_ACTION'
      | 'DUPLICATE_REGISTRATION'
      | 'CAPABILITY_DISABLED'
      | 'UNAUTHORIZED'
      | 'VALIDATION_FAILED'
      | 'RISK_DOWNGRADE'
      | 'TENANT_VIOLATION',
  ) {
    super(message);
    this.name = 'WorkflowActionRegistryError';
  }
}
