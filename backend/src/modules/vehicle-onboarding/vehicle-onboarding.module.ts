import { Module } from '@nestjs/common';
import { DimoModule } from '@modules/dimo/dimo.module';
import { VehicleOnboardingCaseService } from './services/vehicle-onboarding-case.service';
import { VehicleOnboardingActivationService } from './services/vehicle-onboarding-activation.service';

/**
 * VO-3 provider-neutral onboarding orchestration (internal — no public cutover in VO-3).
 */
@Module({
  imports: [DimoModule],
  providers: [VehicleOnboardingCaseService, VehicleOnboardingActivationService],
  exports: [VehicleOnboardingCaseService, VehicleOnboardingActivationService],
})
export class VehicleOnboardingModule {}
