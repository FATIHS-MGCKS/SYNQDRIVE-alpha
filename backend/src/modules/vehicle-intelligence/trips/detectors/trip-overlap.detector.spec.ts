import { TripOverlapDetector, type TripOverlapEvidence } from './trip-overlap.detector';
import { MAX_CANONICAL_INTERVALS } from './trip-coverage.util';

/**
 * PR A — TripOverlapDetector mode behaviour.
 *
 * legacy and shadow must produce the historic binary decision byte for byte;
 * only enforce is allowed to decide differently, and it is off in production.
 */

const T0 = Date.parse('2026-08-01T08:00:00.000Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

const row = (id: string, startMin: number, endMin: number | null, tripStatus = 'COMPLETED') => ({
  id,
  startTime: at(startMin),
  endTime: endMin == null ? null : at(endMin),
  tripStatus,
});

function buildDetector(rows: ReturnType<typeof row>[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = { vehicleTrip: { findMany } } as never;
  return { detector: new TripOverlapDetector(prisma), findMany };
}

const context = (mode?: 'legacy' | 'shadow' | 'enforce') =>
  ({
    vehicleId: 'veh-1',
    dimoTokenId: 1,
    profile: 'ICE',
    phase: 'duplicate_or_overlap_check',
    candidateStart: at(0),
    candidateEnd: at(98),
    coverageMode: mode,
  }) as never;

describe('TripOverlapDetector', () => {
  it('legacy mode suppresses a long drive containing two short trips (historic behaviour)', async () => {
    const { detector } = buildDetector([row('t1', 5, 19), row('t2', 60, 75)]);

    const finding = await detector.evaluate(context('legacy'));
    const evidence = finding.evidence as TripOverlapEvidence;

    expect(finding.verdict).toBe('TRIGGERED');
    expect(evidence.legacyVerdict).toBe('TRIGGERED');
    expect(evidence.coverageVerdict).toBe('PARTIALLY_COVERED');
    expect(evidence.effectiveDecision).toBe('SUPPRESS');
    expect(evidence.decisionSource).toBe('legacy');
  });

  it('shadow mode keeps the legacy decision but records the disagreement', async () => {
    const { detector } = buildDetector([row('t1', 5, 19), row('t2', 60, 75)]);

    const finding = await detector.evaluate(context('shadow'));
    const evidence = finding.evidence as TripOverlapEvidence;

    expect(finding.verdict).toBe('TRIGGERED');
    expect(evidence.agreement).toBe('COVERAGE_WOULD_ACCEPT');
    expect(evidence.coverage.coverageRatio).toBeCloseTo(29 / 98, 3);
    expect(evidence.coverage.missingSeconds).toBe(69 * 60);
    expect(evidence.repairableSpans).toHaveLength(3);
  });

  it('enforce mode accepts the same candidate and clips it to the uncovered spans', async () => {
    const { detector } = buildDetector([row('t1', 5, 19), row('t2', 60, 75)]);

    const finding = await detector.evaluate(context('enforce'));
    const evidence = finding.evidence as TripOverlapEvidence;

    expect(finding.verdict).toBe('NOT_TRIGGERED');
    expect(evidence.decisionSource).toBe('coverage');
    expect(evidence.repairableSpans).toEqual([
      { start: at(0).toISOString(), end: at(5).toISOString() },
      { start: at(19).toISOString(), end: at(60).toISOString() },
      { start: at(75).toISOString(), end: at(98).toISOString() },
    ]);
  });

  it('enforce mode still suppresses a genuine duplicate', async () => {
    const { detector } = buildDetector([row('t1', 0, 98)]);

    const finding = await detector.evaluate(context('enforce'));
    const evidence = finding.evidence as TripOverlapEvidence;

    expect(finding.verdict).toBe('TRIGGERED');
    expect(evidence.coverageVerdict).toBe('FULLY_COVERED');
    expect(evidence.agreement).toBe('AGREE');
  });

  it('enforce mode suppresses while an ONGOING trip intersects', async () => {
    const { detector } = buildDetector([row('t1', 10, null, 'ONGOING')]);

    const finding = await detector.evaluate(context('enforce'));
    const evidence = finding.evidence as TripOverlapEvidence;

    expect(finding.verdict).toBe('TRIGGERED');
    expect(evidence.coverageVerdict).toBe('AMBIGUOUS');
    expect(evidence.ambiguousReason).toBe('ONGOING_TRIP_INTERSECTS');
  });

  it('enforce mode does not treat a CANCELLED trip as coverage', async () => {
    const { detector } = buildDetector([row('t1', 0, 98, 'CANCELLED')]);

    const finding = await detector.evaluate(context('enforce'));
    const evidence = finding.evidence as TripOverlapEvidence;

    expect(finding.verdict).toBe('NOT_TRIGGERED');
    expect(evidence.legacyVerdict).toBe('TRIGGERED');
    expect(evidence.coverageVerdict).toBe('NOT_COVERED');
    expect(evidence.agreement).toBe('COVERAGE_WOULD_ACCEPT');
  });

  it('defaults to shadow when no mode is supplied', async () => {
    const { detector } = buildDetector([row('t1', 5, 19)]);

    const finding = await detector.evaluate(context());

    expect((finding.evidence as TripOverlapEvidence).mode).toBe('shadow');
    expect(finding.verdict).toBe('TRIGGERED');
  });

  it('no intersecting trip means no suppression in any mode', async () => {
    for (const mode of ['legacy', 'shadow', 'enforce'] as const) {
      const { detector } = buildDetector([]);
      const finding = await detector.evaluate(context(mode));
      expect(finding.verdict).toBe('NOT_TRIGGERED');
    }
  });

  it('bounds the canonical set and reports truncation as AMBIGUOUS', async () => {
    const many = Array.from({ length: MAX_CANONICAL_INTERVALS + 1 }, (_, i) =>
      row(`t${i}`, i * 0.1, i * 0.1 + 0.05),
    );
    const { detector, findMany } = buildDetector(many);

    const finding = await detector.evaluate(context('enforce'));
    const evidence = finding.evidence as TripOverlapEvidence;

    expect(findMany.mock.calls[0][0].take).toBe(MAX_CANONICAL_INTERVALS + 1);
    expect(evidence.canonicalSetTruncated).toBe(true);
    expect(evidence.coverageVerdict).toBe('AMBIGUOUS');
    expect(evidence.ambiguousReason).toBe('CANONICAL_SET_TRUNCATED');
    expect(finding.verdict).toBe('TRIGGERED');
  });

  it('queries only the candidate window plus tolerance, scoped to the vehicle', async () => {
    const { detector, findMany } = buildDetector([]);

    await detector.evaluate(context('shadow'));

    const where = findMany.mock.calls[0][0].where;
    expect(where.vehicleId).toBe('veh-1');
    expect(where.OR[0].endTime.gte).toEqual(at(-5));
    expect(where.OR[0].startTime.lte).toEqual(at(103));
  });

  it('leaves the query unordered so the planner keeps the composite vehicle index', async () => {
    const { detector, findMany } = buildDetector([]);

    await detector.evaluate(context('shadow'));

    expect(findMany.mock.calls[0][0].orderBy).toBeUndefined();
  });

  it('orders the bounded result set itself, whatever order the database returns', async () => {
    const { detector } = buildDetector([row('late', 60, 75), row('early', 5, 19)]);

    const finding = await detector.evaluate(context('shadow'));
    const evidence = finding.evidence as TripOverlapEvidence;

    expect(evidence.legacyOverlapTripId).toBe('early');
    expect(evidence.repairableSpans[0]).toEqual({
      start: at(0).toISOString(),
      end: at(5).toISOString(),
    });
  });
});
