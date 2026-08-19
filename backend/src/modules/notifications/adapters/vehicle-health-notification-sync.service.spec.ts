import { NotificationEvaluationService } from '../runtime/notification-evaluation.service';
import { NotificationEvaluationObservabilityService } from '../runtime/notification-evaluation-observability.service';
import { RedisDistributedLockService } from '@shared/redis/redis-distributed-lock.service';
import { randomUUID } from 'crypto';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';

describe('Fleet readiness notification sync independence', () => {
  const orgId = 'org-bi-disabled';

  let fleetSyncRuns: number;
  let insightsRuns: number;

  const fleetReadinessSync = {
    syncForOrganization: jest.fn(async () => {
      fleetSyncRuns++;
    }),
  };

  const insightsService = {
    runForOrganization: jest.fn(async () => {
      insightsRuns++;
      return { runId: '', published: 0 };
    }),
  };

  const lockService = {
    lockKeyForOrganization: (id: string) => `notification:eval:lock:${id}`,
    acquire: jest.fn(async () => ({
      acquired: true as const,
      handle: { key: 'k', token: 't', acquiredAt: new Date() },
    })),
    release: jest.fn(async () => true),
    extend: jest.fn(async () => true),
  } as unknown as RedisDistributedLockService;

  const redis = {
    lrange: jest.fn(async () => []),
    del: jest.fn(async () => 0),
    get: jest.fn(async () => null),
    set: jest.fn(async () => 'OK'),
    rpush: jest.fn(async () => 1),
  };

  const queue = {
    getJob: jest.fn(async () => null),
    add: jest.fn(),
  };

  let evaluation: NotificationEvaluationService;

  beforeEach(() => {
    RuntimeStatusRegistry.setWorkersEnabled(true);
    fleetSyncRuns = 0;
    insightsRuns = 0;
    jest.clearAllMocks();

    evaluation = new NotificationEvaluationService(
      queue as any,
      {
        queueEnabled: false,
        debounceWindowMs: 120_000,
        lockTtlMs: 300_000,
        lockHeartbeatMs: 60_000,
        jobAttempts: 4,
        jobBackoffMs: 5_000,
        bootStaggerMs: 15_000,
      },
      redis as any,
      lockService,
      new NotificationEvaluationObservabilityService(),
      insightsService as any,
      fleetReadinessSync as any,
    );
  });

  afterEach(() => {
    RuntimeStatusRegistry.setWorkersEnabled(false);
  });

  it('runs fleet readiness sync even when Business Insights policy is disabled (published=0)', async () => {
    await evaluation.executeRun({
      organizationId: orgId,
      triggerType: 'scheduled_active',
      triggerClass: 'scheduled',
      scheduledAt: new Date().toISOString(),
      runId: randomUUID(),
    });

    expect(insightsRuns).toBe(1);
    expect(fleetSyncRuns).toBe(1);
    expect(fleetReadinessSync.syncForOrganization).toHaveBeenCalledWith(
      orgId,
      expect.any(String),
    );
  });

  it('runs fleet readiness sync even when Business Insights run throws', async () => {
    insightsService.runForOrganization.mockImplementationOnce(async () => {
      insightsRuns++;
      throw new Error('BI detector crash');
    });

    await expect(
      evaluation.executeRun({
        organizationId: orgId,
        triggerType: 'scheduled_active',
        triggerClass: 'scheduled',
        scheduledAt: new Date().toISOString(),
        runId: randomUUID(),
      }),
    ).rejects.toThrow('BI detector crash');

    expect(insightsRuns).toBe(1);
    expect(fleetSyncRuns).toBe(1);
    expect(fleetReadinessSync.syncForOrganization).toHaveBeenCalledWith(
      orgId,
      expect.any(String),
    );
  });
});
