import { VehicleDetectionProfile } from '@prisma/client';

import { DETECTION_PHASES } from './detectors/detector.interfaces';
import { TripDetectionPolicyResolver } from './policy/trip-detection-policy.resolver';
import {
  START_DETECTION_PHASES,
  assessLiveStartSnapshotFreshness,
  classifySpeedMotionBand,
  getSharedSignalThresholds,
  getStartCandidatePolicy,
  getStartConfirmationPolicy,
} from './trip-start-detection-policy';
import {
  evaluateSnapshotEvidence,
  getProfileThresholds,
  validateTripStart,
} from './trip-evidence.helpers';
import type { SnapshotEvidenceSignals } from './trip-detection.types';
import type { TripCoreDataPoint } from '../../dimo/dimo-segments.service';

function snap(
  partial: Partial<SnapshotEvidenceSignals> & {
    isIgnitionOn?: boolean | null;
    speedKmh?: number | null;
    engineLoad?: number | null;
  },
): SnapshotEvidenceSignals {
  return {
    isIgnitionOn: partial.isIgnitionOn ?? null,
    speedKmh: partial.speedKmh ?? null,
    engineLoad: partial.engineLoad ?? null,
    latitude: partial.latitude ?? 48.1,
    longitude: partial.longitude ?? 11.5,
    odometerKm: partial.odometerKm ?? null,
    fuelLevelAbsolute: partial.fuelLevelAbsolute ?? null,
    evSoc: partial.evSoc ?? null,
    tractionBatteryPowerKw: partial.tractionBatteryPowerKw ?? null,
    sourceTimestamp: partial.sourceTimestamp ?? new Date(),
  };
}

const PROFILES = ['ICE', 'EV', 'HYBRID', 'UNKNOWN'] as const;

describe('R4 — start detection phase contracts', () => {
  it('exposes distinct candidate and confirmation policy objects', () => {
    for (const profile of PROFILES) {
      const candidate = getStartCandidatePolicy(profile);
      const confirmation = getStartConfirmationPolicy(profile);
      expect(candidate.phase).toBe(START_DETECTION_PHASES.START_CANDIDATE_WAKE);
      expect(confirmation.phase).toBe(START_DETECTION_PHASES.START_CONFIRMATION);
      expect(candidate.shared.speedActiveKmh).toBe(
        confirmation.shared.speedActiveKmh,
      );
      expect((candidate as any).ignitionWeight).toBeUndefined();
      expect((confirmation as any).trigger).toBeUndefined();
    }
  });

  it('legacy getProfileThresholds merges shared + confirmation weights only', () => {
    const merged = getProfileThresholds('ICE');
    expect(merged.speedActiveKmh).toBe(5);
    expect(merged.ignitionWeight).toBe(3);
    expect((merged as any).trigger).toBeUndefined();
  });
});

