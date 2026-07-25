import type { WorkflowEventIdStore } from './workflow-domain-event-envelope.types';

export class InMemoryWorkflowEventIdStore implements WorkflowEventIdStore {
  private readonly ids = new Map<string, string>();

  has(eventId: string): boolean {
    return this.ids.has(eventId);
  }

  register(eventId: string, organizationId: string): void {
    this.ids.set(eventId, organizationId);
  }

  getOrganization(eventId: string): string | undefined {
    return this.ids.get(eventId);
  }

  clear(): void {
    this.ids.clear();
  }
}

export const FIXTURE_ORG_ID = 'org-fixture-0001';
export const FIXTURE_BOOKING_ID = 'booking-fixture-0001';
export const FIXTURE_VEHICLE_ID = 'vehicle-fixture-0001';
export const FIXTURE_EVENT_ID = 'evt-fixture-0001-0001-0001-0001-000000000001';
export const FIXTURE_CORRELATION_ID = 'corr-fixture-0001-0001-0001-0001-000000000001';
export const FIXTURE_CAUSATION_ID = 'evt-parent-0001-0001-0001-0001-000000000001';

export const FIXTURE_OCCURRED_AT = '2026-07-25T10:00:00.000Z';
export const FIXTURE_RECEIVED_AT = '2026-07-25T10:00:01.000Z';

export function validBookingReturnedInput() {
  return {
    organizationId: FIXTURE_ORG_ID,
    eventType: 'booking.returned',
    source: 'bookings',
    payload: {
      bookingId: FIXTURE_BOOKING_ID,
      vehicleId: FIXTURE_VEHICLE_ID,
    },
    occurredAt: FIXTURE_OCCURRED_AT,
    receivedAt: FIXTURE_RECEIVED_AT,
    correlationId: FIXTURE_CORRELATION_ID,
    causationId: FIXTURE_CAUSATION_ID,
    eventId: FIXTURE_EVENT_ID,
    metadata: { traceId: 'trace-abc' },
  };
}

export function legacyVehicleReturnedInput() {
  return {
    organizationId: FIXTURE_ORG_ID,
    eventType: 'vehicle_returned',
    source: 'bookings',
    payload: {
      bookingId: FIXTURE_BOOKING_ID,
      vehicleId: FIXTURE_VEHICLE_ID,
    },
    occurredAt: FIXTURE_OCCURRED_AT,
    receivedAt: FIXTURE_RECEIVED_AT,
  };
}
