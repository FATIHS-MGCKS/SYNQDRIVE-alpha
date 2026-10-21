import { MODULE_METADATA } from '@nestjs/common/constants';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { PrismaModule } from '@shared/database/prisma.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { DimoModule } from './dimo.module';
import { DimoConnectivityLifecycleDiModule } from './dimo-connectivity-lifecycle-di.module';
import { ConnectivityLifecycleRuntimePolicyService } from './connectivity/connectivity-lifecycle-runtime-policy.service';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';
import { DeviceConnectionWebhookInboxSchedulerService } from './device-connection-webhook-inbox-scheduler.service';
import { DeviceConnectionWebhookProcessingService } from './device-connection-webhook-processing.service';
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
  describe('canonical submodule wiring', () => {
    it('registers ConnectivityLifecycleRuntimePolicyService in the canonical submodule', () => {
      const providers: unknown[] =
        Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DimoConnectivityLifecycleDiModule) ?? [];
      const exports: unknown[] =
        Reflect.getMetadata(MODULE_METADATA.EXPORTS, DimoConnectivityLifecycleDiModule) ?? [];

      expect(providers).toContain(ConnectivityLifecycleRuntimePolicyService);
      expect(exports).toContain(ConnectivityLifecycleRuntimePolicyService);
    });

    it('imports the canonical submodule from DimoModule (no duplicate provider list)', () => {
      const imports: unknown[] = Reflect.getMetadata(MODULE_METADATA.IMPORTS, DimoModule) ?? [];
      const dimoProviders: unknown[] =
        Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DimoModule) ?? [];

      expect(imports).toContain(DimoConnectivityLifecycleDiModule);
      expect(dimoProviders).not.toContain(ConnectivityLifecycleRuntimePolicyService);
      expect(dimoProviders).not.toContain(DeviceConnectionWebhookService);
    });

    it('re-exports the canonical submodule from DimoModule', () => {
      const exports: unknown[] = Reflect.getMetadata(MODULE_METADATA.EXPORTS, DimoModule) ?? [];
      expect(exports).toContain(DimoConnectivityLifecycleDiModule);
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

    it('resolves inbox scheduler, processing service, and queue producer', () => {
      expect(moduleRef.get(DeviceConnectionWebhookInboxSchedulerService)).toBeInstanceOf(
        DeviceConnectionWebhookInboxSchedulerService,
      );
      expect(moduleRef.get(DeviceConnectionWebhookProcessingService)).toBeInstanceOf(
        DeviceConnectionWebhookProcessingService,
      );
      expect(moduleRef.get(DeviceConnectionWebhookQueueProducer)).toBeInstanceOf(
        DeviceConnectionWebhookQueueProducer,
      );
    });

    it('fails compile when ConnectivityLifecycleRuntimePolicyService is omitted from the canonical submodule', async () => {
      const submoduleProviders: unknown[] =
        Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DimoConnectivityLifecycleDiModule) ?? [];
      const providersWithoutPolicy = submoduleProviders.filter(
        (token) => token !== ConnectivityLifecycleRuntimePolicyService,
      );

      await expect(
        Test.createTestingModule({
          imports: [PrismaModule, DimoConnectivityLifecycleDiModule],
        })
          .overrideProvider(PrismaService)
          .useValue(createPrismaMock())
          .overrideProvider(getQueueToken(QUEUE_NAMES.CONNECTIVITY_WEBHOOK_PROCESS))
          .useValue(createQueueMock())
          .overrideModule(DimoConnectivityLifecycleDiModule)
          .useModule({
            module: class DimoConnectivityLifecycleDiModuleBroken {},
            providers: providersWithoutPolicy as never[],
            exports: providersWithoutPolicy as never[],
          })
          .compile(),
      ).rejects.toThrow();
    });
  });
});
