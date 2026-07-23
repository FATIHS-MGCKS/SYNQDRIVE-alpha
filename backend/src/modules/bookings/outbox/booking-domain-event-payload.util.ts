import type { BookingDomainEventPayload } from './booking-domain-event.types';
import {
  BOOKING_DOMAIN_EVENT_FORBIDDEN_PAYLOAD_KEYS,
  BOOKING_DOMAIN_EVENT_OUTBOX_PAYLOAD_VERSION,
} from './booking-domain-event-outbox.constants';

export function sanitizeBookingDomainEventPayload(
  payload: Record<string, unknown>,
): BookingDomainEventPayload {
  const next: Record<string, unknown> = {
    payloadVersion: BOOKING_DOMAIN_EVENT_OUTBOX_PAYLOAD_VERSION,
  };
  for (const [key, value] of Object.entries(payload)) {
    if (BOOKING_DOMAIN_EVENT_FORBIDDEN_PAYLOAD_KEYS.has(key)) continue;
    if (value === undefined) continue;
    next[key] = value;
  }
  return next as BookingDomainEventPayload;
}

export function buildBookingEventPayload(input: {
  bookingId: string;
  status: string;
  vehicleId?: string | null;
  customerId?: string | null;
  previousStatus?: string | null;
  previousVehicleId?: string | null;
  previousCustomerId?: string | null;
  protocolId?: string | null;
  handoverKind?: 'PICKUP' | 'RETURN' | null;
  acceptanceType?: string | null;
  totalPriceCents?: number | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}): BookingDomainEventPayload {
  return sanitizeBookingDomainEventPayload({
    bookingId: input.bookingId,
    status: input.status,
    vehicleId: input.vehicleId ?? null,
    customerId: input.customerId ?? null,
    previousStatus: input.previousStatus ?? null,
    previousVehicleId: input.previousVehicleId ?? null,
    previousCustomerId: input.previousCustomerId ?? null,
    protocolId: input.protocolId ?? null,
    handoverKind: input.handoverKind ?? null,
    acceptanceType: input.acceptanceType ?? null,
    totalPriceCents: input.totalPriceCents ?? null,
    startDate: input.startDate
      ? input.startDate instanceof Date
        ? input.startDate.toISOString()
        : input.startDate
      : null,
    endDate: input.endDate
      ? input.endDate instanceof Date
        ? input.endDate.toISOString()
        : input.endDate
      : null,
  });
}
