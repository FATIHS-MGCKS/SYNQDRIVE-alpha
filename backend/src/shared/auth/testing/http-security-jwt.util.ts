import { Provider } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { RefreshTokenScope, UserPlatformRole, UserStatus } from '@prisma/client';
import { AuthGuard } from '@shared/auth/auth.guard';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { PrismaService } from '@shared/database/prisma.service';

/** Stable family for lightweight HTTP security specs (not production). */
export const HTTP_SECURITY_TEST_TOKEN_FAMILY = 'http-security-test-family';

export function signHttpSecurityAccessToken(
  jwtSecret: string,
  claims: Record<string, unknown>,
  tokenFamily: string = HTTP_SECURITY_TEST_TOKEN_FAMILY,
): string {
  const sub = (claims.id ?? claims.sub) as string;
  return jwt.sign(
    {
      sub,
      email: claims.email ?? `${sub}@test.local`,
      name: claims.name ?? String(sub),
      platformRole: claims.platformRole ?? UserPlatformRole.USER,
      membershipRole: claims.membershipRole ?? null,
      organizationId: claims.organizationId ?? null,
      membershipId: claims.membershipId ?? null,
      membershipVersion: claims.membershipVersion ?? null,
      sessionVersion: claims.sessionVersion ?? 0,
      securityVersion: claims.securityVersion ?? 0,
      tokenFamily,
      platformPermissions: claims.platformPermissions ?? [],
    },
    jwtSecret,
    { expiresIn: '1h' },
  );
}

type PrismaUserMock = {
  findUnique: jest.Mock;
};

type PrismaRefreshMock = {
  findFirst: jest.Mock;
};

/**
 * Attach minimal user + refresh mocks so bound HTTP security JWTs pass UserAccessAuthorityService.
 */
export function attachHttpSecurityAuthorityPrismaMocks(prisma: {
  user?: PrismaUserMock;
  refreshToken?: PrismaRefreshMock;
}): void {
  const knownUsers = new Map<
    string,
    {
      platformRole: UserPlatformRole | string;
      sessionVersion: number;
      securityVersion: number;
      organizationId?: string | null;
      membershipId?: string | null;
      scope?: RefreshTokenScope;
    }
  >();

  prisma.user = {
    findUnique: jest.fn(async (args: { where: { id: string } }) => {
      const row = knownUsers.get(args.where.id);
      if (!row) {
        return {
          id: args.where.id,
          email: `${args.where.id}@test.local`,
          name: args.where.id,
          status: UserStatus.ACTIVE,
          platformRole: UserPlatformRole.USER,
          sessionVersion: 0,
          securityVersion: 0,
        };
      }
      return {
        id: args.where.id,
        email: `${args.where.id}@test.local`,
        name: args.where.id,
        status: UserStatus.ACTIVE,
        platformRole: row.platformRole,
        sessionVersion: row.sessionVersion,
        securityVersion: row.securityVersion,
      };
    }),
  };

  prisma.refreshToken = {
    findFirst: jest.fn(
      async (query: {
        where: {
          userId?: string;
          family?: string;
          revokedAt?: null;
          replacedBy?: null;
        };
      }) => {
        const w = query.where;
        if (
          w.userId &&
          w.family === HTTP_SECURITY_TEST_TOKEN_FAMILY &&
          Object.prototype.hasOwnProperty.call(w, 'revokedAt') &&
          w.revokedAt === null
        ) {
          const row = knownUsers.get(w.userId);
          return {
            id: 'rt-http-security',
            family: HTTP_SECURITY_TEST_TOKEN_FAMILY,
            scope: row?.scope ?? RefreshTokenScope.LEGACY_UNSCOPED,
            organizationId: row?.organizationId ?? null,
            membershipId: row?.membershipId ?? null,
            sessionVersion: row?.sessionVersion ?? 0,
            membershipVersion: null,
          };
        }
        return null;
      },
    ),
  };

  (prisma as { registerHttpSecurityUser?: (id: string, row?: Partial<typeof knownUsers extends Map<string, infer V> ? V : never>) => void }).registerHttpSecurityUser = (
    id: string,
    row?: {
      platformRole?: UserPlatformRole | string;
      sessionVersion?: number;
      securityVersion?: number;
      organizationId?: string | null;
      membershipId?: string | null;
      scope?: RefreshTokenScope;
    },
  ) => {
    const scope =
      row?.organizationId || row?.membershipId
        ? RefreshTokenScope.ORG_MEMBERSHIP_BOUND
        : RefreshTokenScope.LEGACY_UNSCOPED;
    knownUsers.set(id, {
      platformRole: row?.platformRole ?? UserPlatformRole.USER,
      sessionVersion: row?.sessionVersion ?? 0,
      securityVersion: row?.securityVersion ?? 0,
      organizationId: row?.organizationId ?? null,
      membershipId: row?.membershipId ?? null,
      scope: row?.scope ?? scope,
    });
  };
}

/**
 * Nest providers for HTTP specs that register real AuthGuard + UserAccessAuthorityService.
 * Call `attachHttpSecurityAuthorityPrismaMocks(prisma)` on the same prisma mock first.
 */
export function authGuardHttpSecurityProviders(
  prisma: object,
  platformPermissions: {
    resolveJwtPermissions: jest.Mock;
  } = { resolveJwtPermissions: jest.fn().mockResolvedValue([]) },
): Provider[] {
  return [
    AuthGuard,
    UserAccessAuthorityService,
    { provide: PrismaService, useValue: prisma },
    { provide: PlatformPermissionService, useValue: platformPermissions },
  ];
}