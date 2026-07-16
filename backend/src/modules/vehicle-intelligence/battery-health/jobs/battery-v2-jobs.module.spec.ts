import { MODULE_METADATA } from '@nestjs/common/constants';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import {
  BATTERY_V2_JOB_HANDLERS,
  BatteryV2JobsModule,
} from './battery-v2-jobs.module';
import { BATTERY_V2_JOB_TYPES } from './battery-v2-job.types';
import { BatteryV2JobHandlerRegistry } from './battery-v2-job-handler.registry';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';

describe('BatteryV2JobsModule', () => {
  it('registers all eight job handlers as providers', () => {
    const providers: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BatteryV2JobsModule) ?? [];
    for (const Handler of BATTERY_V2_JOB_HANDLERS) {
      expect(providers).toContain(Handler);
    }
    expect(BATTERY_V2_JOB_HANDLERS).toHaveLength(BATTERY_V2_JOB_TYPES.length);
  });

  it('exports producer and handler registry', () => {
    const exports: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, BatteryV2JobsModule) ?? [];
    expect(exports).toContain(BatteryV2JobProducerService);
    expect(exports).toContain(BatteryV2JobHandlerRegistry);
  });

  it('wires handler registry with all job types', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BatteryV2JobsModule],
    })
      .overrideProvider(getQueueToken(QUEUE_NAMES.BATTERY_V2))
      .useValue({ add: jest.fn() })
      .compile();

    const registry = moduleRef.get(BatteryV2JobHandlerRegistry);
    expect(registry.registeredJobTypes().sort()).toEqual([...BATTERY_V2_JOB_TYPES].sort());
  });
});
