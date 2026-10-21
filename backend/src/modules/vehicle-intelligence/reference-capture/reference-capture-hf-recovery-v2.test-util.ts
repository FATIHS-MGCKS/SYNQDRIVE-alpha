import { parseHfRecoveryPolicyV2ConfigFromEnv } from './reference-capture-hf-recovery-v2.policy';
import type { ReferenceCaptureConfig } from './reference-capture.config';

/** Test harness: legacy HF policy (V2 disabled). */
export function createLegacyHfRecoveryConfigMock(): Pick<
  ReferenceCaptureConfig,
  'getHfRecoveryPolicyConfig' | 'resolveHfRecoveryPolicyForToken'
> {
  const legacy = parseHfRecoveryPolicyV2ConfigFromEnv({ HF_RECOVERY_POLICY_V2_ENABLED: 'false' });
  return {
    getHfRecoveryPolicyConfig: () => legacy,
    resolveHfRecoveryPolicyForToken: () => legacy,
  };
}
