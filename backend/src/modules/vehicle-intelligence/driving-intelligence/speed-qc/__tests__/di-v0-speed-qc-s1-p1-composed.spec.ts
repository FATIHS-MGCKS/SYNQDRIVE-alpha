import {
  CALIBRATION_UNSET_V0_BUNDLE,
  computeDiV0TripIntervals,
  DEFAULT_DI_V0_VERSION_TUPLE,
  classifyPositionRows,
} from '../../core/index';
import { presentObs } from '../../core/__tests__/test-helpers';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../di-v0-speed-qc-policy.version';
import { DI_V0_SPEED_QC_REASON } from '../di-v0-speed-qc-reason-codes';
import { evaluateDiV0SpeedQcInterval } from '../evaluate-di-v0-speed-qc-interval';
import type { DiV0SpeedQcPositionSample } from '../di-v0-speed-qc.types';
import { pilotHoldThenRelease303m } from '../../core/__tests__/fixtures/wob-pilot-golden.fixture';
import { signalNullObs } from '../../core/__tests__/test-helpers';
import { buildDiV0TripSpeedQualityProjectionV1 } from '../../trip-speed-quality/build-di-v0-trip-speed-quality-projection.v1';
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
      r1Obd: [{ bucketLabel: base.centerBucketLabel, speedKmh: 80, temporalConfidence: 'INTERVAL_ONLY' }],
    });
    expect(v.originalEstimatedSpeedKmh).toBe(36);
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.CROSS_SOURCE_CONFLICT);
  });

  it('S1 FROZEN_STOP_SUPPORTED with real flags: V2 withholds SUPPORT_WINDOW_COMPROMISED', () => {
    const lat = 51.3353783;
    const lon = 9.506005;
    const observations = [];
    for (let s = 0; s < 5; s += 1) {
      const label = new Date(Date.parse('2026-09-26T10:00:00Z') + s * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, 'Z');
      observations.push(presentObs(label, lat, lon, 'RUPTELA_R1'));
    }
    observations.push(presentObs('2026-09-26T10:00:05Z', lat + 1 / 111_320, lon, 'RUPTELA_R1'));
    observations.push(presentObs('2026-09-26T10:00:06Z', lat + 2 / 111_320, lon, 'RUPTELA_R1'));
    const s1 = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions: observations }, s1Ctx);
    const frozenStop = s1.intervals.find(
      (r) =>
        r.positionState === 'FROZEN_STOP_SUPPORTED' &&
        r.motionState === 'STATIONARY_SUPPORTED' &&
        r.speedEvidenceState === 'STATIONARY_BAND',
    );
    expect(frozenStop).toBeDefined();
    expect(frozenStop!.estimatedSpeedKmh).toBeNull();
    expect(frozenStop!.sourceQualityFlags).toContain('L3_SUPPORT_CROSSES_GAP');
    const v1 = qcFromS1Interval(frozenStop!, positionsForQc(observations));
    expect(v1.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.NO_NUMERIC);
    const v2 = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: frozenStop!.referenceTime,
      shadow: {
        intervalStart: frozenStop!.intervalStart,
        intervalEnd: frozenStop!.intervalEnd,
        referenceTime: frozenStop!.referenceTime,
        estimatedSpeedKmh: frozenStop!.estimatedSpeedKmh,
        speedEvidenceState: frozenStop!.speedEvidenceState,
        valueConfidence: frozenStop!.valueConfidence,
        sourceRelation: frozenStop!.sourceRelation,
        motionState: frozenStop!.motionState,
        positionState: frozenStop!.positionState,
        abstentionReason: frozenStop!.abstentionReason,
        sourceQualityFlags: frozenStop!.sourceQualityFlags,
        evidenceSources: frozenStop!.evidenceSources,
      },
      positions: positionsForQc(observations),
      evidenceIdentity: { pinnedSnapshotHash: 'pin-composed' },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });
    expect(v2.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.SUPPORT_WINDOW_COMPROMISED);
    expect(v2.reasonCodes).not.toContain(DI_V0_SPEED_QC_REASON.OK_STATIONARY_NULL_SPEED);
  });

  it('FROZEN hold path: S1 null speed → P1 NO_NUMERIC', () => {
    const observations = pilotHoldThenRelease303m().slice(0, 4);
    const s1 = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions: observations }, s1Ctx);
    const held = s1.intervals.find((r) => /^FROZEN_/.test(r.positionState));
    expect(held).toBeDefined();
    expect(held!.estimatedSpeedKmh).toBeNull();
    const v = qcFromS1Interval(held!, positionsForQc(observations));
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.NO_NUMERIC);
  });

  it('RELEASE row: S1 forbids numeric speed; P1 NO_NUMERIC', () => {
    const observations = pilotHoldThenRelease303m();
    const s1 = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions: observations }, s1Ctx);
    const release = s1.intervals.find((r) => r.positionState === 'RELEASE');
    expect(release?.estimatedSpeedKmh).toBeNull();
    const v = qcFromS1Interval(release!, positionsForQc(observations));
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.NO_NUMERIC);
  });

  it('SIGNAL_NULL position → S1 abstains; P1 NO_NUMERIC', () => {
    const observations = [
      presentObs('2026-01-01T00:00:00Z', 52, 9, 'API_SYNTHETIC'),
      signalNullObs('2026-01-01T00:00:01Z', 'API_SYNTHETIC'),
      presentObs('2026-01-01T00:00:02Z', 52.0002, 9, 'API_SYNTHETIC'),
    ];
    const s1 = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions: observations }, s1Ctx);
    const center = s1.intervals[1];
    expect(center.estimatedSpeedKmh).toBeNull();
    const v = qcFromS1Interval(center, positionsForQc(observations));
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.NO_NUMERIC);
  });

  it('S1 R1 vs GPS conflict flows to P1 CROSS_SOURCE_CONFLICT and P2 counter', () => {
    const observations = [
      presentObs('2026-01-01T00:00:00Z', 52, 9, 'RUPTELA_R1'),
      presentObs('2026-01-01T00:00:01Z', 52.0003, 9, 'RUPTELA_R1'),
      presentObs('2026-01-01T00:00:02Z', 52.0006, 9, 'RUPTELA_R1'),
      presentObs('2026-01-01T00:00:03Z', 52.0009, 9, 'RUPTELA_R1'),
    ];
    const r1 = [
      {
        bucketLabel: '2026-01-01T00:00:02Z',
        temporalConfidence: 'INTERVAL_ONLY' as const,
        speedKmh: 200,
        provenance: { sourceSignal: 'speed', derivedFrom: ['test'] },
      },
    ];
    const s1 = computeDiV0TripIntervals(
      { sourceFamily: 'RUPTELA_R1', positions: observations, r1Obd: r1 },
      s1Ctx,
    );
    const moving = s1.intervals.find(
      (r) => r.referenceTime === '2026-01-01T00:00:02Z' && r.motionState === 'MOVING_SPEED_ESTIMATED',
    );
    expect(moving?.sourceRelation).toMatch(/CONFLICT/);
    const qc = qcFromS1Interval(moving!, positionsForQc(observations), r1);
    expect(qc.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.CROSS_SOURCE_CONFLICT);
    const projection = buildDiV0TripSpeedQualityProjectionV1({
      organizationId: 'o',
      vehicleId: 'v',
      tripId: 't',
      workItemId: 'w',
      shadowRunId: 'sr',
      pinnedSnapshotHash: 'pin',
      boundaryFingerprint: 'bf',
      sourceFamily: 'RUPTELA_R1',
      combinedInputIdentity: 'ci',
      shadowInputEvidenceVersion: 'iev',
      workItemCompletedAt: new Date(),
      snapshotVerified: true,
      evidence: { positions: positionsForQc(observations), positionStateByLabel: new Map(), r1Obd: r1 },
      shadowIntervals: s1.intervals.map((r) => ({
        intervalStart: new Date(r.intervalStart),
        intervalEnd: new Date(r.intervalEnd),
        referenceTime: new Date(r.referenceTime),
        motionState: r.motionState,
        positionState: r.positionState,
        estimatedSpeedKmh: r.estimatedSpeedKmh,
        speedEvidenceState: r.speedEvidenceState,
        valueConfidence: r.valueConfidence,
        sourceRelation: r.sourceRelation,
        abstentionReason: r.abstentionReason,
        evidenceSources: r.evidenceSources,
        sourceQualityFlags: r.sourceQualityFlags,
      })),
    });
    expect(projection.quality.reasonCodeBreakdown.CROSS_SOURCE_CONFLICT).toBeGreaterThanOrEqual(1);
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
