import { computeTemporalCoverage } from './tire-ds4-shadow-temporal-coverage';
import type { DiV0MotionCoreShadowTripMapReadResponse } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';

function sampleAt(
  iso: string,
  speedKmh: number | null,
  evidenceQuality = 'OK',
) {
  return {
    bucketLabelUtc: iso,
    speedKmh,
    motionState: 'MOVING',
    evidenceQuality,
    latitude: null,
    longitude: null,
    positionAvailability: null,
  };
}

function baseRead(
  overrides: Partial<DiV0MotionCoreShadowTripMapReadResponse> = {},
): DiV0MotionCoreShadowTripMapReadResponse {
  return {
    status: 'SUCCEEDED',
    previewLabel: 'S4 Motion · vorläufig',
    runId: 'r1',
    workItemId: null,
    pinnedSnapshotHash: 'p',
    combinedInputIdentity: 'i',
    algorithmVersions: null,
    speedAuthority: 'C4_ONLY',
    computedAtUtc: null,
    geometrySource: 'NONE',
    geometryNote: null,
    samples: [],
    events: [],
    stopEpisodes: [],
    limitations: [],
    failureCode: null,
    snapshotBindingVerified: true,
    newerFailedRunId: null,
    newerFailedRunStatus: null,
    ...overrides,
  };
}

const tripWindow = {
  tripDistanceKm: 10,
  tripStartedAt: '2026-01-01T10:00:00.000Z',
  tripEndedAt: '2026-01-01T10:00:04.000Z',
};

function okSamplesEverySecond(from: string, count: number, speed = 40) {
  const start = Date.parse(from);
  return Array.from({ length: count }, (_, i) =>
    sampleAt(new Date(start + i * 1000).toISOString(), speed, 'OK'),
  );
}

describe('tire-ds4-shadow temporal coverage correctness', () => {
  it('100% time labels with all speedKmh=null → NOT VERIFIED', () => {
    const { temporalCoverage, detail } = computeTemporalCoverage(
      baseRead({ samples: okSamplesEverySecond('2026-01-01T10:00:00.000Z', 5, 0).map((s) => ({ ...s, speedKmh: null })) }),
      tripWindow,
    );
    expect(temporalCoverage).not.toBe('VERIFIED');
    expect(detail.verified).toBe(false);
    expect(detail.labelledSampleSeconds).toBe(5);
    expect(detail.validDrivingSeconds).toBe(0);
    expect(detail.invalidLabelSeconds).toBe(5);
  });

  it('100% LIMITED labels → NOT VERIFIED', () => {
    const samples = okSamplesEverySecond('2026-01-01T10:00:00.000Z', 5).map((s) => ({
      ...s,
      evidenceQuality: 'LIMITED',
    }));
    const { temporalCoverage, detail } = computeTemporalCoverage(baseRead({ samples }), tripWindow);
    expect(temporalCoverage).not.toBe('VERIFIED');
    expect(detail.invalidLabelSeconds).toBe(5);
    expect(detail.degradedLabelSeconds).toBe(0);
  });

  it('100% DEGRADED labels → NOT VERIFIED (degraded tracked separately)', () => {
    const samples = okSamplesEverySecond('2026-01-01T10:00:00.000Z', 5).map((s) => ({
      ...s,
      evidenceQuality: 'DEGRADED',
    }));
    const { temporalCoverage, detail } = computeTemporalCoverage(baseRead({ samples }), tripWindow);
    expect(temporalCoverage).not.toBe('VERIFIED');
    expect(detail.degradedLabelSeconds).toBe(5);
    expect(detail.validDrivingSeconds).toBe(0);
  });

  it('full valid OK movement across trip window → VERIFIED', () => {
    const { temporalCoverage, detail } = computeTemporalCoverage(
      baseRead({ samples: okSamplesEverySecond('2026-01-01T10:00:00.000Z', 5) }),
      tripWindow,
    );
    expect(temporalCoverage).toBe('VERIFIED');
    expect(detail.verified).toBe(true);
    expect(detail.validDrivingSeconds).toBe(5);
    expect(detail.accountableFraction).toBe(1);
  });

  it('valid movement plus directly confirmed stop, gapless → VERIFIED', () => {
    const samples = [
      ...okSamplesEverySecond('2026-01-01T10:00:00.000Z', 2),
      ...okSamplesEverySecond('2026-01-01T10:00:03.000Z', 2),
    ];
    const { temporalCoverage, detail } = computeTemporalCoverage(
      baseRead({
        samples,
        stopEpisodes: [
          {
            id: 's1',
            startEarliestUtc: '2026-01-01T10:00:02.000Z',
            startLatestUtc: '2026-01-01T10:00:02.000Z',
            endEarliestUtc: '2026-01-01T10:00:02.000Z',
            endLatestUtc: '2026-01-01T10:00:02.000Z',
            minDurationS: 1,
            maxDurationS: 1,
            evidenceQuality: 'OK',
            observedLabels: 1,
            gapLabels: 0,
            firstStationarySource: 'FSM',
            observed: true,
            inferred: false,
            latitude: null,
            longitude: null,
            positionResolved: false,
          },
        ],
      }),
      tripWindow,
    );
    expect(temporalCoverage).toBe('VERIFIED');
    expect(detail.confirmedStationarySeconds).toBe(1);
    expect(detail.validDrivingSeconds).toBe(4);
  });

  it('inferred stop does not create confirmed stationary seconds', () => {
    const { temporalCoverage, detail } = computeTemporalCoverage(
      baseRead({
        samples: okSamplesEverySecond('2026-01-01T10:00:00.000Z', 3),
        stopEpisodes: [
          {
            id: 's1',
            startEarliestUtc: '2026-01-01T10:00:03.000Z',
            startLatestUtc: '2026-01-01T10:00:03.000Z',
            endEarliestUtc: '2026-01-01T10:00:04.000Z',
            endLatestUtc: '2026-01-01T10:00:04.000Z',
            minDurationS: 1,
            maxDurationS: 1,
            evidenceQuality: 'OK',
            observedLabels: 0,
            gapLabels: 0,
            firstStationarySource: 'FSM',
            observed: true,
            inferred: true,
            latitude: null,
            longitude: null,
            positionResolved: false,
          },
        ],
      }),
      tripWindow,
    );
    expect(temporalCoverage).not.toBe('VERIFIED');
    expect(detail.confirmedStationarySeconds).toBe(0);
    expect(detail.unknownSeconds).toBeGreaterThan(0);
  });

  it('labels outside trip window do not inflate coverage beyond 100%', () => {
    const samples = [
      ...okSamplesEverySecond('2026-01-01T10:00:00.000Z', 5),
      sampleAt('2026-01-01T10:00:10.000Z', 50, 'OK'),
    ];
    const { detail } = computeTemporalCoverage(baseRead({ samples }), tripWindow);
    expect(detail.labelledSampleSeconds).toBe(5);
    expect(detail.labelledFraction).toBeLessThanOrEqual(1);
    expect(detail.accountableFraction).toBeLessThanOrEqual(1);
  });

  it('internal data gap prevents VERIFIED', () => {
    const samples = [
      ...okSamplesEverySecond('2026-01-01T10:00:00.000Z', 2),
      ...okSamplesEverySecond('2026-01-01T10:00:04.000Z', 1),
    ];
    const { temporalCoverage, detail } = computeTemporalCoverage(
      baseRead({ samples }),
      tripWindow,
    );
    expect(temporalCoverage).not.toBe('VERIFIED');
    expect(detail.gapSeconds).toBeGreaterThan(0);
  });
});
