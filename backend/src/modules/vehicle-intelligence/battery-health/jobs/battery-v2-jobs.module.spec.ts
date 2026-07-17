import { MODULE_METADATA } from '@nestjs/common/constants';
import {
  BATTERY_V2_JOB_HANDLERS,
  BatteryV2JobsModule,
} from './battery-v2-jobs.module';
import { BatteryV2JobsProducerModule } from './battery-v2-jobs-producer.module';
import { DimoModule } from '../../../dimo/dimo.module';
import { BATTERY_V2_JOB_TYPES, type BatteryV2JobType } from './battery-v2-job.types';
import { BatteryV2IdempotentExecutionService } from './battery-v2-idempotent-execution.service';
import { BatteryV2JobHandlerRegistry } from './battery-v2-job-handler.registry';
import { BatteryV2VehicleLockService } from './battery-v2-vehicle-lock.service';
import type { BatteryV2JobHandler } from './battery-v2-job.handler';

function mockHandler<T extends BatteryV2JobType>(jobType: T): BatteryV2JobHandler<T> {
  return {
    jobType,
    handle: jest.fn(),
  };
}

describe('BatteryV2JobsModule', () => {
  it('registers all eight job handlers as providers', () => {
    const providers: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BatteryV2JobsModule) ?? [];
    for (const Handler of BATTERY_V2_JOB_HANDLERS) {
      expect(providers).toContain(Handler);
    }
    expect(BATTERY_V2_JOB_HANDLERS).toHaveLength(BATTERY_V2_JOB_TYPES.length);
  });

  it('exports handler registry and producer module', () => {
    const exports: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, BatteryV2JobsModule) ?? [];
    expect(exports).toContain(BatteryV2JobHandlerRegistry);
    expect(exports).toContain(BatteryV2IdempotentExecutionService);
    expect(exports).toContain(BatteryV2VehicleLockService);
    expect(exports).toContain(BatteryV2JobsProducerModule);
  });

  it('registers idempotency services as providers', () => {
    const providers: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BatteryV2JobsModule) ?? [];
    expect(providers).toContain(BatteryV2IdempotentExecutionService);
    expect(providers).toContain(BatteryV2VehicleLockService);
  });

  it('imports DimoModule so worker handlers can resolve DimoSegmentsService', () => {
    const imports: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, BatteryV2JobsModule) ?? [];
    const hasDimoModule = imports.some((entry) => {
      if (entry === DimoModule) return true;
      const forwardRefFn = (entry as { forwardRef?: () => unknown })?.forwardRef;
      return typeof forwardRefFn === 'function' && forwardRefFn() === DimoModule;
    });
    expect(hasDimoModule).toBe(true);
  });

  it('wires handler registry with all job types', () => {
    const registry = new BatteryV2JobHandlerRegistry(
      mockHandler('BATTERY_OBSERVATION_CLASSIFY') as never,
      mockHandler('BATTERY_REST_TARGET_EVALUATE') as never,
      mockHandler('BATTERY_START_PROXY_EXTRACT') as never,
      mockHandler('BATTERY_ASSESSMENT_RECOMPUTE') as never,
      mockHandler('BATTERY_PUBLICATION_UPDATE') as never,
      mockHandler('HV_CAPABILITY_REFRESH') as never,
      mockHandler('HV_RECHARGE_SESSION_RECONCILE') as never,
      mockHandler('HV_CAPACITY_SHADOW_RECOMPUTE') as never,
    );

    expect(registry.registeredJobTypes().sort()).toEqual([...BATTERY_V2_JOB_TYPES].sort());
  });
});
