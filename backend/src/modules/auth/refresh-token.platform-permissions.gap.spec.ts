import { UserPlatformRole } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { createRefreshTokenHarness } from '@modules/users/iam-security-regression.harness';
import {
  buildPasswordOnlyClaims,
  buildMfaClaims,
} from '@shared/auth/auth-session-claims.types';

const JWT_SECRET = 'test-jwt-secret';

function authGuardPlatformPermissions(decoded: jwt.JwtPayload): string[] {
  return (decoded.platformPermissions as string[] | undefined) ?? [];
}

describe('RefreshTokenService — platformPermissions JWT gap (P3B)', () => {
  it('initial login issueTokenPair omits platformPermissions', async () => {
    const { service, prisma } = createRefreshTokenHarness();
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-login' });
    const { accessToken } = await service.issueTokenPair(
      {
        id: 'delegate-user',
        email: 'billing@test.example',
        name: 'Billing Delegate',
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
      },
      null,
    );
    const decoded = jwt.verify(accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(decoded.platformPermissions).toBeUndefined();
    expect(authGuardPlatformPermissions(decoded)).toEqual([]);
    expect(decoded.platformRole).toBe(UserPlatformRole.USER);
  });

  it('refresh-style re-sign (issueTokenPair after login) omits platformPermissions', async () => {
    const { service, prisma } = createRefreshTokenHarness();
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-rotate' });
    const user = {
      id: 'delegate-user',
      email: 'billing@test.example',
      name: 'Billing Delegate',
      platformRole: UserPlatformRole.USER,
      sessionVersion: 1,
    };
    const first = await service.issueTokenPair(user, null);
    const second = await service.issueTokenPair(user, null);
    for (const accessToken of [first.accessToken, second.accessToken]) {
      const decoded = jwt.verify(accessToken, JWT_SECRET) as jwt.JwtPayload;
      expect(decoded.platformPermissions).toBeUndefined();
      expect(authGuardPlatformPermissions(decoded)).toEqual([]);
    }
  });

  it('MFA reissueAccessToken omits platformPermissions', async () => {
    const { service } = createRefreshTokenHarness();
    const claims = buildMfaClaims({
      authenticatedAt: new Date('2026-07-01').toISOString(),
      mfaAuthenticatedAt: new Date('2026-07-01T12:00:00Z').toISOString(),
      authMethods: ['pwd', 'totp'],
      securityVersion: 1,
    });
    const { accessToken } = await service.reissueAccessToken(
      {
        id: 'delegate-user',
        email: 'billing@test.example',
        name: 'Billing Delegate',
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
      },
      null,
      claims,
    );
    const decoded = jwt.verify(accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(decoded.platformPermissions).toBeUndefined();
    expect(decoded.assuranceLevel).toBe(2);
    expect(authGuardPlatformPermissions(decoded)).toEqual([]);
  });

  it('MASTER_ADMIN login JWT still omits platformPermissions (billing via role only)', async () => {
    const { service, prisma } = createRefreshTokenHarness();
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-master' });
    const { accessToken } = await service.issueTokenPair(
      {
        id: 'master-1',
        email: 'master@test.example',
        name: 'Master',
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionVersion: 0,
      },
      null,
      {},
    );
    const decoded = jwt.verify(accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(decoded.platformPermissions).toBeUndefined();
    expect(decoded.platformRole).toBe(UserPlatformRole.MASTER_ADMIN);
    expect(buildPasswordOnlyClaims(0).securityVersion).toBe(0);
  });
});