import { Module, forwardRef } from '@nestjs/common';
import { VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT } from '@modules/vehicle-intelligence/ports/vehicle-intelligence-rental-health-read.port';
import { RentalHealthModule } from '../rental-health.module';
import { VehicleIntelligenceRentalHealthReadAdapter } from './vehicle-intelligence-rental-health-read.adapter';

/**
 * Rental adapter binding for VI canonical rental-health reads.
 */
@Module({
  imports: [forwardRef(() => RentalHealthModule)],
  providers: [
    VehicleIntelligenceRentalHealthReadAdapter,
    {
      provide: VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT,
      useExisting: VehicleIntelligenceRentalHealthReadAdapter,
    },
  ],
  exports: [VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT],
})
export class VehicleIntelligenceRentalHealthReadModule {}