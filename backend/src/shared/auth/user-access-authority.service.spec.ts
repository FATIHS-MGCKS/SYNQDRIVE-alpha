import { UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { UserAccessAuthorityService } from './user-access-authority.service';
import { ACCESS_AUTHORITY_FAILURE_CODES } from './user-access-authority.types';

describe('UserAccessAuthorityService', () => {
  const platformPermissions = {
    resolveJwtPermissions: jest.fn().mockResolvedValue([]),
  };

  const basePayload = {
    sub: 'user-1',
    email: 'u@test.example',
    sessionVersion: 1,
    securityVersion: 0,
    tokenFamily: 'family-1',
    platformRole: 'USER',
  };

  it('denies when session family has no active refresh token', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'u@test.example',
          name: 'U',
          status: UserStatus.ACTIVE,
          platformRole: 'USER',
          sessionVersion: 1,
          securityVersion: 0,
        }),
      },
      refreshToken: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new UserAccessAuthorityService(
      prisma as never,
      platformPermissions as never,
    );

    await expect(service.validateAccessJwt(basePayload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.validateAccessJwt(basePayload)).rejects.toMatchObject({
      response: { code: ACCESS_AUTHORITY_FAILURE_CODES.SESSION_REVOKED },
    });
  });

  it('requires tokenFamily for request-time authority', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          status: UserStatus.ACTIVE,
          platformRole: 'USER',
          sessionVersion: 1,
          securityVersion: 0,
        }),
      },
    };
    const service = new UserAccessAuthorityService(
      prisma as never,
      platformPermissions as never,
    );
    const { tokenFamily: _ignored, ...legacy } = basePayload;
    await expect(service.validateAccessJwt(legacy as never)).rejects.toMatchObject({
      response: { code: ACCESS_AUTHORITY_FAILURE_CODES.SESSION_BINDING_REQUIRED },
    });
  });

  it('fails closed when authority store is unavailable', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockRejectedValue(new Error('db_down')),
      },
    };
    const service = new UserAccessAuthorityService(
      prisma as never,
      platformPermissions as never,
    );
    await expect(service.validateAccessJwt(basePayload)).rejects.toMatchObject({
      response: { code: ACCESS_AUTHORITY_FAILURE_CODES.AUTHORITY_UNAVAILABLE },
    });
  });
});