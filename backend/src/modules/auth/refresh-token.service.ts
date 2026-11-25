import { Injectable, Inject, forwardRef, Logger, UnauthorizedException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MembershipRole,
  MembershipStatus,
  Prisma,
  RefreshTokenScope,
  SessionAssuranceLevel,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { IamSessionPolicyService } from './iam-session-policy.service';
import {
  buildVersionSnapshot,
  classifyRefreshTokenScope,
  type LoginMembershipCandidate,
  resolveRefreshBinding,
  validateVersionSnapshots,
} from '@modules/users/policies/refresh-session-binding.policy';
import { IamMetricsService } from '@modules/iam-observability/iam-metrics.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import {
  ASSURANCE_LEVEL_MFA,
  AuthSessionClaims,
  buildPasswordOnlyClaims,
} from '@shared/auth/auth-session-claims.types';
import { assertOrganizationAllowsTenantSurface } from '@shared/auth/organization-lifecycle-access.policy';
import {
  acquireOrgScopeSessionWriteLock,
  acquireOrgSessionWriteLock,
  acquireSessionWriteLocks,
  acquireUserSessionWriteLock,
} from './refresh-token-session-concurrency';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

const REFRESH_TOKEN_BYTES = 40;
const REFRESH_TOKEN_TTL_DAYS = 30;

export interface RefreshTokenMembershipContext {
  role?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationLogoUrl?: string | null;
  permissions?: unknown;
  membershipId?: string | null;
  membershipVersion?: number | null;
  organizationRoleId?: string | null;
}

export type ExpectedAuthSnapshot = {
  sessionVersion: number;
  securityVersion: number;
  platformRole: string;
};

export type IssueTokenPairOptions = {
  assuranceLevel?: SessionAssuranceLevel;
  sessionClaims?: AuthSessionClaims;
  /** P2-R17: reject when caller/pending context does not match authoritative user row. */
  expectedAuth?: ExpectedAuthSnapshot;
};

export interface RefreshTokenUserContext {
  id: string;
  email: string;
  name?: string | null;
  platformRole: string;
  sessionVersion?: number;
  securityVersion?: number;
}

