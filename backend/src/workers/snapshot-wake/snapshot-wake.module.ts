import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { QUEUE_NAMES } from '../queues/queue-names';
import { SnapshotWakeCoordinatorService } from './snapshot-wake-coordinator.service';
import { SnapshotWakeIntakeService } from './snapshot-wake-intake.service';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.DIMO_SNAPSHOT })],
  providers: [SnapshotWakeCoordinatorService, SnapshotWakeIntakeService],
  exports: [SnapshotWakeCoordinatorService, SnapshotWakeIntakeService],
})
export class SnapshotWakeModule {}
