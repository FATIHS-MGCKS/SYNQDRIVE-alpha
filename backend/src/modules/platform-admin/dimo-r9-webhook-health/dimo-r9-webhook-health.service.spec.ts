import { Test } from '@nestjs/testing';
import dimoR9WebhookHealthConfig from '@config/dimo-r9-webhook-health.config';
import { DimoTriggersService } from '../../dimo/dimo-triggers.service';
import { RedisDistributedLockService } from '@shared/redis/redis-distributed-lock.service';
import { RedisService } from '@shared/redis/redis.service';
import { DimoR9WebhookHealthService } from './dimo-r9-webhook-health.service';
import { R9_IGNITION_ID, R9_SPEED_ID } from './dimo-r9-webhook-health.evaluator';

const speedWebhook = {
  id: R9_SPEED_ID,
  displayName: 'SynqDrive R9 Speed Wake',
  service: 'signals',
  metricName: 'vss.speed',
  condition: 'valueNumber > 3',
  coolDownPeriod: 30,
  status: 'enabled',
  failureCount: 0,
};

const ignitionWebhook = {
  id: R9_IGNITION_ID,
  displayName: 'SynqDrive R9 Ignition Wake',
  service: 'signals',
  metricName: 'vss.isIgnitionOn',
  condition: 'valueNumber == 1',
  coolDownPeriod: 30,
  status: 'enabled',
  failureCount: 0,
};

const cohortSubs = [
  { assetDID: 'did:erc721:137:0xabc:186946' },
  { assetDID: 'did:erc721:137:0xabc:187361' },
  { assetDID: 'did:erc721:137:0xabc:187784' },
  { assetDID: 'did:erc721:137:0xabc:192922' },
];

const baseConfig = {
  cacheTtlMs: 45_000,
  minProviderFetchIntervalMs: 60_000,
  staleAfterMs: 300_000,
  authorizedCohortTokenIds: [186946, 187361, 187784, 192922],
  excludedTokenIds: [187336, 190497],
  cohortConfigValid: true,
  cohortConfigErrors: [] as string[],
  redisCacheKey: 'test:cache',
  redisLockKey: 'test:lock',
  redisLastFetchKey: 'test:last',
  redisLockTtlMs: 25_000,
  lockContentionWaitMs: 500,
};

