import { randomUUID } from 'crypto';
import {
  WORKFLOW_DOMAIN_EVENT_ENVELOPE_SCHEMA_VERSION,
} from './workflow-domain-event-envelope.constants';
import { normalizeWorkflowEventInput } from './workflow-domain-event-envelope.normalizer';
import {
  buildWorkflowDomainEventEnvelope,
  freezeEnvelope,
} from './workflow-domain-event-envelope.validator';
import type {
  CreateWorkflowDomainEventEnvelopeInput,
  WorkflowDomainEventEnvelope,
  WorkflowEventEnvelopeResult,
  WorkflowEventEnvelopeValidateOptions,
} from './workflow-domain-event-envelope.types';

function toUtcIso(value: Date | string | undefined, fallback: Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallback.toISOString();
}

/**
 * Create a validated, immutable workflow domain event envelope.
 * Generates eventId, correlationId (when omitted), and receivedAt.
 */
export function createWorkflowDomainEventEnvelope(
  input: CreateWorkflowDomainEventEnvelopeInput,
  options: WorkflowEventEnvelopeValidateOptions = {},
): WorkflowEventEnvelopeResult {
  const now = options.now ?? new Date();
  const normalized = normalizeWorkflowEventInput({
    eventType: input.eventType,
    payload: input.payload ?? {},
  });

  const correlationId = input.correlationId?.trim() || randomUUID();
  const eventId = input.eventId?.trim() || randomUUID();

  return buildWorkflowDomainEventEnvelope(
    {
      eventId,
      eventType: normalized.eventType,
      eventVersion: input.eventVersion,
      organizationId: input.organizationId,
      occurredAt: toUtcIso(input.occurredAt, now),
      receivedAt: toUtcIso(input.receivedAt, now),
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      correlationId,
      causationId: input.causationId ?? null,
      source: input.source,
      payload: normalized.payload,
      metadata: input.metadata ?? {},
      schemaVersion: WORKFLOW_DOMAIN_EVENT_ENVELOPE_SCHEMA_VERSION,
      legacySourceKey: normalized.legacySourceKey,
    },
    options,
  );
}

/** Serialize envelope for queue/DB storage (JSON-safe, UTC timestamps). */
export function serializeWorkflowDomainEventEnvelope(
  envelope: WorkflowDomainEventEnvelope,
): string {
  return JSON.stringify(envelope);
}

/** Deserialize and re-validate wire JSON. */
export function deserializeWorkflowDomainEventEnvelope(
  json: string,
  options: WorkflowEventEnvelopeValidateOptions = {},
): WorkflowEventEnvelopeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {
      ok: false,
      rejection: {
        reason: 'INVALID_ENVELOPE_SCHEMA',
        message: 'Envelope JSON is not valid',
        rejectedAt: new Date().toISOString(),
        deadLetter: true,
      },
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      rejection: {
        reason: 'INVALID_ENVELOPE_SCHEMA',
        message: 'Envelope must be a JSON object',
        rejectedAt: new Date().toISOString(),
        deadLetter: true,
      },
    };
  }

  const wire = parsed as Record<string, unknown>;
  return buildWorkflowDomainEventEnvelope(
    {
      eventId: typeof wire.eventId === 'string' ? wire.eventId : undefined,
      eventType: String(wire.eventType ?? wire.type ?? ''),
      eventVersion: typeof wire.eventVersion === 'string' ? wire.eventVersion : undefined,
      organizationId: typeof wire.organizationId === 'string' ? wire.organizationId : undefined,
      occurredAt: typeof wire.occurredAt === 'string' ? wire.occurredAt : undefined,
      receivedAt: typeof wire.receivedAt === 'string' ? wire.receivedAt : undefined,
      entityType: (wire.entityType as string | null) ?? null,
      entityId: (wire.entityId as string | null) ?? null,
      correlationId: typeof wire.correlationId === 'string' ? wire.correlationId : undefined,
      causationId: (wire.causationId as string | null) ?? null,
      source: typeof wire.source === 'string' ? wire.source : undefined,
      payload: (wire.payload as Record<string, unknown>) ?? {},
      metadata: (wire.metadata as Record<string, unknown>) ?? {},
      schemaVersion: typeof wire.schemaVersion === 'string' ? wire.schemaVersion : undefined,
      legacySourceKey: typeof wire.legacySourceKey === 'string' ? wire.legacySourceKey : undefined,
    },
    options,
  );
}

export { freezeEnvelope };
