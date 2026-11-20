/**
 * Core-owned read port — Vehicle Intelligence must not inject RentalHealthService.
 *
 * Return type uses type-only import of Rental `VehicleHealth` (in-process monorepo).
 */
import type { VehicleHealth } from '@modules/rental-health/rental-health.types';

export const VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT = Symbol(
  'VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT',
);

export interface VehicleIntelligenceRentalHealthReadPort {
  getVehicleHealth(organizationId: string, vehicleId: string): Promise<VehicleHealth>;
}