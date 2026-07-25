import { Module } from '@nestjs/common';
import { VehicleWarningRetentionScheduler } from './vehicle-warning-retention.scheduler';
import { VehicleWarningErasureService } from './vehicle-warning-erasure.service';

@Module({
  providers: [VehicleWarningRetentionScheduler, VehicleWarningErasureService],
  exports: [VehicleWarningRetentionScheduler, VehicleWarningErasureService],
})
export class VehicleWarningGdprModule {}
