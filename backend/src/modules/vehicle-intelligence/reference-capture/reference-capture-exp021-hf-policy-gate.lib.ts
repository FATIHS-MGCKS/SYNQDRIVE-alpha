import { assertHfCalibrationPhaseActivationAllowed } from './reference-capture-hf-calibration-phase.policy';
import type { HfRecoveryPolicyV2Config } from './reference-capture-hf-recovery-v2.policy';
import {
  parseHfRecoveryPolicyV2ConfigFromEnv,
  resolveHfRecoveryPolicyForToken,
} from './reference-capture-hf-recovery-v2.policy';

export type EffectivePolicyGateResult = {
  allowed: boolean;
  effectiveMode: 'V2' | 'LEGACY';
  blocker?: string;
};

export function evaluateEffectivePolicyGate(
  hfPolicyBase: HfRecoveryPolicyV2Config,
  tokenId: number,
): EffectivePolicyGateResult {
  const effective = resolveHfRecoveryPolicyForToken(hfPolicyBase, tokenId);
  try {
    assertHfCalibrationPhaseActivationAllowed(effective, hfPolicyBase);
    return { allowed: true, effectiveMode: 'V2' };
  } catch (error) {
    return {
      allowed: false,
      effectiveMode: effective.mode,
      blocker: error instanceof Error ? error.message : String(error),
    };
  }
}

export function evaluateEffectivePolicyGateFromEnv(
  env: NodeJS.ProcessEnv,
  tokenId: number,
): EffectivePolicyGateResult {
  const base = parseHfRecoveryPolicyV2ConfigFromEnv(env);
  return evaluateEffectivePolicyGate(base, tokenId);
}
