import { AuthMfaLoginService } from './auth-mfa-login.service';
import { UserPlatformRole } from '@prisma/client';

describe('AuthMfaLoginService — platformPermissions response parity', () => {
  it('includes platformPermissions on MFA login user payload', async () => {
    const platformPermissions = {
      resolveJwtPermissions: jest.fn().mockResolvedValue([]),
    };
    const refreshTokens = {
      issueTokenPair: jest.fn().mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: '15m',
      }),
    };
    const challenge = {
      challengeWithTotp: jest.fn().mockResolvedValue({
        accessToken: 'mfa-access',
        assuranceLevel: 2,
      }),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'admin-1',
          email: 'admin@test.example',
          name: 'Admin',
          status: 'ACTIVE',
          platformRole: UserPlatformRole.MASTER_ADMIN,
          securityVersion: 0,
          memberships: [],
        }),
      },
    };
    const service = new AuthMfaLoginService(
      { get: () => 'jwt-secret' } as never,
      prisma as never,
      refreshTokens as never,
      { isMfaEnrolled: jest.fn().mockResolvedValue(true) } as never,
      challenge as never,
      platformPermissions as never,
    );
    jest.spyOn(service, 'verifyMfaPendingToken').mockReturnValue('admin-1');

    const result = await service.completeLoginMfa({
      mfaPendingToken: 'pending',
      code: '123456',
    });

    expect(result.user.platformPermissions).toEqual([]);
    expect(platformPermissions.resolveJwtPermissions).toHaveBeenCalledWith('admin-1');
  });
});