import { computeOrphanCreatedAtRange } from './physical-refuel-orphan-range.util';

describe('computeOrphanCreatedAtRange', () => {
  const cutover = new Date('2026-09-04T12:00:00.000Z');
  const asOf = new Date('2026-09-04T18:00:00.000Z');

  it('O1 excludes orphans older than recovery lookback', () => {
    const lookbackFrom = new Date('2026-09-04T10:00:00.000Z');
    const range = computeOrphanCreatedAtRange({
      v2OwnershipCutoverAt: cutover,
      orphanLookbackFrom: lookbackFrom,
      asOf,
    });
    expect(range.gte.toISOString()).toBe(cutover.toISOString());
    expect(range.lte.toISOString()).toBe(asOf.toISOString());
  });

  it('O2 includes orphan after cutover within lookback', () => {
    const lookbackFrom = new Date('2026-09-03T00:00:00.000Z');
    const range = computeOrphanCreatedAtRange({
      v2OwnershipCutoverAt: cutover,
      orphanLookbackFrom: lookbackFrom,
      asOf,
    });
    expect(range.gte.toISOString()).toBe(cutover.toISOString());
    expect(range.lte.toISOString()).toBe(asOf.toISOString());
  });

  it('O3 excludes future-created rows above asOf upper bound', () => {
    const range = computeOrphanCreatedAtRange({
      v2OwnershipCutoverAt: cutover,
      orphanLookbackFrom: new Date('2026-09-01T00:00:00.000Z'),
      asOf,
    });
    expect(range.lte.getTime()).toBe(asOf.getTime());
  });

  it('O4 uses cutover as lower bound when newer than orphanLookbackFrom', () => {
    const lookbackFrom = new Date('2026-09-01T00:00:00.000Z');
    const range = computeOrphanCreatedAtRange({
      v2OwnershipCutoverAt: cutover,
      orphanLookbackFrom: lookbackFrom,
      asOf,
    });
    expect(range.gte.getTime()).toBe(cutover.getTime());
  });
});
