/**
 * Core-owned port — Rental supplies tenant-scoped booking facts for DI job validation.
 * Architectural reference: SYNQDRIVE-CORE P2-PR6 (overlap port booking lookup).
 */
export const DRIVING_INTELLIGENCE_BOOKING_RESOLUTION_PORT = Symbol(
  'DRIVING_INTELLIGENCE_BOOKING_RESOLUTION_PORT',
);

export interface DrivingIntelligenceBookingResolutionPort {
  /**
   * Tenant-scoped booking lookup for job validation.
   * Throws when booking is missing or foreign to the organization.
   */
  resolveBookingVehicleForOrganization(input: {
    organizationId: string;
    bookingId: string;
  }): Promise<{ vehicleId: string | null }>;
}