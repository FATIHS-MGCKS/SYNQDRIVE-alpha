import type { RawRefuelCandidateLifecycleState } from '@prisma/client';
import { RawRefuelCandidateLifecycleTransitionError } from './raw-refuel-candidate.errors';

const FORWARD_TRANSITIONS: Record<
  RawRefuelCandidateLifecycleState,
  ReadonlySet<RawRefuelCandidateLifecycleState>
> = {
  INSUFFICIENT: new Set(['OBSERVED', 'REJECTED']),
  OBSERVED: new Set(['SETTLING', 'READY_FOR_PERSIST', 'REJECTED']),
  SETTLING: new Set(['READY_FOR_PERSIST', 'REJECTED']),
  READY_FOR_PERSIST: new Set(['PROMOTED', 'SETTLING', 'REJECTED', 'CONVERGED_NATIVE']),
  REJECTED: new Set([]),
  PROMOTED: new Set([]),
  CONVERGED_NATIVE: new Set([]),
};

/** Monotonic evidence maturity — higher rank means stronger proof of physical refuel readiness. */
const EVIDENCE_MATURITY_RANK: Record<RawRefuelCandidateLifecycleState, number> = {
  INSUFFICIENT: 0,
  OBSERVED: 1,
  SETTLING: 2,
  READY_FOR_PERSIST: 3,
  REJECTED: 100,
  PROMOTED: 101,
  CONVERGED_NATIVE: 102,
};

const TERMINAL_LIFECYCLE_STATES: ReadonlySet<RawRefuelCandidateLifecycleState> = new Set([
  'REJECTED',
  'PROMOTED',
  'CONVERGED_NATIVE',
]);

/**
 * Evidence revision may invalidate prior maturity — allow controlled regression from
 * READY_FOR_PERSIST → SETTLING when new samples arrive (F1.2 §26).
 * F10.6.6-A — allow non-regressive refinement (e.g. INSUFFICIENT → SETTLING) when F3
 * re-scan proves stronger evidence without reactivating terminal rows.
 */
export function isValidRawRefuelCandidateLifecycleTransition(
  from: RawRefuelCandidateLifecycleState,
  to: RawRefuelCandidateLifecycleState,
): boolean {
  if (from === to) return true;
  if (TERMINAL_LIFECYCLE_STATES.has(from)) return false;
  if (FORWARD_TRANSITIONS[from]?.has(to)) return true;
  if (to === 'REJECTED') return true;
  if (TERMINAL_LIFECYCLE_STATES.has(to)) return false;
  const fromRank = EVIDENCE_MATURITY_RANK[from];
  const toRank = EVIDENCE_MATURITY_RANK[to];
  return toRank > fromRank;
}

export function resolveNextLifecycleState(
  current: RawRefuelCandidateLifecycleState,
  requested: RawRefuelCandidateLifecycleState,
): RawRefuelCandidateLifecycleState {
  if (isValidRawRefuelCandidateLifecycleTransition(current, requested)) {
    return requested;
  }
  throw new RawRefuelCandidateLifecycleTransitionError(current, requested);
}

export function isRawRefuelCandidateTerminal(
  state: RawRefuelCandidateLifecycleState,
): boolean {
  return state === 'REJECTED' || state === 'PROMOTED' || state === 'CONVERGED_NATIVE';
}
