import { Module } from '@nestjs/common';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { BatteryRestSessionService } from './battery-rest-session.service';
import { GeneralizedEvidenceCaptureService } from './generalized-evidence-capture.service';
import { GeneralizedEvidenceRepository } from './generalized-evidence.repository';
import { LateTripAssociationService } from './late-trip-association.service';
import { ProviderObservabilityGapModule } from '../provider-observability-gap/provider-observability-gap.module';

@Module({
  imports: [ProviderObservabilityGapModule],
  providers: [
    BatteryPolicyProfileService,
    GeneralizedEvidenceRepository,
    BatteryRestSessionService,
    LateTripAssociationService,
    GeneralizedEvidenceCaptureService,
  ],
  exports: [
    GeneralizedEvidenceRepository,
    BatteryRestSessionService,
    LateTripAssociationService,
    GeneralizedEvidenceCaptureService,
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
