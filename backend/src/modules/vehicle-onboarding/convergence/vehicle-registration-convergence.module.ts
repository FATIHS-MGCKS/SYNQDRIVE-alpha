import { Module } from '@nestjs/common';
import { VehicleOnboardingActivationRailModule } from '../vehicle-onboarding-activation-rail.module';
import { HmOnlyCanonicalRegistrationService } from '../hm-only-canonical/hm-only-canonical-registration.service';
import { VehicleRegistrationConvergenceService } from './vehicle-registration-convergence.service';
import { VEHICLE_REGISTRATION_CONVERGENCE_PORT } from './vehicle-registration-convergence.port';

/**
 * V2B HM convergence port — imports activation rail only (not full VehicleOnboardingModule).
 */
@Module({
  imports: [VehicleOnboardingActivationRailModule],
  providers: [
    HmOnlyCanonicalRegistrationService,
    VehicleRegistrationConvergenceService,
    {
      provide: VEHICLE_REGISTRATION_CONVERGENCE_PORT,
      useExisting: VehicleRegistrationConvergenceService,
    },
  ],
  exports: [VEHICLE_REGISTRATION_CONVERGENCE_PORT, VehicleRegistrationConvergenceService],
})
export class VehicleRegistrationConvergenceModule {}