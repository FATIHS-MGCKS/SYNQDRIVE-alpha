import { DeviceConnectionPhysicalTransitionDecision } from '@prisma/client';
import type { PhysicalStateShadowComparisonInput } from './physical-state-shadow-comparator.types';

/**
 * Shadow comparison domains — legacy episode resolution vs physical projection evidence
 * are not always answers to the same proposition (VDC P2.5 provenance-refresh audit).
 */
export type PhysicalStateShadowComparisonDomain =
  | 'STATE_TRANSITION'
  | 'EPISODE_RESOLUTION'
  | 'SAME_STATE_PROVENANCE_REFRESH';

/**
 * Classifies the primary semantic domain for a shadow comparison input (forensics / metrics).
 * Does not replace GT-R1 proof or classification taxonomy.
 */
export function inferPhysicalStateShadowComparisonDomain(
  input: PhysicalStateShadowComparisonInput,
): PhysicalStateShadowComparisonDomain {
  const transition = input.physicalDecision.transitionDecision ?? null;
  const effectiveState = input.physicalDecision.effectiveState ?? null;
  const legacyReason = input.legacyDecision.reason?.trim() ?? null;

  if (
    transition === DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH &&
    effectiveState != null
  ) {
    return 'SAME_STATE_PROVENANCE_REFRESH';
  }

  if (
    legacyReason === 'no_open_episode' ||
    legacyReason === 'already_resolved' ||
    legacyReason === 'same_snapshot_already_applied'
  ) {
    return 'EPISODE_RESOLUTION';
  }

  if (
    transition === DeviceConnectionPhysicalTransitionDecision.ESTABLISHED ||
    transition === DeviceConnectionPhysicalTransitionDecision.APPLIED
  ) {
    return 'STATE_TRANSITION';
  }

  return 'STATE_TRANSITION';
}
