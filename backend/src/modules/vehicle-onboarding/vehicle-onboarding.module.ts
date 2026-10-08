import { Module } from '@nestjs/common';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { DimoModule } from '@modules/dimo/dimo.module';
import { VehicleOnboardingCaseService } from './services/vehicle-onboarding-case.service';
import { VehicleOnboardingActivationService } from './services/vehicle-onboarding-activation.service';
import { VehicleOnboardingReadinessService } from './services/vehicle-onboarding-readiness.service';
import { VehicleOnboardingCaptureService } from './services/vehicle-onboarding-capture.service';
import { VehicleOnboardingSourceAdoptionService } from './services/vehicle-onboarding-source-adoption.service';
import { VehicleOnboardingCaptureController } from './controllers/vehicle-onboarding-capture.controller';
import { VehicleOnboardingSourceAdoptionController } from './controllers/vehicle-onboarding-source-adoption.controller';
import { VehicleOnboardingProviderCandidateController } from './controllers/vehicle-onboarding-provider-candidate.controller';
import { VehicleOnboardingProviderCandidateService } from './services/vehicle-onboarding-provider-candidate.service';
import { VehicleOffboardingService } from './services/vehicle-offboarding.service';
import { VehicleOnboardingOffboardService } from './services/vehicle-onboarding-offboard.service';
import { VehicleOnboardingOffboardController } from './controllers/vehicle-onboarding-offboard.controller';
import { VehicleOffboardPreflightService } from './offboarding/vehicle-offboard-preflight.service';
import { ProductionFailClosedReadinessAuthority } from './readiness/vehicle-onboarding-readiness-authority';
import { VEHICLE_ONBOARDING_READINESS_AUTHORITY } from './readiness/vehicle-onboarding-readiness.tokens';
import { VehicleOnboardingSourceAdoptionAuthority } from './source-adoption/vehicle-onboarding-source-adoption.authority';

@Module({
  imports: [DimoModule, ActivityLogModule],
  controllers: [
    VehicleOnboardingCaptureController,
    VehicleOnboardingSourceAdoptionController,
    VehicleOnboardingProviderCandidateController,
    VehicleOnboardingOffboardController,
  ],
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
    VehicleOnboardingCaptureService,
    VehicleOnboardingSourceAdoptionService,
    VehicleOnboardingProviderCandidateService,
    VehicleOffboardingService,
    VehicleOffboardPreflightService,
    VehicleOnboardingOffboardService,
  ],
  exports: [
    VehicleOnboardingCaseService,
    VehicleOnboardingActivationService,
    VehicleOnboardingReadinessService,
    VehicleOnboardingCaptureService,
    VehicleOffboardingService,
    VehicleOnboardingOffboardService,
  ],
})
export class VehicleOnboardingModule {}
