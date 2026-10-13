import {
  DI_V0_S4_LIMITS,
  DI_V0_S4_SETTLEMENT_QUIET_PERIOD_CEILING_SECONDS,
} from './di-v0-s4a-contract';

/** Persisted work-item policy labels for T24 / ops segmentation (derived from eligible_at − settlement_anchor_at). */
export type DiV0S4SettlementPolicySegment =
  | 'NEAR_REALTIME_600'
  | 'LEGACY_86400'
  | 'OTHER'
  | 'INVALID';

const NEAR_REALTIME_SECONDS = DI_V0_S4_LIMITS.settlementQuietPeriodSeconds;
const LEGACY_QUIET_SECONDS = DI_V0_S4_SETTLEMENT_QUIET_PERIOD_CEILING_SECONDS;
const TOLERANCE_SECONDS = 2;

export function classifyDiV0S4SettlementPolicySegment(
  quietSeconds: number,
): DiV0S4SettlementPolicySegment {
  if (!Number.isFinite(quietSeconds) || quietSeconds < 0) return 'INVALID';
  if (Math.abs(quietSeconds - NEAR_REALTIME_SECONDS) <= TOLERANCE_SECONDS) return 'NEAR_REALTIME_600';
  if (Math.abs(quietSeconds - LEGACY_QUIET_SECONDS) <= TOLERANCE_SECONDS) return 'LEGACY_86400';
  if (quietSeconds > 0 && quietSeconds <= LEGACY_QUIET_SECONDS) return 'OTHER';
  return 'INVALID';
}

export function quietSecondsBetweenEligibleAndAnchor(eligibleAt: Date, settlementAnchorAt: Date): number {
  return Math.round((eligibleAt.getTime() - settlementAnchorAt.getTime()) / 1000);
}

/** SQL expression (seconds) for dashboards: eligible_at − settlement_anchor_at on work items. */
export const DI_V0_S4_SETTLEMENT_QUIET_SECONDS_SQL = `extract(epoch FROM (eligible_at - settlement_anchor_at))`;
