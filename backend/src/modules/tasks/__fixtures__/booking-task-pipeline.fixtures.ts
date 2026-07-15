/** Deterministic IDs and clock for booking-task pipeline integration tests. */
export const BOOKING_TASK_FIXED_NOW = new Date('2026-07-15T12:00:00.000Z');

export interface BookingTaskPipelineFixtureIds {
  orgA: string;
  orgB: string;
  customerA: string;
  customerB: string;
  vehicleA: string;
  vehicleB: string;
  vehicleOtherOrg: string;
  bookingA: string;
  bookingB: string;
}

export function createBookingTaskPipelineFixtures(): BookingTaskPipelineFixtureIds {
  return {
    orgA: 'org-booking-task-a',
    orgB: 'org-booking-task-b',
    customerA: 'cust-booking-a',
    customerB: 'cust-booking-b',
    vehicleA: 'vehicle-booking-a',
    vehicleB: 'vehicle-booking-b',
    vehicleOtherOrg: 'vehicle-org-b',
    bookingA: 'booking-task-a',
    bookingB: 'booking-task-b',
  };
}

export function confirmedBookingInput(
  ids: BookingTaskPipelineFixtureIds,
  overrides?: Partial<{
    startDate: Date;
    endDate: Date;
    vehicleId: string;
    customerId: string;
    status: string;
  }>,
) {
  return {
    id: ids.bookingA,
    organizationId: ids.orgA,
    vehicleId: overrides?.vehicleId ?? ids.vehicleA,
    customerId: overrides?.customerId ?? ids.customerA,
    status: overrides?.status ?? 'CONFIRMED',
    startDate: overrides?.startDate ?? new Date('2026-07-25T10:00:00.000Z'),
    endDate: overrides?.endDate ?? new Date('2026-07-28T10:00:00.000Z'),
    pickupStationId: 'station-pickup-a',
    returnStationId: 'station-return-a',
  };
}
