import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import { BatteryV2SnapshotObservationProducer } from './battery-v2-snapshot-observation.producer';
import { BatteryV2TripStartProducer } from './battery-v2-trip-start.producer';

/** Producer-side queue registration — safe to import from VehicleIntelligence without worker handlers. */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.BATTERY_V2 })],
  providers: [
    BatteryV2JobProducerService,
    BatteryV2SnapshotObservationProducer,
    BatteryV2TripStartProducer,
  ],
  exports: [
    BatteryV2JobProducerService,
    BatteryV2SnapshotObservationProducer,
    BatteryV2TripStartProducer,
    BullModule,
  ],
})
export class BatteryV2JobsProducerModule {}
