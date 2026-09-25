import {
  EnergyEventKind,
  VehicleEnergyEventDetectionSource,
  type VehicleEnergyEvent,
} from '@prisma/client';
import type { CoalescedEnergySegment } from '../energy-events.pipeline';
import {
  ERD_RECHARGE_EPISODE_WRITE_OWNER,
  ERD_RECHARGE_LEGACY_WRITE_GATE_OUTCOME,
  type ErdRechargeLegacyWriteGateOutcome,
} from './erd-recharge-write-authority.constants';
import {
  evaluateErdRechargeWriteAuthority,
  evaluateRechargeEpisodeWriteOwner,
} from './erd-recharge-write-authority.policy';

export function resolveLegacyRechargeSegmentEvidenceEnd(
  segment: CoalescedEnergySegment,
): Date {
  const end = segment.endTime ? new Date(segment.endTime) : null;
  if (end != null && !Number.isNaN(end.getTime())) {
    return end;
  }
  return new Date(segment.startTime);
}

export function isCanonicalRechargeRowProtectedFromLegacyMutation(
  row: VehicleEnergyEvent,
): boolean {
  return (
    row.kind === EnergyEventKind.RECHARGE &&
    row.detectionSource === VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION &&
    row.canonicalChargeSessionId != null
  );
}

export interface LegacyRechargeWriteGateDecision {
  allowPersist: boolean;
  outcome: ErdRechargeLegacyWriteGateOutcome;
}

export function evaluateLegacyRechargeWriteGate(input: {
  segment: CoalescedEnergySegment;
  existing: VehicleEnergyEvent | null;
  env: NodeJS.ProcessEnv;
}): LegacyRechargeWriteGateDecision {
  const globalAuthority = evaluateErdRechargeWriteAuthority(input.env);
  const evidenceEnd = resolveLegacyRechargeSegmentEvidenceEnd(input.segment);
  const episode = evaluateRechargeEpisodeWriteOwner({
    physicalEvidenceEnd: evidenceEnd,
    globalAuthority,
  });

  if (
    input.existing &&
    isCanonicalRechargeRowProtectedFromLegacyMutation(input.existing)
  ) {
    return {
      allowPersist: false,
      outcome: ERD_RECHARGE_LEGACY_WRITE_GATE_OUTCOME.CANONICAL_ROW_PROTECTED,
    };
  }

  if (episode.owner === ERD_RECHARGE_EPISODE_WRITE_OWNER.CANONICAL) {
    return {
      allowPersist: false,
      outcome: ERD_RECHARGE_LEGACY_WRITE_GATE_OUTCOME.SKIPPED_CANONICAL_AUTHORITY,
    };
  }

  return {
    allowPersist: true,
    outcome: ERD_RECHARGE_LEGACY_WRITE_GATE_OUTCOME.LEGACY_OWNED,
  };
}

export function shouldProjectCanonicalRechargeSession(input: {
  session: { endAt: Date | null; startAt: Date; isOngoing: boolean };
  env: NodeJS.ProcessEnv;
}): { allowed: boolean; skipReason?: 'legacy_authority' | 'pre_cutover' | 'ongoing' } {
  const globalAuthority = evaluateErdRechargeWriteAuthority(input.env);
  if (globalAuthority.authority !== 'canonical' || globalAuthority.cutoverAt == null) {
    return { allowed: false, skipReason: 'legacy_authority' };
  }

  if (input.session.isOngoing || input.session.endAt == null) {
    return { allowed: false, skipReason: 'ongoing' };
  }

  const evidenceEnd = input.session.endAt;
  if (evidenceEnd.getTime() < globalAuthority.cutoverAt.getTime()) {
    return { allowed: false, skipReason: 'pre_cutover' };
  }

  return { allowed: true };
}
