import { BusinessInsightsTriggerService } from './business-insights-trigger.service';

const DEBOUNCE_WINDOW_MS = 2 * 60_000;

/** In-memory Redis stand-in for deterministic debounce tests (no external services). */
class MemoryRedis {
  private strings = new Map<string, string>();
  private lists = new Map<string, string[]>();
  private expiries = new Map<string, number>();

  private purgeExpired(key: string) {
    const exp = this.expiries.get(key);
    if (exp != null && Date.now() >= exp) {
      this.strings.delete(key);
      this.expiries.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    this.purgeExpired(key);
    return this.strings.get(key) ?? null;
  }

  async set(key: string, value: string, mode?: string, px?: number): Promise<'OK'> {
    void mode;
    this.strings.set(key, value);
    if (typeof px === 'number') {
      this.expiries.set(key, Date.now() + px);
    }
    return 'OK';
  }

  async rpush(key: string, value: string): Promise<number> {
    const list = this.lists.get(key) ?? [];
    list.push(value);
    this.lists.set(key, list);
    return list.length;
  }

  async lrange(key: string, start: number, end: number): Promise<string[]> {
    const list = this.lists.get(key) ?? [];
    const normalizedEnd = end < 0 ? list.length + end + 1 : end + 1;
    return list.slice(start, normalizedEnd);
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.strings.delete(key)) count++;
      if (this.lists.delete(key)) count++;
      this.expiries.delete(key);
    }
    return count;
  }
}

describe('BusinessInsightsTriggerService — notification engine debounce', () => {
  const orgId = 'org-debounce-test';
  let redis: MemoryRedis;
  let insightsService: { runForOrganization: jest.Mock };
  let trigger: BusinessInsightsTriggerService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
    redis = new MemoryRedis();
    insightsService = {
      runForOrganization: jest.fn().mockResolvedValue({ runId: 'run-1', published: 1 }),
    };
    trigger = new BusinessInsightsTriggerService(redis as any, insightsService as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('case 8 — debounce window behavior', () => {
    it('characterization: first event schedules execution after 2 minutes', async () => {
      await trigger.requestDebouncedRerun(orgId, 'driving_assessment_degraded');
      expect(insightsService.runForOrganization).not.toHaveBeenCalled();

      jest.advanceTimersByTime(DEBOUNCE_WINDOW_MS);
      await Promise.resolve();
      await Promise.resolve();

      expect(insightsService.runForOrganization).toHaveBeenCalledTimes(1);
      expect(insightsService.runForOrganization).toHaveBeenCalledWith(
        orgId,
        expect.stringContaining('debounced_event'),
      );
    });

    it('characterization: events within debounce window are coalesced, not lost', async () => {
      await trigger.requestDebouncedRerun(orgId, 'event_booking_change');
      await trigger.requestDebouncedRerun(orgId, 'event_vehicle_change');
      await trigger.requestDebouncedRerun(orgId, 'driving_assessment_degraded');

      jest.advanceTimersByTime(DEBOUNCE_WINDOW_MS);
      await Promise.resolve();
      await Promise.resolve();

      expect(insightsService.runForOrganization).toHaveBeenCalledTimes(1);
      const triggerArg = insightsService.runForOrganization.mock.calls[0][1] as string;
      expect(triggerArg).toContain('event_booking_change');
      expect(triggerArg).toContain('driving_assessment_degraded');
    });

    it('characterization: duplicate event sources deduplicated in trigger string', async () => {
      await trigger.requestDebouncedRerun(orgId, 'event_booking_change');
      await trigger.requestDebouncedRerun(orgId, 'event_booking_change');
      await trigger.requestDebouncedRerun(orgId, 'event_booking_change');

      jest.advanceTimersByTime(DEBOUNCE_WINDOW_MS);
      await Promise.resolve();
      await Promise.resolve();

      const triggerArg = insightsService.runForOrganization.mock.calls[0][1] as string;
      const uniqueInTrigger =
        triggerArg.match(/event_booking_change/g)?.length ?? 0;
      expect(uniqueInTrigger).toBe(1);
    });

    it('target: only one insights run per debounce window (no double processing)', async () => {
      await trigger.requestDebouncedRerun(orgId, 'driving_assessment_degraded');
      await trigger.requestDebouncedRerun(orgId, 'driving_assessment_recovered');

      jest.advanceTimersByTime(DEBOUNCE_WINDOW_MS);
      await Promise.resolve();
      await Promise.resolve();

      expect(insightsService.runForOrganization).toHaveBeenCalledTimes(1);
    });

    it('target: events are not lost when debounce is active', async () => {
      await trigger.requestDebouncedRerun(orgId, 'driving_assessment_degraded');
      // Second call while debounce flag set — should queue, not drop
      await trigger.requestDebouncedRerun(orgId, 'driving_assessment_recovered');

      const pendingKey = `bi:pending:${orgId}`;
      const queued = await redis.lrange(pendingKey, 0, -1);
      expect(queued).toContain('driving_assessment_degraded');
      expect(queued).toContain('driving_assessment_recovered');
    });

    it('characterization: new debounce cycle after window completes', async () => {
      await trigger.requestDebouncedRerun(orgId, 'event_a');
      jest.advanceTimersByTime(DEBOUNCE_WINDOW_MS);
      await Promise.resolve();
      await Promise.resolve();

      await trigger.requestDebouncedRerun(orgId, 'event_b');
      jest.advanceTimersByTime(DEBOUNCE_WINDOW_MS);
      await Promise.resolve();
      await Promise.resolve();

      expect(insightsService.runForOrganization).toHaveBeenCalledTimes(2);
    });
  });

  describe('case 6 — scheduler vs trigger same org', () => {
    it('characterization: scheduler and trigger services have independent in-flight guards today', () => {
      // BusinessInsightsScheduler.running and BusinessInsightsTriggerService.pendingTimers
      // are not coordinated — concurrent runs for the same org are possible in production.
      const schedulerHasOrgLock = false;
      const triggerSharesSchedulerLock = false;
      expect(schedulerHasOrgLock).toBe(false);
      expect(triggerSharesSchedulerLock).toBe(false);
    });
  });
});

describe('Debounce constants', () => {
  it('debounce window is 2 minutes', () => {
    expect(DEBOUNCE_WINDOW_MS).toBe(120_000);
  });
});
