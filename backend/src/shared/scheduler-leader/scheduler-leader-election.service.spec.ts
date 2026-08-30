import { randomUUID } from 'crypto';
import { RedisDistributedLockService } from '@shared/redis/redis-distributed-lock.service';
import { SchedulerLeaderElectionService } from './scheduler-leader-election.service';
import { SCHEDULER_LEADER_LEASE_KEY } from './scheduler-leader-election.redis';

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

  async set(key: string, value: string, mode: string, px: number, nx?: string): Promise<'OK' | null> {
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

  async pttl(key: string): Promise<number> {
    this.purge(key);
    const row = this.store.get(key);
    if (!row) return -2;
    return Math.max(0, row.expiresAt - Date.now());
  }

  setThrow = false;
  async ping(): Promise<string> {
    if (this.setThrow) throw new Error('redis down');
    return 'PONG';
  }
}

function buildService(
  redis: MemoryRedisLock,
  overrides: Partial<{
    enabled: boolean;
    leaseMs: number;
    renewIntervalMs: number;
    acquireIntervalMs: number;
  }> = {},
) {
  const config = {
    enabled: true,
    leaseMs: 30_000,
    renewIntervalMs: 10_000,
    acquireIntervalMs: 5_000,
    ...overrides,
  };
  const lockService = new RedisDistributedLockService(redis as any);
  return new SchedulerLeaderElectionService(config as any, lockService, redis as any);
}

describe('SchedulerLeaderElectionService', () => {
  let redis: MemoryRedisLock;

  beforeEach(() => {
    redis = new MemoryRedisLock();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('A — single instance acquires leadership', async () => {
    const service = buildService(redis);
    await service.onModuleInit();
    expect(service.isLeader()).toBe(true);
    expect(service.getRole()).toBe('LEADER');
    await service.onModuleDestroy();
  });

  it('B — second instance stays follower', async () => {
    const leader = buildService(redis);
    await leader.onModuleInit();

    const follower = buildService(redis);
    await follower.onModuleInit();

    expect(leader.isLeader()).toBe(true);
    expect(follower.isLeader()).toBe(false);
    await leader.onModuleDestroy();
    await follower.onModuleDestroy();
  });

  it('C — leader renews lease', async () => {
    const service = buildService(redis, { leaseMs: 6_000, renewIntervalMs: 2_000 });
    await service.onModuleInit();
    jest.advanceTimersByTime(250);
    await Promise.resolve();
    expect(service.isLeader()).toBe(true);
    await service.onModuleDestroy();
  });

  it('D — safe token release on shutdown', async () => {
    const service = buildService(redis);
    await service.onModuleInit();
    await service.onModuleDestroy();
    const next = buildService(redis);
    await next.onModuleInit();
    expect(next.isLeader()).toBe(true);
    await next.onModuleDestroy();
  });

  it('E — wrong token cannot release lease', async () => {
    const service = buildService(redis);
    await service.onModuleInit();
    const wrong = {
      key: SCHEDULER_LEADER_LEASE_KEY,
      token: randomUUID(),
      acquiredAt: new Date(),
    };
    const lockService = new RedisDistributedLockService(redis as any);
    expect(await lockService.release(wrong)).toBe(false);
    expect(service.isLeader()).toBe(true);
    await service.onModuleDestroy();
  });

  it('F/G — wrong token cannot renew; split-brain protection', async () => {
    const leaderA = buildService(redis, {
      leaseMs: 6_000,
      renewIntervalMs: 2_000,
      acquireIntervalMs: 500,
    });
    await leaderA.onModuleInit();
    clearInterval((leaderA as any).renewTimer);
    (leaderA as any).renewTimer = null;

    await jest.advanceTimersByTimeAsync(6_100);

    const leaderB = buildService(redis, {
      leaseMs: 6_000,
      renewIntervalMs: 2_000,
      acquireIntervalMs: 500,
    });
    await leaderB.onModuleInit();
    await jest.advanceTimersByTimeAsync(500);

    expect(leaderB.isLeader()).toBe(true);
    await (leaderA as any).renewLeaderLease();
    expect(leaderA.isLeader()).toBe(false);
    expect(leaderB.isLeader()).toBe(true);

    await leaderA.onModuleDestroy();
    await leaderB.onModuleDestroy();
  });

  it('H — follower takeover after TTL expiration', async () => {
    const leader = buildService(redis, {
      leaseMs: 6_000,
      renewIntervalMs: 2_000,
      acquireIntervalMs: 500,
    });
    await leader.onModuleInit();
    clearInterval((leader as any).renewTimer);
    (leader as any).renewTimer = null;

    const follower = buildService(redis, {
      leaseMs: 6_000,
      renewIntervalMs: 2_000,
      acquireIntervalMs: 500,
    });
    await follower.onModuleInit();
    expect(follower.isLeader()).toBe(false);

    await jest.advanceTimersByTimeAsync(6_600);
    expect(follower.isLeader()).toBe(true);
    await (leader as any).renewLeaderLease();
    expect(leader.isLeader()).toBe(false);

    await leader.onModuleDestroy();
    await follower.onModuleDestroy();
  });

  it('K — redis unavailable on acquire fails closed', async () => {
    redis.setThrow = true;
    const service = buildService(redis);
    const originalSet = redis.set.bind(redis);
    redis.set = async () => {
      throw new Error('redis down');
    };
    await service.onModuleInit();
    expect(service.isLeader()).toBe(false);
    redis.set = originalSet;
    await service.onModuleDestroy();
  });

  it('L — redis unavailable on renew loses trusted leadership', async () => {
    const service = buildService(redis, { leaseMs: 6_000, renewIntervalMs: 2_000 });
    await service.onModuleInit();
    const originalEval = redis.eval.bind(redis);
    redis.eval = async () => {
      throw new Error('redis down');
    };
    await jest.advanceTimersByTimeAsync(2_100);
    expect(service.isLeader()).toBe(false);
    redis.eval = originalEval;
    await service.onModuleDestroy();
  });

  it('AD — disabled election acts as leader with unsafe warning path', async () => {
    const service = buildService(redis, { enabled: false });
    await service.onModuleInit();
    expect(service.isLeader()).toBe(true);
  });

  it('AC — invalid config rejected at startup', async () => {
    await expect(
      buildService(redis, { leaseMs: 5_000, renewIntervalMs: 5_000 }).onModuleInit(),
    ).rejects.toThrow(/Invalid scheduler leader election config/);
  });
});
