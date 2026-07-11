import { randomUUID } from 'crypto';
import { RedisDistributedLockService } from './redis-distributed-lock.service';

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
}

describe('RedisDistributedLockService', () => {
  let redis: MemoryRedisLock;
  let locks: RedisDistributedLockService;

  beforeEach(() => {
    redis = new MemoryRedisLock();
    locks = new RedisDistributedLockService(redis as any);
  });

  it('acquires and releases with matching token only', async () => {
    const first = await locks.acquire('lock:a', 5_000);
    expect(first.acquired).toBe(true);
    if (!first.acquired) return;

    const second = await locks.acquire('lock:a', 5_000);
    expect(second.acquired).toBe(false);

    const released = await locks.release(first.handle);
    expect(released).toBe(true);

    const third = await locks.acquire('lock:a', 5_000);
    expect(third.acquired).toBe(true);
  });

  it('rejects release with wrong token (compare-and-delete)', async () => {
    const acquired = await locks.acquire('lock:b', 5_000);
    expect(acquired.acquired).toBe(true);
    if (!acquired.acquired) return;

    const wrongToken = { ...acquired.handle, token: randomUUID() };
    expect(await locks.release(wrongToken)).toBe(false);
    expect((await locks.acquire('lock:b', 5_000)).acquired).toBe(false);
  });

  it('extends TTL for holder only', async () => {
    const acquired = await locks.acquire('lock:c', 1_000);
    expect(acquired.acquired).toBe(true);
    if (!acquired.acquired) return;
    expect(await locks.extend(acquired.handle, 10_000)).toBe(true);
  });

  it('lock expires — another instance can acquire', async () => {
    jest.useFakeTimers();
    const acquired = await locks.acquire('lock:d', 500);
    expect(acquired.acquired).toBe(true);
    jest.advanceTimersByTime(600);
    const next = await locks.acquire('lock:d', 500);
    expect(next.acquired).toBe(true);
    jest.useRealTimers();
  });
});
