import {
  CALIBRATION_UNSET_V0_BUNDLE,
  computeDiV0TripIntervals,
  DEFAULT_DI_V0_VERSION_TUPLE,
  classifyPositionRows,
} from '../../core/index';
import { presentObs } from '../../core/__tests__/test-helpers';
import { DI_V0_SPEED_QC_REASON } from '../di-v0-speed-qc-reason-codes';
import { evaluateDiV0SpeedQcInterval } from '../evaluate-di-v0-speed-qc-interval';
import type { DiV0SpeedQcPositionSample } from '../di-v0-speed-qc.types';
import { syntheticHighway130Input } from './fixtures/synthetic-scenarios';

const s1Ctx = {
  versions: DEFAULT_DI_V0_VERSION_TUPLE,
  calibration: CALIBRATION_UNSET_V0_BUNDLE,
};

function positionsForQc(observations: ReturnType<typeof presentObs>[]): DiV0SpeedQcPositionSample[] {
  return classifyPositionRows(observations, CALIBRATION_UNSET_V0_BUNDLE).map((row) => ({
    bucketLabel: row.observation.bucketLabel,
    availability: row.observation.availability,
    latitude: row.observation.latitude,
    longitude: row.observation.longitude,
    positionState: row.positionState,
  }));
}

function qcFromS1Interval(
  interval: ReturnType<typeof computeDiV0TripIntervals>['intervals'][number],
  qcPositions: DiV0SpeedQcPositionSample[],
  r1Obd: { bucketLabel: string; speedKmh: number }[] = [],
) {
  return evaluateDiV0SpeedQcInterval({
    centerBucketLabel: interval.referenceTime,
    shadow: {
      intervalStart: interval.intervalStart,
      intervalEnd: interval.intervalEnd,
      referenceTime: interval.referenceTime,
      estimatedSpeedKmh: interval.estimatedSpeedKmh,
      speedEvidenceState: interval.speedEvidenceState,
      valueConfidence: interval.valueConfidence,
      sourceRelation: interval.sourceRelation,
      motionState: interval.motionState,
      positionState: interval.positionState,
      abstentionReason: interval.abstentionReason,
      sourceQualityFlags: interval.sourceQualityFlags,
      evidenceSources: interval.evidenceSources,
    },
    positions: qcPositions,
    r1Obd,
    evidenceIdentity: { pinnedSnapshotHash: 'pin-composed' },
  });
}

describe('S1 shadow output composed through P1 speed QC', () => {
  it('fresh GPS stop: estimatedSpeedKmh null → NO_NUMERIC (not TRUSTED_LIMITED)', () => {
    const step = 0.0000025;
    const observations = [
      presentObs('2026-01-01T00:00:00Z', 52, 9, 'API_SYNTHETIC'),
      presentObs('2026-01-01T00:00:01Z', 52, 9 + step, 'API_SYNTHETIC'),
      presentObs('2026-01-01T00:00:02Z', 52, 9 + step * 2, 'API_SYNTHETIC'),
      presentObs('2026-01-01T00:00:03Z', 52, 9 + step * 3, 'API_SYNTHETIC'),
    ];
    const s1 = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions: observations }, s1Ctx);
    const center = s1.intervals[2];
    expect(center.estimatedSpeedKmh).toBeNull();
    expect(center.speedEvidenceState).toBe('STATIONARY_BAND');
    const v = qcFromS1Interval(center, positionsForQc(observations));
    expect(v.trustLevel).toBe('UNTRUSTED');
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.NO_NUMERIC);
    expect(v.reasonCodes).not.toContain(DI_V0_SPEED_QC_REASON.OK_MODERATE);
  });

  it('uniform GPS motion without R1 stays numeric and can reach TRUSTED', () => {
    const observations = [
      presentObs('2026-01-01T00:00:00Z', 52, 9, 'API_SYNTHETIC'),
      presentObs('2026-01-01T00:00:01Z', 52.0003, 9, 'API_SYNTHETIC'),
      presentObs('2026-01-01T00:00:02Z', 52.0006, 9, 'API_SYNTHETIC'),
      presentObs('2026-01-01T00:00:03Z', 52.0009, 9, 'API_SYNTHETIC'),
    ];
    const s1 = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions: observations }, s1Ctx);
    const moving = s1.intervals.find((r) => r.motionState === 'MOVING_SPEED_ESTIMATED');
    expect(moving?.estimatedSpeedKmh).not.toBeNull();
    const v = qcFromS1Interval(moving!, positionsForQc(observations));
    expect(v.reasonCodes).not.toContain(DI_V0_SPEED_QC_REASON.NO_NUMERIC);
    expect(v.trustLevel).toBe('TRUSTED');
  });

  it('conflicting R1 does not replace GPS L3; shadow CONFLICTING → CROSS_SOURCE_CONFLICT', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      shadow: {
        ...base.shadow,
        estimatedSpeedKmh: 36,
        sourceRelation: 'CONFLICTING',
      },
      r1Obd: [{ bucketLabel: base.centerBucketLabel, speedKmh: 80 }],
    });
    expect(v.originalEstimatedSpeedKmh).toBe(36);
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.CROSS_SOURCE_CONFLICT);
  });

  it('ROW_ABSENT with null S1 speed yields NO_NUMERIC before MISSING_POSITION_EVIDENCE', () => {
    const base = syntheticHighway130Input();
    const absent = base.centerBucketLabel;
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      shadow: { ...base.shadow, estimatedSpeedKmh: null },
      positions: base.positions.map((p) =>
        p.bucketLabel === absent ? { ...p, availability: 'ROW_ABSENT' } : p,
      ),
    });
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.NO_NUMERIC);
    expect(v.reasonCodes).not.toContain(DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE);
  });
});
