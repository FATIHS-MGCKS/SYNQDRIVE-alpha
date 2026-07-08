import { QueueMonitoringService } from './queue-monitoring.service';

describe('QueueMonitoringService', () => {
  it('returns idle placeholders when workers are disabled', async () => {
    const prev = process.env.WORKERS_ENABLED;
    process.env.WORKERS_ENABLED = 'false';

    const svc = new QueueMonitoringService({
      get: () => undefined,
    } as any);
    svc.onModuleInit();

    const counts = await svc.getAllQueueCounts();
    expect(counts.length).toBeGreaterThan(0);
    expect(counts.every((c) => c.status === 'idle')).toBe(true);

    if (prev === undefined) delete process.env.WORKERS_ENABLED;
    else process.env.WORKERS_ENABLED = prev;
  });
});
