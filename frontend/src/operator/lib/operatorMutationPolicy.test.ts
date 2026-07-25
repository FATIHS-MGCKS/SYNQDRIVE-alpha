import { describe, expect, it } from 'vitest';
import { isOperatorMutationBlocked } from './operatorMutationPolicy';

describe('isOperatorMutationBlocked', () => {
  it('blocks when organisation is missing', () => {
    expect(isOperatorMutationBlocked(null, false)).toBe(true);
    expect(isOperatorMutationBlocked(undefined, false)).toBe(true);
  });

  it('blocks while a mutation is already in flight', () => {
    expect(isOperatorMutationBlocked('org-1', true)).toBe(true);
  });

  it('allows a new mutation when org is present and idle', () => {
    expect(isOperatorMutationBlocked('org-1', false)).toBe(false);
  });
});
