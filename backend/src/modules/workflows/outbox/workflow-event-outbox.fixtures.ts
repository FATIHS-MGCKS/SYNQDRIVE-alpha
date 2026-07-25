export const FIXTURE_OUTBOX_ORG_ID = 'org-outbox-fixture-001';
export const FIXTURE_OUTBOX_BOOKING_ID = 'booking-outbox-fixture-001';
export const FIXTURE_OUTBOX_VEHICLE_ID = 'vehicle-outbox-fixture-001';
export const FIXTURE_OUTBOX_INVOICE_ID = 'invoice-outbox-fixture-001';

export function validBookingConfirmedOutboxInput() {
  return {
    organizationId: FIXTURE_OUTBOX_ORG_ID,
    eventType: 'booking.confirmed',
    source: 'bookings',
    entityType: 'booking' as const,
    entityId: FIXTURE_OUTBOX_BOOKING_ID,
    idempotencyKey: `booking.confirmed:${FIXTURE_OUTBOX_BOOKING_ID}`,
    payload: {
      bookingId: FIXTURE_OUTBOX_BOOKING_ID,
      vehicleId: FIXTURE_OUTBOX_VEHICLE_ID,
      customerId: 'customer-outbox-fixture-001',
    },
    correlationId: `booking-lifecycle:${FIXTURE_OUTBOX_BOOKING_ID}`,
  };
}

export function validBookingReturnedOutboxInput() {
  return {
    organizationId: FIXTURE_OUTBOX_ORG_ID,
    eventType: 'booking.returned',
    source: 'bookings',
    entityType: 'booking' as const,
    entityId: FIXTURE_OUTBOX_BOOKING_ID,
    idempotencyKey: `booking.returned:${FIXTURE_OUTBOX_BOOKING_ID}`,
    payload: {
      bookingId: FIXTURE_OUTBOX_BOOKING_ID,
      vehicleId: FIXTURE_OUTBOX_VEHICLE_ID,
    },
    correlationId: `booking-handover:${FIXTURE_OUTBOX_BOOKING_ID}`,
  };
}

export function validInvoiceOverdueOutboxInput() {
  return {
    organizationId: FIXTURE_OUTBOX_ORG_ID,
    eventType: 'invoice.overdue',
    source: 'billing',
    entityType: 'invoice' as const,
    entityId: FIXTURE_OUTBOX_INVOICE_ID,
    idempotencyKey: `invoice.overdue:${FIXTURE_OUTBOX_INVOICE_ID}`,
    payload: {
      invoiceId: FIXTURE_OUTBOX_INVOICE_ID,
      dueAt: '2026-07-20T00:00:00.000Z',
      daysOverdue: 5,
      amountCents: 15000,
    },
    correlationId: `billing-invoice:${FIXTURE_OUTBOX_INVOICE_ID}`,
  };
}

export function validVehicleHealthCriticalOutboxInput() {
  return {
    organizationId: FIXTURE_OUTBOX_ORG_ID,
    eventType: 'vehicle.health.critical',
    source: 'vehicle-health',
    entityType: 'vehicle' as const,
    entityId: FIXTURE_OUTBOX_VEHICLE_ID,
    idempotencyKey: `vehicle.health.critical:${FIXTURE_OUTBOX_VEHICLE_ID}:brakes`,
    payload: {
      vehicleId: FIXTURE_OUTBOX_VEHICLE_ID,
      healthModule: 'brakes',
      severityCode: 'critical',
      metricCode: 'BRAKE_DTC_CRITICAL',
    },
    correlationId: `vehicle-health:${FIXTURE_OUTBOX_VEHICLE_ID}`,
  };
}
