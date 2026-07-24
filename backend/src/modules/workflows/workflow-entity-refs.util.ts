import type { WorkflowDomainEvent } from './workflow-engine.service';

export interface WorkflowEntityRefs {
  vehicleId?: string;
  stationId?: string;
  bookingId?: string;
  customerId?: string;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Extract canonical entity references from a workflow domain event. */
export function extractWorkflowEntityRefs(event: WorkflowDomainEvent): WorkflowEntityRefs {
  const payload = event.payload ?? {};
  return {
    vehicleId:
      event.entityType === 'vehicle'
        ? readString(event.entityId)
        : readString(payload.vehicleId),
    stationId:
      event.entityType === 'station'
        ? readString(event.entityId)
        : readString(payload.stationId),
    bookingId:
      event.entityType === 'booking'
        ? readString(event.entityId)
        : readString(payload.bookingId),
    customerId:
      event.entityType === 'customer'
        ? readString(event.entityId)
        : readString(payload.customerId),
  };
}

export function refsFromActionContext(input: {
  entityType?: string | null;
  entityId?: string | null;
  payload: Record<string, unknown>;
}): WorkflowEntityRefs {
  return extractWorkflowEntityRefs({
    organizationId: '',
    type: '',
    entityType: input.entityType ?? undefined,
    entityId: input.entityId ?? undefined,
    payload: input.payload,
  });
}
