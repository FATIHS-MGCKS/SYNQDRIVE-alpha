import { resolveHfRecoveryPolicyForToken } from '../reference-capture-hf-recovery-v2.policy';
import type { HfRecoveryPolicyV2Config } from '../reference-capture-hf-recovery-v2.policy';

/** Fixed scientific ages (ms) — design authority §7. */
export const EXP021_MATURATION_SHADOW_FIXED_AGES_MS = [
  30_000,
  40_000,
  45_000,
  50_000,
  55_000,
  60_000,
  90_000,
  120_000,
] as const;

export type Exp021MaturationShadowFrozenSchedule = {
  policyDelayProbeMs: number;
  plannedAgesMsExact: number[];
};

/**
 * Resolve effective HF settlement delay for a token at enrollment.
 * Does not assume code default 8000 ms is always effective.
 */
export function resolvePolicyDelayProbeMs(
  hfPolicyBase: HfRecoveryPolicyV2Config,
  tokenId: number,
): number {
  const effective = resolveHfRecoveryPolicyForToken(hfPolicyBase, tokenId);
  return effective.settlementDelayMs;
}

/**
 * Build frozen per-family schedule: fixed ages + policy-delay probe when not duplicate.
 */
export function buildFrozenFamilySchedule(policyDelayProbeMs: number): Exp021MaturationShadowFrozenSchedule {
  const fixedSet = new Set<number>(EXP021_MATURATION_SHADOW_FIXED_AGES_MS);
  const plannedAgesMsExact: number[] = [...EXP021_MATURATION_SHADOW_FIXED_AGES_MS];
  if (!fixedSet.has(policyDelayProbeMs)) {
    plannedAgesMsExact.unshift(policyDelayProbeMs);
  }
  plannedAgesMsExact.sort((a, b) => a - b);
  return {
    policyDelayProbeMs,
    plannedAgesMsExact,
  };
}

export function computeObservationTargetAt(canonicalWindowTo: Date, plannedAgeMs: number): Date {
  return new Date(canonicalWindowTo.getTime() + plannedAgeMs);
}

export function computeEnqueueDelayMs(targetAt: Date, now = new Date()): number {
  return Math.max(0, targetAt.getTime() - now.getTime());
}
