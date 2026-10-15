import type { MotionState } from '../../core/types';
import { buildDiV0TripSpeedQualityProjectionV1 } from '../build-di-v0-trip-speed-quality-projection.v1';
import {
  CANONICAL_DI_V0_MOTION_STATES,
  emptyDiV0TripSpeedQualityMotionCounts,
  incrementDiV0TripSpeedQualityMotionCounter,
} from '../di-v0-trip-speed-quality-motion';
import { syntheticHighway130Input } from '../../speed-qc/__tests__/fixtures/synthetic-scenarios';

describe('DiV0TripSpeedQuality motion counters', () => {
  it('maps every canonical MotionState to exactly one counter', () => {
    for (const state of CANONICAL_DI_V0_MOTION_STATES) {
      const counts = emptyDiV0TripSpeedQualityMotionCounts();
      incrementDiV0TripSpeedQualityMotionCounter(state, counts);
      const sum = Object.values(counts).reduce((a, b) => a + b, 0);
      expect(sum).toBe(1);
    }
  });

  it('rejects unknown motion states', () => {
    const counts = emptyDiV0TripSpeedQualityMotionCounts();
    expect(() => incrementDiV0TripSpeedQualityMotionCounter('UNCERTAIN', counts)).toThrow(/UNKNOWN_MOTION_STATE/);
  });

  it('motion counter sum equals total intervals in projection build', () => {
    const base = syntheticHighway130Input();
    const states: MotionState[] = [
      'STATIONARY_SUPPORTED',
      'MOVING_SPEED_ESTIMATED',
      'MOVING_SPEED_UNKNOWN',
      'TRANSITION_UNCERTAIN',
      'NO_MOTION_EVIDENCE',
    ];
    const shadowIntervals = states.map((motionState, i) => ({
      intervalStart: new Date(base.shadow.intervalStart),
      intervalEnd: new Date(base.shadow.intervalEnd),
      referenceTime: new Date(Date.parse(base.shadow.referenceTime) + i * 1000),
      motionState,
      positionState: base.shadow.positionState,
      estimatedSpeedKmh: base.shadow.estimatedSpeedKmh,
      speedEvidenceState: base.shadow.speedEvidenceState,
      valueConfidence: base.shadow.valueConfidence,
      sourceRelation: base.shadow.sourceRelation,
      abstentionReason: base.shadow.abstentionReason,
      evidenceSources: base.shadow.evidenceSources,
      sourceQualityFlags: base.shadow.sourceQualityFlags,
    }));
    const p = buildDiV0TripSpeedQualityProjectionV1({
      organizationId: 'o',
      vehicleId: 'v',
      tripId: 't',
      workItemId: 'w',
      shadowRunId: 'r',
      pinnedSnapshotHash: 'h',
      boundaryFingerprint: 'fp',
      sourceFamily: 'API_SYNTHETIC',
      combinedInputIdentity: null,
      shadowInputEvidenceVersion: null,
      workItemCompletedAt: null,
      snapshotVerified: true,
      evidence: {
        positions: base.positions,
        positionStateByLabel: new Map(),
        r1Obd: [],
      },
      shadowIntervals,
    });
    const motionSum =
      p.motion.stationarySupportedCount +
      p.motion.movingEstimatedCount +
      p.motion.movingUnknownCount +
      p.motion.uncertainCount +
      p.motion.noMotionEvidenceCount;
    expect(motionSum).toBe(states.length);
    expect(p.motion.uncertainCount).toBe(1);
    expect(p.motion.noMotionEvidenceCount).toBe(1);
  });
});
