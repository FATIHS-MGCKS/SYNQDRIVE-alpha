import { adaptLegacyWorkflowEvent, resolveCanonicalEventType } from '../registry';
import type { WorkflowDomainEventEnvelopeWireInput } from './workflow-domain-event-envelope.types';

export interface NormalizedEnvelopeInput {
  eventType: string;
  payload: Record<string, unknown>;
  legacySourceKey?: string;
  /** Original raw type before legacy resolution. */
  originalEventType: string;
}

/**
 * Controlled legacy normalizer — delegates to registry adapters.
 * Does not validate payload; validation happens in envelope validator.
 */
export function normalizeWorkflowEventInput(input: {
  eventType: string;
  payload?: Record<string, unknown>;
}): NormalizedEnvelopeInput {
  const originalEventType = input.eventType?.trim() ?? '';
  const adapted = adaptLegacyWorkflowEvent({
    type: originalEventType,
    payload: input.payload ?? {},
  });
  const canonicalType = resolveCanonicalEventType(adapted.type);

  return {
    eventType: canonicalType,
    payload: adapted.payload,
    legacySourceKey: adapted.legacySourceKey,
    originalEventType,
  };
}

/** Map legacy WorkflowDomainEvent (engine) shape to wire input. */
export function legacyEngineEventToWireInput(event: {
  organizationId: string;
  type: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
  idempotencyKey?: string;
  eventVersion?: string;
  correlationId?: string;
  causationId?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}): WorkflowDomainEventEnvelopeWireInput {
  return {
    organizationId: event.organizationId,
    eventType: event.type,
    eventVersion: event.eventVersion,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    payload: event.payload ?? {},
    occurredAt: event.occurredAt?.toISOString(),
    correlationId: event.correlationId ?? event.idempotencyKey,
    causationId: event.causationId ?? null,
    source: event.source,
    metadata: {
      ...(event.metadata ?? {}),
      ...(event.idempotencyKey ? { idempotencyKey: event.idempotencyKey } : {}),
    },
  };
}
