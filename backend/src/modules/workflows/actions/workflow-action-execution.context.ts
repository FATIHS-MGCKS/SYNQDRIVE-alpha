import type { WorkflowActionPiiSafeLogger } from './workflow-action-pii-logger';
import type { WorkflowActionSecretsResolver } from './workflow-action-secrets.resolver';

export interface WorkflowActionEventContext {
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  payload: Record<string, unknown>;
  correlationId?: string;
  occurredAt?: Date;
}

export interface WorkflowActionActorIdentity {
  kind: 'system' | 'user';
  id?: string;
  permissions?: string[];
  displayName?: string;
}

export interface WorkflowActionExecutionContext {
  organizationId: string;
  workflowRunId: string;
  actionRunId: string;
  workflowId: string;
  actionIndex: number;
  idempotencyKey: string;
  event: WorkflowActionEventContext;
  workflowSnapshot: Record<string, unknown>;
  policySnapshot: Record<string, unknown>;
  actor: WorkflowActionActorIdentity;
  correlationId: string;
  secretsResolver: WorkflowActionSecretsResolver;
  logger: WorkflowActionPiiSafeLogger;
  /** Optional explicit action version — defaults to latest registered. */
  actionVersion?: string;
  /** Client-supplied risk class — must not exceed handler definition. */
  clientRiskClass?: string;
}
