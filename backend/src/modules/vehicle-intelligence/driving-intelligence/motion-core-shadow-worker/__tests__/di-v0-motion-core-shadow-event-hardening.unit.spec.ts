import {
  MOTION_EVENT_PLAUSIBILITY_UNIVERSAL_V0_2,
  MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
  motionEventVersionId,
  type MotionCorePositionBucket,
} from '../../core';
import { processDiV0MotionCoreShadowFromEvidenceAdaptation } from '../di-v0-motion-core-shadow-processor';

function evidenceFromGrid(buckets: MotionCorePositionBucket[]) {
  return {
    buckets,
    sparseSpeed: [],
    sparsePersisted: [],
    sparseChannelOutcome: null,
    sparseComparable: false,
    limitations: [],
  };
}

describe('motion-core shadow event hardening (P1+P2)', () => {
  const mk = (i: number): MotionCorePositionBucket => ({
    bucketLabelUtc: new Date((1_900_000_000 + i) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    availability: 'PRESENT',
    latitude: 48.1 + (i * 27.8) / 111_320,
    longitude: 11.5,
  });

  it('records V0.3 detector + universal plausibility in contract event version', () => {
    const out = processDiV0MotionCoreShadowFromEvidenceAdaptation(evidenceFromGrid([0, 1, 2, 3, 4].map(mk)), {
      pinnedSnapshotHash: 'abc',
      combinedInputIdentity: 'id',
      vehiclePlausibilityClass: 'TIGUAN',
    });
    const expectedDetector = motionEventVersionId(MOTION_EVENT_V0_3_CANDIDATE_OPTIONS);
    expect(out.payload.contract.algorithmVersions.events).toBe(
      `${expectedDetector} + ${MOTION_EVENT_PLAUSIBILITY_UNIVERSAL_V0_2}`,
    );
    expect(out.payload.contract.algorithmVersions.bundle).toContain('EVENT_V0_3_PLAUS_V0_2');
  });
});
