import { buildMotionCoreShadowIntentKey } from '../di-v0-motion-core-shadow-intent';
import {
  DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1,
  DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V2_C5_1,
} from '../di-v0-motion-core-shadow.bundle.version';

describe('C5.1 bundle intent idempotency', () => {
  it('uses distinct intent keys for V1 C4-only vs V2 C5.1 preferred bundles', () => {
    const base = { pinnedSnapshotHash: 'hash', combinedInputIdentity: 'input' };
    const v1 = buildMotionCoreShadowIntentKey({ ...base, bundleVersion: DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1 });
    const v2 = buildMotionCoreShadowIntentKey({ ...base, bundleVersion: DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V2_C5_1 });
    expect(v1).not.toBe(v2);
    expect(v1.startsWith(DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1)).toBe(true);
    expect(v2.startsWith(DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V2_C5_1)).toBe(true);
  });
});
