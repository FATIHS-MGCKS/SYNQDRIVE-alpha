/**
 * STAGING multi-replica validation gate — P1.3 + P1.7 + P1.4
 *
 * Harness topology: TWO logical replicas (A/B) in one Jest process sharing an
 * in-memory Redis lock store. This is the closest deterministic integration
 * equivalent available without Docker/process-level staging.
 *
 * NOT full staging proof — see architecture/STAGING_MULTI_REPLICA_VALIDATION_P1_3_P1_7_P1_4_2026-08-30.md
 */
import { randomUUID } from 'crypto';
import { RedisDistributedLockService } from '@shared/redis/redis-distributed-lock.service';
import { SchedulerLeaderElectionService } from '@shared/scheduler-leader/scheduler-leader-election.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { SCHEDULER_LEADER_LEASE_KEY } from '@shared/scheduler-leader/scheduler-leader-election.redis';
import { ReconciliationExecutionMutexService } from '@shared/reconciliation-execution-mutex/reconciliation-execution-mutex.service';
import { DimoProviderBudgetService } from '@modules/dimo/provider-budget/dimo-provider-budget.service';
import { Registry } from 'prom-client';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

class SharedMemoryRedis {
  private store = new Map<string, { value: string; expiresAt: number }>();

  private purge(key: string) {
    const row = this.store.get(key);
    if (row && Date.now() >= row.expiresAt) this.store.delete(key);
  }

  async set(
    key: string,
    value: string,
    mode: string,
    px: number,
    nx?: string,
  ): Promise<'OK' | null> {
    this.purge(key);
    if (nx === 'NX' && this.store.has(key)) return null;
    void mode;
    this.store.set(key, { value, expiresAt: Date.now() + px });
    return 'OK';
  }

  async eval(script: string, _numKeys: number, key: string, ...args: string[]): Promise<number> {
    if (script === RELEASE_SCRIPT) {
      const token = args[0];
      const row = this.store.get(key);
      if (row?.value === token) {
        this.store.delete(key);
        return 1;
      }
      return 0;
    }
    if (script === EXTEND_SCRIPT) {
      const token = args[0];
      const ttl = parseInt(args[1], 10);
      const row = this.store.get(key);
      if (row?.value === token) {
        row.expiresAt = Date.now() + ttl;
        return 1;
      }
      return 0;
    }
    return 0;
  }

  evalBudget = jest.fn(async (_script: string, _n: number, ...args: string[]) => {
    const maxInFlight = Number(args[4]);
    const token = args[5];
    const key = 'dimo:budget:inflight';
    const members = (this as any).budgetMembers ?? ((this as any).budgetMembers = new Set<string>());
    if (members.has(token)) return [1, 'already'];
    if (members.size >= maxInFlight) return [0, 'at_limit'];
    members.add(token);
    return [1, 'acquired'];
  });

  async ping(): Promise<string> {
    return 'PONG';
  }
}

function buildLeaderReplica(redis: SharedMemoryRedis, suffix: string) {
  const config = {
    enabled: true,
    leaseMs: 30_000,
    renewIntervalMs: 10_000,
    acquireIntervalMs: 5_000,
  };
  const lockService = new RedisDistributedLockService(redis as any);
  const election = new SchedulerLeaderElectionService(config as any, lockService, redis as any);
  const guard = new SchedulerLeaderGuardService(election);
  void suffix;
  return { election, guard, lockService };
}

function buildMutexReplica(redis: SharedMemoryRedis) {
  const config = {
    enabled: true,
    lockTtlMs: 120_000,
    lockRenewEnabled: true,
    lockRenewIntervalMs: 30_000,
    lockAcquireTimeoutMs: 0,
  };
  const lockService = new RedisDistributedLockService(redis as any);
  const mutex = new ReconciliationExecutionMutexService(config as any, lockService);
  mutex.onModuleInit();
  return mutex;
}

function buildBudgetReplica(redis: SharedMemoryRedis) {
  const config = {
    globalBudgetEnabled: true,
    globalMaxInFlight: 10,
    globalAcquireTimeoutMs: 50,
    globalLeaseMs: 30_000,
    globalMaxRetries: 3,
    globalRetryAfterMaxMs: 120_000,
    reservedHighPrioritySlots: 2,
    starvationPromotionMs: 30_000,
    providerCooldown429Threshold: 5,
    providerCooldownMs: 60_000,
    acquirePollIntervalMs: 25,
  };
  const svc = new DimoProviderBudgetService(
    config as any,
    { eval: redis.evalBudget.bind(redis) } as any,
    { registry: new Registry() } as any,
  );
  svc.onModuleInit();
  return svc;
}

