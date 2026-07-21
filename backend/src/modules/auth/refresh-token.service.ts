import { Injectable, Inject, forwardRef, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  IamSessionPolicyService,
} from './iam-session-policy.service';
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
}

export interface RefreshTokenUserContext {
  id: string;
  email: string;
  name?: string | null;
  platformRole: string;
  sessionVersion?: number;
}

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
  ) {
    this.jwtSecret = this.config.get<string>('app.jwtSecret')!;
    this.jwtExpiresIn = this.config.get<string>('app.jwtExpiresIn', '15m');
  }

  /** Issue a new access + refresh token pair after successful authentication. */
  async issueTokenPair(
    user: RefreshTokenUserContext,
    membership: RefreshTokenMembershipContext | null,
    context: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
    const accessToken = this.signAccessToken(user, membership);
    const refreshToken = await this.createRefreshToken(user, membership, context);
    return { accessToken, refreshToken, expiresIn: this.jwtExpiresIn };
  }

  async rotate(
    rawToken: string,
    context: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
    const tokenHash = await this.hashToken(rawToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            memberships: {
              where: { status: 'ACTIVE' },
              include: { organization: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt || stored.expiresAt < new Date()) {
      if (stored.replacedBy) {
        this.logger.warn(
          `Refresh token reuse detected for user ${stored.userId}, family ${stored.family}. Revoking entire family.`,
        );
        await this.sessionPolicy.recordAndExecute({
          eventType: 'REFRESH_TOKEN_REUSE_DETECTED',
          userId: stored.userId,
          tokenFamily: stored.family,
          refreshTokenId: stored.id,
          highRiskReuse: true,
        });
      }
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    const user = stored.user;
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is inactive');
    }

    const membership = user.memberships[0] ?? null;

    const newPair = await this.issueTokenPairWithFamily(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        sessionVersion: user.sessionVersion,
      },
      membership
        ? {
            role: membership.role,
            organizationId: membership.organizationId,
            organizationName: membership.organization?.companyName ?? null,
            permissions: membership.permissions,
            membershipId: membership.id,
            membershipVersion: membership.membershipVersion,
          }
        : null,
      stored.family,
      context,
    );

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: {
        revokedAt: new Date(),
        replacedBy: newPair.refreshTokenId,
      },
    });

    return {
      accessToken: newPair.accessToken,
      refreshToken: newPair.rawRefreshToken,
      expiresIn: this.jwtExpiresIn,
    };
  }

  async revoke(rawToken: string): Promise<void> {
    const tokenHash = await this.hashToken(rawToken);
    await this.prisma.refreshToken
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.revokeAllActiveForUser(userId);
  }

  async revokeAllActiveForUser(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async revokeForOrganizationMembership(
    userId: string,
    organizationId: string,
  ): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        organizationId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async revokeFamily(family: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async revokePrivilegedSessionsForUser(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        privilegedSession: true,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
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

  async revokeSessionById(userId: string, sessionId: string): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  async revokeOtherSessionsForUser(
    userId: string,
    keepSessionId?: string | null,
  ): Promise<{ revoked: number; keptSessionId: string | null }> {
    const tokens = await this.listSessionsForUser(userId);
    const now = new Date();
    const active = tokens.filter(
      (t) => !t.revokedAt && t.expiresAt > now && !t.replacedBy,
    );
    const keepId =
      keepSessionId && active.some((t) => t.id === keepSessionId)
        ? keepSessionId
        : this.resolveCurrentSessionId(tokens);

    if (!keepId) {
      return { revoked: 0, keptSessionId: null };
    }

    const result = await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        id: { not: keepId },
      },
      data: { revokedAt: new Date() },
    });

    return { revoked: result.count, keptSessionId: keepId };
  }

  private async createRefreshToken(
    user: RefreshTokenUserContext,
    membership: RefreshTokenMembershipContext | null,
    context: { userAgent?: string; ipAddress?: string },
  ): Promise<string> {
    const family = crypto.randomUUID();
    const result = await this.issueTokenPairWithFamily(
      user,
      membership,
      family,
      context,
    );
    return result.rawRefreshToken;
  }

  private async issueTokenPairWithFamily(
    user: RefreshTokenUserContext | null,
    membership: RefreshTokenMembershipContext | null,
    family: string,
    context: { userAgent?: string; ipAddress?: string },
    userIdOverride?: string,
  ): Promise<{ accessToken: string; rawRefreshToken: string; refreshTokenId: string }> {
    const userId = user?.id ?? userIdOverride!;
    const rawToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const tokenHash = await this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    const privilegedSession = this.isPrivilegedMembership(membership);

    const record = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        family,
        organizationId: membership?.organizationId ?? null,
        membershipId: membership?.membershipId ?? null,
        sessionVersion: user?.sessionVersion ?? null,
        membershipVersion: membership?.membershipVersion ?? null,
        privilegedSession,
        expiresAt,
        userAgent: context.userAgent ?? null,
        ipAddress: context.ipAddress ?? null,
      },
    });

    const accessToken = user ? this.signAccessToken(user, membership) : '';

    return { accessToken, rawRefreshToken: rawToken, refreshTokenId: record.id };
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
  ): string {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      membershipRole: membership?.role ?? null,
      organizationId: membership?.organizationId ?? null,
      organizationName: membership?.organizationName ?? null,
      sessionVersion: user.sessionVersion ?? 0,
      membershipVersion: membership?.membershipVersion ?? null,
      membershipId: membership?.membershipId ?? null,
    };
    return jwt.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
  }

  private async hashToken(rawToken: string): Promise<string> {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }
}
