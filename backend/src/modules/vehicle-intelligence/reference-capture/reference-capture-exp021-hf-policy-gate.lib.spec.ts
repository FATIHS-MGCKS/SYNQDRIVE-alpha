import { evaluateEffectivePolicyGate, evaluateEffectivePolicyGateFromEnv } from './reference-capture-exp021-hf-policy-gate.lib';
import { parseHfRecoveryPolicyV2ConfigFromEnv } from './reference-capture-hf-recovery-v2.policy';

describe('reference-capture-exp021-hf-policy-gate.lib', () => {
  const base = parseHfRecoveryPolicyV2ConfigFromEnv({
    HF_RECOVERY_POLICY_V2_ENABLED: 'true',
    HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
    HF_SETTLEMENT_DELAY_MS: '8000',
    HF_RECOVERY_OVERLAP_MS: '6000',
    HF_HISTORICAL_POLL_INTERVAL_MS: '30000',
  });

  it('allows V2 when policy is enabled and canary-only is off', () => {
    expect(evaluateEffectivePolicyGate(base, 187361)).toEqual({
      allowed: true,
      effectiveMode: 'V2',
    });
  });

  it('blocks non-canary token when canary-only is enabled', () => {
    const canaryBase = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'true',
      HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS: '187361',
    });
    const result = evaluateEffectivePolicyGate(canaryBase, 999999);
    expect(result.allowed).toBe(false);
    expect(result.effectiveMode).toBe('LEGACY');
    expect(result.blocker).toContain('effective V2 policy');
  });

  it('matches evaluateEffectivePolicyGateFromEnv semantics', () => {
    const env = {
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
      HF_SETTLEMENT_DELAY_MS: '8000',
      HF_RECOVERY_OVERLAP_MS: '6000',
      HF_HISTORICAL_POLL_INTERVAL_MS: '30000',
    };
    expect(evaluateEffectivePolicyGateFromEnv(env, 187361)).toEqual(evaluateEffectivePolicyGate(base, 187361));
  });
});