describe('R4 — candidate profile matrix', () => {
  it.each([
    ['ICE', true, 0, 2, true],
    ['EV', true, 0, 1, false],
    ['HYBRID', true, 0, 2, true],
    ['UNKNOWN', true, 0, 1, false],
  ] as const)(
    '%s ignition-only: strong=%i triggered=%s',
    (profile, ignition, speed, expectedStrong, expectedTriggered) => {
      const result = evaluateSnapshotEvidence(
        snap({ isIgnitionOn: ignition, speedKmh: speed }),
        null,
        profile,
      );
      expect(result.strong).toBe(expectedStrong);
      expect(result.triggered).toBe(expectedTriggered);
      expect(result.hasMovement).toBe(false);
      expect(result.candidatePhase).toBe(
        START_DETECTION_PHASES.START_CANDIDATE_WAKE,
      );
    },
  );

  it('ICE speed-only strong movement above speedActiveKmh', () => {
    const result = evaluateSnapshotEvidence(
      snap({ isIgnitionOn: false, speedKmh: 6 }),
      null,
      'ICE',
    );
    expect(result.triggered).toBe(true);
    expect(result.hasMovement).toBe(true);
    expect(result.strong).toBeGreaterThanOrEqual(1);
  });

  it.each(PROFILES)(
    '%s: speed <= speedMotionKmh does not classify speed as movement',
    (profile) => {
      const shared = getSharedSignalThresholds(profile);
      const result = evaluateSnapshotEvidence(
        snap({ isIgnitionOn: false, speedKmh: shared.speedMotionKmh }),
        null,
        profile,
      );
      expect(result.hasMovement).toBe(false);
      expect(result.reasons.some((r) => r.startsWith('lowSpeed'))).toBe(false);
    },
  );

  it.each(PROFILES)(
    '%s: low-speed weak band uses speedMotionKmh < speed <= speedActiveKmh',
    (profile) => {
      const shared = getSharedSignalThresholds(profile);
      const speed = shared.speedMotionKmh + 0.1;
      expect(classifySpeedMotionBand(speed, shared)).toBe('weak');
      const result = evaluateSnapshotEvidence(
        snap({ isIgnitionOn: false, speedKmh: speed }),
        null,
        profile,
      );
      expect(result.hasMovement).toBe(true);
      expect(result.weak).toBeGreaterThanOrEqual(1);
    },
  );

  it('odometer progress triggers candidate movement', () => {
    const result = evaluateSnapshotEvidence(
      snap({ isIgnitionOn: false, speedKmh: 0, odometerKm: 100.2 }),
      {
        latitude: 48.1,
        longitude: 11.5,
        odometerKm: 100,
        fuelLevelAbsolute: null,
        evSoc: null,
      },
      'ICE',
    );
    expect(result.triggered).toBe(true);
    expect(result.hasMovement).toBe(true);
    expect(result.reasons).toContain('odometer+');
  });

  it('GPS movement triggers candidate', () => {
    const result = evaluateSnapshotEvidence(
      snap({ latitude: 48.2, longitude: 11.6, speedKmh: 0 }),
      {
        latitude: 48.1,
        longitude: 11.5,
        odometerKm: null,
        fuelLevelAbsolute: null,
        evSoc: null,
      },
      'ICE',
    );
    expect(result.triggered).toBe(true);
    expect(result.hasMovement).toBe(true);
  });

  it('EV traction battery draw contributes to candidate score', () => {
    const result = evaluateSnapshotEvidence(
      snap({ tractionBatteryPowerKw: -20, speedKmh: 0 }),
      null,
      'EV',
    );
    expect(result.strong).toBeGreaterThanOrEqual(1);
    expect(result.reasons.some((r) => r.includes('batteryOut'))).toBe(true);
  });

  it('composite weak evidence can trigger candidate via minWeak', () => {
    const result = evaluateSnapshotEvidence(
      snap({
        isIgnitionOn: false,
        speedKmh: 0.6,
        engineLoad: 5,
        fuelLevelAbsolute: 50,
        tractionBatteryPowerKw: -5,
      }),
      {
        latitude: 48.1,
        longitude: 11.5,
        odometerKm: null,
        fuelLevelAbsolute: 49,
        evSoc: null,
      },
      'UNKNOWN',
    );
    expect(result.weak).toBeGreaterThanOrEqual(3);
    expect(result.triggered).toBe(true);
  });
});

describe('R4 — confirmation weighted contract preserved', () => {
  function corePoint(
    speed: number,
    ignition: boolean,
    ts: string,
  ): TripCoreDataPoint {
    return {
      timestamp: ts,
      isIgnitionOn: ignition,
      speed,
      travelledDistance: null,
      fuelAbsoluteLevel: null,
      batteryEnergy: null,
    };
  }

  it('validateTripStart uses confirmation evidence weights, not candidate increments', () => {
    const points = [
      corePoint(6, true, '2026-01-01T00:00:00Z'),
      corePoint(8, true, '2026-01-01T00:00:30Z'),
      corePoint(10, true, '2026-01-01T00:01:00Z'),
    ];
    const result = validateTripStart(
      points,
      { isIgnitionOn: true, speedKmh: 10, engineLoad: 20 },
      'ICE',
    );
    expect(result.confirmed).toBe(true);
    expect(result.summary.confirmationPhase).toBe(
      START_DETECTION_PHASES.START_CONFIRMATION,
    );
    expect(result.summary.evidenceWeights).toEqual(
      getStartConfirmationPolicy('ICE').evidenceWeights,
    );
    expect((result.summary as any).trigger).toBeUndefined();
  });
});

