import { Module } from '@nestjs/common';
import { DimoModule } from '@modules/dimo/dimo.module';
import { DimoChargingAddedEnergyIntervalClient } from './dimo-charging-added-energy-interval.client';
import { HvChargingCounterEvidenceCaptureService } from './hv-charging-counter-evidence.capture.service';
import { HvChargingCounterEvidenceRepository } from './hv-charging-counter-evidence.repository';

@Module({
  imports: [DimoModule],
  providers: [
    HvChargingCounterEvidenceRepository,
    DimoChargingAddedEnergyIntervalClient,
    HvChargingCounterEvidenceCaptureService,
  ],
  exports: [HvChargingCounterEvidenceCaptureService],
})
export class HvChargingCounterEvidenceModule {}
