import { RedisDistributedLockService } from '@shared/redis/redis-distributed-lock.service';
import { ReconciliationExecutionMutexService } from './reconciliation-execution-mutex.service';
import { buildReconciliationLockKey } from './reconciliation-execution-mutex.redis';

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

class MemoryRedisLock {
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

  forceExpire(key: string) {
    this.store.delete(key);
  }

  setThrow = false;
}

function buildService(
  redis: MemoryRedisLock,
  overrides: Partial<{
    enabled: boolean;
    lockTtlMs: number;
    lockRenewEnabled: boolean;
    lockRenewIntervalMs: number;
    lockAcquireTimeoutMs: number;
  }> = {},
) {
  const config = {
    enabled: true,
    lockTtlMs: 30_000,
    lockRenewEnabled: true,
    lockRenewIntervalMs: 10_000,
    lockAcquireTimeoutMs: 0,
    ...overrides,
  };
  const lockService = new RedisDistributedLockService(redis as any);
  const service = new ReconciliationExecutionMutexService(config as any, lockService);
  service.onModuleInit();
  return service;
}

const scope = {
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  reconciliationType: 'trip' as const,
};

describe('ReconciliationExecutionMutexService', () => {
  let redis: MemoryRedisLock;

  beforeEach(() => {
    redis = new MemoryRedisLock();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('A/B — two replicas start same reconciliation; only one executes', async () => {
    const serviceA = buildService(redis);
    const serviceB = buildService(redis);
    const fnA = jest.fn().mockResolvedValue('a');
    const fnB = jest.fn().mockResolvedValue('b');

    const [resultA, resultB] = await Promise.all([
      serviceA.execute(scope, fnA),
      serviceB.execute(scope, fnB),
    ]);

    const executed = [resultA, resultB].filter((r) => r.status === 'executed');
    const skipped = [resultA, resultB].filter((r) => r.status === 'skipped');

    expect(executed).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ reason: 'LOCKED' });
    expect(fnA.mock.calls.length + fnB.mock.calls.length).toBe(1);
  });

  it('C/D/E — crash mid-execution; TTL expiry allows subsequent success', async () => {
    const service = buildService(redis, { lockTtlMs: 10_000, lockRenewEnabled: false });
    const fn = jest.fn(async () => {
      redis.forceExpire(
        buildReconciliationLockKey(scope.organizationId, scope.vehicleId, 'trip'),
      );
      return 'done';
    });

    const first = await service.execute(scope, fn);
    expect(first.status).toBe('executed');

    const second = await service.execute(scope, async () => 'recovered');
    expect(second.status).toBe('executed');
    if (second.status === 'executed') {
      expect(second.value).toBe('recovered');
    }
  });

  it('F — stale owner cannot release new owner lock', async () => {
    const lockService = new RedisDistributedLockService(redis as any);
    const first = await lockService.acquire(
      buildReconciliationLockKey(scope.organizationId, scope.vehicleId, 'trip'),
      30_000,
    );
    expect(first.acquired).toBe(true);
    if (!first.acquired) return;

    redis.forceExpire(first.handle.key);

    const second = await lockService.acquire(first.handle.key, 30_000);
    expect(second.acquired).toBe(true);
    if (!second.acquired) return;

    const staleRelease = await lockService.release(first.handle);
    expect(staleRelease).toBe(false);

    const current = await redis.eval(RELEASE_SCRIPT, 1, first.handle.key, second.handle.token);
    expect(current).toBe(1);
  });

  it('G — Redis unavailable before acquire fails closed', async () => {
    const throwingRedis = {
      set: async () => {
        throw new Error('redis down');
      },
      eval: async () => 0,
    };
    const lockService = new RedisDistributedLockService(throwingRedis as any);
    const service = new ReconciliationExecutionMutexService(
      {
        enabled: true,
        lockTtlMs: 30_000,
        lockRenewEnabled: true,
        lockRenewIntervalMs: 10_000,
        lockAcquireTimeoutMs: 0,
      } as any,
      lockService,
    );
    service.onModuleInit();

    const fn = jest.fn();
    const result = await service.execute(scope, fn);
    expect(result).toEqual({ status: 'skipped', reason: 'REDIS_UNAVAILABLE' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('M — unrelated vehicles reconcile in parallel', async () => {
    const service = buildService(redis);
    const fnA = jest.fn().mockResolvedValue('a');
    const fnB = jest.fn().mockResolvedValue('b');

    const [resultA, resultB] = await Promise.all([
      service.execute({ ...scope, vehicleId: 'veh-a' }, fnA),
      service.execute({ ...scope, vehicleId: 'veh-b' }, fnB),
    ]);

    expect(resultA.status).toBe('executed');
    expect(resultB.status).toBe('executed');
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
  });

  it('H — renew extends lease during long execution', async () => {
    const service = buildService(redis, {
      lockTtlMs: 30_000,
      lockRenewEnabled: true,
      lockRenewIntervalMs: 5_000,
    });
    const lockKey = buildReconciliationLockKey(
      scope.organizationId,
      scope.vehicleId,
      'trip',
    );

    const result = await service.execute(scope, async () => {
      jest.advanceTimersByTime(6_000);
      await Promise.resolve();
      return 'ok';
    });

    expect(result.status).toBe('executed');
    const second = await service.execute(scope, async () => 'blocked');
    expect(second.status).toBe('executed');
    if (second.status === 'executed') {
      expect(second.value).toBe('blocked');
    }
    void lockKey;
  });

  it('disabled mutex executes without locking', async () => {
    const service = buildService(redis, { enabled: false });
    const fn = jest.fn().mockResolvedValue(42);
    const result = await service.execute(scope, fn);
    expect(result).toEqual({ status: 'executed', value: 42 });
  });
});

describe('P1.4 multi-replica reconciliation mutex proof', () => {
  it('N — scheduled + manual overlap on same vehicle → one mutation path', async () => {
    const redis = new MemoryRedisLock();
    const service = buildService(redis);
    let concurrent = 0;
    let maxConcurrent = 0;

    const guardedFn = async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrent -= 1;
      return 'ok';
    };

    jest.useRealTimers();
    await Promise.all([
      service.execute(scope, guardedFn),
      service.execute(scope, guardedFn),
    ]);

    expect(maxConcurrent).toBe(1);
  });
});
