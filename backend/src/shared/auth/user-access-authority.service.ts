import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  MembershipStatus,
  OrganizationStatus,
  RefreshTokenScope,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { sessionClaimsFromJwt } from './auth-session-claims.types';
import {
  assertOrganizationAllowsTenantSurface,
  type OrganizationAccessSurface,
} from './organization-lifecycle-access.policy';
import {
  ACCESS_AUTHORITY_FAILURE_CODES,
  type AccessJwtPayload,
  type ValidatedRequestUser,
} from './user-access-authority.types';

type ActiveRefreshAuthority = {
  id: string;
  family: string;
  scope: RefreshTokenScope;
  organizationId: string | null;
  membershipId: string | null;
  sessionVersion: number | null;
  membershipVersion: number | null;
};

@Injectable()
export class UserAccessAuthorityService {
  private readonly logger = new Logger(UserAccessAuthorityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformPermissions: PlatformPermissionService,
  ) {}

  async validateAccessJwt(decoded: AccessJwtPayload): Promise<ValidatedRequestUser> {
    const userId = this.readNonEmptyString(decoded.sub);
    if (!userId) {
      throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.INVALID_TOKEN_CLAIMS);
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          platformRole: true,
          sessionVersion: true,
          securityVersion: true,
        },
      });
      if (!user) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.USER_NOT_FOUND);
      }
      if (user.status !== UserStatus.ACTIVE) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.USER_INACTIVE);
      }

      const jwtSessionVersion = this.readNonNegativeInt(decoded.sessionVersion, 0);
      if (jwtSessionVersion === null || jwtSessionVersion !== user.sessionVersion) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.SESSION_VERSION_MISMATCH);
      }

      const jwtSecurityVersion = this.readNonNegativeInt(decoded.securityVersion, 0);
      if (jwtSecurityVersion === null || jwtSecurityVersion !== user.securityVersion) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.SECURITY_VERSION_MISMATCH);
      }

      const tokenFamily = this.readNonEmptyString(decoded.tokenFamily);
      if (!tokenFamily) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.SESSION_BINDING_REQUIRED);
      }

      const activeRefresh = await this.prisma.refreshToken.findFirst({
        where: {
          userId,
          family: tokenFamily,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          replacedBy: null,
        },
        select: {
          id: true,
          family: true,
          scope: true,
          organizationId: true,
          membershipId: true,
          sessionVersion: true,
          membershipVersion: true,
        },
      });
      if (!activeRefresh) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.SESSION_REVOKED);
      }

      this.assertRefreshScopeMatchesJwt(activeRefresh, decoded, user.platformRole);

      const {
        membershipRole,
        organizationId,
        organizationName,
        membershipId,
        membershipVersion,
      } = await this.resolveAuthoritativeMembershipContext({
        user,
        refresh: activeRefresh,
        decoded,
      });

      const platformPermissions = await this.platformPermissions.resolveJwtPermissions(userId);

      return {
        id: user.id,
        email: user.email ?? decoded.email,
        name: user.name ?? decoded.name,
        platformRole: user.platformRole,
        platformPermissions,
        membershipRole,
        organizationId,
        organizationName,
        membershipId,
        sessionVersion: user.sessionVersion,
        membershipVersion,
        tokenFamily,
        sessionClaims: sessionClaimsFromJwt(decoded as Record<string, unknown>),
      };
    } catch (err) {
      if (
        err instanceof UnauthorizedException ||
        err instanceof ForbiddenException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      this.logger.warn(`user_access_authority_failed userId=${userId}`);
      throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.AUTHORITY_UNAVAILABLE);
    }
  }

  private assertRefreshScopeMatchesJwt(
    refresh: ActiveRefreshAuthority,
    decoded: AccessJwtPayload,
    platformRole: string,
  ): void {
    const jwtOrgId = decoded.organizationId ?? null;
    const jwtMembershipId = decoded.membershipId ?? null;

    const refreshOrgId = refresh.organizationId ?? null;
    const refreshMembershipId = refresh.membershipId ?? null;

    if (refresh.scope === RefreshTokenScope.ORG_MEMBERSHIP_BOUND) {
      if (!refreshMembershipId || !refreshOrgId) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.SESSION_SCOPE_MISMATCH);
      }
      if (jwtMembershipId && jwtMembershipId !== refreshMembershipId) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.SESSION_SCOPE_MISMATCH);
      }
      if (jwtOrgId && jwtOrgId !== refreshOrgId) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.SESSION_SCOPE_MISMATCH);
      }
      return;
    }

    if (refreshOrgId || refreshMembershipId) {
      if (jwtOrgId && jwtOrgId !== refreshOrgId) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.SESSION_SCOPE_MISMATCH);
      }
      if (jwtMembershipId && refreshMembershipId && jwtMembershipId !== refreshMembershipId) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.SESSION_SCOPE_MISMATCH);
      }
      return;
    }

    if (
      refresh.scope === RefreshTokenScope.LEGACY_UNSCOPED ||
      (!refreshOrgId && !refreshMembershipId)
    ) {
      if (jwtMembershipId && platformRole !== UserPlatformRole.MASTER_ADMIN) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.SESSION_SCOPE_MISMATCH);
      }
    }
  }

  private async resolveAuthoritativeMembershipContext(input: {
    user: {
      id: string;
      platformRole: string;
    };
    refresh: ActiveRefreshAuthority;
    decoded: AccessJwtPayload;
  }): Promise<{
    membershipRole: string | null;
    organizationId: string | null;
    organizationName: string | null;
    membershipId: string | null;
    membershipVersion: number | null;
  }> {
    let membershipRole: string | null = null;
    let organizationId: string | null = input.refresh.organizationId ?? null;
    let organizationName: string | null = null;
    let membershipId: string | null = input.refresh.membershipId ?? null;
    let membershipVersion: number | null = input.refresh.membershipVersion ?? null;

    if (!membershipId && !organizationId) {
      return {
        membershipRole: null,
        organizationId: null,
        organizationName: null,
        membershipId: null,
        membershipVersion: null,
      };
    }

    const resolveMembership = async (
      where: { id: string } | { userId: string; organizationId: string },
    ) => {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          ...where,
          userId: input.user.id,
          status: MembershipStatus.ACTIVE,
        },
        select: {
          id: true,
          role: true,
          membershipVersion: true,
          organizationId: true,
          organization: { select: { companyName: true, status: true } },
        },
      });
      if (!membership) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.MEMBERSHIP_INVALID);
      }
      return membership;
    };

    const accessSurface: OrganizationAccessSurface =
      input.user.platformRole === UserPlatformRole.MASTER_ADMIN
        ? 'PLATFORM_MASTER_ADMIN'
        : membershipId || organizationId
          ? 'TENANT_OPERATIONAL'
          : 'TENANT_OPERATIONAL';

    if (membershipId) {
      const membership = await resolveMembership({ id: membershipId });
      const jwtMv = this.readNonNegativeInt(input.decoded.membershipVersion, null);
      if (jwtMv !== null && jwtMv !== membership.membershipVersion) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.MEMBERSHIP_VERSION_MISMATCH);
      }
      const orgStatus = membership.organization?.status;
      if (orgStatus === OrganizationStatus.PENDING) {
        assertOrganizationAllowsTenantSurface(orgStatus, 'TENANT_ONBOARDING');
      } else {
        assertOrganizationAllowsTenantSurface(orgStatus, accessSurface, {
          platformRole: input.user.platformRole,
        });
      }
      membershipRole = membership.role;
      organizationId = membership.organizationId;
      organizationName = membership.organization?.companyName ?? null;
      membershipId = membership.id;
      membershipVersion = membership.membershipVersion;
    } else if (organizationId) {
      if (input.user.platformRole === UserPlatformRole.MASTER_ADMIN) {
        const org = await this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { companyName: true, status: true },
        });
        assertOrganizationAllowsTenantSurface(org?.status, 'PLATFORM_MASTER_ADMIN', {
          platformRole: input.user.platformRole,
        });
        organizationName = org?.companyName ?? input.decoded.organizationName ?? null;
      } else {
        const membership = await resolveMembership({
          userId: input.user.id,
          organizationId,
        });
        const jwtMv = this.readNonNegativeInt(input.decoded.membershipVersion, null);
        if (jwtMv !== null && jwtMv !== membership.membershipVersion) {
          throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.MEMBERSHIP_VERSION_MISMATCH);
        }
        const orgStatus = membership.organization?.status;
        if (orgStatus === OrganizationStatus.PENDING) {
          assertOrganizationAllowsTenantSurface(orgStatus, 'TENANT_ONBOARDING');
        } else {
          assertOrganizationAllowsTenantSurface(orgStatus, accessSurface, {
            platformRole: input.user.platformRole,
          });
        }
        membershipRole = membership.role;
        organizationId = membership.organizationId;
        organizationName = membership.organization?.companyName ?? null;
        membershipId = membership.id;
        membershipVersion = membership.membershipVersion;
      }
    }

    return { membershipRole, organizationId, organizationName, membershipId, membershipVersion };
  }

  private readNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private readNonNegativeInt(value: unknown, fallback: number | null): number | null {
    if (value === undefined || value === null) {
      return fallback;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      return null;
    }
    return value;
  }

  private unauthorized(code: string): UnauthorizedException {
    return new UnauthorizedException({ code, message: 'Invalid or expired token' });
  }
}