import { buildWorkflowOccurrenceId } from '../outbox/workflow-event-occurrence.util';
import type { WorkflowDomainEventEnvelope } from '../envelope';

const PII_FIELD_PATTERN =
  /^(email|phone|name|firstName|lastName|address|recipient|customerName|driverName)$/i;

export interface ResolveOccurrenceIdInput {
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  eventId?: string;
  occurrenceId?: string | null;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Resolves a stable occurrenceId for idempotency.
 * Explicit occurrenceId wins; otherwise derives from event type + entity refs (no PII).
 */
export function resolveWorkflowOccurrenceId(input: ResolveOccurrenceIdInput): string {
  const explicit =
    input.occurrenceId?.trim()
    ?? (typeof input.metadata?.occurrenceId === 'string' ? input.metadata.occurrenceId.trim() : '')
    ?? '';
  if (explicit) {
    assertNoPiiInOccurrenceId(explicit);
    return explicit;
  }

  const payload = input.payload ?? {};
  const dtcCode =
    (payload.dtcCode as string | undefined)
    ?? (payload.code as string | undefined)
    ?? (payload.findingKey as string | undefined);

  if (dtcCode && (input.entityId || payload.vehicleId)) {
    const vehicleId = String(input.entityId ?? payload.vehicleId);
    return buildWorkflowOccurrenceId([input.eventType, vehicleId, dtcCode]);
  }

  const bookingId = payload.bookingId as string | undefined;
  const milestoneDate = payload.milestoneDateOnly as string | undefined;
  if (bookingId && milestoneDate) {
    return buildWorkflowOccurrenceId([input.eventType, bookingId, milestoneDate]);
  }

  const entityId =
    input.entityId?.trim()
    ?? bookingId?.toString()
    ?? (payload.invoiceId as string | undefined)?.toString()
    ?? (payload.vehicleId as string | undefined)?.toString()
    ?? '';

  if (entityId) {
    return buildWorkflowOccurrenceId([input.eventType, entityId]);
  }

  if (input.eventId?.trim()) {
    return buildWorkflowOccurrenceId(['event', input.eventId.trim()]);
  }

  throw new Error(
    `Cannot resolve occurrenceId for eventType=${input.eventType} without entityId or eventId`,
  );
}

export function resolveOccurrenceIdFromEnvelope(envelope: WorkflowDomainEventEnvelope): string {
  return resolveWorkflowOccurrenceId({
    eventType: envelope.eventType,
    entityType: envelope.entityType,
    entityId: envelope.entityId,
    eventId: envelope.eventId,
    payload: { ...envelope.payload },
    metadata: { ...envelope.metadata },
    occurrenceId:
      typeof envelope.metadata.occurrenceId === 'string'
        ? envelope.metadata.occurrenceId
        : undefined,
  });
}

function assertNoPiiInOccurrenceId(occurrenceId: string): void {
  const segments = occurrenceId.split(':');
  for (const segment of segments) {
    if (segment.includes('@') || segment.match(/^\+?\d{10,}$/)) {
      throw new Error('occurrenceId must not contain PII (email/phone patterns)');
    }
    if (PII_FIELD_PATTERN.test(segment)) {
      throw new Error(`occurrenceId segment "${segment}" resembles a PII field name`);
    }
  }
}
