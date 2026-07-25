import type { Prisma, WorkflowEventOutbox } from '@prisma/client';
import type { WorkflowDomainEventEnvelope } from '../envelope';
import { serializeWorkflowDomainEventEnvelope } from '../envelope';

export function envelopeToOutboxCreateData(
  envelope: WorkflowDomainEventEnvelope,
  idempotencyKey: string,
): Prisma.WorkflowEventOutboxUncheckedCreateInput {
  return {
    eventId: envelope.eventId,
    organizationId: envelope.organizationId,
    eventType: envelope.eventType,
    eventVersion: envelope.eventVersion,
    schemaVersion: envelope.schemaVersion,
    entityType: envelope.entityType,
    entityId: envelope.entityId,
    aggregateType: envelope.entityType,
    aggregateId: envelope.entityId,
    correlationId: envelope.correlationId,
    causationId: envelope.causationId,
    source: envelope.source,
    idempotencyKey,
    occurredAt: new Date(envelope.occurredAt),
    receivedAt: new Date(envelope.receivedAt),
    payload: envelope.payload as Prisma.InputJsonValue,
    metadata: envelope.metadata as Prisma.InputJsonValue,
    envelope: JSON.parse(serializeWorkflowDomainEventEnvelope(envelope)) as Prisma.InputJsonValue,
    status: 'PENDING',
  };
}

export function outboxRowToEnvelope(row: WorkflowEventOutbox): WorkflowDomainEventEnvelope {
  if (row.envelope && typeof row.envelope === 'object') {
    return row.envelope as unknown as WorkflowDomainEventEnvelope;
  }
  return {
    eventId: row.eventId,
    eventType: row.eventType,
    eventVersion: row.eventVersion,
    organizationId: row.organizationId,
    occurredAt: row.occurredAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    entityType: row.entityType,
    entityId: row.entityId,
    correlationId: row.correlationId,
    causationId: row.causationId,
    source: row.source,
    payload: (row.payload as Record<string, unknown>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    schemaVersion: row.schemaVersion as WorkflowDomainEventEnvelope['schemaVersion'],
  };
}
