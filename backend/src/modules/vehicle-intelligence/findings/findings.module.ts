import { Module } from '@nestjs/common';
import { FindingLifecycleService } from './finding-lifecycle.service';
import { FindingBridgeService } from './finding-bridge.service';

@Module({
  providers: [FindingLifecycleService, FindingBridgeService],
  exports: [FindingLifecycleService, FindingBridgeService],
})
export class VehicleFindingsModule {}
