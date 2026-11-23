import { Module, forwardRef } from '@nestjs/common';
import { DocumentExtractionModule } from '@modules/document-extraction/document-extraction.module';
import { AiModule } from '@modules/ai/ai.module';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { DimoModule } from '@modules/dimo/dimo.module';
import { AuthModule } from '@shared/auth/auth.module';
import { VehicleOnboardingCaptureController } from './controllers/vehicle-onboarding-capture.controller';
import { VehicleOnboardingSourceAdoptionController } from './controllers/vehicle-onboarding-source-adoption.controller';
import { VehicleOnboardingProviderCandidateController } from './controllers/vehicle-onboarding-provider-candidate.controller';
import { VehicleOnboardingProviderCandidateService } from './services/vehicle-onboarding-provider-candidate.service';
import { VehicleOffboardingService } from './services/vehicle-offboarding.service';
import { DimoSourceLinkAuditedDeactivationService } from './services/dimo-source-link-audited-deactivation.service';
import { DimoSourceLinkOperatorAuthorizationService } from './services/dimo-source-link-operator-authorization.service';
import { VehicleOnboardingOffboardService } from './services/vehicle-onboarding-offboard.service';
import { VehicleOnboardingOffboardController } from './controllers/vehicle-onboarding-offboard.controller';
import { MasterVehicleOffboardAdmissionGuard } from './guards/master-vehicle-offboard-admission.guard';
import { MasterVehicleOffboardMfaGuard } from './guards/master-vehicle-offboard-mfa.guard';
import { VehicleOffboardPreflightService } from './offboarding/vehicle-offboard-preflight.service';
import { MasterDimoCanonicalRegistrationService } from './master-dimo/master-dimo-canonical-registration.service';
import { VsiReadonlySignalComposerModule } from '@modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-readonly-composer.module';
import { VehicleIdentityReviewController } from './vehicle-identity-review/vehicle-identity-review.controller';
import { VehicleIdentityP3Service } from './vehicle-identity-review/vehicle-identity-p3.service';
import { VehicleIdentityReviewService } from './vehicle-identity-review/vehicle-identity-review.service';
import { FsdDiscoveryIntegrationModule } from '@modules/vehicle-intelligence/fsd-integration/fsd-integration.module';
import { VehicleOnboardingActivationRailModule } from './vehicle-onboarding-activation-rail.module';
import { VehicleRegistrationConvergenceModule } from './convergence/vehicle-registration-convergence.module';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => DimoModule),
    forwardRef(() => FsdDiscoveryIntegrationModule),
    ActivityLogModule,
    VsiReadonlySignalComposerModule,
    forwardRef(() => AiModule),
    forwardRef(() => DocumentExtractionModule),
    VehicleOnboardingActivationRailModule,
    VehicleRegistrationConvergenceModule,
  ],
  controllers: [
    VehicleIdentityReviewController,
    VehicleOnboardingCaptureController,
    VehicleOnboardingSourceAdoptionController,
    VehicleOnboardingProviderCandidateController,
    VehicleOnboardingOffboardController,
  ],
  providers: [
    VehicleOnboardingProviderCandidateService,
    VehicleOffboardingService,
    DimoSourceLinkAuditedDeactivationService,
    DimoSourceLinkOperatorAuthorizationService,
    VehicleOffboardPreflightService,
    VehicleOnboardingOffboardService,
    MasterVehicleOffboardAdmissionGuard,
    MasterVehicleOffboardMfaGuard,
    MasterDimoCanonicalRegistrationService,
    VehicleIdentityReviewService,
    VehicleIdentityP3Service,
  ],
  exports: [
    VehicleOnboardingActivationRailModule,
    VehicleOffboardingService,
    VehicleOffboardPreflightService,
    DimoSourceLinkAuditedDeactivationService,
    DimoSourceLinkOperatorAuthorizationService,
    VehicleOnboardingOffboardService,
    MasterDimoCanonicalRegistrationService,
    VehicleRegistrationConvergenceModule,
  ],
})
export class VehicleOnboardingModule {}