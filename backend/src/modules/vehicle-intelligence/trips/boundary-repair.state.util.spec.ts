import {
  appendBoundaryRepairHistory,
  buildBoundaryRefreshRecord,
  buildBoundaryRepairGeneration,
  isBoundaryRefreshRetryable,
  isEnqueuedLeaseActive,
  isEnqueuedStale,
  normalizeBoundaryRepairHistory,
  readBoundaryRefreshRecord,
} from './boundary-repair.state.util';

const GENERATION = buildBoundaryRepairGeneration({
  auditId: 'audit-1',
  providerSegmentId: 'seg-1',
  newStartTime: new Date('2026-08-29T12:01:00.000Z'),
  newEndTime: new Date('2026-08-29T12:50:00.000Z'),
});

describe('boundary-repair.state.util', () => {
  it('normalizes malformed boundaryRepairHistory without throwing', () => {
    expect(normalizeBoundaryRepairHistory(null)).toEqual([]);
    expect(normalizeBoundaryRepairHistory('bad')).toEqual([]);
    expect(normalizeBoundaryRepairHistory({ foo: 1 })).toEqual([]);
    expect(normalizeBoundaryRepairHistory([{ a: 1 }])).toEqual([{ a: 1 }]);
  });

  it('caps boundaryRepairHistory growth', () => {
    const prior = { boundaryRepairHistory: Array.from({ length: 25 }, (_, i) => ({ i })) };
    const next = appendBoundaryRepairHistory(prior, { new: true }, 20);
    expect(next).toHaveLength(20);
    expect((next[0] as { i: number }).i).toBe(6);
    expect((next[19] as { new: boolean }).new).toBe(true);
  });

  it('detects pending refresh with generation', () => {
    const meta = {
      boundaryRefresh: buildBoundaryRefreshRecord('PENDING', null, undefined, {
        generation: GENERATION,
      }),
    };
    expect(isBoundaryRefreshRetryable(readBoundaryRefreshRecord(meta))).toBe(true);
    expect(readBoundaryRefreshRecord(meta)?.state).toBe('PENDING');
  });

  it('does not retry recent ENQUEUED lease', () => {
    const record = buildBoundaryRefreshRecord('ENQUEUED', null, undefined, {
      generation: GENERATION,
    });
    expect(isEnqueuedLeaseActive(record)).toBe(true);
    expect(isBoundaryRefreshRetryable(record)).toBe(false);
  });

  it('retries stale ENQUEUED after lease and stale threshold', () => {
    const staleAt = new Date(Date.now() - 20 * 60_000).toISOString();
    const record = {
      ...buildBoundaryRefreshRecord('PENDING', null, undefined, { generation: GENERATION }),
      state: 'ENQUEUED' as const,
      enqueuedAt: staleAt,
      lastProgressAt: staleAt,
      leaseUntil: new Date(Date.now() - 60_000).toISOString(),
    };
    expect(isEnqueuedStale(record)).toBe(true);
    expect(isBoundaryRefreshRetryable(record)).toBe(true);
  });

  it('never retries COMPLETED', () => {
    const record = buildBoundaryRefreshRecord(
      'COMPLETED',
      buildBoundaryRefreshRecord('ENQUEUED', null, undefined, { generation: GENERATION }),
      undefined,
      { generation: GENERATION },
    );
    expect(isBoundaryRefreshRetryable(record)).toBe(false);
  });
});
