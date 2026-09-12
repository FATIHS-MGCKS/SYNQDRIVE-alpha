import {
  isValidRawRefuelCandidateLifecycleTransition,
  resolveNextLifecycleState,
} from './raw-refuel-candidate-lifecycle';
import { RawRefuelCandidateLifecycleTransitionError } from './raw-refuel-candidate.errors';

describe('raw-refuel-candidate-lifecycle', () => {
  it('allows READY_FOR_PERSIST → SETTLING regression', () => {
    expect(
      isValidRawRefuelCandidateLifecycleTransition('READY_FOR_PERSIST', 'SETTLING'),
    ).toBe(true);
    expect(resolveNextLifecycleState('READY_FOR_PERSIST', 'SETTLING')).toBe('SETTLING');
  });

  it('allows READY_FOR_PERSIST → REJECTED', () => {
    expect(resolveNextLifecycleState('READY_FOR_PERSIST', 'REJECTED')).toBe('REJECTED');
  });

  it('allows SETTLING → READY_FOR_PERSIST', () => {
    expect(resolveNextLifecycleState('SETTLING', 'READY_FOR_PERSIST')).toBe('READY_FOR_PERSIST');
  });

  it('blocks PROMOTED → REJECTED', () => {
    expect(() => resolveNextLifecycleState('PROMOTED', 'REJECTED')).toThrow(
      RawRefuelCandidateLifecycleTransitionError,
    );
  });

  it('blocks PROMOTED → SETTLING', () => {
    expect(() => resolveNextLifecycleState('PROMOTED', 'SETTLING')).toThrow(
      RawRefuelCandidateLifecycleTransitionError,
    );
  });

  it('blocks REJECTED → OBSERVED', () => {
    expect(() => resolveNextLifecycleState('REJECTED', 'OBSERVED')).toThrow(
      RawRefuelCandidateLifecycleTransitionError,
    );
  });
});
