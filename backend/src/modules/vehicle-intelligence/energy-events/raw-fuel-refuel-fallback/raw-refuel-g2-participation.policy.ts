import {
  evaluateFallbackG2HandoffAuthority,
  isSynqdriveRawFuelFallbackDetectionSource,
} from '@config/raw-fuel-refuel-fallback.config';
import type { VehicleEnergyEvent } from '@prisma/client';

export type FallbackG2ParticipationDecision =
  | { participate: true; reason: 'native_or_null_source' | 'fallback_handoff_authorized' }
  | {
      participate: false;
      reason:
        | 'fallback_handoff_not_authorized'
        | 'fallback_handoff_promotion_not_authorized'
        | 'fallback_handoff_convergence_not_authorized';
    };

export function evaluateFallbackG2Participation(
  event: Pick<VehicleEnergyEvent, 'detectionSource'>,
  env: NodeJS.ProcessEnv = process.env,
): FallbackG2ParticipationDecision {
  if (!isSynqdriveRawFuelFallbackDetectionSource(event.detectionSource)) {
    return { participate: true, reason: 'native_or_null_source' };
  }

  const authority = evaluateFallbackG2HandoffAuthority(env);
  if (authority.authorized) {
    return { participate: true, reason: 'fallback_handoff_authorized' };
  }

  switch (authority.detail) {
    case 'handoff_not_authorized':
      return { participate: false, reason: 'fallback_handoff_not_authorized' };
    case 'promotion_execution_not_authorized':
      return { participate: false, reason: 'fallback_handoff_promotion_not_authorized' };
    case 'convergence_not_authorized':
      return { participate: false, reason: 'fallback_handoff_convergence_not_authorized' };
  }

  return { participate: false, reason: 'fallback_handoff_not_authorized' };
}

export function canFallbackEventParticipateInG2Reconciliation(
  event: Pick<VehicleEnergyEvent, 'detectionSource'>,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return evaluateFallbackG2Participation(event, env).participate;
}

export function filterAuthorizedRefuelCandidates<T extends Pick<VehicleEnergyEvent, 'detectionSource'>>(
  candidates: T[],
  env: NodeJS.ProcessEnv = process.env,
): T[] {
  return candidates.filter((candidate) =>
    canFallbackEventParticipateInG2Reconciliation(candidate, env),
  );
}
