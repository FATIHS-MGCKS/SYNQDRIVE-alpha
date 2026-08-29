import {
  appendBoundaryRepairHistory,
  buildBoundaryRefreshRecord,
  isBoundaryRefreshPending,
  normalizeBoundaryRepairHistory,
  readBoundaryRefreshRecord,
} from './boundary-repair.state.util';

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

  it('detects pending refresh from durable metadata', () => {
    const meta = {
      boundaryRefresh: buildBoundaryRefreshRecord('PENDING', null),
    };
    expect(isBoundaryRefreshPending(meta)).toBe(true);
    expect(readBoundaryRefreshRecord(meta)?.state).toBe('PENDING');
  });
});
