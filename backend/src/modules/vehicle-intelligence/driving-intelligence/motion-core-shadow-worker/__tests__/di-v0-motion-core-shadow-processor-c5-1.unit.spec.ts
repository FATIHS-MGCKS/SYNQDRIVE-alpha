import { processDiV0MotionCoreShadowFromEvidenceAdaptation } from '../di-v0-motion-core-shadow-processor';
import type { DiV0MotionCoreShadowEvidenceAdaptation } from '../di-v0-motion-core-shadow-evidence.adapter';
import { DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V2_C5_1 } from '../di-v0-motion-core-shadow.bundle.version';
import type { MotionCorePositionBucket } from '../../core';

function evidenceFromGrid(buckets: MotionCorePositionBucket[]): DiV0MotionCoreShadowEvidenceAdaptation {
  return {
    buckets,
    sparseSpeed: [],
    sparsePersisted: [],
    sparseChannelOutcome: null,
    sparseComparable: false,
    limitations: [],
  };
}

describe('di-v0-motion-core-shadow processor C5.1 integration', () => {
  const mk = (i: number): MotionCorePositionBucket => ({
    bucketLabelUtc: new Date((1_900_000_000 + i) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    availability: 'PRESENT',
    latitude: 48.1 + (i * 27.8) / 111_320,
    longitude: 11.5,
  });

  it('defaults to C4-only bundle and speed authority', () => {
    const out = processDiV0MotionCoreShadowFromEvidenceAdaptation(evidenceFromGrid([0, 1, 2].map(mk)), {
      pinnedSnapshotHash: 'abc',
      combinedInputIdentity: 'id',
    });
    expect(out.payload.contract.speedAuthority).toBe('C4_ONLY');
    expect(out.payload.contract.algorithmVersions.c5_1).toBeNull();
    expect(out.payload.c4Speeds).toBeUndefined();
  });

  it('emits versioned C5.1 preferred payload with C4 baseline rows', () => {
    const out = processDiV0MotionCoreShadowFromEvidenceAdaptation(evidenceFromGrid([0, 1, 2, 3, 4].map(mk)), {
      pinnedSnapshotHash: 'abc',
      combinedInputIdentity: 'id',
      c5_1PreferredSpeedEnabled: true,
      vehiclePlausibilityClass: 'TESLA',
    });
    expect(out.payload.contract.speedAuthority).toBe('C5_1_PREFERRED');
    expect(out.payload.contract.algorithmVersions.bundle).toBe(DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V2_C5_1);
    expect(out.payload.c4Speeds?.length).toBe(out.payload.speeds.length);
    expect(out.payload.speedRepairs?.length).toBe(out.payload.speeds.length);
    expect(out.summary.bundleVersion).toBe(DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V2_C5_1);
  });
});
