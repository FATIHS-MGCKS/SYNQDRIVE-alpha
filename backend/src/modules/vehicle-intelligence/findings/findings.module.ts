import { Module } from '@nestjs/common';
import { FindingLifecycleService } from './finding-lifecycle.service';

@Module({
  providers: [FindingLifecycleService],
  exports: [FindingLifecycleService],
})
export class VehicleFindingsModule {}
