import { DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1 } from './di-v0-motion-core-shadow.bundle.version';

export function buildMotionCoreShadowIntentKey(input: {
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  bundleVersion?: string;
}): string {
  const bundle = input.bundleVersion ?? DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1;
  return `${bundle}|${input.pinnedSnapshotHash}|${input.combinedInputIdentity}`;
}
