import { describe, expect, it } from 'vitest';
import { classifyCreateOrgRefreshOutcome } from './organizations-operational-create-outcome';

describe('create org refresh outcome', () => {
  it('marks complete when operational refresh succeeds', () => {
    expect(classifyCreateOrgRefreshOutcome(null)).toBe('complete');
  });

  it('marks partial when create succeeded but refresh failed', () => {
    expect(classifyCreateOrgRefreshOutcome('network')).toBe('partial');
  });
});