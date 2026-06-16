import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

const REFRESH_TOKEN_BYTES = 40;
const REFRESH_TOKEN_TTL_DAYS = 30;
const BCRYPT_ROUNDS = 10;

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.jwtSecret = this.config.get<string>('app.jwtSecret')!;
    this.jwtExpiresIn = this.config.get<string>('app.jwtExpiresIn', '15m');
  }

  /** Issue a new access + refresh token pair after successful authentication. */
  async issueTokenPair(
    user: { id: string; email: string; name?: string | null; platformRole: string },
    membership: { role?: string | null; organizationId?: string | null; organizationName?: string | null; organizationLogoUrl?: string | null; permissions?: any } | null,
    context: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
    const accessToken = this.signAccessToken(user, membership);
    const refreshToken = await this.createRefreshToken(user.id, context);
    return { accessToken, refreshToken, expiresIn: this.jwtExpiresIn };
  }

  /**
   * Rotate a refresh token:
   *  - Verify the token is valid and not expired/revoked.
   *  - Detect reuse: if the token was already replaced, revoke the entire family (token theft).
   *  - Issue a new access + refresh token pair.
   *  - Revoke the consumed token.
   */
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
      // Token already revoked or expired — if it had a replacement, this looks like reuse
      if (stored.replacedBy) {
        this.logger.warn(
          `Refresh token reuse detected for user ${stored.userId}, family ${stored.family}. Revoking entire family.`,
        );
        await this.revokeFamily(stored.family);
      }
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    const user = stored.user;
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is inactive');
    }

    const membership = user.memberships[0] ?? null;

    // Issue new pair
    const newPair = await this.issueTokenPairWithFamily(
      user,
      membership
        ? {
            role: membership.role,
            organizationId: membership.organizationId,
            organizationName: membership.organization?.companyName ?? null,
            permissions: membership.permissions,
          }
        : null,
      stored.family,
      context,
    );

    // Mark old token as revoked/replaced
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

  /** Revoke a single refresh token (logout from one device). */
  async revoke(rawToken: string): Promise<void> {
    const tokenHash = await this.hashToken(rawToken);
    await this.prisma.refreshToken
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  /** Revoke all refresh tokens for a user (logout from all devices). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** List refresh-token sessions for account self-service (metadata only). */
  async listSessionsForUser(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Heuristic for "current" session when no raw refresh token is supplied:
   * the newest active token (not revoked, not expired, not superseded by rotation).
   */
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

  /** Revoke a single session owned by the user. */
  async revokeSessionById(userId: string, sessionId: string): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  /**
   * Revoke all active sessions except `keepSessionId`.
   * When `keepSessionId` is omitted, keeps the newest active session so the
   * caller is not locked out if the current session cannot be determined
   * from the access token alone.
   */
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
    userId: string,
    context: { userAgent?: string; ipAddress?: string },
  ): Promise<string> {
    const family = crypto.randomUUID();
    const result = await this.issueTokenPairWithFamily(null, null, family, context, userId);
    return result.rawRefreshToken;
  }

  private async issueTokenPairWithFamily(
    user: any,
    membership: any,
    family: string,
    context: { userAgent?: string; ipAddress?: string },
    userIdOverride?: string,
  ): Promise<{ accessToken: string; rawRefreshToken: string; refreshTokenId: string }> {
    const userId = user?.id ?? userIdOverride!;
    const rawToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const tokenHash = await this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const record = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        family,
        expiresAt,
        userAgent: context.userAgent ?? null,
        ipAddress: context.ipAddress ?? null,
      },
    });

    const accessToken = user ? this.signAccessToken(user, membership) : '';

    return { accessToken, rawRefreshToken: rawToken, refreshTokenId: record.id };
  }

  private async revokeFamily(family: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private signAccessToken(
    user: { id: string; email: string; name?: string | null; platformRole: string },
    membership: { role?: string | null; organizationId?: string | null; organizationName?: string | null } | null,
  ): string {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      membershipRole: membership?.role ?? null,
      organizationId: membership?.organizationId ?? null,
      organizationName: membership?.organizationName ?? null,
    };
    return jwt.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiresIn as any });
  }

  private async hashToken(rawToken: string): Promise<string> {
    // Use SHA-256 for lookup hash (fast, deterministic) and bcrypt only at creation for storage
    // This way lookup is O(1) and brute-force resistance comes from token entropy (40 random bytes)
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }
}
