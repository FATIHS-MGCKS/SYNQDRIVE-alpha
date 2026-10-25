import { kineticDeltaJPerKg, m3ContributionJPerKgPerKm } from './tire-ds4-shadow-m3-dynamics';
import { mapDs4TripMapToTireShadowInput } from './tire-ds4-shadow-input.mapper';
import { computeTemporalCoverage } from './tire-ds4-shadow-temporal-coverage';
import type { DiV0MotionCoreShadowTripMapReadResponse } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';
import { TIRE_DS4_SHADOW_INPUT_PAYLOAD_SCHEMA_VERSION } from './tire-ds4-shadow-adapter.version';
import { TireDs4ShadowRepository } from './tire-ds4-shadow.repository';

function manoeuvreEvent(
  overrides: Partial<DiV0MotionCoreShadowTripMapReadResponse['events'][0]> = {},
) {
  return {
    id: 'e1',
    kind: 'ACCELERATION',
    displayKind: 'ACCELERATION' as const,
    startLabelUtc: '2026-01-01T10:00:00.000Z',
    endLabelUtc: '2026-01-01T10:00:02.000Z',
    startSpeedKmh: 0,
    endSpeedKmh: 36,
    deltaKmh: 36,
    peakAccel1sMps2: null,
    quality: 'OK',
    artefactSuspect: false,
    latitude: null,
    longitude: null,
    positionResolved: false,
    ...overrides,
  };
}

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
      c5_1: 'c5',
      fsm: 'fsm',
      gapBridgeV1: null,
      fsmAuxBinding: null,
      events: 'ev',
      bundle: 'bundle',
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

const tripCtx = {
  tripDistanceKm: 10,
  tripStartedAt: '2026-01-01T10:00:00.000Z',
  tripEndedAt: '2026-01-01T10:00:10.000Z',
};

describe('tire-ds4-shadow P3B M3 dynamics', () => {
  it('constant speed yields zero kinetic delta', () => {
    expect(kineticDeltaJPerKg(50, 50)).toBe(0);
    const payload = mapDs4TripMapToTireShadowInput(
      baseRead({
        events: [
          manoeuvreEvent({ startSpeedKmh: 50, endSpeedKmh: 50, deltaKmh: 0 }),
        ],
      }),
      tripCtx,
    );
    expect(payload.acceleration.okM3JPerKgPerKmSum).toBe(0);
  });

  it('stop-and-go sums accel and decel M3 separately', () => {
    const payload = mapDs4TripMapToTireShadowInput(
      baseRead({
        events: [
          manoeuvreEvent({ displayKind: 'ACCELERATION', startSpeedKmh: 0, endSpeedKmh: 36 }),
          manoeuvreEvent({
            id: 'e2',
            displayKind: 'DECELERATION',
            kind: 'DECELERATION',
            startSpeedKmh: 36,
            endSpeedKmh: 0,
            deltaKmh: -36,
          }),
        ],
      }),
      tripCtx,
    );
    expect(payload.acceleration.okM3EventCount).toBe(1);
    expect(payload.deceleration.okM3EventCount).toBe(1);
    expect(payload.acceleration.okM3JPerKgPerKmSum).toBeGreaterThan(0);
    expect(payload.deceleration.okM3JPerKgPerKmSum).toBeGreaterThan(0);
  });

  it('strong braking produces larger M3 than mild accel at same distance', () => {
    const mild = m3ContributionJPerKgPerKm(
      manoeuvreEvent({ startSpeedKmh: 10, endSpeedKmh: 20 }),
      10,
    )!;
    const strong = m3ContributionJPerKgPerKm(
      manoeuvreEvent({
        displayKind: 'DECELERATION',
        startSpeedKmh: 100,
        endSpeedKmh: 20,
        deltaKmh: -80,
      }),
      10,
    )!;
    expect(strong).toBeGreaterThan(mild);
  });

  it('excludes ARTEFACT_SUSPECT from M3 while preserving artefact counters', () => {
    const payload = mapDs4TripMapToTireShadowInput(
      baseRead({
        events: [manoeuvreEvent({ artefactSuspect: true })],
      }),
      tripCtx,
    );
    expect(payload.acceleration.excludedArtefactCount).toBe(1);
    expect(payload.acceleration.okM3EventCount).toBe(0);
  });

  it('skips M3 on null trip distance but keeps OK counts', () => {
    const payload = mapDs4TripMapToTireShadowInput(
      baseRead({ events: [manoeuvreEvent()] }),
      { ...tripCtx, tripDistanceKm: 0 },
    );
    expect(payload.tripDistanceKm).toBeNull();
    expect(payload.acceleration.okCount).toBe(1);
    expect(payload.acceleration.okM3EventCount).toBe(0);
  });

  it('records speedAuthority C5_1_PREFERRED without changing M3 formula', () => {
    const payload = mapDs4TripMapToTireShadowInput(
      baseRead({
        speedAuthority: 'C5_1_PREFERRED',
        events: [manoeuvreEvent()],
      }),
      tripCtx,
    );
    expect(payload.speedAuthority).toBe('C5_1_PREFERRED');
    expect(payload.schemaVersion).toBe(TIRE_DS4_SHADOW_INPUT_PAYLOAD_SCHEMA_VERSION);
  });
});

