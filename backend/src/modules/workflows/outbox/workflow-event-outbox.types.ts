import type { WorkflowDomainEventEnvelope } from '../envelope';

export interface WorkflowEventOutboxEnqueueInput {
  organizationId: string;
  eventType: string;
  source: string;
  payload?: Record<string, unknown>;
  eventVersion?: string;
  occurredAt?: Date | string;
  entityType?: string | null;
  entityId?: string | null;
  correlationId?: string;
  causationId?: string | null;
  metadata?: Record<string, unknown>;
  /** Business idempotency key — defaults to `{eventType}:{occurrenceId}`. */
  idempotencyKey?: string;
  /** Stable business occurrence — folded into idempotencyKey when set. */
  occurrenceId?: string | null;
  eventId?: string;
}

export interface WorkflowEventOutboxRecord {
  id: string;
  eventId: string;
  organizationId: string;
  eventType: string;
  status: string;
  idempotencyKey: string;
  envelope: WorkflowDomainEventEnvelope;
}

export class WorkflowEventOutboxEnqueueError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'WorkflowEventOutboxEnqueueError';
  }
}
