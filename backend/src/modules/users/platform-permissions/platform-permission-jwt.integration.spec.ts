import { ForbiddenException } from '@nestjs/common';
import { UserPlatformRole } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { createRefreshTokenHarness } from '@modules/users/iam-security-regression.harness';
import { MasterBillingGuard } from '@shared/auth/master-billing.guard';
import { Reflector } from '@nestjs/core';
import { PLATFORM_PERMISSION_JWT_VALUES } from './platform-permission.constants';

const JWT_SECRET = 'test-jwt-secret';

describe('Platform permissions — real JWT issuance contract', () => {
  it('includes master-billing in access JWT when resolver returns grant', async () => {
    const { service, platformPermissions, prisma } = createRefreshTokenHarness();
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
    (platformPermissions.resolveJwtPermissions as jest.Mock).mockResolvedValue([
      PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING,
    ]);

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
    expect(decoded.platformPermissions).toEqual([PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING]);
  });

  it('MFA reissue resolves current grants', async () => {
    const { service, platformPermissions } = createRefreshTokenHarness();
    (platformPermissions.resolveJwtPermissions as jest.Mock)
      .mockResolvedValueOnce([PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING])
      .mockResolvedValueOnce([]);

    const user = {
      id: 'delegate-user',
      email: 'billing@test.example',
      name: 'Billing Delegate',
      platformRole: UserPlatformRole.USER,
      sessionVersion: 0,
    };
    const first = await service.reissueAccessToken(user, null, {
      assuranceLevel: 2,
      authenticatedAt: new Date().toISOString(),
      mfaAuthenticatedAt: new Date().toISOString(),
      authMethods: ['pwd', 'totp'],
      securityVersion: 0,
    });
    const second = await service.reissueAccessToken(user, null, {
      assuranceLevel: 2,
      authenticatedAt: new Date().toISOString(),
      mfaAuthenticatedAt: new Date().toISOString(),
      authMethods: ['pwd', 'totp'],
      securityVersion: 0,
    });

    const firstDecoded = jwt.verify(first.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const secondDecoded = jwt.verify(second.accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(firstDecoded.platformPermissions).toEqual([PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING]);
    expect(secondDecoded.platformPermissions).toEqual([]);
  });

  it('MasterBillingGuard denies when DB grant revoked despite JWT claim', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector;
    const platformPermissions = {
      hasActiveMasterBillingGrant: jest.fn().mockResolvedValue(false),
    } as never;
    const guard = new MasterBillingGuard(reflector, platformPermissions);

    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              id: 'delegate',
              platformRole: 'USER',
              platformPermissions: [PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING],
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as never),
    ).rejects.toThrow(ForbiddenException);
  });
});