describe('DimoR9WebhookHealthService', () => {
  let service: DimoR9WebhookHealthService;
  let triggers: {
    listWebhooksDetailed: jest.Mock;
    getWebhookSubscriberEntries: jest.Mock;
  };

  beforeEach(async () => {
    triggers = {
      listWebhooksDetailed: jest.fn(),
      getWebhookSubscriberEntries: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DimoR9WebhookHealthService,
        {
          provide: DimoTriggersService,
          useValue: triggers,
        },
        {
          provide: dimoR9WebhookHealthConfig.KEY,
          useValue: baseConfig,
        },
      ],
    }).compile();

    service = moduleRef.get(DimoR9WebhookHealthService);
  });

  it('returns HEALTHY when both definitions enabled with zero failures and cohort matches', async () => {
    triggers.listWebhooksDetailed.mockResolvedValue({
      webhooks: [speedWebhook, ignitionWebhook],
      error: null,
    });
    triggers.getWebhookSubscriberEntries.mockImplementation(async () => ({
      entries: cohortSubs,
      error: null,
    }));

    const res = await service.getHealth({ forceRefresh: true });
    expect(res.overall).toBe('HEALTHY');
    expect(res.speed.healthy).toBe(true);
    expect(res.ignition.healthy).toBe(true);
    expect(res.lastSuccessfulProviderCheckAt).not.toBeNull();
    expect(res.wakePipelineEvidence).toBe('NOT_EVALUATED');
    expect(JSON.stringify(res)).not.toMatch(/Bearer|privateKey|DIMO_PRIVATE/i);
  });

  it('flags CRITICAL when speed status is failed', async () => {
    triggers.listWebhooksDetailed.mockResolvedValue({
      webhooks: [{ ...speedWebhook, status: 'failed' }, ignitionWebhook],
      error: null,
    });
    triggers.getWebhookSubscriberEntries.mockResolvedValue({ entries: cohortSubs, error: null });

    const res = await service.getHealth({ forceRefresh: true });
    expect(res.speed.state).toBe('CRITICAL');
    expect(res.lastSuccessfulProviderCheckAt).toBeNull();
    expect(res.speed.alerts.some((a) => a.code === 'STATUS_NOT_ENABLED')).toBe(true);
  });

  it('flags failure count increase', async () => {
    triggers.listWebhooksDetailed.mockResolvedValue({
      webhooks: [{ ...speedWebhook, failureCount: 2 }, ignitionWebhook],
      error: null,
    });
    triggers.getWebhookSubscriberEntries.mockResolvedValue({ entries: cohortSubs, error: null });

    const res = await service.getHealth({ forceRefresh: true });
    expect(res.speed.alerts.some((a) => a.code === 'FAILURE_COUNT_NONZERO')).toBe(true);
    expect(res.lastSuccessfulProviderCheckAt).toBeNull();
  });

  it('detects excluded vehicle subscribed', async () => {
    triggers.listWebhooksDetailed.mockResolvedValue({
      webhooks: [speedWebhook, ignitionWebhook],
      error: null,
    });
    triggers.getWebhookSubscriberEntries.mockResolvedValue({
      entries: [...cohortSubs, { assetDID: 'did:erc721:137:0xabc:187336' }],
      error: null,
    });

    const res = await service.getHealth({ forceRefresh: true });
    expect(res.cohort.excludedSubscribedTokenIds).toContain(187336);
    expect(res.speed.state).toBe('CRITICAL');
  });

  it('returns UNKNOWN when DIMO list fails', async () => {
    triggers.listWebhooksDetailed.mockResolvedValue({
      webhooks: [],
      error: { code: 'DIMO_API_UNAVAILABLE', message: 'network' },
    });

    const res = await service.getHealth({ forceRefresh: true });
    expect(res.providerAccessState).toBe('UNAVAILABLE');
    expect(res.overall).toBe('UNKNOWN');
    expect(res.lastSuccessfulProviderCheckAt).toBeNull();
  });

  it('handles ignition subscriber GET failure symmetrically to speed', async () => {
    triggers.listWebhooksDetailed.mockResolvedValue({
      webhooks: [speedWebhook, ignitionWebhook],
      error: null,
    });
    triggers.getWebhookSubscriberEntries.mockImplementation(async (id: string) => {
      if (id === R9_IGNITION_ID) {
        return { entries: null, error: { code: 'DIMO_API_UNAVAILABLE', message: 'ignition 503', httpStatus: 503 } };
      }
      return { entries: cohortSubs, error: null };
    });

    const res = await service.getHealth({ forceRefresh: true });
    expect(res.providerAccessState).toBe('PROVIDER_5XX');
    expect(res.ignition.state).toBe('UNKNOWN');
    expect(res.ignition.healthy).toBe(false);
    expect(res.speed.state).toBe('HEALTHY');
    expect(res.lastSuccessfulProviderCheckAt).toBeNull();
    expect(res.lastProviderError?.message).toMatch(/ignition/i);
    expect(res.overall).not.toBe('HEALTHY');
  });

  it('handles speed subscriber GET failure with provider state and channel alerts', async () => {
    triggers.listWebhooksDetailed.mockResolvedValue({
      webhooks: [speedWebhook, ignitionWebhook],
      error: null,
    });
    triggers.getWebhookSubscriberEntries.mockImplementation(async (id: string) => {
      if (id === R9_SPEED_ID) {
        return { entries: null, error: { code: 'DIMO_API_UNAVAILABLE', message: 'speed 401', httpStatus: 401 } };
      }
      return { entries: cohortSubs, error: null };
    });

    const res = await service.getHealth({ forceRefresh: true });
    expect(res.providerAccessState).toBe('AUTH_ERROR');
    expect(res.speed.state).toBe('UNKNOWN');
    expect(res.lastProviderError?.message).toMatch(/speed/i);
    expect(res.overall).not.toBe('HEALTHY');
  });

  it('enforces manual refresh rate limit (served stale cache when available)', async () => {
    triggers.listWebhooksDetailed.mockResolvedValue({
      webhooks: [speedWebhook, ignitionWebhook],
      error: null,
    });
    triggers.getWebhookSubscriberEntries.mockResolvedValue({ entries: cohortSubs, error: null });

    await service.getHealth({ forceRefresh: true });
    const second = await service.getHealth({ forceRefresh: true });
    expect(second.rateLimitRetryAfterMs).not.toBeNull();
    expect(second.servedFromCache).toBe(true);
    expect(triggers.listWebhooksDetailed).toHaveBeenCalledTimes(1);
  });

  it('uses in-memory cache on second call without refresh', async () => {
    triggers.listWebhooksDetailed.mockResolvedValue({
      webhooks: [speedWebhook, ignitionWebhook],
      error: null,
    });
    triggers.getWebhookSubscriberEntries.mockResolvedValue({ entries: cohortSubs, error: null });

    await service.getHealth({ forceRefresh: true });
    triggers.listWebhooksDetailed.mockClear();
    const cached = await service.getHealth();
    expect(cached.servedFromCache).toBe(true);
    expect(triggers.listWebhooksDetailed).not.toHaveBeenCalled();
  });

  it('marks aged cache as STALE and not HEALTHY', async () => {
    triggers.listWebhooksDetailed.mockResolvedValue({
      webhooks: [speedWebhook, ignitionWebhook],
      error: null,
    });
    triggers.getWebhookSubscriberEntries.mockResolvedValue({ entries: cohortSubs, error: null });

    const fresh = await service.getHealth({ forceRefresh: true });
    const oldCheckedAt = new Date(Date.now() - 400_000).toISOString();
    const staleSnapshot = { ...fresh, checkedAt: oldCheckedAt, overall: 'HEALTHY' as const };

    const applied = service.applyFreshnessPolicy(staleSnapshot, Date.now());
    expect(applied.isStale).toBe(true);
    expect(applied.overall).toBe('STALE');
    expect(applied.speed.healthy).toBe(false);
  });

  it('rate-limited refresh still applies stale policy to cached payload', async () => {
    triggers.listWebhooksDetailed.mockResolvedValue({
      webhooks: [speedWebhook, ignitionWebhook],
      error: null,
    });
    triggers.getWebhookSubscriberEntries.mockResolvedValue({ entries: cohortSubs, error: null });

    await service.getHealth({ forceRefresh: true });
    const mem = (service as unknown as { memoryCache: { payload: { checkedAt: string } } }).memoryCache;
    mem.payload.checkedAt = new Date(Date.now() - 400_000).toISOString();

    const second = await service.getHealth({ forceRefresh: true });
    expect(second.isStale).toBe(true);
    expect(second.overall).not.toBe('HEALTHY');
  });

  it('surfaces invalid cohort configuration without implying health', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DimoR9WebhookHealthService,
        { provide: DimoTriggersService, useValue: triggers },
        {
          provide: dimoR9WebhookHealthConfig.KEY,
          useValue: {
            ...baseConfig,
            cohortConfigValid: false,
            cohortConfigErrors: ['INVALID_AUTHORIZED_COHORT_TOKEN_IDS'],
          },
        },
      ],
    }).compile();
    const invalidService = moduleRef.get(DimoR9WebhookHealthService);

    const res = await invalidService.getHealth({ forceRefresh: true });
    expect(triggers.listWebhooksDetailed).not.toHaveBeenCalled();
    expect(res.overall).toBe('NOT_CONFIGURED');
    expect(res.providerAccessState).toBe('NOT_CONFIGURED');
    expect(res.speed.alerts.some((a) => a.code === 'INVALID_COHORT_CONFIG')).toBe(true);
  });
});

