import { computeDiV0TripIntervals } from '../../core/compute-trip-intervals';
import { CALIBRATION_UNSET_V0_BUNDLE } from '../../core/calibration/CALIBRATION_UNSET_V0';
import { DEFAULT_DI_V0_VERSION_TUPLE } from '../../core/versions';
import { evaluateDiV0SpeedQcInterval } from '../../speed-qc/evaluate-di-v0-speed-qc-interval';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../../speed-qc/di-v0-speed-qc-policy.version';
import { DI_V0_SPEED_QC_REASON } from '../../speed-qc/di-v0-speed-qc-reason-codes';
import { presentObs } from '../../core/__tests__/test-helpers';
import { pilotFreshL3Triple } from '../../core/__tests__/fixtures/wob-pilot-golden.fixture';
import { motionFsmSparseVehicleSpeedFromR1 } from '../di-v0-r1-vehicle-speed-ds4-boundary';

const ctx = { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE };

describe('DS4 R1 vehicle speed boundary', () => {
  it('L3 intervals ignore R1 for sourceRelation and flags', () => {
    const positions = pilotFreshL3Triple();
    const centerLabel = '2026-09-26T09:57:21Z';
    const r1 = [
      {
        bucketLabel: centerLabel,
        temporalConfidence: 'INTERVAL_ONLY' as const,
        speedKmh: 200,
        provenance: { sourceSignal: 'speed', derivedFrom: ['test'] },
      },
    ];
    const without = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions }, ctx);
    const withR1 = computeDiV0TripIntervals(
      { sourceFamily: 'RUPTELA_R1', positions, r1Obd: r1 },
      ctx,
    );
    expect(withR1.intervals.map((i) => i.estimatedSpeedKmh)).toEqual(
      without.intervals.map((i) => i.estimatedSpeedKmh),
    );
    const center = withR1.intervals.find((i) => i.referenceTime === centerLabel);
    expect(center?.sourceRelation).toBe(without.intervals.find((i) => i.referenceTime === centerLabel)?.sourceRelation);
    expect(center?.sourceQualityFlags).not.toContain('R1_INTERVAL_ONLY');
  });

  it('speed QC ignores R1 vehicle speed for verdict', () => {
    const v = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: '2026-01-01T00:00:02Z',
      shadow: {
        intervalStart: '2026-01-01T00:00:01.500Z',
        intervalEnd: '2026-01-01T00:00:02.500Z',
        referenceTime: '2026-01-01T00:00:02Z',
        estimatedSpeedKmh: 36,
        speedEvidenceState: 'NUMERIC_HIGH',
        valueConfidence: 'HIGH',
        sourceRelation: 'SUPPORTED',
        motionState: 'MOVING_SPEED_ESTIMATED',
        positionState: 'FRESH',
        abstentionReason: null,
        sourceQualityFlags: [],
        evidenceSources: ['L3'],
      },
      positions: [
        {
          bucketLabel: '2026-01-01T00:00:01Z',
          availability: 'PRESENT',
          latitude: 52.0003,
          longitude: 9,
          positionState: 'FRESH',
        },
        {
          bucketLabel: '2026-01-01T00:00:02Z',
          availability: 'PRESENT',
          latitude: 52.0006,
          longitude: 9,
          positionState: 'FRESH',
        },
        {
          bucketLabel: '2026-01-01T00:00:03Z',
          availability: 'PRESENT',
          latitude: 52.0009,
          longitude: 9,
          positionState: 'FRESH',
        },
      ],
      r1Obd: [{ bucketLabel: '2026-01-01T00:00:02Z', speedKmh: 80, temporalConfidence: 'INTERVAL_ONLY' }],
      evidenceIdentity: { pinnedSnapshotHash: 'pin' },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });
    expect(v.reasonCodes).not.toContain(DI_V0_SPEED_QC_REASON.CROSS_SOURCE_CONFLICT);
    expect(v.reasonCodes).not.toContain(DI_V0_SPEED_QC_REASON.R1_DISAGREEMENT);
    expect(v.sourceCorroboration.r1CorroboratesL3).toBe(false);
  });

  it('motion FSM sparse input is always null (samples may still be persisted)', () => {
    expect(
      motionFsmSparseVehicleSpeedFromR1([{ label: '2026-01-01T00:00:01Z', speedKmh: 80 }], true),
    ).toBeNull();
    expect(motionFsmSparseVehicleSpeedFromR1([], false)).toBeNull();
  });
});
