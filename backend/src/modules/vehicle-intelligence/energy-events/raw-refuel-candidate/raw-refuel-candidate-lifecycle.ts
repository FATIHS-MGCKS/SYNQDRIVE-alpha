import type { RawRefuelCandidateLifecycleState } from '@prisma/client';

const FORWARD_TRANSITIONS: Record<
  RawRefuelCandidateLifecycleState,
  ReadonlySet<RawRefuelCandidateLifecycleState>
> = {
  INSUFFICIENT: new Set(['OBSERVED', 'REJECTED']),
  OBSERVED: new Set(['SETTLING', 'READY_FOR_PERSIST', 'REJECTED']),
  SETTLING: new Set(['READY_FOR_PERSIST', 'REJECTED']),
  READY_FOR_PERSIST: new Set(['PROMOTED', 'SETTLING', 'REJECTED']),
  REJECTED: new Set([]),
  PROMOTED: new Set([]),
};

/**
 * Evidence revision may invalidate prior maturity — allow controlled regression from
 * READY_FOR_PERSIST → SETTLING when new samples arrive (F1.2 §26).
 */
export function isValidRawRefuelCandidateLifecycleTransition(
  from: RawRefuelCandidateLifecycleState,
  to: RawRefuelCandidateLifecycleState,
): boolean {
  if (from === to) return true;
  return FORWARD_TRANSITIONS[from]?.has(to) ?? false;
}

export function resolveNextLifecycleState(
  current: RawRefuelCandidateLifecycleState,
  requested: RawRefuelCandidateLifecycleState,
): RawRefuelCandidateLifecycleState {
  if (isValidRawRefuelCandidateLifecycleTransition(current, requested)) {
    return requested;
  }
  if (requested === 'REJECTED') {
    return 'REJECTED';
  }
  return current;
}

export function isRawRefuelCandidateTerminal(
  state: RawRefuelCandidateLifecycleState,
): boolean {
  return state === 'REJECTED' || state === 'PROMOTED';
}
