import {
  buildFrozenFamilySchedule,
  EXP021_MATURATION_SHADOW_FIXED_AGES_MS,
  computeEnqueueDelayMs,
  resolvePolicyDelayProbeMs,
} from './reference-capture-exp021-maturation-shadow-schedule.lib';
import { parseHfRecoveryPolicyV2ConfigFromEnv } from '../reference-capture-hf-recovery-v2.policy';

describe('reference-capture-exp021-maturation-shadow-schedule.lib', () => {
  it('includes policy delay probe when not duplicate of fixed ages', () => {
    const schedule = buildFrozenFamilySchedule(8_000);
    expect(schedule.policyDelayProbeMs).toBe(8_000);
    expect(schedule.plannedAgesMsExact[0]).toBe(8_000);
    expect(schedule.plannedAgesMsExact).toContain(30_000);
    expect(schedule.plannedAgesMsExact).toContain(120_000);
  });

  it('does not duplicate policy delay when equal to fixed age', () => {
    const schedule = buildFrozenFamilySchedule(60_000);
    expect(schedule.plannedAgesMsExact).toEqual([...EXP021_MATURATION_SHADOW_FIXED_AGES_MS]);
  });

  it('resolves effective policy delay from env override', () => {
    const base = parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: 'true',
      HF_SETTLEMENT_DELAY_MS: '12000',
    });
    expect(resolvePolicyDelayProbeMs(base, 1)).toBe(12_000);
  });

  it('late enqueue uses zero delay without rewriting planned age', () => {
    const delay = computeEnqueueDelayMs(new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-01T00:01:00.000Z'));
    expect(delay).toBe(0);
  });
});
