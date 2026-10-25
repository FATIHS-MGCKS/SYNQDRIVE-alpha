import { mapDs4TripMapToTireShadowInput } from './tire-ds4-shadow-input.mapper';
import type { DiV0MotionCoreShadowTripMapReadResponse } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';
import { DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1 } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow.bundle.version';

function baseRead(
  overrides: Partial<DiV0MotionCoreShadowTripMapReadResponse> = {},
): DiV0MotionCoreShadowTripMapReadResponse {
  return {
    status: 'SUCCEEDED',
    previewLabel: 'S4 Motion · vorläufig',
    runId: 'run-1',
    workItemId: 'wi-1',
    pinnedSnapshotHash: 'pin',
    combinedInputIdentity: 'input',
    algorithmVersions: {
      c4: 'c4',
      c5_1: null,
      fsm: 'fsm',
      gapBridgeV1: null,
      fsmAuxBinding: null,
      events: 'ev',
      bundle: DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1,
    },
    speedAuthority: 'C4_ONLY',
    computedAtUtc: '2026-01-01T10:00:00.000Z',
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

const trip = {
  tripDistanceKm: 12,
  tripStartedAt: '2026-01-01T10:00:00.000Z',
  tripEndedAt: '2026-01-01T10:05:00.000Z',
};

describe('tire-ds4-shadow-input.mapper', () => {
  it('aggregates OK acceleration and excludes LIMITED deceleration', () => {
    const payload = mapDs4TripMapToTireShadowInput(
      baseRead({
        events: [
          {
            id: 'e1',
            kind: 'ACCELERATION',
            displayKind: 'ACCELERATION',
            startLabelUtc: '2026-01-01T10:00:00.000Z',
            endLabelUtc: '2026-01-01T10:00:02.000Z',
            startSpeedKmh: 10,
            endSpeedKmh: 20,
            deltaKmh: 10,
            peakAccel1sMps2: null,
            quality: 'OK',
            artefactSuspect: false,
            latitude: null,
            longitude: null,
            positionResolved: false,
          },
          {
            id: 'e2',
            kind: 'DECELERATION',
            displayKind: 'DECELERATION',
            startLabelUtc: '2026-01-01T10:01:00.000Z',
            endLabelUtc: '2026-01-01T10:01:02.000Z',
            startSpeedKmh: 40,
            endSpeedKmh: 30,
            deltaKmh: -10,
            peakAccel1sMps2: null,
            quality: 'LIMITED',
            artefactSuspect: false,
            latitude: null,
            longitude: null,
            positionResolved: false,
          },
        ],
      }),
      trip,
    );

    expect(payload.acceleration.okCount).toBe(1);
    expect(payload.acceleration.okDurationS).toBe(2);
    expect(payload.acceleration.okDeltaKmhAbsSum).toBe(10);
    expect(payload.acceleration.okM3EventCount).toBe(1);
    expect(payload.deceleration.limitedCount).toBe(1);
    expect(payload.neutral).toBe(false);
    expect(payload.eventQualityCoverage).toBe('PARTIAL');
    expect(payload.temporalCoverageDetail).toBeDefined();
    expect(payload.schemaVersion).toBe(3);
  });

  it('marks neutral when no admissible manoeuvre counts', () => {
    const payload = mapDs4TripMapToTireShadowInput(baseRead(), trip);
    expect(payload.neutral).toBe(true);
    expect(payload.acceleration.okCount).toBe(0);
    expect(payload.deceleration.okCount).toBe(0);
  });
});
