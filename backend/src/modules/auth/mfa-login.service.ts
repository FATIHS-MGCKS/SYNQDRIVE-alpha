import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { AccountTwoFactorService } from '@modules/account/two-factor/account-two-factor.service';
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from '@modules/account/two-factor/two-factor-crypto.util';

export type MfaChallengeResult = {
  mfaRequired: true;
  mfaChallengeToken: string;
  expiresIn: number;
};

type LoginUserContext = {
  user: {
    id: string;
    email: string;
    name: string | null;
    platformRole: string;
    mustChangePassword: boolean;
    memberships: Array<{
      role: string;
      organizationId: string;
      permissions: unknown;
      organization: { companyName: string; logoUrl: string | null };
    }>;
  };
  membership: LoginUserContext['user']['memberships'][0] | null;
};

@Injectable()
export class MfaLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly twoFactor: AccountTwoFactorService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async createChallengeIfRequired(userId: string): Promise<MfaChallengeResult | null> {
    const enabled = await this.twoFactor.isEnabled(userId);
    if (!enabled) return null;

    const plainToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(plainToken);
    const ttlSeconds = this.config.get<number>('security.mfaChallengeTtlSeconds', 300);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.prisma.userMfaLoginChallenge.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return {
      mfaRequired: true,
      mfaChallengeToken: plainToken,
      expiresIn: ttlSeconds,
    };
  }

  async verifyChallengeAndIssueTokens(
    input: { mfaChallengeToken: string; totpCode?: string; recoveryCode?: string },
    context: { ip?: string; userAgent?: string; route?: string },
  ) {
    const hasTotp = Boolean(input.totpCode?.trim());
    const hasRecovery = Boolean(input.recoveryCode?.trim());
    if (hasTotp === hasRecovery) {
      throw new BadRequestException('Provide either totpCode or recoveryCode');
    }

    const tokenHash = hashOpaqueToken(input.mfaChallengeToken.trim());
    const challenge = await this.prisma.userMfaLoginChallenge.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            memberships: {
              where: { status: 'ACTIVE' },
              include: { organization: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!challenge || challenge.consumedAt) {
      throw new UnauthorizedException('Invalid or expired MFA challenge');
    }

    if (challenge.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired MFA challenge');
    }

    const maxAttempts = this.config.get<number>('security.mfaMaxAttempts', 5);
    if (challenge.attemptCount >= maxAttempts) {
      throw new UnauthorizedException('Too many MFA attempts — sign in again');
    }

    let verified = false;
    let usedRecoveryCode = false;

    if (hasTotp) {
      verified = await this.twoFactor.verifyTotpForUser(challenge.userId, input.totpCode!.trim());
    } else {
      verified = await this.twoFactor.consumeRecoveryCode(
        challenge.userId,
        input.recoveryCode!.trim(),
      );
      usedRecoveryCode = verified;
    }

    if (!verified) {
      await this.prisma.userMfaLoginChallenge.update({
        where: { id: challenge.id },
        data: { attemptCount: { increment: 1 } },
      });
      void this.audit.warn({
        actorUserId: challenge.userId,
        action: ActivityAction.AUTH_FAIL,
        entity: ActivityEntity.AUTH_EVENT,
        entityId: challenge.userId,
        description: 'Failed MFA attempt during login',
        route: context.route,
        ipAddress: context.ip,
        userAgent: context.userAgent,
        metaJson: {
          step: 'mfa_verify_failed',
          method: hasTotp ? 'totp' : 'recovery_code',
        },
      });
      throw new UnauthorizedException('Invalid MFA code');
    }

    await this.prisma.userMfaLoginChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    const user = challenge.user;
    const membership = user.memberships[0] ?? null;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: context.ip ?? null,
        lastLoginDevice: context.userAgent?.slice(0, 500) ?? null,
      },
    });

    const tokens = await this.refreshTokens.issueTokenPair(
      user,
      membership
        ? {
            role: membership.role,
            organizationId: membership.organizationId,
            organizationName: membership.organization?.companyName ?? null,
            organizationLogoUrl: membership.organization?.logoUrl ?? null,
            permissions: membership.permissions,
          }
        : null,
      {
        userAgent: context.userAgent,
        ipAddress: context.ip,
      },
    );

    void this.audit.record({
      actorUserId: user.id,
      actorOrganizationId: membership?.organizationId,
      action: ActivityAction.LOGIN,
      entity: ActivityEntity.AUTH_EVENT,
      entityId: user.id,
      description: `Login success with MFA (${usedRecoveryCode ? 'recovery code' : 'TOTP'})`,
      route: context.route,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      metaJson: {
        step: 'mfa_login_success',
        method: usedRecoveryCode ? 'recovery_code' : 'totp',
      },
    });

    if (usedRecoveryCode) {
      void this.audit.warn({
        actorUserId: user.id,
        action: ActivityAction.UPDATE,
        entity: ActivityEntity.AUTH_EVENT,
        entityId: user.id,
        description: 'Recovery code used for login',
        route: context.route,
        ipAddress: context.ip,
        userAgent: context.userAgent,
        metaJson: { step: 'recovery_code_used' },
      });
    }

    return {
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        membershipRole: membership?.role ?? null,
        organizationId: membership?.organizationId ?? null,
        organizationName: membership?.organization?.companyName ?? null,
        organizationLogoUrl: membership?.organization?.logoUrl ?? null,
        permissions:
          (membership?.permissions as Record<string, { read: boolean; write: boolean }>) ?? null,
      },
    };
  }
}
