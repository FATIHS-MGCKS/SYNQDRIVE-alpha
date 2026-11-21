import { describe, expect, it } from 'vitest';
import {
  allowedOrgLifecycleActions,
  isArchivingExposed,
  orgLifecyclePatchStatus,
} from './master-organization-lifecycle.policy';

describe('master organization lifecycle policy', () => {
  it('allows PENDING -> activate only', () => {
    expect(allowedOrgLifecycleActions('PENDING')).toEqual(['activate']);
    expect(orgLifecyclePatchStatus('activate')).toBe('ACTIVE');
  });

  it('allows ACTIVE -> suspend only', () => {
    expect(allowedOrgLifecycleActions('ACTIVE')).toEqual(['suspend']);
    expect(orgLifecyclePatchStatus('suspend')).toBe('SUSPENDED');
  });

  it('allows SUSPENDED -> reactivate only', () => {
    expect(allowedOrgLifecycleActions('SUSPENDED')).toEqual(['reactivate']);
    expect(orgLifecyclePatchStatus('reactivate')).toBe('ACTIVE');
  });

  it('does not expose ARCHIVED transitions', () => {
    expect(allowedOrgLifecycleActions('ARCHIVED')).toEqual([]);
    expect(isArchivingExposed()).toBe(false);
  });
});