describe('DimoR9WebhookHealthService distributed lock', () => {
  let triggers: {
    listWebhooksDetailed: jest.Mock;
    getWebhookSubscriberEntries: jest.Mock;
  };
  let redisGet: jest.Mock;
  let redisSetex: jest.Mock;
  let lockAcquire: jest.Mock;
  let lockRelease: jest.Mock;

  beforeEach(() => {
    triggers = {
      listWebhooksDetailed: jest.fn().mockResolvedValue({
        webhooks: [speedWebhook, ignitionWebhook],
        error: null,
      }),
      getWebhookSubscriberEntries: jest.fn().mockResolvedValue({ entries: cohortSubs, error: null }),
    };
    redisGet = jest.fn().mockResolvedValue(null);
    redisSetex = jest.fn().mockResolvedValue('OK');
    lockAcquire = jest.fn();
    lockRelease = jest.fn().mockResolvedValue(true);
  });

  async function createService() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DimoR9WebhookHealthService,
        { provide: DimoTriggersService, useValue: triggers },
        { provide: dimoR9WebhookHealthConfig.KEY, useValue: { ...baseConfig, lockContentionWaitMs: 200 } },
        {
          provide: RedisService,
          useValue: {
            get: redisGet,
            setex: redisSetex,
            set: jest.fn(),
          },
        },
        {
          provide: RedisDistributedLockService,
          useValue: {
            acquire: lockAcquire,
            release: lockRelease,
          },
        },
      ],
    }).compile();
    return moduleRef.get(DimoR9WebhookHealthService);
  }

  it('releases lock with ownership token after successful fetch', async () => {
    const handle = { key: 'test:lock', token: 'token-a', acquiredAt: new Date() };
    lockAcquire.mockResolvedValue({ acquired: true, handle });

    const service = await createService();
    await service.getHealth({ forceRefresh: true });

    expect(lockAcquire).toHaveBeenCalledWith('test:lock', 25_000);
    expect(lockRelease).toHaveBeenCalledWith(handle);
    expect(triggers.listWebhooksDetailed).toHaveBeenCalledTimes(1);
  });

  it('waits for peer cache when lock is contended', async () => {
    lockAcquire.mockResolvedValue({ acquired: false, reason: 'contended' });
    const peerPayload = {
      generatedAt: new Date().toISOString(),
      checkedAt: new Date().toISOString(),
      cacheExpiresAt: null,
      isStale: false,
      staleReason: null,
      overall: 'HEALTHY',
      providerAccessState: 'OK',
      lastSuccessfulProviderCheckAt: new Date().toISOString(),
      lastProviderError: null,
      refreshCadenceMs: 60_000,
      minManualRefreshIntervalMs: 60_000,
      rateLimitRetryAfterMs: null,
      servedFromCache: false,
      wakePipelineEvidence: 'NOT_EVALUATED',
      cohort: { expectedTokenIds: [], excludedTokenIds: [], excludedSubscribedTokenIds: [] },
      speed: {
        webhookId: R9_SPEED_ID,
        kind: 'speed',
        state: 'HEALTHY',
        healthy: true,
        definition: null,
        subscriberTokenIds: [],
        expectedSubscriberTokenIds: [],
        subscriberCount: 0,
        alerts: [],
      },
      ignition: {
        webhookId: R9_IGNITION_ID,
        kind: 'ignition',
        state: 'HEALTHY',
        healthy: true,
        definition: null,
        subscriberTokenIds: [],
        expectedSubscriberTokenIds: [],
        subscriberCount: 0,
        alerts: [],
      },
      diagnostics: [],
    };

    redisGet.mockImplementation(async (key: string) => {
      if (key === 'test:cache') return JSON.stringify(peerPayload);
      return null;
    });

    const service = await createService();
    const res = await service.getHealth({ forceRefresh: true });

    expect(lockRelease).not.toHaveBeenCalled();
    expect(triggers.listWebhooksDetailed).not.toHaveBeenCalled();
    expect(res.servedFromCache).toBe(true);
    expect(res.overall).toBe('HEALTHY');
  });

  it('does not delete lock without acquiring (contended, no cache)', async () => {
    lockAcquire.mockResolvedValue({ acquired: false, reason: 'contended' });
    redisGet.mockResolvedValue(null);

    const service = await createService();
    const res = await service.getHealth({ forceRefresh: true });

    expect(lockRelease).not.toHaveBeenCalled();
    expect(triggers.listWebhooksDetailed).not.toHaveBeenCalled();
    expect(['UNKNOWN', 'STALE']).toContain(res.overall);
    expect(res.diagnostics.some((d) => d.includes('Replica'))).toBe(true);
  });
});
