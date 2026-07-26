import { resolveIamMfaFeatureFlagsForPrincipal } from './iam-mfa-feature-flags.resolver';

describe('resolveIamMfaFeatureFlagsForPrincipal', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.IAM_MFA_MASTER_ADMIN_ENABLED;
    delete process.env.IAM_MFA_ORG_ALLOWLIST;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('enables master admin MFA independently of org allowlist', () => {
    process.env.IAM_MFA_MASTER_ADMIN_ENABLED = 'true';
    process.env.IAM_MFA_ORG_ALLOWLIST = 'some-other-org';

    const flags = resolveIamMfaFeatureFlagsForPrincipal({
      organizationId: null,
      platformRole: 'MASTER_ADMIN',
    });

    expect(flags.masterAdminMfaEnabled).toBe(true);
    expect(flags.mfaEnrollmentEnabled).toBe(true);
    expect(flags.mfaStepUpEnforced).toBe(true);
    expect(flags.mfaPrivilegedEnrollmentRequired).toBe(true);
  });

  it('does not affect tenant users when master admin flag is on', () => {
    process.env.IAM_MFA_MASTER_ADMIN_ENABLED = 'true';
    process.env.IAM_MFA_ENROLLMENT_ENABLED = 'false';

    const flags = resolveIamMfaFeatureFlagsForPrincipal({
      organizationId: 'org-tenant',
      platformRole: 'USER',
    });

    expect(flags.masterAdminMfaEnabled).toBe(false);
    expect(flags.mfaEnrollmentEnabled).toBe(false);
  });
});
