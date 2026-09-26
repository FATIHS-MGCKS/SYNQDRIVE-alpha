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
import { LongitudinalInputReaderService } from './rest-session-features/longitudinal/longitudinal-input.reader';
import { LongitudinalProfileMaterializationRepository } from './rest-session-features/longitudinal/longitudinal-profile-materialization.repository';
import { LongitudinalProfileMaterializationService } from './rest-session-features/longitudinal/longitudinal-profile-materialization.service';
import { LongitudinalProfileMaterializationRuntimeService } from './rest-session-features/longitudinal/longitudinal-profile-materialization.runtime.service';
import { PrismaService } from '@shared/database/prisma.service';

@Module({
  imports: [ProviderObservabilityGapModule, PrismaModule],
  providers: [
    BatteryPolicyProfileService,
    GeneralizedEvidenceRepository,
    RestSessionFeatureComputationService,
    RestSessionFeatureShadowTriggerService,
    RestSessionFeatureShadowInspectionService,
    LongitudinalInputReaderService,
    {
      provide: LongitudinalProfileMaterializationRepository,
      useFactory: (prisma: PrismaService) =>
        new LongitudinalProfileMaterializationRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: LongitudinalProfileMaterializationService,
      useFactory: (
        inputReader: LongitudinalInputReaderService,
        materializationRepository: LongitudinalProfileMaterializationRepository,
      ) => new LongitudinalProfileMaterializationService(inputReader, materializationRepository),
      inject: [LongitudinalInputReaderService, LongitudinalProfileMaterializationRepository],
    },
    LongitudinalProfileMaterializationRuntimeService,
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
    LongitudinalInputReaderService,
    LongitudinalProfileMaterializationRuntimeService,
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
