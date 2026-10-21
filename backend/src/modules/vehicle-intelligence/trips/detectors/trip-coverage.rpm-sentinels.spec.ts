import { assessCoverage, isSuppressingVerdict, type CanonicalTripInterval } from './trip-coverage.util';

/**
 * PR A — the five RPM sentinel windows, as fixtures.
 *
 * These are the `rpm_webhook_candidates` rows that the Stage 2 historical
 * repair could not associate with any trip: real engine activity above 5000 rpm
 * with no canonical trip containing it. Geometry (candidate windows, adjacent
 * canonical trips) is copied verbatim from the 90-day production extract used
 * by the replay harness.
 *
 * Every one of them was suppressed by binary overlap because a canonical trip
 * ends exactly where the candidate begins, or begins exactly where it ends.
 * Containment-aware coverage must classify all five as repairable.
 */

const trip = (
  id: string,
  start: string,
  end: string,
  tripStatus = 'COMPLETED',
): CanonicalTripInterval => ({
  id,
  startTime: new Date(start),
  endTime: new Date(end),
  tripStatus,
});

interface Sentinel {
  candidateId: string;
  vehicle: string;
  rpm: number;
  observedAt: string;
  candidateStart: string;
  candidateEnd: string;
  trips: CanonicalTripInterval[];
}

const SENTINELS: Sentinel[] = [
  {
    candidateId: '79c4f647',
    vehicle: '8c850ff1 (HMÜ C 215)',
    rpm: 5543,
    observedAt: '2026-07-18T12:41:13.000Z',
    candidateStart: '2026-07-18T11:58:55.000Z',
    candidateEnd: '2026-07-18T13:45:46.000Z',
    trips: [
      trip('1702244f', '2026-07-18T11:45:46.000Z', '2026-07-18T11:55:53.000Z'),
      trip('a16e75cd', '2026-07-18T13:25:53.000Z', '2026-07-18T13:31:50.000Z'),
    ],
  },
  {
    candidateId: 'd9197e1f',
    vehicle: '8c850ff1 (HMÜ C 215)',
    rpm: 5013,
    observedAt: '2026-07-19T07:28:01.000Z',
    candidateStart: '2026-07-19T07:24:37.000Z',
    candidateEnd: '2026-07-19T09:02:38.000Z',
    trips: [
      trip('69e68bf1', '2026-07-19T04:52:00.000Z', '2026-07-19T05:07:00.000Z'),
      trip('1917b0f8', '2026-07-19T08:20:01.000Z', '2026-07-19T08:29:04.000Z'),
      trip('78b4a424', '2026-07-19T08:36:36.000Z', '2026-07-19T08:56:05.000Z'),
    ],
  },
  {
    candidateId: '5e46a6de',
    vehicle: '8c850ff1 (HMÜ C 215)',
    rpm: 5575,
    observedAt: '2026-07-20T06:47:22.000Z',
    candidateStart: '2026-07-20T06:35:13.000Z',
    candidateEnd: '2026-07-20T07:13:11.000Z',
    trips: [
      trip('0f91164c', '2026-07-20T06:29:10.000Z', '2026-07-20T06:35:13.000Z'),
      trip('caba83b7', '2026-07-20T07:13:11.000Z', '2026-07-20T07:29:44.000Z'),
    ],
  },
  {
    candidateId: 'd6073d34',
    vehicle: '19fedd4b (WOB L 7503)',
    rpm: 5155,
    observedAt: '2026-07-20T06:50:27.000Z',
    candidateStart: '2026-07-20T06:26:44.000Z',
    candidateEnd: '2026-07-20T07:09:01.000Z',
    trips: [
      trip('6810cd87', '2026-07-20T06:10:28.000Z', '2026-07-20T06:26:44.000Z'),
      trip('ea8d1632', '2026-07-20T07:09:01.000Z', '2026-07-20T07:16:48.000Z'),
    ],
  },
  {
    candidateId: 'aba38e11',
    vehicle: '19fedd4b (WOB L 7503)',
    rpm: 5887,
    observedAt: '2026-07-20T06:53:56.000Z',
    candidateStart: '2026-07-20T06:26:44.000Z',
    candidateEnd: '2026-07-20T07:09:01.000Z',
    trips: [
      trip('6810cd87', '2026-07-20T06:10:28.000Z', '2026-07-20T06:26:44.000Z'),
      trip('ea8d1632', '2026-07-20T07:09:01.000Z', '2026-07-20T07:16:48.000Z'),
    ],
  },
];

const OVERLAP_TOLERANCE_MS = 5 * 60_000;

/** The binary predicate the detector used before this PR. */
function legacyOverlapTriggered(sentinel: Sentinel): boolean {
  const windowStart = new Date(sentinel.candidateStart).getTime() - OVERLAP_TOLERANCE_MS;
  const windowEnd = new Date(sentinel.candidateEnd).getTime() + OVERLAP_TOLERANCE_MS;
  return sentinel.trips.some(
    (t) =>
      t.endTime != null &&
      t.endTime.getTime() >= windowStart &&
      t.startTime.getTime() <= windowEnd,
  );
}

describe('RPM sentinel windows', () => {
  it.each(SENTINELS)(
    'sentinel $candidateId ($rpm rpm, $vehicle) is repairable under coverage',
    (sentinel) => {
      const result = assessCoverage(
        new Date(sentinel.candidateStart),
        new Date(sentinel.candidateEnd),
        sentinel.trips,
      );

      expect(legacyOverlapTriggered(sentinel)).toBe(true);
      expect(['NOT_COVERED', 'PARTIALLY_COVERED']).toContain(result.verdict);
      expect(isSuppressingVerdict(result.verdict)).toBe(false);

      const observedAt = new Date(sentinel.observedAt).getTime();
      const covering = result.repairableSpans.find(
        (span) => span.start.getTime() <= observedAt && span.end.getTime() >= observedAt,
      );
      expect(covering).toBeDefined();
    },
  );

  it('no sentinel window is anywhere near substantially covered', () => {
    for (const sentinel of SENTINELS) {
      const metrics = assessCoverage(
        new Date(sentinel.candidateStart),
        new Date(sentinel.candidateEnd),
        sentinel.trips,
      ).metrics;

      // Every sentinel is bracketed by trips that touch its edges, and the
      // worst case (d9197e1f) is the 98-minute drive whose only canonical
      // representation is two short inner trips totalling 29 minutes.
      expect(metrics.coverageRatio).toBeLessThan(0.3);
      expect(metrics.longestUncoveredSpanSeconds).toBeGreaterThanOrEqual(20 * 60);
    }
  });
});
