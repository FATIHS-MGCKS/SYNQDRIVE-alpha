import { MODULE_METADATA } from '@nestjs/common/constants';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import deviceConnectionWebhookInboxConfig from '@config/device-connection-webhook-inbox.config';
import connectivityRecoveryConfig from '@config/connectivity-recovery.config';
import { PrismaService } from '@shared/database/prisma.service';
import { PrismaModule } from '@shared/database/prisma.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { DimoModule } from './dimo.module';
import { DimoConnectivityLifecycleDiModule } from './dimo-connectivity-lifecycle-di.module';
import { ConnectivityLifecycleRuntimePolicyService } from './connectivity/connectivity-lifecycle-runtime-policy.service';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';
import { DeviceConnectionWebhookInboxSchedulerService } from './device-connection-webhook-inbox-scheduler.service';
import { DeviceConnectionWebhookProcessingService } from './device-connection-webhook-processing.service';
import { ConnectivityRecoveryPolicyService } from './connectivity/connectivity-recovery.policy';
import { DeviceConnectionEpisodeService } from './device-connection-episode.service';
import { DeviceConnectionWebhookInboxRepository } from './device-connection-webhook-inbox.repository';
import { DeviceConnectionWebhookInboxEnqueueService } from './device-connection-webhook-inbox-enqueue.service';
import { DeviceConnectionWebhookQueueProducer } from './device-connection-webhook-queue.producer';

function createPrismaMock(): PrismaService {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      return new Proxy(
        {},
        {
          get: () => jest.fn().mockResolvedValue(null),
        },
      );
    },
  };
  return new Proxy({} as object, handler) as unknown as PrismaService;
}

function createQueueMock() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
    }),
  };
}

describe('DimoModule — Nest DI bootstrap regression', () => {
  describe('DimoModule export/provider metadata (production boot defect guard)', () => {
    it('registers ConnectivityLifecycleRuntimePolicyService in providers and exports', () => {
      const providers: unknown[] =
        Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DimoModule) ?? [];
      const exports: unknown[] = Reflect.getMetadata(MODULE_METADATA.EXPORTS, DimoModule) ?? [];

      expect(providers).toContain(ConnectivityLifecycleRuntimePolicyService);
      expect(exports).toContain(ConnectivityLifecycleRuntimePolicyService);
    });

    it('fails metadata review when an export lacks a matching provider', () => {
      const providers: unknown[] =
        Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DimoModule) ?? [];
      const exports: unknown[] = Reflect.getMetadata(MODULE_METADATA.EXPORTS, DimoModule) ?? [];

      const exportedWithoutProvider = exports.filter(
        (token) => typeof token === 'function' && !providers.includes(token),
      );

      expect(exportedWithoutProvider).not.toContain(ConnectivityLifecycleRuntimePolicyService);
    });
  });

  describe('DimoConnectivityLifecycleDiModule — runtime graph resolution', () => {
    let moduleRef: TestingModule;

    beforeAll(async () => {
      moduleRef = await Test.createTestingModule({
        imports: [PrismaModule, DimoConnectivityLifecycleDiModule],
      })
        .overrideProvider(PrismaService)
        .useValue(createPrismaMock())
        .overrideProvider(getQueueToken(QUEUE_NAMES.CONNECTIVITY_WEBHOOK_PROCESS))
        .useValue(createQueueMock())
        .compile();
    });

    afterAll(async () => {
      await moduleRef?.close();
    });

    it('resolves ConnectivityLifecycleRuntimePolicyService from the module graph', () => {
      const policy = moduleRef.get(ConnectivityLifecycleRuntimePolicyService);
      expect(policy).toBeInstanceOf(ConnectivityLifecycleRuntimePolicyService);
      expect(typeof policy.evaluateOrphanReconciliationEligibility).toBe('function');
    });

    it('resolves DeviceConnectionWebhookService with lifecycle policy injected', () => {
      const webhook = moduleRef.get(DeviceConnectionWebhookService);
      expect(webhook).toBeInstanceOf(DeviceConnectionWebhookService);
      expect((webhook as unknown as { lifecyclePolicy: unknown }).lifecyclePolicy).toBeInstanceOf(
        ConnectivityLifecycleRuntimePolicyService,
      );
    });

    it('resolves inbox scheduler and processing services for worker/scheduler wiring', () => {
      expect(moduleRef.get(DeviceConnectionWebhookInboxSchedulerService)).toBeInstanceOf(
        DeviceConnectionWebhookInboxSchedulerService,
      );
      expect(moduleRef.get(DeviceConnectionWebhookProcessingService)).toBeInstanceOf(
        DeviceConnectionWebhookProcessingService,
      );
    });

    it('would fail compile if ConnectivityLifecycleRuntimePolicyService were omitted from providers', async () => {
      const providersWithoutPolicy = [
        ConnectivityRecoveryPolicyService,
        DeviceConnectionEpisodeService,
        DeviceConnectionWebhookService,
        DeviceConnectionWebhookInboxRepository,
        DeviceConnectionWebhookInboxEnqueueService,
        DeviceConnectionWebhookProcessingService,
        DeviceConnectionWebhookQueueProducer,
        DeviceConnectionWebhookInboxSchedulerService,
      ];

      await expect(
        Test.createTestingModule({
          imports: [
            PrismaModule,
            ConfigModule.forFeature(deviceConnectionWebhookInboxConfig),
            ConfigModule.forFeature(connectivityRecoveryConfig),
            BullModule.registerQueue({ name: QUEUE_NAMES.CONNECTIVITY_WEBHOOK_PROCESS }),
          ],
          providers: providersWithoutPolicy,
        })
          .overrideProvider(PrismaService)
          .useValue(createPrismaMock())
          .overrideProvider(getQueueToken(QUEUE_NAMES.CONNECTIVITY_WEBHOOK_PROCESS))
          .useValue(createQueueMock())
          .compile(),
      ).rejects.toThrow();
    });
  });
});
