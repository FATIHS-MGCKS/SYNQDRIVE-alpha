import { Module } from '@nestjs/common';
import { DimoModule } from '@modules/dimo/dimo.module';
import { VehicleOnboardingCaseService } from './services/vehicle-onboarding-case.service';
import { VehicleOnboardingActivationService } from './services/vehicle-onboarding-activation.service';
import { VehicleOnboardingReadinessService } from './services/vehicle-onboarding-readiness.service';
import { ProductionFailClosedReadinessAuthority } from './readiness/vehicle-onboarding-readiness-authority';
import { VEHICLE_ONBOARDING_READINESS_AUTHORITY } from './readiness/vehicle-onboarding-readiness.tokens';
import { VehicleOnboardingSourceAdoptionAuthority } from './source-adoption/vehicle-onboarding-source-adoption.authority';

@Module({
  imports: [DimoModule],
  providers: [
    VehicleOnboardingSourceAdoptionAuthority,
    ProductionFailClosedReadinessAuthority,
    {
      provide: VEHICLE_ONBOARDING_READINESS_AUTHORITY,
      useExisting: ProductionFailClosedReadinessAuthority,
    },
    VehicleOnboardingReadinessService,
    VehicleOnboardingCaseService,
    VehicleOnboardingActivationService,
  ],
  exports: [
    VehicleOnboardingCaseService,
    VehicleOnboardingActivationService,
    VehicleOnboardingReadinessService,
  ],
})
export class VehicleOnboardingModule {}
