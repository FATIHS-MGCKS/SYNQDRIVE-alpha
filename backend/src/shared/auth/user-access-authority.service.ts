import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { MembershipStatus, OrganizationStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { sessionClaimsFromJwt } from './auth-session-claims.types';
import { assertOrganizationAllowsTenantSurface } from './organization-lifecycle-access.policy';
import {
  ACCESS_AUTHORITY_FAILURE_CODES,
  type AccessJwtPayload,
  type ValidatedRequestUser,
} from './user-access-authority.types';

@Injectable()
export class UserAccessAuthorityService {
  private readonly logger = new Logger(UserAccessAuthorityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformPermissions: PlatformPermissionService,
  ) {}

  async validateAccessJwt(decoded: AccessJwtPayload): Promise<ValidatedRequestUser> {
    const userId = decoded.sub;
    if (!userId?.trim()) {
      throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.USER_NOT_FOUND);
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

      const jwtSessionVersion = decoded.sessionVersion ?? 0;
      if (jwtSessionVersion !== user.sessionVersion) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.SESSION_VERSION_MISMATCH);
      }

      const jwtSecurityVersion = decoded.securityVersion ?? 0;
      if (jwtSecurityVersion !== user.securityVersion) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.SECURITY_VERSION_MISMATCH);
      }

      const tokenFamily = decoded.tokenFamily?.trim() || null;
      if (!tokenFamily) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.SESSION_BINDING_REQUIRED);
      }

      const activeRefresh = await this.prisma.refreshToken.findFirst({
        where: {
          userId,
          family: tokenFamily,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!activeRefresh) {
        throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.SESSION_REVOKED);
      }

      let membershipRole: string | null = decoded.membershipRole ?? null;
      let organizationId: string | null = decoded.organizationId ?? null;
      let organizationName: string | null = decoded.organizationName ?? null;
      let membershipId: string | null = decoded.membershipId ?? null;
      let membershipVersion: number | null = decoded.membershipVersion ?? null;

      const resolveMembership = async (
        where: { id: string } | { userId: string; organizationId: string },
      ) => {
        const membership = await this.prisma.organizationMembership.findFirst({
          where: {
            ...where,
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
        assertOrganizationAllowsTenantSurface(
          membership.organization?.status as OrganizationStatus | undefined,
          'TENANT_OPERATIONAL',
        );
        return membership;
      };

      if (membershipId) {
        const membership = await resolveMembership({ id: membershipId, userId });
        const jwtMv = decoded.membershipVersion ?? 0;
        if (jwtMv !== membership.membershipVersion) {
          throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.MEMBERSHIP_VERSION_MISMATCH);
        }
        membershipRole = membership.role;
        organizationId = membership.organizationId;
        organizationName = membership.organization?.companyName ?? null;
        membershipId = membership.id;
        membershipVersion = membership.membershipVersion;
      } else if (organizationId) {
        if (user.platformRole === 'MASTER_ADMIN') {
          const org = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: { companyName: true, status: true },
          });
          assertOrganizationAllowsTenantSurface(
            org?.status as OrganizationStatus | undefined,
            'TENANT_OPERATIONAL',
          );
          organizationName = org?.companyName ?? organizationName;
        } else {
          const membership = await resolveMembership({ userId, organizationId });
          const jwtMv = decoded.membershipVersion ?? null;
          if (jwtMv != null && jwtMv !== membership.membershipVersion) {
            throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.MEMBERSHIP_VERSION_MISMATCH);
          }
          membershipRole = membership.role;
          organizationId = membership.organizationId;
          organizationName = membership.organization?.companyName ?? null;
          membershipId = membership.id;
          membershipVersion = membership.membershipVersion;
        }
      }

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
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      this.logger.error(
        `user_access_authority_failed userId=${userId} error=${(err as Error).message}`,
      );
      throw this.unauthorized(ACCESS_AUTHORITY_FAILURE_CODES.AUTHORITY_UNAVAILABLE);
    }
  }

  private unauthorized(code: string): UnauthorizedException {
    return new UnauthorizedException({ code, message: 'Invalid or expired token' });
  }
}