import { Module } from '@nestjs/common';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { ShutdownEvidenceCaptureService } from './shutdown-evidence-capture.service';
import { ShutdownEvidenceRepository } from './shutdown-evidence.repository';
import { ShutdownEvidenceTripContextService } from './shutdown-evidence-trip-context.service';

@Module({
  providers: [
    BatteryPolicyProfileService,
    ShutdownEvidenceRepository,
    ShutdownEvidenceCaptureService,
    ShutdownEvidenceTripContextService,
  ],
  exports: [
    ShutdownEvidenceRepository,
    ShutdownEvidenceCaptureService,
    ShutdownEvidenceTripContextService,
  ],
})
export class BatteryShutdownEvidenceModule {}

export {
  ShutdownEvidenceCaptureService,
  ShutdownEvidenceRepository,
  ShutdownEvidenceTripContextService,
};
