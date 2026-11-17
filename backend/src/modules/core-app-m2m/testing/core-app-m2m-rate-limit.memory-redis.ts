/**
 * In-memory Redis subset for P3-PR3 rate-limit tests (fixed-window consume script).
 */
export class CoreAppM2mRateLimitMemoryRedis {
  private readonly store = new Map<string, string>();
  private readonly ttl = new Map<string, number>();

  async eval(
    script: string,
    numKeys: number,
    key: string,
    limitRaw: string,
    ttlMsRaw: string,
  ): Promise<number> {
    if (numKeys !== 1 || !script.includes('INCR')) {
      throw new Error('Unsupported script in memory redis');
    }
    const limit = Number.parseInt(limitRaw, 10);
    const ttlMs = Number.parseInt(ttlMsRaw, 10);
    const current = Number.parseInt(this.store.get(key) ?? '0', 10);
    if (current + 1 > limit) {
      return 0;
    }
    const next = current + 1;
    this.store.set(key, String(next));
    if (next === 1) {
      this.ttl.set(key, ttlMs);
    }
    return 1;
  }

  snapshotCount(key: string): number {
    return Number.parseInt(this.store.get(key) ?? '0', 10);
  }

  clear(): void {
    this.store.clear();
    this.ttl.clear();
  }
}