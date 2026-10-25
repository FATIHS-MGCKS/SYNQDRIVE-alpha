import { computeTemporalCoverage } from './tire-ds4-shadow-temporal-coverage';
import type { DiV0MotionCoreShadowTripMapReadResponse } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';

function fsmSample(
  iso: string,
  speedKmh: number | null,
  motionState: string,
  evidenceQuality: string,
) {
  return {
    bucketLabelUtc: iso,
    speedKmh,
    motionState,
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
    speedAuthority: 'C5_1_PREFERRED',
    computedAtUtc: null,
    geometrySource: 'NONE',
    geometryNote: null,
    samples: [],
    events: [],
    stopEpisodes: [],
    limitations: ['SPARSE_R1_BUCKET_ONLY_NO_FSM_POINT_AUTHORITY'],
    failureCode: null,
    snapshotBindingVerified: true,
    newerFailedRunId: null,
    newerFailedRunStatus: null,
    ...overrides,
  };
}

const tripWindow = {
  tripDistanceKm: 12,
  tripStartedAt: '2026-10-25T10:28:00.000Z',
  tripEndedAt: '2026-10-25T10:28:04.000Z',
};

describe('tire-ds4-shadow FSM temporal quality contract', () => {
  it('DIRECT MOVING with authoritative speed counts as valid driving (not invalid)', () => {
    const samples = [
      fsmSample('2026-10-25T10:28:00.000Z', 35, 'MOVING', 'DIRECT'),
      fsmSample('2026-10-25T10:28:01.000Z', 36, 'MOVING', 'DIRECT'),
      fsmSample('2026-10-25T10:28:02.000Z', 34, 'MOVING', 'DIRECT'),
      fsmSample('2026-10-25T10:28:03.000Z', 33, 'MOVING', 'DIRECT'),
      fsmSample('2026-10-25T10:28:04.000Z', 32, 'MOVING', 'DIRECT'),
    ];
    const { temporalCoverage, detail } = computeTemporalCoverage(
      baseRead({ samples }),
      tripWindow,
    );
    expect(detail.validDrivingSeconds).toBe(5);
    expect(detail.invalidLabelSeconds).toBe(0);
    expect(detail.degradedLabelSeconds).toBe(0);
    expect(temporalCoverage).toBe('VERIFIED');
  });

  it('INFERRED labels are degraded, never VERIFIED alone', () => {
    const samples = Array.from({ length: 5 }, (_, i) =>
      fsmSample(
        new Date(Date.parse('2026-10-25T10:28:00.000Z') + i * 1000).toISOString(),
        30,
        'MOVING',
        'INFERRED',
      ),
    );
    const { temporalCoverage, detail } = computeTemporalCoverage(
      baseRead({ samples }),
      tripWindow,
    );
    expect(detail.degradedLabelSeconds).toBe(5);
    expect(detail.validDrivingSeconds).toBe(0);
    expect(temporalCoverage).not.toBe('VERIFIED');
  });

  it('INDETERMINATE labels are invalid, not upgraded to driving', () => {
    const samples = [
      fsmSample('2026-10-25T10:28:00.000Z', 30, 'MOVING', 'INDETERMINATE'),
      fsmSample('2026-10-25T10:28:01.000Z', 30, 'MOVING', 'DIRECT'),
      fsmSample('2026-10-25T10:28:02.000Z', 30, 'MOVING', 'DIRECT'),
      fsmSample('2026-10-25T10:28:03.000Z', 30, 'MOVING', 'DIRECT'),
      fsmSample('2026-10-25T10:28:04.000Z', 30, 'MOVING', 'DIRECT'),
    ];
    const { detail } = computeTemporalCoverage(baseRead({ samples }), tripWindow);
    expect(detail.invalidLabelSeconds).toBe(1);
    expect(detail.validDrivingSeconds).toBe(4);
    expect(detail.verified).toBe(false);
  });

  it('DIRECT without speed authority does not count as valid driving', () => {
    const samples = [
      fsmSample('2026-10-25T10:28:00.000Z', 40, 'MOVING', 'DIRECT'),
      fsmSample('2026-10-25T10:28:01.000Z', 40, 'MOVING', 'DIRECT'),
      fsmSample('2026-10-25T10:28:02.000Z', 40, 'MOVING', 'DIRECT'),
      fsmSample('2026-10-25T10:28:03.000Z', 40, 'MOVING', 'DIRECT'),
      fsmSample('2026-10-25T10:28:04.000Z', 40, 'MOVING', 'DIRECT'),
    ];
    const { detail } = computeTemporalCoverage(
      baseRead({ samples, speedAuthority: null }),
      tripWindow,
    );
    expect(detail.validDrivingSeconds).toBe(0);
    expect(detail.invalidLabelSeconds).toBe(5);
  });

  it('DIRECT stop episode with tight bounds and STATIONARY samples confirms stationary seconds', () => {
    const samples = [
      fsmSample('2026-10-25T10:28:00.000Z', 40, 'MOVING', 'DIRECT'),
      fsmSample('2026-10-25T10:28:01.000Z', 0, 'STATIONARY', 'DIRECT'),
      fsmSample('2026-10-25T10:28:02.000Z', 0, 'STATIONARY', 'DIRECT'),
      fsmSample('2026-10-25T10:28:03.000Z', 40, 'MOVING', 'DIRECT'),
      fsmSample('2026-10-25T10:28:04.000Z', 42, 'MOVING', 'DIRECT'),
    ];
    const { detail, temporalCoverage } = computeTemporalCoverage(
      baseRead({
        samples,
        stopEpisodes: [
          {
            id: 's1',
            startEarliestUtc: '2026-10-25T10:28:01.000Z',
            startLatestUtc: '2026-10-25T10:28:01.000Z',
            endEarliestUtc: '2026-10-25T10:28:02.000Z',
            endLatestUtc: '2026-10-25T10:28:02.000Z',
            minDurationS: 2,
            maxDurationS: 2,
            evidenceQuality: 'DIRECT',
            observedLabels: 2,
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
    expect(detail.confirmedStationarySeconds).toBe(2);
    expect(detail.validDrivingSeconds).toBe(3);
    expect(temporalCoverage).toBe('VERIFIED');
  });
});