type MembershipWithOrg = {
  id: string;
  userId: string;
  organizationId: string;
  role: MembershipRole;
  organizationRoleId: string | null;
  status: MembershipStatus;
  membershipVersion: number;
  permissions: unknown;
  organization: { companyName: string | null; logoUrl: string | null } | null;
};

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => IamSessionPolicyService))
    private readonly sessionPolicy: IamSessionPolicyService,
    private readonly platformPermissions: PlatformPermissionService,
    @Optional() private readonly iamMetrics?: IamMetricsService,
  ) {
    this.jwtSecret = this.config.get<string>('app.jwtSecret')!;
    this.jwtExpiresIn = this.config.get<string>('app.jwtExpiresIn', '15m');
  }

  private async withSessionWriteFence<T>(
    scope: { userId: string; organizationId?: string | null },
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await acquireSessionWriteLocks(tx, scope);
      return fn(tx);
    });
  }

  private async withOrgOnlySessionWriteFence<T>(
    organizationId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await acquireOrgScopeSessionWriteLock(tx, organizationId);
      return fn(tx);
    });
  }

  /** Issue a new access + refresh token pair after successful authentication. */
  async issueTokenPair(
    user: RefreshTokenUserContext,
    membership: RefreshTokenMembershipContext | null,
    context: { userAgent?: string; ipAddress?: string } = {},
    options?: IssueTokenPairOptions,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
    const family = crypto.randomUUID();
    const authenticatedAt = options?.sessionClaims?.authenticatedAt
      ? new Date(options.sessionClaims.authenticatedAt)
      : new Date();
    const orgId = membership?.organizationId ?? null;
    const pair = await this.withSessionWriteFence(
      { userId: user.id, organizationId: orgId },
      async (tx) => {
        const liveUser = await tx.user.findUnique({
          where: { id: user.id },
          select: {
            id: true,
            email: true,
            name: true,
            platformRole: true,
            sessionVersion: true,
            securityVersion: true,
            status: true,
          },
        });
        if (!liveUser || liveUser.status !== UserStatus.ACTIVE) {
          throw new UnauthorizedException('Account is inactive');
        }
        this.assertIssuanceAuthSnapshot(liveUser, user, options?.expectedAuth);

        let liveMembership = membership;
        if (membership?.membershipId) {
          const row = await tx.organizationMembership.findFirst({
            where: {
              id: membership.membershipId,
              userId: user.id,
              status: MembershipStatus.ACTIVE,
            },
            select: {
              id: true,
              userId: true,
              organizationId: true,
              role: true,
              organizationRoleId: true,
              status: true,
              membershipVersion: true,
              permissions: true,
              organization: { select: { companyName: true, logoUrl: true } },
            },
          });
          if (!row) {
            throw new UnauthorizedException('Membership is not active');
          }
          await this.assertOrganizationSessionIssuanceForOrganizationIdWithClient(
            tx,
            row.organizationId,
          );
          liveMembership = this.toMembershipContext(this.toLoginMembershipCandidate(row));
        } else {
          await this.assertOrganizationSessionIssuanceForMembership(liveMembership);
        }

        const userCtx: RefreshTokenUserContext = {
          id: liveUser.id,
          email: liveUser.email,
          name: liveUser.name,
          platformRole: liveUser.platformRole,
          sessionVersion: liveUser.sessionVersion,
          securityVersion: liveUser.securityVersion,
        };

        return this.issueTokenPairWithFamilyTx(
          tx,
          userCtx,
          liveMembership,
          family,
          context,
          {
            scope: classifyRefreshTokenScope(
              liveMembership
                ? {
                    id: liveMembership.membershipId!,
                    organizationId: liveMembership.organizationId!,
                    role: liveMembership.role ?? 'WORKER',
                    status: MembershipStatus.ACTIVE,
                    membershipVersion: liveMembership.membershipVersion ?? 0,
                    permissions: liveMembership.permissions,
                    organizationRoleId: liveMembership.organizationRoleId,
                  }
                : null,
            ),
            authenticatedAt,
            assuranceLevel: options?.assuranceLevel ?? SessionAssuranceLevel.PASSWORD,
            sessionClaims: options?.sessionClaims,
          },
        );
      },
    );
    this.iamMetrics?.recordSessionCreated('login');
    return {
      accessToken: pair.accessToken,
      refreshToken: pair.rawRefreshToken,
      expiresIn: this.jwtExpiresIn,
    };
  }

  /** Most recent non-revoked refresh family for MFA/step-up reissue binding. */
  async resolveLatestActiveTokenFamily(userId: string): Promise<string | null> {
    const row = await this.prisma.refreshToken.findFirst({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { family: true },
    });
    return row?.family ?? null;
  }

  async reissueAccessToken(
    user: RefreshTokenUserContext,
    membership: RefreshTokenMembershipContext | null,
    sessionClaims: AuthSessionClaims,
    options?: { tokenFamily?: string | null },
  ): Promise<{ accessToken: string; expiresIn: string }> {
    await this.assertOrganizationSessionIssuanceForMembership(membership);
    const platformPermissions = await this.platformPermissions.resolveJwtPermissions(user.id);
    return {
      accessToken: this.signAccessToken(
        user,
        membership,
        sessionClaims,
        platformPermissions,
        options?.tokenFamily ?? null,
      ),
      expiresIn: this.jwtExpiresIn,
    };
  }

  decodeAccessToken(token: string): jwt.JwtPayload | null {
    try {
      return jwt.verify(token, this.jwtSecret) as jwt.JwtPayload;
    } catch {
      return null;
    }
  }

  async rotate(
    rawToken: string,
    context: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
    const tokenHash = await this.hashToken(rawToken);

    type LockedRow = {
      id: string;
      user_id: string;
      family: string;
      scope: RefreshTokenScope;
      organization_id: string | null;
      membership_id: string | null;
      session_version: number | null;
      membership_version: number | null;
      permission_version: number | null;
      role_version: number | null;
      assurance_level: SessionAssuranceLevel | null;
      authenticated_at: Date | null;
      created_at: Date;
      revoked_at: Date | null;
      replaced_by: string | null;
      expires_at: Date;
    };

    type RotateOutcome =
      | { kind: 'invalid' }
      | { kind: 'inactive' }
      | {
          kind: 'reuse';
          row: LockedRow;
        }
      | {
          kind: 'denied';
          message: string;
          membershipPolicy?: 'MEMBERSHIP_REMOVED' | 'MEMBERSHIP_SUSPENDED';
          stored: {
            userId: string;
            organizationId: string | null;
            membershipId: string | null;
            refreshTokenId: string;
            tokenFamily: string;
          };
        }
      | { kind: 'ok'; accessToken: string; refreshToken: string; expiresIn: string };

    const preview = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      select: { userId: true, organizationId: true },
    });
    if (!preview) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let outcome: RotateOutcome;
    try {
      outcome = await this.prisma.$transaction(async (tx): Promise<RotateOutcome> => {
      await acquireSessionWriteLocks(tx, {
        userId: preview.userId,
        organizationId: preview.organizationId,
      });

      const locked = await tx.$queryRaw<LockedRow[]>`
        SELECT id, user_id, family, scope, organization_id, membership_id,
               session_version, membership_version, permission_version, role_version,
               assurance_level, authenticated_at, created_at, revoked_at, replaced_by, expires_at
        FROM refresh_tokens
        WHERE token_hash = ${tokenHash}
        FOR UPDATE
      `;

      const row = locked[0];
      if (!row) {
        return { kind: 'invalid' };
      }

      if (row.revoked_at || row.expires_at < new Date()) {
        if (row.replaced_by) {
          await tx.refreshToken.updateMany({
            where: { family: row.family, revokedAt: null },
            data: {
              revokedAt: new Date(),
              revocationReason: 'REFRESH_TOKEN_REUSE_DETECTED',
            },
          });
          return { kind: 'reuse', row };
        }
        return { kind: 'invalid' };
      }

      const user = await tx.user.findUnique({
        where: { id: row.user_id },
        select: {
          id: true,
          email: true,
          name: true,
          platformRole: true,
          status: true,
          sessionVersion: true,
          securityVersion: true,
          lastSelectedOrganizationId: true,
        },
      });
      if (!user || user.status !== UserStatus.ACTIVE) {
        return { kind: 'inactive' };
      }

      const stored = {
        id: row.id,
        userId: row.user_id,
        family: row.family,
        scope: row.scope,
        organizationId: row.organization_id,
        membershipId: row.membership_id,
        sessionVersion: row.session_version,
        membershipVersion: row.membership_version,
        permissionVersion: row.permission_version,
        roleVersion: row.role_version,
        assuranceLevel: row.assurance_level,
        authenticatedAt: row.authenticated_at,
        createdAt: row.created_at,
      };

      const activeMemberships = await this.loadActiveMembershipsTx(tx, user.id);
      const boundMembership = stored.membershipId
        ? await this.loadMembershipForUserTx(tx, stored.membershipId, user.id)
        : null;

      const binding = resolveRefreshBinding(
        {
          scope: stored.scope as 'ORG_MEMBERSHIP_BOUND' | 'LEGACY_UNSCOPED',
          organizationId: stored.organizationId,
          membershipId: stored.membershipId,
          sessionVersion: stored.sessionVersion,
          membershipVersion: stored.membershipVersion,
          permissionVersion: stored.permissionVersion,
          roleVersion: stored.roleVersion,
          userId: stored.userId,
        },
        boundMembership,
        activeMemberships,
        {
          lastSelectedOrganizationId: user.lastSelectedOrganizationId,
          graceEnabled: this.isLegacyGraceEnabled(),
          orgBoundEnforced: this.isOrgBoundEnforced(),
        },
      );

      if (!binding.ok) {
        await tx.refreshToken.updateMany({
          where: { id: stored.id, revokedAt: null },
          data: {
            revokedAt: new Date(),
            revocationReason: binding.auditEvent ?? binding.code,
          },
        });
        return {
          kind: 'denied',
          message: binding.message,
          membershipPolicy:
            binding.code === 'MEMBERSHIP_REMOVED'
              ? 'MEMBERSHIP_REMOVED'
              : binding.code === 'MEMBERSHIP_INACTIVE'
                ? 'MEMBERSHIP_SUSPENDED'
                : undefined,
          stored: {
            userId: stored.userId,
            organizationId: stored.organizationId,
            membershipId: stored.membershipId,
            refreshTokenId: stored.id,
            tokenFamily: stored.family,
          },
        };
      }

      const membership = binding.membership;
      const destinationOrgId = membership?.organizationId ?? stored.organizationId;
      if (
        destinationOrgId &&
        destinationOrgId !== preview.organizationId
      ) {
        await acquireOrgSessionWriteLock(tx, destinationOrgId);
      }
      await this.assertOrganizationSessionIssuanceForOrganizationIdWithClient(
        tx,
        destinationOrgId,
      );
      const membershipContext = membership
        ? this.toMembershipContext(membership)
        : null;

      const versionCheck = validateVersionSnapshots(
        stored,
        buildVersionSnapshot({
          sessionVersion: user.sessionVersion,
          membership: membership,
        }),
      );
      if (!('ok' in versionCheck && versionCheck.ok)) {
        await tx.refreshToken.updateMany({
          where: { id: stored.id, revokedAt: null },
          data: {
            revokedAt: new Date(),
            revocationReason: versionCheck.auditEvent ?? 'VERSION_MISMATCH',
          },
        });
        return { kind: 'denied', message: versionCheck.message, stored: {
          userId: stored.userId,
          organizationId: stored.organizationId,
          membershipId: stored.membershipId,
          refreshTokenId: stored.id,
          tokenFamily: stored.family,
        } };
      }

      const authenticatedAt = stored.authenticatedAt ?? stored.createdAt;
      const rotationClaims = this.buildSessionClaimsForStored(stored, user.securityVersion);

      const newPair = await this.issueTokenPairWithFamilyTx(
        tx,
        {
          id: user.id,
          email: user.email,
          name: user.name,
          platformRole: user.platformRole,
          sessionVersion: user.sessionVersion,
          securityVersion: user.securityVersion,
        },
        membershipContext,
        stored.family,
        context,
        {
          scope: binding.scope,
          authenticatedAt,
          assuranceLevel: stored.assuranceLevel ?? SessionAssuranceLevel.PASSWORD,
          sessionClaims: rotationClaims,
        },
      );

      const replaced = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: {
          revokedAt: new Date(),
          replacedBy: newPair.refreshTokenId,
          lastUsedAt: new Date(),
        },
      });
      if (replaced.count !== 1) {
        throw new Error('REFRESH_ROTATION_REPLACE_RACE');
      }

      return {
        kind: 'ok',
        accessToken: newPair.accessToken,
        refreshToken: newPair.rawRefreshToken,
        expiresIn: this.jwtExpiresIn,
      };
    });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('REFRESH_ROTATION_')) {
        throw new UnauthorizedException('Refresh token is no longer valid');
      }
      throw err;
    }

    if (outcome.kind === 'reuse') {
      this.logger.warn(
        `Refresh token reuse detected for user ${outcome.row.user_id}, family ${outcome.row.family}.`,
      );
      this.iamMetrics?.recordSessionReuseDetected();
      await this.sessionPolicy.recordAndExecute({
        eventType: 'REFRESH_TOKEN_REUSE_DETECTED',
        userId: outcome.row.user_id,
        organizationId: outcome.row.organization_id,
        membershipId: outcome.row.membership_id,
        tokenFamily: outcome.row.family,
        refreshTokenId: outcome.row.id,
        highRiskReuse: true,
      });
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    if (outcome.kind === 'denied') {
      if (outcome.membershipPolicy) {
        void this.sessionPolicy.recordAndExecute({
          eventType: outcome.membershipPolicy,
          userId: outcome.stored.userId,
          organizationId: outcome.stored.organizationId,
          membershipId: outcome.stored.membershipId,
          refreshTokenId: outcome.stored.refreshTokenId,
          tokenFamily: outcome.stored.tokenFamily,
        });
      }
      throw new UnauthorizedException(outcome.message);
    }

    if (outcome.kind === 'inactive') {
      throw new UnauthorizedException('Account is inactive');
    }

    if (outcome.kind === 'invalid') {
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    this.iamMetrics?.recordSessionCreated('refresh');
    return {
      accessToken: outcome.accessToken,
      refreshToken: outcome.refreshToken,
      expiresIn: outcome.expiresIn,
    };
  }

  async revoke(rawToken: string, revocationReason?: string): Promise<void> {
    const tokenHash = await this.hashToken(rawToken);
    const row = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      select: { userId: true, family: true, organizationId: true },
    });
    if (!row?.family) return;

    const result = await this.withSessionWriteFence(
      { userId: row.userId, organizationId: row.organizationId },
      async (tx) =>
        tx.refreshToken.updateMany({
          where: { family: row.family, userId: row.userId, revokedAt: null },
          data: {
            revokedAt: new Date(),
            revocationReason: revocationReason ?? null,
          },
        }),
    );
    if (result.count > 0) {
      this.iamMetrics?.recordSessionRevoked('single');
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.revokeAllActiveForUser(userId);
  }

  async revokeAllActiveForUser(userId: string): Promise<number> {
    const result = await this.withSessionWriteFence(
      { userId, organizationId: null },
      async (tx) =>
        tx.refreshToken.updateMany({
          where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
          data: {
            revokedAt: new Date(),
            revocationReason: 'USER_ALL_SESSIONS_REVOKED',
          },
        }),
    );
    if (result.count > 0) {
      this.iamMetrics?.recordSessionRevoked('all');
    }
    return result.count;
  }

  /**
   * Revoke every active refresh token bound to an organization (P6D3 offboarding).
   * Other-org tokens for the same user remain valid.
   */
  async revokeAllActiveForOrganization(organizationId: string): Promise<number> {
    const result = await this.withOrgOnlySessionWriteFence(organizationId, async (tx) =>
      tx.refreshToken.updateMany({
        where: {
          organizationId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          revokedAt: new Date(),
          revocationReason: 'ORG_OFFBOARDING_SESSIONS_REVOKED',
        },
      }),
    );
    if (result.count > 0) {
      this.iamMetrics?.recordSessionRevoked('membership');
    }
    return result.count;
  }

  async revokeForOrganizationMembership(
    userId: string,
    organizationId: string,
  ): Promise<number> {
    const result = await this.withSessionWriteFence(
      { userId, organizationId },
      async (tx) =>
        tx.refreshToken.updateMany({
          where: {
            userId,
            organizationId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: {
            revokedAt: new Date(),
            revocationReason: 'ORG_MEMBERSHIP_SESSIONS_REVOKED',
          },
        }),
    );
    return result.count;
  }

  async revokeFamily(family: string): Promise<number> {
    const anchor = await this.prisma.refreshToken.findFirst({
      where: { family },
      select: { userId: true, organizationId: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!anchor) return 0;

    const result = await this.withSessionWriteFence(
      { userId: anchor.userId, organizationId: anchor.organizationId },
      async (tx) =>
        tx.refreshToken.updateMany({
        where: { family, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revocationReason: 'TOKEN_FAMILY_REVOKED',
        },
      }),
    );
    if (result.count > 0) {
      this.iamMetrics?.recordSessionRevoked('family');
    }
    return result.count;
  }

  async revokePrivilegedSessionsForUser(userId: string): Promise<number> {
    return this.withSessionWriteFence({ userId, organizationId: null }, async (tx) =>
      tx.refreshToken.updateMany({
        where: {
          userId,
          privilegedSession: true,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          revokedAt: new Date(),
          revocationReason: 'PRIVILEGED_SESSIONS_REVOKED',
        },
      }),
    ).then((r) => r.count);
  }

  async listSessionsForUser(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  resolveCurrentSessionId(
    tokens: Array<{ id: string; revokedAt: Date | null; expiresAt: Date; replacedBy: string | null }>,
  ): string | null {
    const now = new Date();
    const active = tokens.filter(
      (t) => !t.revokedAt && t.expiresAt > now && !t.replacedBy,
    );
    if (active.length === 0) return null;
    return active[0]?.id ?? null;
  }

  async findSessionOrganizationId(
    userId: string,
    sessionId: string,
  ): Promise<string | null> {
    const row = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId },
      select: { organizationId: true },
    });
    return row?.organizationId ?? null;
  }

  async revokeSessionById(userId: string, sessionId: string): Promise<boolean> {
    return this.withSessionWriteFence({ userId, organizationId: null }, async (tx) =>
      this.revokeSessionByIdInTransaction(tx, userId, sessionId),
    );
  }

  async revokeSessionByIdInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    sessionId: string,
  ): Promise<boolean> {
    const target = await tx.refreshToken.findFirst({
      where: { id: sessionId, userId },
      select: { family: true, organizationId: true },
    });
    if (!target?.family) return false;
    await acquireSessionWriteLocks(tx, { userId, organizationId: target.organizationId });
    const result = await tx.refreshToken.updateMany({
      where: {
        userId,
        family: target.family,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        revokedAt: new Date(),
        revocationReason: 'SESSION_REVOKED_BY_ID',
      },
    });
    return result.count > 0;
  }

  async revokeAllActiveForUserInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<number> {
    await acquireSessionWriteLocks(tx, { userId, organizationId: null });
    const result = await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      data: {
        revokedAt: new Date(),
        revocationReason: 'USER_ALL_SESSIONS_REVOKED',
      },
    });
    return result.count;
  }

  resolveActiveHeadSessionIdForFamily(
    tokens: Array<{ id: string; family: string; revokedAt: Date | null; expiresAt: Date; replacedBy: string | null }>,
    tokenFamily: string | null | undefined,
  ): string | null {
    if (!tokenFamily) return null;
    const now = new Date();
    const activeHead = tokens.find(
      (t) =>
        t.family === tokenFamily &&
        !t.revokedAt &&
        t.expiresAt > now &&
        !t.replacedBy,
    );
    return activeHead?.id ?? null;
  }

  async revokeOtherSessionsForUser(
    userId: string,
    keepTokenFamily?: string | null,
  ): Promise<{ revoked: number; keptSessionId: string | null }> {
    if (!keepTokenFamily) {
      return { revoked: 0, keptSessionId: null };
    }

    return this.withSessionWriteFence({ userId, organizationId: null }, async (tx) => {
      const keptHead = await tx.refreshToken.findFirst({
        where: {
          userId,
          family: keepTokenFamily,
          revokedAt: null,
          replacedBy: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!keptHead) {
        return { revoked: 0, keptSessionId: null };
      }

      const result = await tx.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          NOT: { family: keepTokenFamily },
        },
        data: {
          revokedAt: new Date(),
          revocationReason: 'OTHER_SESSIONS_REVOKED',
        },
      });

      return { revoked: result.count, keptSessionId: keptHead.id };
    });
  }

  private async issueTokenPairWithFamilyTx(
    tx: Prisma.TransactionClient,
    user: RefreshTokenUserContext | null,
    membership: RefreshTokenMembershipContext | null,
    family: string,
    context: { userAgent?: string; ipAddress?: string },
    options: {
      scope: RefreshTokenScope;
      authenticatedAt: Date;
      assuranceLevel: SessionAssuranceLevel;
      sessionClaims?: AuthSessionClaims;
    },
    userIdOverride?: string,
  ): Promise<{ accessToken: string; rawRefreshToken: string; refreshTokenId: string }> {
    return this.issueTokenPairWithFamilyInternal(
      tx,
      user,
      membership,
      family,
      context,
      options,
      userIdOverride,
    );
  }

  private async issueTokenPairWithFamily(
    user: RefreshTokenUserContext | null,
    membership: RefreshTokenMembershipContext | null,
    family: string,
    context: { userAgent?: string; ipAddress?: string },
    options: {
      scope: RefreshTokenScope;
      authenticatedAt: Date;
      assuranceLevel: SessionAssuranceLevel;
      sessionClaims?: AuthSessionClaims;
    },
    userIdOverride?: string,
  ): Promise<{ accessToken: string; rawRefreshToken: string; refreshTokenId: string }> {
    return this.issueTokenPairWithFamilyInternal(
      this.prisma,
      user,
      membership,
      family,
      context,
      options,
      userIdOverride,
    );
  }

  private async issueTokenPairWithFamilyInternal(
    client: Prisma.TransactionClient | PrismaService,
    user: RefreshTokenUserContext | null,
    membership: RefreshTokenMembershipContext | null,
    family: string,
    context: { userAgent?: string; ipAddress?: string },
    options: {
      scope: RefreshTokenScope;
      authenticatedAt: Date;
      assuranceLevel: SessionAssuranceLevel;
      sessionClaims?: AuthSessionClaims;
    },
    userIdOverride?: string,
  ): Promise<{ accessToken: string; rawRefreshToken: string; refreshTokenId: string }> {
    const userId = user?.id ?? userIdOverride!;
    const rawToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const tokenHash = await this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    const privilegedSession = this.isPrivilegedMembership(membership);
    const versionSnapshot = buildVersionSnapshot({
      sessionVersion: user?.sessionVersion ?? 0,
      membership: membership?.membershipId
        ? {
            id: membership.membershipId,
            organizationId: membership.organizationId!,
            role: membership.role ?? 'WORKER',
            status: MembershipStatus.ACTIVE,
            membershipVersion: membership.membershipVersion ?? 0,
            permissions: membership.permissions,
            organizationRoleId: membership.organizationRoleId,
          }
        : null,
    });

    const record = await client.refreshToken.create({
      data: {
        userId,
        tokenHash,
        family,
        scope: options.scope,
        organizationId: membership?.organizationId ?? null,
        membershipId: membership?.membershipId ?? null,
        sessionVersion: versionSnapshot.sessionVersion,
        membershipVersion: versionSnapshot.membershipVersion,
        permissionVersion: versionSnapshot.permissionVersion,
        roleVersion: versionSnapshot.roleVersion,
        assuranceLevel: options.assuranceLevel,
        authenticatedAt: options.authenticatedAt,
        privilegedSession,
        expiresAt,
        userAgent: context.userAgent ?? null,
        ipAddress: context.ipAddress ?? null,
      },
    });

    const platformPermissions = user
      ? await this.platformPermissions.resolveJwtPermissions(user.id)
      : [];
    const accessToken = user
      ? this.signAccessToken(
          user,
          membership,
          options.sessionClaims,
          platformPermissions,
          family,
        )
      : '';

    return { accessToken, rawRefreshToken: rawToken, refreshTokenId: record.id };
  }

  private async loadActiveMemberships(
    userId: string,
  ): Promise<LoginMembershipCandidate[]> {
  return this.loadActiveMembershipsTx(this.prisma, userId);
  }

  private async loadActiveMembershipsTx(
    client: Prisma.TransactionClient | PrismaService,
    userId: string,
  ): Promise<LoginMembershipCandidate[]> {
    const rows = await client.organizationMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        role: true,
        organizationRoleId: true,
        status: true,
        membershipVersion: true,
        permissions: true,
        organization: { select: { companyName: true, logoUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toLoginMembershipCandidate(row));
  }

  private async loadMembershipForUser(
    membershipId: string,
    userId: string,
  ): Promise<LoginMembershipCandidate | null> {
    return this.loadMembershipForUserTx(this.prisma, membershipId, userId);
  }

  private async loadMembershipForUserTx(
    client: Prisma.TransactionClient | PrismaService,
    membershipId: string,
    userId: string,
  ): Promise<LoginMembershipCandidate | null> {
    const row = await client.organizationMembership.findFirst({
      where: { id: membershipId, userId },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        role: true,
        organizationRoleId: true,
        status: true,
        membershipVersion: true,
        permissions: true,
        organization: { select: { companyName: true, logoUrl: true } },
      },
    });
    return row ? this.toLoginMembershipCandidate(row) : null;
  }

  private buildSessionClaimsForStored(
    stored: {
      assuranceLevel: SessionAssuranceLevel | null;
      authenticatedAt: Date | null;
      createdAt: Date;
    },
    securityVersion: number,
  ): AuthSessionClaims {
    const authenticatedAt = (stored.authenticatedAt ?? stored.createdAt).toISOString();
    if (stored.assuranceLevel === SessionAssuranceLevel.MFA) {
      // P2-R18: refresh rows do not persist authMethods — keep MFA assurance timestamps
      // but do not fabricate totp/recovery on rotation (conservative pwd-only methods).
      return {
        assuranceLevel: ASSURANCE_LEVEL_MFA,
        authenticatedAt,
        mfaAuthenticatedAt: authenticatedAt,
        authMethods: ['pwd'],
        securityVersion,
      };
    }
    return {
      ...buildPasswordOnlyClaims(securityVersion),
      authenticatedAt,
    };
  }

  private assertIssuanceAuthSnapshot(
    liveUser: {
      sessionVersion: number;
      securityVersion: number;
      platformRole: string;
    },
    caller: RefreshTokenUserContext,
    expected?: ExpectedAuthSnapshot,
  ): void {
    if (expected) {
      if (
        liveUser.sessionVersion !== expected.sessionVersion ||
        liveUser.securityVersion !== expected.securityVersion ||
        liveUser.platformRole !== expected.platformRole
      ) {
        throw new UnauthorizedException('Authentication snapshot is no longer valid');
      }
    }
    if (
      caller.sessionVersion !== undefined &&
      caller.sessionVersion !== liveUser.sessionVersion
    ) {
      throw new UnauthorizedException('Authentication snapshot is no longer valid');
    }
    if (
      caller.securityVersion !== undefined &&
      caller.securityVersion !== liveUser.securityVersion
    ) {
      throw new UnauthorizedException('Authentication snapshot is no longer valid');
    }
    if (caller.platformRole !== liveUser.platformRole) {
      throw new UnauthorizedException('Authentication snapshot is no longer valid');
    }
  }

  private toLoginMembershipCandidate(
    row: MembershipWithOrg,
  ): LoginMembershipCandidate {
    return {
      id: row.id,
      userId: row.userId,
      organizationId: row.organizationId,
      role: row.role,
      status: row.status,
      membershipVersion: row.membershipVersion,
      permissions: row.permissions,
      organizationRoleId: row.organizationRoleId,
      organization: row.organization,
    };
  }

  private toMembershipContext(
    membership: LoginMembershipCandidate,
  ): RefreshTokenMembershipContext {
    return {
      role: membership.role,
      organizationId: membership.organizationId,
      organizationName: membership.organization?.companyName ?? null,
      organizationLogoUrl: membership.organization?.logoUrl ?? null,
      permissions: membership.permissions,
      membershipId: membership.id,
      membershipVersion: membership.membershipVersion,
      organizationRoleId: membership.organizationRoleId,
    };
  }

  private async revokeStoredToken(id: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        revocationReason: reason,
      },
    });
  }

  private isOrgBoundEnforced(): boolean {
    return this.config.get<boolean>('iam.enableOrgBoundRefreshSessions', true);
  }

  private isLegacyGraceEnabled(): boolean {
    return this.config.get<boolean>('iam.enableLegacyUnscopedRefreshGrace', false);
  }

  private isPrivilegedMembership(
    membership: RefreshTokenMembershipContext | null,
  ): boolean {
    if (!membership?.role) return false;
    if (membership.role === MembershipRole.ORG_ADMIN) return true;
    const perms = membership.permissions as
      | Record<string, { manage?: boolean }>
      | null
      | undefined;
    if (!perms) return false;
    return Object.values(perms).some((p) => !!p?.manage);
  }

  private signAccessToken(
    user: RefreshTokenUserContext,
    membership: RefreshTokenMembershipContext | null,
    sessionClaims?: AuthSessionClaims,
    platformPermissions: string[] = [],
    tokenFamily?: string | null,
  ): string {
    const securityVersion = sessionClaims?.securityVersion ?? user.securityVersion ?? 0;
    const claims = sessionClaims ?? buildPasswordOnlyClaims(securityVersion);
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      platformPermissions,
      membershipRole: membership?.role ?? null,
      organizationId: membership?.organizationId ?? null,
      organizationName: membership?.organizationName ?? null,
      sessionVersion: user.sessionVersion ?? 0,
      membershipVersion: membership?.membershipVersion ?? null,
      membershipId: membership?.membershipId ?? null,
      tokenFamily: tokenFamily ?? null,
      assuranceLevel: claims.assuranceLevel,
      authenticatedAt: claims.authenticatedAt,
      mfaAuthenticatedAt: claims.mfaAuthenticatedAt,
      authMethods: claims.authMethods,
      securityVersion: claims.securityVersion,
    };
    return jwt.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
  }

  private async assertOrganizationSessionIssuanceForMembership(
    membership: RefreshTokenMembershipContext | null,
  ): Promise<void> {
    if (!membership?.organizationId) return;
    await this.assertOrganizationSessionIssuanceForOrganizationId(membership.organizationId);
  }

  private async assertOrganizationSessionIssuanceForOrganizationId(
    organizationId: string | null | undefined,
  ): Promise<void> {
    return this.assertOrganizationSessionIssuanceForOrganizationIdWithClient(
      this.prisma,
      organizationId,
    );
  }

  private async assertOrganizationSessionIssuanceForOrganizationIdWithClient(
    client: Prisma.TransactionClient | PrismaService,
    organizationId: string | null | undefined,
  ): Promise<void> {
    if (!organizationId) return;
    const org = await client.organization.findUnique({
      where: { id: organizationId },
      select: { status: true },
    });
    assertOrganizationAllowsTenantSurface(org?.status, 'SESSION_ISSUANCE');
  }

  private async hashToken(rawToken: string): Promise<string> {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }
}
