import {
  CALIBRATION_UNSET_V0_BUNDLE,
  computeDiV0TripIntervals,
  DEFAULT_DI_V0_VERSION_TUPLE,
  classifyPositionRows,
} from '../../core/index';
import { presentObs, signalNullObs } from '../../core/__tests__/test-helpers';
import { pilotHoldThenRelease303m } from '../../core/__tests__/fixtures/wob-pilot-golden.fixture';
import { DI_V0_SPEED_QC_POLICY_V1, DI_V0_SPEED_QC_POLICY_V2, DiV0SpeedQcPolicyVersionError } from '../di-v0-speed-qc-policy.version';
import { DI_V0_SPEED_QC_REASON } from '../di-v0-speed-qc-reason-codes';
import { evaluateDiV0SpeedQcInterval } from '../evaluate-di-v0-speed-qc-interval';
import type { DiV0SpeedQcPositionSample } from '../di-v0-speed-qc.types';
import { syntheticHighway130Input } from './fixtures/synthetic-scenarios';
import { buildDiV0TripSpeedQualityIdempotencyKey } from '../../trip-speed-quality/di-v0-trip-speed-quality-idempotency';

const s1Ctx = { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE };

function positionsForQc(observations: ReturnType<typeof presentObs>[]): DiV0SpeedQcPositionSample[] {
  return classifyPositionRows(observations, CALIBRATION_UNSET_V0_BUNDLE).map((row) => ({
    bucketLabel: row.observation.bucketLabel,
    availability: row.observation.availability,
    latitude: row.observation.latitude,
    longitude: row.observation.longitude,
    positionState: row.positionState,
  }));
}

function freshStationaryShadow(centerLabel: string) {
  return {
    intervalStart: centerLabel,
    intervalEnd: centerLabel,
    referenceTime: centerLabel,
    estimatedSpeedKmh: null,
    speedEvidenceState: 'STATIONARY_BAND' as const,
    valueConfidence: 'HIGH' as const,
    sourceRelation: 'SUPPORTED' as const,
    motionState: 'STATIONARY_SUPPORTED' as const,
    positionState: 'FRESH' as const,
    abstentionReason: null,
    sourceQualityFlags: [] as string[],
    evidenceSources: [] as string[],
  };
}

