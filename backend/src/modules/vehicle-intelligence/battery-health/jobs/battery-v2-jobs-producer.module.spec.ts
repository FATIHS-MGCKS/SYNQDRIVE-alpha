import { MODULE_METADATA } from '@nestjs/common/constants';
import { BatteryV2JobsProducerModule } from './battery-v2-jobs-producer.module';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import { BatteryV2SnapshotObservationProducer } from './battery-v2-snapshot-observation.producer';
import { BatteryV2TripStartProducer } from './battery-v2-trip-start.producer';

describe('BatteryV2JobsProducerModule', () => {
  it('registers producer services', () => {
    const providers: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BatteryV2JobsProducerModule) ?? [];
    expect(providers).toContain(BatteryV2JobProducerService);
    expect(providers).toContain(BatteryV2SnapshotObservationProducer);
    expect(providers).toContain(BatteryV2TripStartProducer);
  });
});
