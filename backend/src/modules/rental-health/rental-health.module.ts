import { Module, forwardRef } from '@nestjs/common';
import { RentalHealthController } from './rental-health.controller';
import { RentalHealthService } from './rental-health.service';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { HighMobilityModule } from '../high-mobility/high-mobility.module';

/**
 * Rental Health V1 — top-level module.
 *
 * Consumes Battery/Tires/Brakes/DTC exclusively through the canonical
 * services exported by {@link VehicleIntelligenceModule}, and the HM
 * alert signals through {@link HighMobilityModule}. It does NOT re-
 * implement any calculation logic from those modules — see
 * {@link RentalHealthService} for the evaluators.
 *
 * Exports {@link RentalHealthService} so {@link BookingsModule} can use
 * it as the rental-blocked hard-gate in `BookingsService.create`.
 */
@Module({
  imports: [
    forwardRef(() => VehicleIntelligenceModule),
    forwardRef(() => HighMobilityModule),
  ],
  controllers: [RentalHealthController],
  providers: [RentalHealthService],
  exports: [RentalHealthService],
})
export class RentalHealthModule {}
