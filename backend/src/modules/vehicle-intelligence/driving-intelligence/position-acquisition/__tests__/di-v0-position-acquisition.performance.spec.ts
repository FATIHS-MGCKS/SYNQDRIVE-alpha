import { acquireDiV0HistoricalPositions } from '../di-v0-position-acquisition';
import { buildRequest, expectAcquired, labelAt, nullLocationRow, row, signalsBody, staticTransport } from './position-acquisition-test-helpers';

const BASE = '2026-09-26T06:00:00Z';

/** Deterministic mixed evidence: ~5% ROW_ABSENT, ~3% SIGNAL_NULL, a few duplicates. */
function syntheticRows(buckets: number): unknown[] {
  const rows: unknown[] = [];
  for (let i = 0; i < buckets; i++) {
    if (i % 20 === 7) continue;
    const label = labelAt(BASE, i);
    if (i % 33 === 5) {
      rows.push(nullLocationRow(label));
      continue;
    }
    rows.push(row(label, 51.3 + i * 1e-6, 9.5 + i * 1e-6));
    if (i % 500 === 11) rows.push(row(label, 51.3 + i * 1e-6, 9.5 + i * 1e-6));
  }
  // Reverse to exercise order independence at scale.
  return rows.reverse();
}

describe('S3A scale (1800 / 3600 / 28800 buckets)', () => {
  it.each([1800, 3600, 28800])('%i buckets normalize in bounded time with exact invariants', async (buckets) => {
    const body = signalsBody(syntheticRows(buckets));
    const heapBefore = process.memoryUsage().heapUsed;
    const started = performance.now();
    const result = expectAcquired(
      await acquireDiV0HistoricalPositions(buildRequest(BASE, labelAt(BASE, buckets)), staticTransport(body), {}),
    );
    const elapsedMs = performance.now() - started;
    const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024);

    expect(result.expectedBucketCount).toBe(buckets);
    expect(result.observations).toHaveLength(buckets);
    expect(result.presentCount + result.signalNullCount + result.rowAbsentCount).toBe(buckets);
    expect(result.rowAbsentCount).toBe(Math.ceil((buckets - 7) / 20));
    expect(result.duplicateBucketCount).toBeGreaterThan(0);
    expect(result.counters.duplicateConflictingBuckets).toBe(0);
    expect(elapsedMs).toBeLessThan(5000);

    // Structured measurement for the evidence record (not asserted beyond the generous bound).
    console.info(
      JSON.stringify({
        s3aPerf: { buckets, elapsedMs: Math.round(elapsedMs), heapDeltaMb: Math.round(heapDeltaMb * 10) / 10 },
      }),
    );
  });
});
