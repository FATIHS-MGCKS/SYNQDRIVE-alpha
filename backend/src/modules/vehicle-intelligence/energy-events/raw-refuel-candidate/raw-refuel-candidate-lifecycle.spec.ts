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

  it('allows READY_FOR_PERSIST → CONVERGED_NATIVE', () => {
    expect(resolveNextLifecycleState('READY_FOR_PERSIST', 'CONVERGED_NATIVE')).toBe(
      'CONVERGED_NATIVE',
    );
  });

  it('blocks CONVERGED_NATIVE → PROMOTED', () => {
    expect(() => resolveNextLifecycleState('CONVERGED_NATIVE', 'PROMOTED')).toThrow(
      RawRefuelCandidateLifecycleTransitionError,
    );
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

  it('allows INSUFFICIENT → SETTLING evidence refinement (F10.6.6-A)', () => {
    expect(isValidRawRefuelCandidateLifecycleTransition('INSUFFICIENT', 'SETTLING')).toBe(
      true,
    );
    expect(resolveNextLifecycleState('INSUFFICIENT', 'SETTLING')).toBe('SETTLING');
  });

  it('allows INSUFFICIENT → READY_FOR_PERSIST when evidence matures', () => {
    expect(resolveNextLifecycleState('INSUFFICIENT', 'READY_FOR_PERSIST')).toBe(
      'READY_FOR_PERSIST',
    );
  });
});
