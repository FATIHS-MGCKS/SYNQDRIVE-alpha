/** Layer where an idempotency decision was recorded. */
export type WorkflowIdempotencyEntityType = 'OUTBOX' | 'RUN' | 'ACTION' | 'DELIVERY' | 'TIMER';

/** Outcome of an idempotency check — persisted for explainability. */
export type WorkflowIdempotencyDecisionOutcome =
  | 'ACCEPTED'
  | 'DUPLICATE_SUPPRESSED'
  | 'FORCE_REPLAY'
  | 'REPLAY_SAME'
  | 'CONSTRAINT_CONFLICT';

/**
 * Stable business occurrence identifier — distinguishes legitimate repeated events
 * on the same entity (e.g. two DTC codes, two pickup-overdue bookings).
 * Must not contain PII (no email, phone, name, address).
 */
export type WorkflowOccurrenceId = string;

/** Replay mode for dead-letter / manual force replay. */
export type WorkflowIdempotencyReplayMode = 'SAME' | 'FORCE_NEW';

export interface WorkflowIdempotencyKeyParts {
  organizationId: string;
  workflowVersionId: string;
  actionStableId?: string;
  occurrenceId: WorkflowOccurrenceId;
}

export interface WorkflowIdempotencyDecisionInput {
  organizationId: string;
  entityType: WorkflowIdempotencyEntityType;
  scopeKey: string;
  outcome: WorkflowIdempotencyDecisionOutcome;
  reason: string;
  occurrenceId?: string | null;
  eventId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  workflowRunId?: string | null;
  actionId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Canonical identifiers (definitions):
 *
 * - eventId: globally unique domain event instance (UUID). Duplicate delivery shares eventId.
 * - occurrenceId: stable business occurrence — same fact re-delivered maps to same occurrenceId.
 * - correlationId: process-wide trace (may span multiple events/runs).
 * - causationId: upstream eventId that caused this event.
 * - workflowRunId: primary key of WorkflowRun execution row.
 * - actionId: primary key of WorkflowActionRun row.
 * - providerIdempotencyKey: opaque key passed to external providers (email, webhooks).
 * - deduplicationWindowMs: audit/TTL window for explainability; uniqueness enforced by DB constraints.
 */
export interface WorkflowIdempotencyContext {
  organizationId: string;
  workflowVersionId?: string;
  eventId?: string;
  occurrenceId?: string;
  correlationId?: string;
  causationId?: string;
  workflowRunId?: string;
  actionId?: string;
  providerIdempotencyKey?: string;
}