describe('R4 — LIVE_START freshness authority', () => {
  const resolver = new TripDetectionPolicyResolver();

  it('FRESH provider timestamp keeps SnapshotEvidenceEvaluator eligible', () => {
    const now = new Date('2026-09-06T12:00:00Z');
    const fresh = assessLiveStartSnapshotFreshness({
      providerSourceTimestamp: new Date('2026-09-06T11:59:30Z'),
      workerNow: now,
    });
    expect(fresh.state).toBe('FRESH');
    expect(fresh.timestampSource).toBe('PROVIDER_EVENT_TIME');

    const policy = resolver.resolve({
      phase: DETECTION_PHASES.LIVE_START,
      profile: VehicleDetectionProfile.ICE,
      dataQuality: {
        ...resolver.assessDataQuality({
          snapshotFreshMs: fresh.snapshotFreshMs,
          ignitionAvailable: true,
          speedAvailable: true,
          odometerAvailable: true,
          corePointCount: 1,
          hasRoutePoints: false,
          hasHighFrequency: false,
        }),
        snapshotFreshness: 'FRESH',
      },
    });
    expect(policy.detectors).toEqual(['SnapshotEvidenceEvaluator']);
  });

  it('STALE provider timestamp blocks LIVE_START detectors', () => {
    const policy = resolver.resolve({
      phase: DETECTION_PHASES.LIVE_START,
      profile: VehicleDetectionProfile.EV,
      dataQuality: {
        snapshotFreshness: 'STALE',
        ignitionAvailable: true,
        speedAvailable: true,
        odometerAvailable: true,
        telemetryDensity: 'LOW',
        routeCoverage: 'NONE',
        highFrequencyAvailable: false,
      },
    });
    expect(policy.detectors).toEqual([]);
    expect(policy.skipReason).toBe('live_start_stale_snapshot');
  });

  it('MISSING provider timestamp blocks LIVE_START without DB-time fallback', () => {
    const missing = assessLiveStartSnapshotFreshness({
      providerSourceTimestamp: null,
    });
    expect(missing.state).toBe('MISSING');
    expect(missing.timestampSource).toBe('NONE');

    const policy = resolver.resolve({
      phase: DETECTION_PHASES.LIVE_START,
      profile: VehicleDetectionProfile.HYBRID,
      dataQuality: {
        snapshotFreshness: 'MISSING',
        ignitionAvailable: true,
        speedAvailable: true,
        odometerAvailable: false,
        telemetryDensity: 'LOW',
        routeCoverage: 'NONE',
        highFrequencyAvailable: false,
      },
    });
    expect(policy.detectors).toEqual([]);
    expect(policy.skipReason).toBe('live_start_missing_provider_timestamp');
  });

  it('future-invalid provider timestamp is not classified FRESH', () => {
    const now = new Date('2026-09-06T12:00:00Z');
    const invalid = assessLiveStartSnapshotFreshness({
      providerSourceTimestamp: new Date('2026-09-06T12:05:00Z'),
      workerNow: now,
    });
    expect(invalid.state).toBe('INVALID_TIMESTAMP');
    expect(invalid.snapshotFreshMs).toBeNull();
  });
});

describe('R4 — ClickHouse boundary (P4-F08)', () => {
  const resolver = new TripDetectionPolicyResolver();

  it('LIVE_START never selects ClickHouse-only detectors from RESTING', () => {
    const policy = resolver.resolve({
      phase: DETECTION_PHASES.LIVE_START,
      profile: VehicleDetectionProfile.EV,
      dataQuality: {
        snapshotFreshness: 'FRESH',
        ignitionAvailable: false,
        speedAvailable: true,
        odometerAvailable: true,
        telemetryDensity: 'HIGH',
        routeCoverage: 'NONE',
        highFrequencyAvailable: true,
      },
    });
    expect(policy.detectors).not.toContain('ActivityWindowDetector');
    expect(policy.detectors).not.toContain('IgnitionSegmentDetector');
    expect(policy.detectors).not.toContain('MotionSegmentDetector');
  });

  it('confirmation phase may include ClickHouse corroboration detectors', () => {
    const policy = resolver.resolve({
      phase: DETECTION_PHASES.ACTIVE_TRIP,
      profile: VehicleDetectionProfile.EV,
      dataQuality: {
        snapshotFreshness: 'FRESH',
        ignitionAvailable: false,
        speedAvailable: true,
        odometerAvailable: true,
        telemetryDensity: 'HIGH',
        routeCoverage: 'NONE',
        highFrequencyAvailable: true,
      },
      anomalyContext: {
        confirmingStart: true,
        clickhouseAvailable: true,
      },
    });
    expect(policy.detectors).toContain('StartConfirmationDetector');
    expect(policy.detectors).toContain('ActivityWindowDetector');
    expect(policy.detectors).toContain('MotionSegmentDetector');
  });
});
