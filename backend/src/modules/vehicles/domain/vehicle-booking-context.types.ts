import type { BookingStatus } from '@prisma/client';

/**
 * Normalized booking row loaded by `VehiclesService.buildBookingContextMap`.
 * No UI labels — display formatting happens at API projection time.
 */
export interface VehicleBookingQueryRow {
  id: string;
  vehicleId: string;
  organizationId: string;
  status: BookingStatus;
  startDate: Date;
  endDate: Date;
  kmIncluded: number | null;
  kmDriven: number | null;
  pickupStationId: string | null;
  returnStationId: string | null;
  customerLabel: string;
  pickupStationName: string | null;
  returnStationName: string | null;
}

export interface AssembleVehicleBookingContextParams {
  vehicleId: string;
  bookings: VehicleBookingQueryRow[];
  evaluationAt: Date;
  organizationTimezone: string;
}

export interface AssembleBookingContextMapParams {
  vehicleIds: string[];
  bookings: VehicleBookingQueryRow[];
  evaluationAt: Date;
  organizationTimezone: string;
}

export function formatBookingCustomerLabel(customer: {
  firstName: string;
  lastName: string;
  company: string | null;
}): string {
  const personal = `${customer.firstName} ${customer.lastName}`.trim();
  if (customer.company && customer.company.trim().length > 0) {
    return personal ? `${personal} · ${customer.company}` : customer.company;
  }
  return personal || customer.company || '';
}