describe('DI_V0_SPEED_QC_POLICY_V2 stationary semantics', () => {
  it('defaults to V1 when qcPolicyVersion omitted', () => {
    const step = 0.0000025;
    const observations = [
      presentObs('2026-01-01T00:00:00Z', 52, 9, 'API_SYNTHETIC'),
      presentObs('2026-01-01T00:00:01Z', 52, 9 + step, 'API_SYNTHETIC'),
      presentObs('2026-01-01T00:00:02Z', 52, 9 + step * 2, 'API_SYNTHETIC'),
    ];
    const center = '2026-01-01T00:00:01Z';
    const v1 = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: center,
      shadow: freshStationaryShadow(center),
      positions: positionsForQc(observations),
      evidenceIdentity: { pinnedSnapshotHash: 'pin' },
    });
    expect(v1.qcPolicyVersion).toBe(DI_V0_SPEED_QC_POLICY_V1);
    expect(v1.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.NO_NUMERIC);
  });

  it('V2 accepts fresh stationary null speed as TRUSTED_LIMITED without numeric speed', () => {
    const step = 0.0000025;
    const observations = [
      presentObs('2026-01-01T00:00:00Z', 52, 9, 'API_SYNTHETIC'),
      presentObs('2026-01-01T00:00:01Z', 52, 9 + step, 'API_SYNTHETIC'),
      presentObs('2026-01-01T00:00:02Z', 52, 9 + step * 2, 'API_SYNTHETIC'),
    ];
    const center = '2026-01-01T00:00:01Z';
    const v2 = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: center,
      shadow: freshStationaryShadow(center),
      positions: positionsForQc(observations),
      evidenceIdentity: { pinnedSnapshotHash: 'pin' },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });
    expect(v2.qcPolicyVersion).toBe(DI_V0_SPEED_QC_POLICY_V2);
    expect(v2.trustLevel).toBe('TRUSTED_LIMITED');
    expect(v2.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.OK_STATIONARY_NULL_SPEED);
    expect(v2.qcTrustedSpeedKmh).toBeNull();
    expect(v2.reasonCodes).not.toContain(DI_V0_SPEED_QC_REASON.NO_NUMERIC);
  });

  it('V2 accepts FROZEN_STOP_SUPPORTED stationary band with valid center only', () => {
    const center = '2026-01-01T00:00:01Z';
    const v2 = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: center,
      shadow: {
        ...freshStationaryShadow(center),
        positionState: 'FROZEN_STOP_SUPPORTED',
      },
      positions: [
        {
          bucketLabel: center,
          availability: 'PRESENT',
          latitude: 52,
          longitude: 9,
          positionState: 'FROZEN_STOP_SUPPORTED',
        },
      ],
      evidenceIdentity: { pinnedSnapshotHash: 'pin' },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });
    expect(v2.trustLevel).toBe('TRUSTED_LIMITED');
    expect(v2.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.OK_STATIONARY_NULL_SPEED);
  });

  it('V2 withholds FROZEN_UNRESOLVED', () => {
    const center = '2026-01-01T00:00:01Z';
    const v2 = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: center,
      shadow: {
        ...freshStationaryShadow(center),
        positionState: 'FROZEN_UNRESOLVED',
        motionState: 'TRANSITION_UNCERTAIN',
        speedEvidenceState: 'ABSTAINED',
      },
      positions: [
        { bucketLabel: center, availability: 'PRESENT', latitude: 52, longitude: 9, positionState: 'FROZEN_UNRESOLVED' },
      ],
      evidenceIdentity: { pinnedSnapshotHash: 'pin' },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });
    expect(v2.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.NO_NUMERIC);
  });

  it('V2 withholds neighbor hold on fresh stationary center', () => {
    const observations = [
      presentObs('2026-01-01T00:00:00Z', 52, 9, 'API_SYNTHETIC'),
      presentObs('2026-01-01T00:00:01Z', 52, 9, 'API_SYNTHETIC'),
      presentObs('2026-01-01T00:00:02Z', 52, 9, 'API_SYNTHETIC'),
    ];
    const positions = positionsForQc(observations);
    positions[0] = { ...positions[0], positionState: 'FROZEN_UNRESOLVED' };
    const center = '2026-01-01T00:00:01Z';
    const v2 = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: center,
      shadow: freshStationaryShadow(center),
      positions,
      evidenceIdentity: { pinnedSnapshotHash: 'pin' },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });
    expect(v2.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.FROZEN_OR_RELEASE_IN_SUPPORT);
  });

  it('V2 numeric movement unchanged vs V1', () => {
    const base = syntheticHighway130Input();
    const v1 = evaluateDiV0SpeedQcInterval(base);
    const v2 = evaluateDiV0SpeedQcInterval({ ...base, qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2 });
    expect(v2).toEqual({ ...v1, qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2 });
  });

  it('rejects unknown policy version', () => {
    expect(() =>
      evaluateDiV0SpeedQcInterval({
        ...syntheticHighway130Input(),
        qcPolicyVersion: 'DI_V0_SPEED_QC_POLICY_V99',
      }),
    ).toThrow(DiV0SpeedQcPolicyVersionError);
  });

  it('idempotency keys differ for V1 vs V2', () => {
    const base = {
      workItemId: 'wi',
      shadowRunId: 'sr',
      pinnedSnapshotHash: 'hash',
      boundaryFingerprint: 'bf',
      projectionVersion: 'DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1',
    };
    const k1 = buildDiV0TripSpeedQualityIdempotencyKey({ ...base, qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V1 });
    const k2 = buildDiV0TripSpeedQualityIdempotencyKey({ ...base, qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2 });
    expect(k1).not.toBe(k2);
  });

  it('MOVING_SPEED_UNKNOWN stays NO_NUMERIC under V2', () => {
    const s1 = computeDiV0TripIntervals(
      {
        sourceFamily: 'API_SYNTHETIC',
        positions: [
          presentObs('2026-01-01T00:00:00Z', 52, 9, 'API_SYNTHETIC'),
          presentObs('2026-01-01T00:00:01Z', 52.001, 9, 'API_SYNTHETIC'),
          presentObs('2026-01-01T00:00:02Z', 52.002, 9, 'API_SYNTHETIC'),
        ],
      },
      s1Ctx,
    );
    const row = s1.intervals.find((r) => r.motionState === 'MOVING_SPEED_UNKNOWN');
    if (!row) return;
    const v2 = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: row.referenceTime,
      shadow: {
        intervalStart: row.intervalStart,
        intervalEnd: row.intervalEnd,
        referenceTime: row.referenceTime,
        estimatedSpeedKmh: row.estimatedSpeedKmh,
        speedEvidenceState: row.speedEvidenceState,
        valueConfidence: row.valueConfidence,
        sourceRelation: row.sourceRelation,
        motionState: row.motionState,
        positionState: row.positionState,
        abstentionReason: row.abstentionReason,
        sourceQualityFlags: row.sourceQualityFlags,
        evidenceSources: row.evidenceSources,
      },
      positions: positionsForQc([
        presentObs('2026-01-01T00:00:00Z', 52, 9, 'API_SYNTHETIC'),
        presentObs('2026-01-01T00:00:01Z', 52.001, 9, 'API_SYNTHETIC'),
        presentObs('2026-01-01T00:00:02Z', 52.002, 9, 'API_SYNTHETIC'),
      ]),
      evidenceIdentity: { pinnedSnapshotHash: 'pin' },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });
    expect(v2.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.NO_NUMERIC);
  });

  it('RELEASE path stays NO_NUMERIC under V2', () => {
    const observations = pilotHoldThenRelease303m();
    const s1 = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions: observations }, s1Ctx);
    const release = s1.intervals.find((r) => r.positionState === 'RELEASE');
    expect(release).toBeDefined();
    const v2 = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: release!.referenceTime,
      shadow: {
        intervalStart: release!.intervalStart,
        intervalEnd: release!.intervalEnd,
        referenceTime: release!.referenceTime,
        estimatedSpeedKmh: release!.estimatedSpeedKmh,
        speedEvidenceState: release!.speedEvidenceState,
        valueConfidence: release!.valueConfidence,
        sourceRelation: release!.sourceRelation,
        motionState: release!.motionState,
        positionState: release!.positionState,
        abstentionReason: release!.abstentionReason,
        sourceQualityFlags: release!.sourceQualityFlags,
        evidenceSources: release!.evidenceSources,
      },
      positions: positionsForQc(observations),
      evidenceIdentity: { pinnedSnapshotHash: 'pin' },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });
    expect(v2.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.NO_NUMERIC);
  });

  it('ROW_ABSENT with null speed: V2 still NO_NUMERIC before missing-position on stationary candidate', () => {
    const center = '2026-01-01T00:00:01Z';
    const v2 = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: center,
      shadow: freshStationaryShadow(center),
      positions: [{ bucketLabel: center, availability: 'ROW_ABSENT', positionState: 'FRESH' }],
      evidenceIdentity: { pinnedSnapshotHash: 'pin' },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });
    expect(v2.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE);
  });

  it('SIGNAL_NULL blocks V2 stationary acceptance', () => {
    const observations = [
      presentObs('2026-01-01T00:00:00Z', 52, 9, 'API_SYNTHETIC'),
      signalNullObs('2026-01-01T00:00:01Z', 'API_SYNTHETIC'),
      presentObs('2026-01-01T00:00:02Z', 52, 9, 'API_SYNTHETIC'),
    ];
    const center = '2026-01-01T00:00:01Z';
    const v2 = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: center,
      shadow: freshStationaryShadow(center),
      positions: positionsForQc(observations),
      evidenceIdentity: { pinnedSnapshotHash: 'pin' },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });
    expect(v2.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE);
  });
});
