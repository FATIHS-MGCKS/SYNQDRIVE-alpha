import { Module } from '@nestjs/common';
import { VehicleRegistrationConvergenceService } from './vehicle-registration-convergence.service';
import { VEHICLE_REGISTRATION_CONVERGENCE_PORT } from './vehicle-registration-convergence.port';

/**
 * Lightweight V2B-PR1 convergence wiring — no VehicleOnboarding / HM module graph.
 * HighMobility imports this module only to avoid Nest circular dependencies at boot.
 */
@Module({
  providers: [
    VehicleRegistrationConvergenceService,
    {
      provide: VEHICLE_REGISTRATION_CONVERGENCE_PORT,
      useExisting: VehicleRegistrationConvergenceService,
    },
  ],
  exports: [VEHICLE_REGISTRATION_CONVERGENCE_PORT, VehicleRegistrationConvergenceService],
})
export class VehicleRegistrationConvergenceModule {}