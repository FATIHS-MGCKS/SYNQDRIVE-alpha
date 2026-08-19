import { randomUUID } from 'crypto';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { NotificationEvaluationService } from './notification-evaluation.service';
import { NotificationEvaluationObservabilityService } from './notification-evaluation-observability.service';
import { RedisDistributedLockService } from '@shared/redis/redis-distributed-lock.service';
import { EvaluationsObservabilityService } from '@modules/evaluations-observability/evaluations-observability.service';

describe('NotificationEvaluationService — terminal observability', () => {
  const orgId = 'org-terminal-obs';

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

  const insightsService = {
    runForOrganization: jest.fn(async () => ({ runId: 'insight-1', published: 2 })),
  };

  const fleetReadinessSync = {
    syncForOrganization: jest.fn(async () => undefined),
  };

  const evaluationsObservability = {
    createCorrelationId: jest.fn((runId: string) => runId),
    observeEvaluationJob: jest.fn(),
    recordCache: jest.fn(),
    recordRedisFailure: jest.fn(),
  } as unknown as EvaluationsObservabilityService;

  let evaluation: NotificationEvaluationService;
  let observability: NotificationEvaluationObservabilityService;

  const job = () => ({
    organizationId: orgId,
    triggerType: 'scheduled_active',
    triggerClass: 'scheduled' as const,
    scheduledAt: new Date().toISOString(),
    runId: randomUUID(),
  });

  beforeEach(() => {
    RuntimeStatusRegistry.setWorkersEnabled(true);
    jest.clearAllMocks();

    observability = new NotificationEvaluationObservabilityService();
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
      observability,
      insightsService as any,
      fleetReadinessSync as any,
      evaluationsObservability,
    );
  });

  afterEach(() => {
    RuntimeStatusRegistry.setWorkersEnabled(false);
  });

  function errorObservations() {
    return (evaluationsObservability.observeEvaluationJob as jest.Mock).mock.calls.filter(
      (call) => call[2] === 'error',
    );
  }

  function successObservations() {
    return (evaluationsObservability.observeEvaluationJob as jest.Mock).mock.calls.filter(
      (call) => call[2] === 'success',
    );
  }

  it('success: fleet sync runs, one success observation, failureCount 0', async () => {
    const result = await evaluation.executeRun(job());

    expect(result.stats.failureCount).toBe(0);
    expect(fleetReadinessSync.syncForOrganization).toHaveBeenCalledTimes(1);
    expect(successObservations()).toHaveLength(1);
    expect(errorObservations()).toHaveLength(0);
  });

  it('BI throws + fleet succeeds: fleet sync runs, one terminal error observation, failureCount 1', async () => {
    insightsService.runForOrganization.mockRejectedValueOnce(new Error('BI crash'));

    await expect(evaluation.executeRun(job())).rejects.toThrow('BI crash');

    expect(fleetReadinessSync.syncForOrganization).toHaveBeenCalledTimes(1);
    expect(errorObservations()).toHaveLength(1);
    expect(successObservations()).toHaveLength(0);
    expect((evaluationsObservability.observeEvaluationJob as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('BI succeeds + fleet throws: one terminal error observation, failureCount 1', async () => {
    fleetReadinessSync.syncForOrganization.mockRejectedValueOnce(new Error('Fleet sync crash'));

    await expect(evaluation.executeRun(job())).rejects.toThrow('Fleet sync crash');

    expect(fleetReadinessSync.syncForOrganization).toHaveBeenCalledTimes(1);
    expect(errorObservations()).toHaveLength(1);
    expect((evaluationsObservability.observeEvaluationJob as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('BI and fleet both throw: fleet sync attempted, failureCount 2, one terminal error observation', async () => {
    insightsService.runForOrganization.mockRejectedValueOnce(new Error('BI crash'));
    fleetReadinessSync.syncForOrganization.mockRejectedValueOnce(new Error('Fleet sync crash'));

    await expect(evaluation.executeRun(job())).rejects.toThrow('BI crash');

    expect(fleetReadinessSync.syncForOrganization).toHaveBeenCalledTimes(1);
    expect(errorObservations()).toHaveLength(1);
    expect((evaluationsObservability.observeEvaluationJob as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('unexpected error outside BI/fleet: one terminal error observation, failureCount 1', async () => {
    jest
      .spyOn(observability, 'logRunCompleted')
      .mockImplementationOnce(() => {
        throw new Error('Observability crash');
      });

    await expect(evaluation.executeRun(job())).rejects.toThrow('Observability crash');

    expect(insightsService.runForOrganization).toHaveBeenCalledTimes(1);
    expect(fleetReadinessSync.syncForOrganization).toHaveBeenCalledTimes(1);
    expect(errorObservations()).toHaveLength(1);
    expect(successObservations()).toHaveLength(0);
    expect((evaluationsObservability.observeEvaluationJob as jest.Mock).mock.calls).toHaveLength(1);
  });
});
