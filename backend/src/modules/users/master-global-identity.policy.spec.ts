import { MASTER_GLOBAL_PROFILE_ALLOWLIST } from './policies/master-global-profile.policy';

describe('Master global profile allowlist (USR-P3A)', () => {
  it('excludes security-sensitive user fields', () => {
    const forbidden = [
      'email',
      'passwordHash',
      'securityVersion',
      'sessionVersion',
      'platformRole',
      'status',
      'mustChangePassword',
    ];
    for (const field of forbidden) {
      expect(MASTER_GLOBAL_PROFILE_ALLOWLIST).not.toContain(field);
    }
  });
});