describe('tire-ds4-shadow P3B temporal coverage', () => {
  it('marks PARTIAL when labelled fraction below Fable 85% hypothesis', () => {
    const read = baseRead({
      samples: [
        {
          bucketLabelUtc: '2026-01-01T10:00:00.000Z',
          speedKmh: 30,
          motionState: 'MOVING',
          evidenceQuality: 'OK',
          latitude: null,
          longitude: null,
          positionAvailability: null,
        },
        {
          bucketLabelUtc: '2026-01-01T10:00:02.000Z',
          speedKmh: 30,
          motionState: 'MOVING',
          evidenceQuality: 'OK',
          latitude: null,
          longitude: null,
          positionAvailability: null,
        },
      ],
    });
    const { temporalCoverage, detail } = computeTemporalCoverage(read, {
      tripDistanceKm: 5,
      tripStartedAt: '2026-01-01T10:00:00.000Z',
      tripEndedAt: '2026-01-01T10:01:00.000Z',
    });
    expect(temporalCoverage).not.toBe('VERIFIED');
    expect(detail.fableHypothesis85PctThreshold).toBe(0.85);
    expect(detail.labelledFraction).not.toBeNull();
    if (detail.labelledFraction != null) {
      expect(detail.labelledFraction).toBeLessThan(0.85);
    }
    expect(detail.verified).toBe(false);
  });

  it('counts confirmed stationary only for observed non-inferred OK stops', () => {
    const { detail } = computeTemporalCoverage(
      baseRead({
        stopEpisodes: [
          {
            id: 's1',
            startEarliestUtc: '2026-01-01T10:00:05.000Z',
            startLatestUtc: '2026-01-01T10:00:05.000Z',
            endEarliestUtc: '2026-01-01T10:00:07.000Z',
            endLatestUtc: '2026-01-01T10:00:07.000Z',
            minDurationS: 2,
            maxDurationS: 2,
            evidenceQuality: 'OK',
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
      {
        tripDistanceKm: 2,
        tripStartedAt: '2026-01-01T10:00:00.000Z',
        tripEndedAt: '2026-01-01T10:00:10.000Z',
      },
    );
    expect(detail.confirmedStationarySeconds).toBe(3);
  });

  it('EV mild regen below event threshold yields no manoeuvre events (neutral)', () => {
    const payload = mapDs4TripMapToTireShadowInput(baseRead({ events: [] }), tripCtx);
    expect(payload.neutral).toBe(true);
    expect(payload.deceleration.okM3EventCount).toBe(0);
  });
});

describe('tire-ds4-shadow P3B repository idempotency', () => {
  it('returns unchanged when fingerprint matches', async () => {
    const prisma = {
      tireDs4MotionShadowInputV1: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'row-1',
          contentFingerprint: 'fp-same',
        }),
        create: jest.fn(),
      },
    };
    const repo = new TireDs4ShadowRepository(prisma as never);
    const result = await repo.insertShadowInputImmutable({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tireSetupId: 'setup-1',
      tireTripUsageLedgerId: 'ledger-1',
      diV0MotionCoreShadowRunId: 'run-1',
      workItemId: null,
      combinedInputIdentity: 'id',
      pinnedSnapshotHash: 'pin',
      contentFingerprint: 'fp-same',
      shadowBundleVersion: 'b',
      speedAuthority: 'C4_ONLY',
      eventsAlgorithmVersion: 'ev',
      adapterVersion: 'tire-ds4-shadow-input-v1.1.0',
      eventQualityCoverage: 'PARTIAL',
      temporalCoverage: 'PARTIAL',
      ds4ReadStatus: 'SUCCEEDED',
      inputPayload: {
        schemaVersion: 3,
        neutral: false,
        shadowBundleVersion: 'b',
        tripDistanceKm: 10,
        speedAuthority: 'C4_ONLY',
        acceleration: {
          okCount: 0,
          okDurationS: 0,
          okDeltaKmhAbsSum: 0,
          okM3JPerKgPerKmSum: 0,
          okM3EventCount: 0,
          degradedCount: 0,
          limitedCount: 0,
          excludedArtefactCount: 0,
          excludedOtherQualityCount: 0,
        },
        deceleration: {
          okCount: 0,
          okDurationS: 0,
          okDeltaKmhAbsSum: 0,
          okM3JPerKgPerKmSum: 0,
          okM3EventCount: 0,
          degradedCount: 0,
          limitedCount: 0,
          excludedArtefactCount: 0,
          excludedOtherQualityCount: 0,
        },
        eventQualityCoverage: 'NONE',
        temporalCoverage: 'NONE',
        temporalCoverageDetail: {
          tripWindowSeconds: 0,
          labelledSampleSeconds: 0,
          validDrivingSeconds: 0,
          confirmedStationarySeconds: 0,
          degradedLabelSeconds: 0,
          invalidLabelSeconds: 0,
          gapSeconds: 0,
          unknownSeconds: 0,
          labelledFraction: null,
          accountableFraction: null,
          fableHypothesis85PctThreshold: 0.85,
          verified: false,
        },
        limitations: [],
        newerFailedRunId: null,
        newerFailedRunStatus: null,
      },
    });
    expect(result).toBe('unchanged');
    expect(prisma.tireDs4MotionShadowInputV1.create).not.toHaveBeenCalled();
  });
});
