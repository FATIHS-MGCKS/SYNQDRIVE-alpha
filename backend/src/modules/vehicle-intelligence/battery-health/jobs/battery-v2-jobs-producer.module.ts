import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { BatteryV2JobDeadLetterService } from './battery-v2-job-dead-letter.service';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import { BatteryV2ReconciliationService } from './battery-v2-reconciliation.service';
import { BatteryV2SnapshotObservationProducer } from './battery-v2-snapshot-observation.producer';
import { BatteryV2TripStartProducer } from './battery-v2-trip-start.producer';

/** Producer-side queue registration — safe to import from VehicleIntelligence without worker handlers. */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.BATTERY_V2 })],
  providers: [
    BatteryV2JobDeadLetterService,
    BatteryV2JobProducerService,
    BatteryV2SnapshotObservationProducer,
    BatteryV2TripStartProducer,
    BatteryV2ReconciliationService,
  ],
  exports: [
    BatteryV2JobDeadLetterService,
    BatteryV2JobProducerService,
    BatteryV2SnapshotObservationProducer,
    BatteryV2TripStartProducer,
    BatteryV2ReconciliationService,
    BullModule,
  ],
})
export class BatteryV2JobsProducerModule {}
