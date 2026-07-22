import {
  IAM_SESSION_INVALIDATION_TRIGGERS,
  IAM_SESSION_INVALIDATION_POLICY,
  isRoleDowngrade,
  permissionsWereReduced,
  resolveSessionInvalidationScope,
  sessionInvalidationSatisfiesTarget,
  stationScopeWasReduced,
} from './iam-session-invalidation.policy';

describe('iam-session-invalidation.policy (Prompt 5)', () => {
  it('defines a scope for every trigger', () => {
    for (const trigger of IAM_SESSION_INVALIDATION_TRIGGERS) {
      expect(IAM_SESSION_INVALIDATION_POLICY[trigger]).toBeDefined();
    }
  });

  it('maps membership events to org-scoped revocation', () => {
    expect(resolveSessionInvalidationScope('MEMBERSHIP_REMOVED')).toEqual([
      'ORGANIZATION_MEMBERSHIP_SESSIONS',
    ]);
    expect(resolveSessionInvalidationScope('ROLE_DOWNGRADED')).toEqual([
      'ORGANIZATION_MEMBERSHIP_SESSIONS',
    ]);
  });

  it('detects role downgrade', () => {
    expect(isRoleDowngrade('ORG_ADMIN', 'WORKER')).toBe(true);
    expect(isRoleDowngrade('WORKER', 'ORG_ADMIN')).toBe(false);
  });

  it('detects permission reduction', () => {
    expect(
      permissionsWereReduced(
        { bookings: { read: true, write: true, manage: true } },
        { bookings: { read: true, write: false, manage: false } },
      ),
    ).toBe(true);
  });

  it('detects station scope reduction', () => {
    expect(stationScopeWasReduced(['s1', 's2'], ['s1'])).toBe(true);
    expect(stationScopeWasReduced(['s1'], ['s1', 's2'])).toBe(false);
  });

  it('accepts org-bound execution as satisfying membership suspension target', () => {
    expect(
      sessionInvalidationSatisfiesTarget(
        'MEMBERSHIP_SUSPENDED',
        'ORG_BOUND_SESSIONS',
      ),
    ).toBe(true);
  });
});
