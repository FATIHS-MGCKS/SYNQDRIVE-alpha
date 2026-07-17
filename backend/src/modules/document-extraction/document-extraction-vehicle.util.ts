import { BadRequestException } from '@nestjs/common';

/**
 * Legacy vehicle-scoped extraction flows require a bound vehicle.
 * Org-only uploads (V2) are not supported on these code paths yet.
 */
export function requireExtractionVehicleId(record: {
  id: string;
  vehicleId: string | null;
}): string {
  if (!record.vehicleId) {
    throw new BadRequestException(
      `Document extraction ${record.id} is not vehicle-scoped`,
    );
  }
  return record.vehicleId;
}
