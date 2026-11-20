import { Injectable } from '@nestjs/common';
import { RentalHealthService } from '../rental-health.service';
import type { VehicleIntelligenceRentalHealthReadPort } from '@modules/vehicle-intelligence/ports/vehicle-intelligence-rental-health-read.port';
import type { VehicleHealth } from '../rental-health.types';

@Injectable()
export class VehicleIntelligenceRentalHealthReadAdapter
  implements VehicleIntelligenceRentalHealthReadPort
{
  constructor(private readonly rentalHealth: RentalHealthService) {}

  getVehicleHealth(organizationId: string, vehicleId: string): Promise<VehicleHealth> {
    return this.rentalHealth.getVehicleHealth(organizationId, vehicleId);
  }
}