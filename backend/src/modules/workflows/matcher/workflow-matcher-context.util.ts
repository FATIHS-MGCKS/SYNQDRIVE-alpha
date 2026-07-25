import type { WorkflowDomainEventEnvelope } from '../envelope';

export interface WorkflowMatcherEventContext {
  organizationId: string;
  eventId: string;
  eventType: string;
  eventVersion: string;
  entityType: string | null;
  entityId: string | null;
  occurredAt: Date;
  vehicleId: string | null;
  stationId: string | null;
  bookingId: string | null;
  customerId: string | null;
}

export function buildWorkflowMatcherEventContext(
  envelope: WorkflowDomainEventEnvelope,
): WorkflowMatcherEventContext {
  const payload = envelope.payload ?? {};
  const vehicleId = readId(
    envelope.entityType === 'vehicle' ? envelope.entityId : null,
    payload.vehicleId,
  );
  const stationId = readId(payload.stationId);
  const bookingId = readId(
    envelope.entityType === 'booking' ? envelope.entityId : null,
    payload.bookingId,
  );
  const customerId = readId(
    envelope.entityType === 'customer' ? envelope.entityId : null,
    payload.customerId,
  );

  return {
    organizationId: envelope.organizationId,
    eventId: envelope.eventId,
    eventType: envelope.eventType,
    eventVersion: envelope.eventVersion,
    entityType: envelope.entityType,
    entityId: envelope.entityId,
    occurredAt: new Date(envelope.occurredAt),
    vehicleId,
    stationId,
    bookingId,
    customerId,
  };
}

function readId(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}
