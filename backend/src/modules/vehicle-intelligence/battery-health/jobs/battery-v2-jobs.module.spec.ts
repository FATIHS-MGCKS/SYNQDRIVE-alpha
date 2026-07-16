import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BATTERY_V2_JOB_HANDLERS,
  BatteryV2JobsModule,
} from './battery-v2-jobs.module';
import { BatteryV2JobsProducerModule } from './battery-v2-jobs-producer.module';
import { BATTERY_V2_JOB_TYPES } from './battery-v2-job.types';
import { BatteryV2IdempotentExecutionService } from './battery-v2-idempotent-execution.service';
import { BatteryV2JobHandlerRegistry } from './battery-v2-job-handler.registry';
import { BatteryV2VehicleLockService } from './battery-v2-vehicle-lock.service';
import { BatteryV2SnapshotIngestionService } from './battery-v2-snapshot-ingestion.service';
import { BatteryV2Service } from '../battery-v2.service';
import { HvBatteryHealthService } from '../hv-battery-health.service';

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

  it('wires handler registry with all job types', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ...BATTERY_V2_JOB_HANDLERS,
        BatteryV2JobHandlerRegistry,
        BatteryV2SnapshotIngestionService,
        { provide: PrismaService, useValue: { vehicle: { findUnique: jest.fn() } } },
        { provide: BatteryV2Service, useValue: { onSnapshot: jest.fn(), onTripStart: jest.fn() } },
        { provide: HvBatteryHealthService, useValue: { recordSnapshot: jest.fn() } },
      ],
    }).compile();

    const registry = moduleRef.get(BatteryV2JobHandlerRegistry);
    expect(registry.registeredJobTypes().sort()).toEqual([...BATTERY_V2_JOB_TYPES].sort());
  });
});
