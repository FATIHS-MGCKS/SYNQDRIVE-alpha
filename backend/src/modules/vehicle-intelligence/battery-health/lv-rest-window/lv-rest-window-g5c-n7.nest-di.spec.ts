import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '@shared/database/prisma.service';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { RedisService } from '@shared/redis/redis.service';
import { BatteryV2JobsProducerModule } from '../jobs/battery-v2-jobs-producer.module';
import { BatteryV2JobObservabilityService } from '../jobs/battery-v2-job-observability.service';
import { VehicleIntelligenceModule } from '../../vehicle-intelligence.module';
import { LvRestWindowStateMachineService } from './lv-rest-window.service';
import { LvRestCanonicalTargetAnchorResolverService } from './lv-rest-canonical-target-anchor.resolver.service';
import { LvRestWindowSessionArmingService } from './lv-rest-window-session-arming.service';
import { LvRestWindowIngestionBridgeService } from './lv-rest-window-ingestion-bridge.service';
import { BatteryRestTargetEvaluationService } from './battery-rest-target-evaluation.service';

/**
 * Production deploy boot-check (`SYNQDRIVE_BOOT_CHECK=1`) resolves AppModule.
 * G5C-N7 registered `LvRestWindowStateMachineService` in VehicleIntelligenceModule
 * while `LvRestCanonicalTargetAnchorResolverService` lived only inside
 * BatteryV2JobsProducerModule without export — duplicate FSM context, missing resolver.
 */
describe('G5C-N7 LV REST window Nest DI ownership', () => {
  const viProviders: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, VehicleIntelligenceModule) ?? [];
  const producerProviders: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BatteryV2JobsProducerModule) ?? [];
  const producerExports: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.EXPORTS, BatteryV2JobsProducerModule) ?? [];

  it('registers LV REST FSM and canonical resolver only in BatteryV2JobsProducerModule', () => {
    expect(producerProviders).toContain(LvRestWindowStateMachineService);
    expect(producerProviders).toContain(LvRestCanonicalTargetAnchorResolverService);
    expect(viProviders).not.toContain(LvRestWindowStateMachineService);
    expect(viProviders).not.toContain(LvRestWindowSessionArmingService);
    expect(viProviders).not.toContain(LvRestCanonicalTargetAnchorResolverService);
  });

  it('exports FSM, session arming, and canonical resolver from BatteryV2JobsProducerModule', () => {
    expect(producerExports).toContain(LvRestWindowStateMachineService);
    expect(producerExports).toContain(LvRestWindowSessionArmingService);
    expect(producerExports).toContain(LvRestCanonicalTargetAnchorResolverService);
  });

  it('keeps VI-owned bridge and REST target evaluation as VehicleIntelligenceModule providers', () => {
    expect(viProviders).toContain(LvRestWindowIngestionBridgeService);
    expect(viProviders).toContain(BatteryRestTargetEvaluationService);
  });

  it('resolves LvRestWindowStateMachineService with LvRestCanonicalTargetAnchorResolverService (no resolver mock)', async () => {
    const prismaMock = {
      batteryRestSession: { findMany: jest.fn().mockResolvedValue([]) },
      batteryMeasurementSession: { findFirst: jest.fn(), update: jest.fn() },
      trip: { findFirst: jest.fn() },
      tripDetectionState: { findFirst: jest.fn() },
      batteryRestTargetMeasurement: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [BatteryV2JobsProducerModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(getQueueToken(QUEUE_NAMES.BATTERY_V2))
      .useValue({ add: jest.fn(), getJob: jest.fn() })
      .overrideProvider(RedisService)
      .useValue({ getClient: jest.fn(), set: jest.fn(), get: jest.fn() })
      .overrideProvider(BatteryV2JobObservabilityService)
      .useValue({ recordJobLifecycle: jest.fn() })
      .overrideProvider(TripMetricsService)
      .useValue({ recordTripMetric: jest.fn() })
      .compile();

    const fsm = moduleRef.get(LvRestWindowStateMachineService);
    const resolver = moduleRef.get(LvRestCanonicalTargetAnchorResolverService);

    expect(fsm).toBeInstanceOf(LvRestWindowStateMachineService);
    expect(resolver).toBeInstanceOf(LvRestCanonicalTargetAnchorResolverService);
  });
});
