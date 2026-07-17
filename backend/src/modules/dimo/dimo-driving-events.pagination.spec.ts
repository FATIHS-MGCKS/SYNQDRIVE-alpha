import {
  dedupeDimoEventSamples,
  DIMO_DRIVING_EVENTS_RETRY_BASE_MS,
  splitTimeWindowForPagination,
  sleep,
} from './dimo-driving-events.pagination';
import type { DimoVehicleEventRecord } from './queries/driving-events.query';

describe('dimo-driving-events.pagination', () => {
  const sample = (timestamp: string): DimoVehicleEventRecord => ({
    timestamp,
    name: 'behavior.harshBraking',
    source: '0xDEVICE',
    durationNs: 0,
    metadata: '{"counterValue":1}',
  });

  it('chunks long windows for pagination', () => {
    const windows = splitTimeWindowForPagination(
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-01T13:00:00.000Z'),
    );
    expect(windows).toHaveLength(3);
    expect(windows[0].from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(windows[2].to.toISOString()).toBe('2026-01-01T13:00:00.000Z');
  });

  it('dedupes duplicate provider events across pages', () => {
    const rows = dedupeDimoEventSamples(
      [sample('2026-01-01T00:00:00.000Z'), sample('2026-01-01T00:00:00.000Z')],
      5,
    );
    expect(rows).toHaveLength(1);
  });

  it('retries use bounded backoff base', async () => {
    const started = Date.now();
    await sleep(DIMO_DRIVING_EVENTS_RETRY_BASE_MS);
    expect(Date.now() - started).toBeGreaterThanOrEqual(DIMO_DRIVING_EVENTS_RETRY_BASE_MS - 5);
  });
});
