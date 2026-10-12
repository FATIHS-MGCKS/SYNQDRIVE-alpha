import { Test } from '@nestjs/testing';
import dimoR9WebhookHealthConfig from '@config/dimo-r9-webhook-health.config';
import { DimoTriggersService } from '../../dimo/dimo-triggers.service';
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
          useValue: {
            cacheTtlMs: 45_000,
            minProviderFetchIntervalMs: 60_000,
            staleAfterMs: 300_000,
            authorizedCohortTokenIds: [186946, 187361, 187784, 192922],
            excludedTokenIds: [187336, 190497],
            redisCacheKey: 'test:cache',
            redisLockKey: 'test:lock',
            redisLastFetchKey: 'test:last',
          },
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
    triggers.getWebhookSubscriberEntries.mockImplementation(async (id: string) => ({
      entries: cohortSubs,
      error: null,
    }));

    const res = await service.getHealth({ forceRefresh: true });
    expect(res.overall).toBe('HEALTHY');
    expect(res.speed.healthy).toBe(true);
    expect(res.ignition.healthy).toBe(true);
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
});
