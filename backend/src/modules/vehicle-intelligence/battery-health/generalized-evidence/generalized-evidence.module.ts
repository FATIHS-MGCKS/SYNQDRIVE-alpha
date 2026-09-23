import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { BatteryRestSessionService } from './battery-rest-session.service';
import { GeneralizedEvidenceCaptureService } from './generalized-evidence-capture.service';
import { GeneralizedEvidenceRepository } from './generalized-evidence.repository';
import { LateTripAssociationService } from './late-trip-association.service';
import { ProviderObservabilityGapModule } from '../provider-observability-gap/provider-observability-gap.module';
import { RestSessionFeatureComputationService } from './rest-session-features/rest-session-feature-computation.service';
import { RestSessionFeatureShadowTriggerService } from './rest-session-features/rest-session-feature-shadow-trigger.service';
import { RestSessionFeatureShadowInspectionService } from './rest-session-features/rest-session-feature-shadow-inspection.service';

@Module({
  imports: [ProviderObservabilityGapModule, PrismaModule],
  providers: [
    BatteryPolicyProfileService,
    GeneralizedEvidenceRepository,
    RestSessionFeatureComputationService,
    RestSessionFeatureShadowTriggerService,
    RestSessionFeatureShadowInspectionService,
    BatteryRestSessionService,
    LateTripAssociationService,
    GeneralizedEvidenceCaptureService,
  ],
  exports: [
    GeneralizedEvidenceRepository,
    BatteryRestSessionService,
    LateTripAssociationService,
    GeneralizedEvidenceCaptureService,
    RestSessionFeatureShadowInspectionService,
    ProviderObservabilityGapModule,
  ],
})
export class BatteryGeneralizedEvidenceModule {}

export {
  GeneralizedEvidenceCaptureService,
  GeneralizedEvidenceRepository,
  BatteryRestSessionService,
  LateTripAssociationService,
};
