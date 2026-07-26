import { AuthMfaLoginService } from './auth-mfa-login.service';
import { UserPlatformRole } from '@prisma/client';

describe('AuthMfaLoginService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'test-secret-key-for-mfa-login-service',
      IAM_MFA_MASTER_ADMIN_ENABLED: 'true',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('requires MFA challenge for enrolled master admin', async () => {
    const enrollment = { isMfaEnrolled: jest.fn().mockResolvedValue(true) };
    const service = new AuthMfaLoginService(
      { get: () => 'test-secret-key-for-mfa-login-service' } as never,
      {} as never,
      {} as never,
      enrollment as never,
      {} as never,
    );

    const result = await service.evaluateMasterAdminLoginGate({
      id: 'admin-1',
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });

    expect(result.kind).toBe('mfa_required');
    if (result.kind === 'mfa_required') {
      expect(result.mfaPendingToken).toBeTruthy();
    }
  });

  it('allows password-only login when master admin is not enrolled yet', async () => {
    const enrollment = { isMfaEnrolled: jest.fn().mockResolvedValue(false) };
    const service = new AuthMfaLoginService(
      { get: () => 'test-secret-key-for-mfa-login-service' } as never,
      {} as never,
      {} as never,
      enrollment as never,
      {} as never,
    );

    const result = await service.evaluateMasterAdminLoginGate({
      id: 'admin-1',
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });

    expect(result).toEqual({ kind: 'none' });
  });

  it('ignores tenant users', async () => {
    const enrollment = { isMfaEnrolled: jest.fn() };
    const service = new AuthMfaLoginService(
      { get: () => 'test-secret-key-for-mfa-login-service' } as never,
      {} as never,
      {} as never,
      enrollment as never,
      {} as never,
    );

    const result = await service.evaluateMasterAdminLoginGate({
      id: 'user-1',
      platformRole: UserPlatformRole.USER,
    });

    expect(result).toEqual({ kind: 'none' });
    expect(enrollment.isMfaEnrolled).not.toHaveBeenCalled();
  });
});
