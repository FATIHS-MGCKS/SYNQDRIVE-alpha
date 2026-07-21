import {
  IAM_SESSION_INVALIDATION_TRIGGERS,
  TARGET_SESSION_INVALIDATION_POLICY,
  sessionInvalidationSatisfiesTarget,
} from './iam-session-invalidation.policy';

describe('iam-session-invalidation.policy (pure domain)', () => {
  it('defines a target scope for every trigger', () => {
    for (const trigger of IAM_SESSION_INVALIDATION_TRIGGERS) {
      expect(TARGET_SESSION_INVALIDATION_POLICY[trigger]).toBeDefined();
      expect(TARGET_SESSION_INVALIDATION_POLICY[trigger]).not.toBe('NONE');
    }
  });

  it('accepts ALL_USER_SESSIONS as satisfying org-bound targets', () => {
    expect(
      sessionInvalidationSatisfiesTarget('MEMBERSHIP_SUSPENDED', 'ALL_USER_SESSIONS'),
    ).toBe(true);
  });

  it('rejects NONE for credential-changing triggers', () => {
    expect(
      sessionInvalidationSatisfiesTarget('PASSWORD_CHANGED', 'NONE'),
    ).toBe(false);
    expect(
      sessionInvalidationSatisfiesTarget('ROLE_DOWNGRADED', 'NONE'),
    ).toBe(false);
  });
});
