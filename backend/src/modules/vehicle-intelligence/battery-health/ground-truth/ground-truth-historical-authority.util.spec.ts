import {
  buildGroundTruthSuccessorsByPriorId,
  isGroundTruthActiveAtAsOf,
} from './ground-truth-historical-authority.util';

describe('ground-truth historical asOf authority G3.1', () => {
  const asOf = new Date('2026-06-15T12:00:00.000Z');

  it('G3.1-A2 — revocation on/before asOf invalidates row', () => {
    const row = {
      id: 'gt-1',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
      verificationStatus: 'REVOKED' as const,
      revocations: [{ revokedAt: new Date('2026-06-10T00:00:00.000Z') }],
      supersedesGroundTruthEventId: null,
    };
    expect(isGroundTruthActiveAtAsOf(row, asOf, new Map())).toBe(false);
  });

  it('G3.1-A1 — revocation after asOf does not invalidate historical asOf', () => {
    const row = {
      id: 'gt-1',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
      verificationStatus: 'REVOKED' as const,
      revocations: [{ revokedAt: new Date('2026-07-01T00:00:00.000Z') }],
      supersedesGroundTruthEventId: null,
    };
    expect(isGroundTruthActiveAtAsOf(row, asOf, new Map())).toBe(true);
  });

  it('G3.1-A4 — supersession on/before asOf invalidates prior row', () => {
    const prior = {
      id: 'gt-prior',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
      verificationStatus: 'SUPERSEDED' as const,
      revocations: [],
      supersedesGroundTruthEventId: null,
    };
    const successor = {
      id: 'gt-new',
      createdAt: new Date('2026-06-10T00:00:00.000Z'),
      effectiveAt: new Date('2026-06-10T00:00:00.000Z'),
      verificationStatus: 'CONFIRMED' as const,
      revocations: [],
      supersedesGroundTruthEventId: 'gt-prior',
    };
    const successors = buildGroundTruthSuccessorsByPriorId([prior, successor]);
    expect(isGroundTruthActiveAtAsOf(prior, asOf, successors)).toBe(false);
  });

  it('G3.1-A3 — supersession after asOf leaves prior active at historical asOf', () => {
    const prior = {
      id: 'gt-prior',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
      verificationStatus: 'SUPERSEDED' as const,
      revocations: [],
      supersedesGroundTruthEventId: null,
    };
    const successor = {
      id: 'gt-new',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      effectiveAt: new Date('2026-07-01T00:00:00.000Z'),
      verificationStatus: 'CONFIRMED' as const,
      revocations: [],
      supersedesGroundTruthEventId: 'gt-prior',
    };
    const successors = buildGroundTruthSuccessorsByPriorId([prior, successor]);
    expect(isGroundTruthActiveAtAsOf(prior, asOf, successors)).toBe(true);
  });
});
