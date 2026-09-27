import {
  DI_V0_S4_STATES,
  DI_V0_S4_TRANSITIONS,
  type DiV0S4FromState,
  type DiV0S4State,
  type DiV0S4TransitionId,
  type DiV0S4TransitionSpec,
} from './di-v0-s4a-contract';
import { DiV0S4TransitionRejectedError } from './di-v0-s4a-errors';

const BY_ID = new Map<DiV0S4TransitionId, DiV0S4TransitionSpec>(DI_V0_S4_TRANSITIONS.map((t) => [t.id, t]));

export function getDiV0S4Transition(id: DiV0S4TransitionId): DiV0S4TransitionSpec {
  const spec = BY_ID.get(id);
  if (!spec) {
    throw new Error(`DI_V0_S4_UNKNOWN_TRANSITION:${id}`);
  }
  return spec;
}

export function isDiV0S4State(value: unknown): value is DiV0S4State {
  return typeof value === 'string' && (DI_V0_S4_STATES as readonly string[]).includes(value);
}

/** True when at least one contract transition moves `from` to `to`. */
export function isDiV0S4LegalStatePair(from: DiV0S4FromState, to: DiV0S4State): boolean {
  return DI_V0_S4_TRANSITIONS.some((t) => t.to === to && t.from.includes(from));
}

export function listDiV0S4LegalStatePairs(): Array<[DiV0S4FromState, DiV0S4State]> {
  const pairs: Array<[DiV0S4FromState, DiV0S4State]> = [];
  for (const from of ['NONE', ...DI_V0_S4_STATES] as DiV0S4FromState[]) {
    for (const to of DI_V0_S4_STATES) {
      if (isDiV0S4LegalStatePair(from, to)) {
        pairs.push([from, to]);
      }
    }
  }
  return pairs;
}

/**
 * Asserts the persisted `from` status is a legal source of `transitionId`. Repository methods
 * call this after locking the row and before issuing their transition-specific UPDATE, which
 * repeats the same status predicate in SQL.
 */
export function assertDiV0S4TransitionFrom(transitionId: DiV0S4TransitionId, from: string): DiV0S4TransitionSpec {
  const spec = getDiV0S4Transition(transitionId);
  if (!isDiV0S4State(from) || !spec.from.includes(from)) {
    throw new DiV0S4TransitionRejectedError(transitionId, 'ILLEGAL_SOURCE_STATE', `${from}->${spec.to}`);
  }
  return spec;
}
