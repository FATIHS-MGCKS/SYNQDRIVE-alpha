import { randomUUID } from 'crypto';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { NotificationEvaluationService } from './notification-evaluation.service';
import { NotificationEvaluationObservabilityService } from './notification-evaluation-observability.service';
import { RedisDistributedLockService } from '@shared/redis/redis-distributed-lock.service';
import { buildNotificationEvaluationJobId } from './notification-evaluation-queue.util';

describe('NotificationEvaluationService — concurrency & recovery', () => {
  const orgId = 'org-concurrency';

  let queueJobs: Map<string, any>;
  let queueStates: Map<string, string>;
  let redisStore: Map<string, string>;
  let redisLists: Map<string, string[]>;
  let lockHolder: string | null;
  let lockToken: string | null;
  let insightsRuns: number;
  let evaluation: NotificationEvaluationService;
  let observability: NotificationEvaluationObservabilityService;

  const queue = {
    getJob: jest.fn(async (jobId: string) => {
      const data = queueJobs.get(jobId);
      if (!data) return null;
      return {
        id: jobId,
        data,
        getState: async () => queueStates.get(jobId) ?? 'waiting',
        remove: async () => {
          queueJobs.delete(jobId);
          queueStates.delete(jobId);
        },
      };
    }),
    add: jest.fn(async (_name: string, data: any, opts: { jobId: string; delay?: number }) => {
      if (queueJobs.has(opts.jobId) && queueStates.get(opts.jobId) !== 'completed') {
        throw new Error(`Job ${opts.jobId} already exists`);
      }
      queueJobs.set(opts.jobId, data);
      queueStates.set(opts.jobId, opts.delay ? 'delayed' : 'waiting');
      return { id: opts.jobId };
    }),
  };

  const redis = {
    rpush: jest.fn(async (key: string, value: string) => {
      const list = redisLists.get(key) ?? [];
      list.push(value);
      redisLists.set(key, list);
      return list.length;
    }),
    lrange: jest.fn(async (key: string) => redisLists.get(key) ?? []),
    del: jest.fn(async (...keys: string[]) => {
      let n = 0;
      for (const k of keys) {
        if (redisStore.delete(k)) n++;
        if (redisLists.delete(k)) n++;
      }
      return n;
    }),
    get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return 'OK';
    }),
  };

  const lockService = {
    lockKeyForOrganization: (id: string) => `notification:eval:lock:${id}`,
    acquire: jest.fn(async (key: string) => {
      if (lockHolder) return { acquired: false as const, reason: 'contended' as const };
      lockToken = randomUUID();
      lockHolder = key;
      return { acquired: true as const, handle: { key, token: lockToken, acquiredAt: new Date() } };
    }),
    release: jest.fn(async () => {
      lockHolder = null;
      lockToken = null;
      return true;
    }),
    extend: jest.fn(async () => true),
  } as unknown as RedisDistributedLockService;

  const insightsService = {
    runForOrganization: jest.fn(async () => {
      insightsRuns++;
      return { runId: `insight-${insightsRuns}`, published: 3 };
    }),
  };

  beforeEach(() => {
    RuntimeStatusRegistry.setWorkersEnabled(true);
    queueJobs = new Map();
    queueStates = new Map();
    redisStore = new Map();
    redisLists = new Map();
    lockHolder = null;
    lockToken = null;
    insightsRuns = 0;
    jest.clearAllMocks();
    observability = new NotificationEvaluationObservabilityService();
    evaluation = new NotificationEvaluationService(
      queue as any,
      {
        queueEnabled: true,
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
    );
  });

  afterEach(() => {
    RuntimeStatusRegistry.setWorkersEnabled(false);
  });

  it('scheduler and trigger share deterministic job IDs per trigger class', async () => {
    await evaluation.scheduleDebouncedEvaluation(orgId, 'event_a');
    await evaluation.scheduleScheduledEvaluation(orgId, 'scheduled', 'scheduled_active');

    expect(queueJobs.has(buildNotificationEvaluationJobId(orgId, 'debounced'))).toBe(true);
    expect(queueJobs.has(buildNotificationEvaluationJobId(orgId, 'scheduled'))).toBe(true);
  });

  it('coalesces duplicate debounced enqueue while job is delayed', async () => {
    await evaluation.scheduleDebouncedEvaluation(orgId, 'event_a');
    await evaluation.scheduleDebouncedEvaluation(orgId, 'event_b');

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(observability.getCounter('job_coalesced')).toBeGreaterThanOrEqual(1);
    const pending = redisLists.get(`notification:eval:pending:${orgId}`) ?? [];
    expect(pending).toContain('event_a');
    expect(pending).toContain('event_b');
  });

  it('two workers: second run skips on lock contention and schedules follow-up', async () => {
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    insightsService.runForOrganization.mockImplementation(async () => {
      insightsRuns++;
      await gate;
      return { runId: `insight-${insightsRuns}`, published: 3 };
    });

    const job = {
      organizationId: orgId,
      triggerType: 'debounced_event',
      triggerClass: 'debounced' as const,
      scheduledAt: new Date().toISOString(),
      runId: randomUUID(),
    };

    const p1 = evaluation.executeRun(job);
    await Promise.resolve();
    const p2 = evaluation.executeRun({ ...job, runId: randomUUID() });
    releaseFirst();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.skipped).toBeFalsy();
    expect(r2.skipped).toBe(true);
    expect(r2.skipReason).toBe('lock_contended');
    expect(r2.followUpScheduled).toBe(true);
    expect(insightsRuns).toBe(1);
    expect(observability.getCounter('lock_contention')).toBe(1);
  });

  it('follow-up run executes after first completes with pending events', async () => {
    await redis.rpush(`notification:eval:pending:${orgId}`, 'event_during_run');
    await redis.set(`notification:eval:followup:${orgId}`, '1');

    const first = await evaluation.executeRun({
      organizationId: orgId,
      triggerType: 'debounced_event',
      triggerClass: 'debounced',
      scheduledAt: new Date().toISOString(),
      runId: randomUUID(),
    });
    expect(first.followUpScheduled).toBe(true);

    queueStates.set(buildNotificationEvaluationJobId(orgId, 'debounced'), 'completed');
    await evaluation.scheduleDebouncedEvaluation(orgId, 'event_followup');
    expect(queue.add).toHaveBeenCalled();
  });

  it('duplicate job delivery is idempotent under org lock', async () => {
    const job = {
      organizationId: orgId,
      triggerType: 'scheduled_active',
      triggerClass: 'scheduled' as const,
      scheduledAt: new Date().toISOString(),
      runId: randomUUID(),
    };

    await evaluation.executeRun(job);
    lockHolder = null;
    await evaluation.executeRun(job);
    expect(insightsRuns).toBe(2);
  });

  it('redis unavailable on lock acquire skips without throwing', async () => {
    (lockService.acquire as jest.Mock).mockResolvedValueOnce({
      acquired: false,
      reason: 'redis_unavailable',
    });

    const result = await evaluation.executeRun({
      organizationId: orgId,
      triggerType: 'debounced_event',
      triggerClass: 'debounced',
      scheduledAt: new Date().toISOString(),
      runId: randomUUID(),
    });

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('lock_redis_unavailable');
    expect(insightsRuns).toBe(0);
  });

  it('run context includes stats fields from insights publish count', async () => {
    const result = await evaluation.executeRun({
      organizationId: orgId,
      triggerType: 'scheduled_active',
      triggerClass: 'scheduled',
      scheduledAt: new Date().toISOString(),
      runId: randomUUID(),
    });

    expect(result.runId).toBeDefined();
    expect(result.stats.candidateCount).toBe(3);
    expect(result.publishedCount).toBe(3);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
