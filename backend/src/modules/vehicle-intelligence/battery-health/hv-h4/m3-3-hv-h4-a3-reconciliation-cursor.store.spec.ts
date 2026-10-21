import { M3_3HvH4A3ReconciliationCursorStore } from './m3-3-hv-h4-a3-reconciliation-cursor.store';

class InMemoryRedis {
  private data = new Map<string, string>();
  private fail = false;

  setFail(v: boolean) {
    this.fail = v;
  }

  async get(key: string): Promise<string | null> {
    if (this.fail) throw new Error('redis down');
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    if (this.fail) throw new Error('redis down');
    this.data.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0;
  }
}

describe('M3_3HvH4A3ReconciliationCursorStore', () => {
  it('loads ABSENT when key missing', async () => {
    const redis = new InMemoryRedis();
    const store = new M3_3HvH4A3ReconciliationCursorStore(redis as never);
    expect(await store.load()).toEqual({ status: 'ABSENT' });
  });

  it('round-trips cursor tuple', async () => {
    const redis = new InMemoryRedis();
    const store = new M3_3HvH4A3ReconciliationCursorStore(redis as never);
    const cursor = {
      organizationId: '10000000-0000-4000-8000-000000000001',
      vehicleId: '20000000-0000-4000-8000-000000000002',
      id: '30000000-0000-4000-8000-000000000003',
    };
    await store.save(cursor);
    expect(await store.load()).toEqual({ status: 'OK', cursor });
  });

  it('malformed cursor → MALFORMED', async () => {
    const redis = new InMemoryRedis();
    const store = new M3_3HvH4A3ReconciliationCursorStore(redis as never);
    await redis.set('battery:hv:h4:a3:reconciliation:cursor:v1', '{"bad":true}');
    expect(await store.load()).toEqual({ status: 'MALFORMED' });
  });

  it('redis unavailable → UNAVAILABLE', async () => {
    const redis = new InMemoryRedis();
    redis.setFail(true);
    const store = new M3_3HvH4A3ReconciliationCursorStore(redis as never);
    expect(await store.load()).toEqual({ status: 'UNAVAILABLE' });
  });
});
