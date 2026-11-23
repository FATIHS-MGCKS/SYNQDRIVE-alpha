import { Module, forwardRef } from '@nestjs/common';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { DimoModule } from '@modules/dimo/dimo.module';
import { AuthModule } from '@shared/auth/auth.module';
import { VsiReadonlySignalComposerModule } from '@modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-readonly-composer.module';
import { VehicleOnboardingCaseService } from './services/vehicle-onboarding-case.service';
import { VehicleOnboardingActivationService } from './services/vehicle-onboarding-activation.service';
import { VehicleOnboardingReadinessService } from './services/vehicle-onboarding-readiness.service';
import { VehicleOnboardingCaptureService } from './services/vehicle-onboarding-capture.service';
import { VehicleOnboardingSourceAdoptionService } from './services/vehicle-onboarding-source-adoption.service';
import { ProductionFailClosedReadinessAuthority } from './readiness/vehicle-onboarding-readiness-authority';
import { VEHICLE_ONBOARDING_READINESS_AUTHORITY } from './readiness/vehicle-onboarding-readiness.tokens';
import { VehicleOnboardingSourceAdoptionAuthority } from './source-adoption/vehicle-onboarding-source-adoption.authority';

/**
 * Shared VO activation rail (case → capture → readiness → activation).
 * Imported by VehicleOnboardingModule and VehicleRegistrationConvergenceModule without full VO graph.
 */
@Module({
  imports: [
    AuthModule,
    ActivityLogModule,
    VsiReadonlySignalComposerModule,
    forwardRef(() => DimoModule),
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
  ],
  exports: [
    VehicleOnboardingSourceAdoptionAuthority,
    VehicleOnboardingReadinessService,
    VehicleOnboardingCaseService,
    VehicleOnboardingActivationService,
    VehicleOnboardingCaptureService,
    VehicleOnboardingSourceAdoptionService,
  ],
})
export class VehicleOnboardingActivationRailModule {}