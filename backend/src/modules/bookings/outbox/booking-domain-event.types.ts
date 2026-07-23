export const BOOKING_DOMAIN_EVENT_TYPES = {
  BOOKING_CREATED: 'BookingCreated',
  BOOKING_UPDATED: 'BookingUpdated',
  BOOKING_CONFIRMED: 'BookingConfirmed',
  BOOKING_CANCELLED: 'BookingCancelled',
  BOOKING_MARKED_NO_SHOW: 'BookingMarkedNoShow',
  BOOKING_ACTIVATED: 'BookingActivated',
  BOOKING_COMPLETED: 'BookingCompleted',
  BOOKING_PRICING_CHANGED: 'BookingPricingChanged',
  BOOKING_CUSTOMER_CHANGED: 'BookingCustomerChanged',
  BOOKING_VEHICLE_CHANGED: 'BookingVehicleChanged',
  BOOKING_LEGAL_ACCEPTED: 'BookingLegalAccepted',
  PICKUP_COMPLETED: 'PickupCompleted',
  RETURN_COMPLETED: 'ReturnCompleted',
} as const;

export type BookingDomainEventType =
  (typeof BOOKING_DOMAIN_EVENT_TYPES)[keyof typeof BOOKING_DOMAIN_EVENT_TYPES];

export type BookingDomainEventPayload = {
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
  startDate?: string | null;
  endDate?: string | null;
  previousStartDate?: string | null;
  previousEndDate?: string | null;
};

export type BookingDomainEventEnvelope = {
  eventId: string;
  eventType: BookingDomainEventType;
  aggregateId: string;
  organizationId: string;
  aggregateVersion: number;
  occurredAt: string;
  payload: BookingDomainEventPayload;
  correlationId: string;
  causationId: string | null;
};