describe('STAGING gate — P1.3 + P1.7 + P1.4 cross-system', () => {
  let redis: SharedMemoryRedis;

  beforeEach(() => {
    redis = new SharedMemoryRedis();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('1 — leader schedules reconciliation; mutex serializes; budget shared across replicas', async () => {
    const replicaA = buildLeaderReplica(redis, 'A');
    const replicaB = buildLeaderReplica(redis, 'B');
    await replicaA.election.onModuleInit();
    await replicaB.election.onModuleInit();

    const mutexA = buildMutexReplica(redis);
    const mutexB = buildMutexReplica(redis);
    const budgetA = buildBudgetReplica(redis);
    const budgetB = buildBudgetReplica(redis);

    const schedulerTicks: string[] = [];
    const reconcileRuns: string[] = [];
    let maxBudgetInFlight = 0;

    const runScheduledReconcile = async (replica: 'A' | 'B') => {
      const guard = replica === 'A' ? replicaA.guard : replicaB.guard;
      if (!guard.shouldRun('trip_reconciliation_fast')) return;
      schedulerTicks.push(replica);
      const mutex = replica === 'A' ? mutexA : mutexB;
      const budget = replica === 'A' ? budgetA : budgetB;
      const result = await mutex.execute(
        { organizationId: 'org-1', vehicleId: 'veh-1', reconciliationType: 'trip' },
        async () => {
          const permit = await budget.acquirePermit({
            category: 'RECONCILIATION',
            priority: 'NORMAL',
          });
          maxBudgetInFlight = Math.max(
            maxBudgetInFlight,
            (redis as any).budgetMembers?.size ?? 0,
          );
          reconcileRuns.push(replica);
          await budget.releasePermit(permit);
          return 'ok';
        },
      );
      return result;
    };

    await Promise.all([runScheduledReconcile('A'), runScheduledReconcile('B')]);

    expect(schedulerTicks).toEqual(['A']);
    expect(reconcileRuns).toHaveLength(1);
    expect(maxBudgetInFlight).toBeLessThanOrEqual(10);
  });

  it('2 — graceful leader failover then follower may schedule', async () => {
    const leader = buildLeaderReplica(redis, 'leader');
    const follower = buildLeaderReplica(redis, 'follower');
    await leader.election.onModuleInit();
    await follower.election.onModuleInit();
    expect(leader.guard.isLeader()).toBe(true);
    expect(follower.guard.isLeader()).toBe(false);

    const started = Date.now();
    await leader.election.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(5_100);
    expect(follower.guard.isLeader()).toBe(true);
    const failoverMs = Date.now() - started;
    expect(failoverMs).toBeLessThanOrEqual(6_000);

    await follower.election.onModuleDestroy();
  });

  it('3 — Redis outage: mutex skip + budget fail-closed', async () => {
    const throwingRedis = {
      set: async () => {
        throw new Error('redis down');
      },
      eval: async () => 0,
    };
    const mutex = new ReconciliationExecutionMutexService(
      {
        enabled: true,
        lockTtlMs: 120_000,
        lockRenewEnabled: true,
        lockRenewIntervalMs: 30_000,
        lockAcquireTimeoutMs: 0,
      } as any,
      new RedisDistributedLockService(throwingRedis as any),
    );
    mutex.onModuleInit();

    const mutexResult = await mutex.execute(
      { organizationId: 'org-1', vehicleId: 'veh-1', reconciliationType: 'trip' },
      async () => 'mutated',
    );
    expect(mutexResult.status).toBe('skipped');
    if (mutexResult.status === 'skipped') {
      expect(mutexResult.reason).toBe('REDIS_UNAVAILABLE');
    }

    const budgetRedis = new SharedMemoryRedis();
    const budget = buildBudgetReplica(budgetRedis);
    budgetRedis.evalBudget.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(
      budget.acquirePermit({ category: 'RECONCILIATION', priority: 'NORMAL' }),
    ).rejects.toMatchObject({ code: 'REDIS_UNAVAILABLE' });
  });

  it('4 — stale scheduler token cannot release successor lease', async () => {
    const lockService = new RedisDistributedLockService(redis as any);
    const first = await lockService.acquire(SCHEDULER_LEADER_LEASE_KEY, 30_000);
    expect(first.acquired).toBe(true);
    if (!first.acquired) return;

    await lockService.release(first.handle);
    const second = await lockService.acquire(SCHEDULER_LEADER_LEASE_KEY, 30_000);
    expect(second.acquired).toBe(true);
    if (!second.acquired) return;

    const staleRelease = await lockService.release({
      key: SCHEDULER_LEADER_LEASE_KEY,
      token: randomUUID(),
      acquiredAt: new Date(),
    });
    expect(staleRelease).toBe(false);

    const validRelease = await lockService.release(second.handle);
    expect(validRelease).toBe(true);
  });
});
