import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { MfaFactorType } from '@prisma/client';
import { authenticator } from 'otplib';
import { PrismaService } from '@shared/database/prisma.service';
import * as bcrypt from 'bcrypt';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { decryptMfaSecret } from './iam-mfa-crypto.util';
import { MFA_ERROR } from './iam-mfa.policy';
import { IamMfaStepUpService } from './iam-mfa-step-up.service';
import { resolveAcceptedTotpStep } from './iam-mfa-totp-step.util';
import type { MfaChallengeResult } from './iam-mfa.types';
import { AuthMethod, type AuthSessionClaims } from '@shared/auth/auth-session-claims.types';

export type MfaSessionBinding = {
  tokenFamily: string;
  membershipId?: string | null;
  organizationId?: string | null;
};

@Injectable()
export class IamMfaChallengeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly stepUp: IamMfaStepUpService,
  ) {}

  async challengeWithTotp(input: {
    userId: string;
    code: string;
    existingClaims?: {
      authenticatedAt?: string;
      securityVersion?: number;
    };
    sessionBinding?: MfaSessionBinding;
    /** Pre-auth login MFA may reissue an intermediate token without session family binding. */
    allowUnboundReissue?: boolean;
    idempotencyKey?: string;
  }): Promise<MfaChallengeResult> {
    const factor = await this.prisma.userMfaFactor.findUnique({
      where: {
        userId_factorType: { userId: input.userId, factorType: MfaFactorType.TOTP },
      },
    });
    if (!factor?.enabledAt || !factor.encryptedSecret) {
      throw new BadRequestException({
        code: MFA_ERROR.NOT_ENROLLED,
        message: 'MFA is not enrolled',
      });
    }

    const secret = decryptMfaSecret(factor.encryptedSecret);
    const normalized = input.code.replace(/\s+/g, '').trim();
    if (!authenticator.check(normalized, secret)) {
      throw new UnauthorizedException({
        code: MFA_ERROR.INVALID_CODE,
        message: 'Invalid MFA code',
      });
    }

    const step = resolveAcceptedTotpStep(normalized, secret);

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.consumeTotpStepAtomic(factor.id, step);

    const membership = await this.loadAuthoritativeMembership(input.userId, input.sessionBinding);
    await this.assertSessionBindingActive(input.userId, input.sessionBinding);

    const claims = this.stepUp.buildClaimsAfterChallenge({
      existingAuthenticatedAt: input.existingClaims?.authenticatedAt,
      authMethods: ['pwd', 'totp'],
      securityVersion: input.existingClaims?.securityVersion ?? user.securityVersion,
    });

    const tokenFamily = input.sessionBinding?.tokenFamily ?? null;
    if (!tokenFamily && !input.allowUnboundReissue) {
      throw new UnauthorizedException('MFA session binding required');
    }

    const tokenResult = await this.refreshTokens.reissueAccessToken(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        sessionVersion: user.sessionVersion,
        securityVersion: user.securityVersion,
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
      claims,
      { tokenFamily },
    );

    const grant = await this.stepUp.createGrant({
      userId: input.userId,
      actionScope: 'GLOBAL',
      claims,
      idempotencyKey: input.idempotencyKey,
    });

    return {
      accessToken: tokenResult.accessToken,
      expiresIn: tokenResult.expiresIn,
      stepUpToken: grant.stepUpToken,
      stepUpExpiresAt: grant.expiresAt.toISOString(),
      assuranceLevel: claims.assuranceLevel,
      authMethods: claims.authMethods as AuthMethod[],
      mfaAuthenticatedAt: claims.mfaAuthenticatedAt!,
    };
  }

  async challengeWithRecoveryCode(input: {
    userId: string;
    recoveryCode: string;
    existingClaims?: {
      authenticatedAt?: string;
      securityVersion?: number;
    };
    sessionBinding?: MfaSessionBinding;
    allowUnboundReissue?: boolean;
    idempotencyKey?: string;
  }): Promise<MfaChallengeResult> {
    const codes = await this.prisma.userMfaRecoveryCode.findMany({
      where: { userId: input.userId, usedAt: null },
    });
    if (codes.length === 0) {
      throw new BadRequestException({
        code: MFA_ERROR.NOT_ENROLLED,
        message: 'No recovery codes available',
      });
    }

    const normalized = input.recoveryCode.trim().toUpperCase();
    let matchedId: string | null = null;
    for (const row of codes) {
      if (await bcrypt.compare(normalized, row.codeHash)) {
        matchedId = row.id;
        break;
      }
    }
    if (!matchedId) {
      throw new UnauthorizedException({
        code: MFA_ERROR.INVALID_CODE,
        message: 'Invalid recovery code',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.consumeRecoveryCodeAtomic(matchedId);

    const membership = await this.loadAuthoritativeMembership(input.userId, input.sessionBinding);
    await this.assertSessionBindingActive(input.userId, input.sessionBinding);

    const claims = this.stepUp.buildClaimsAfterChallenge({
      existingAuthenticatedAt: input.existingClaims?.authenticatedAt,
      authMethods: ['pwd', 'recovery'],
      securityVersion: input.existingClaims?.securityVersion ?? user.securityVersion,
    });

    const tokenFamily = input.sessionBinding?.tokenFamily ?? null;
    if (!tokenFamily && !input.allowUnboundReissue) {
      throw new UnauthorizedException('MFA session binding required');
    }

    const tokenResult = await this.refreshTokens.reissueAccessToken(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        sessionVersion: user.sessionVersion,
        securityVersion: user.securityVersion,
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
      claims,
      { tokenFamily },
    );

    const grant = await this.stepUp.createGrant({
      userId: input.userId,
      actionScope: 'GLOBAL',
      claims,
      idempotencyKey: input.idempotencyKey,
    });

    return {
      accessToken: tokenResult.accessToken,
      expiresIn: tokenResult.expiresIn,
      stepUpToken: grant.stepUpToken,
      stepUpExpiresAt: grant.expiresAt.toISOString(),
      assuranceLevel: claims.assuranceLevel,
      authMethods: claims.authMethods as AuthMethod[],
      mfaAuthenticatedAt: claims.mfaAuthenticatedAt!,
    };
  }

  /** Pre-auth MFA login: verify TOTP only (no access JWT reissue). */
  async verifyLoginMfaTotp(userId: string, code: string): Promise<{ claims: AuthSessionClaims }> {
    const factor = await this.prisma.userMfaFactor.findUnique({
      where: {
        userId_factorType: { userId, factorType: MfaFactorType.TOTP },
      },
    });
    if (!factor?.enabledAt || !factor.encryptedSecret) {
      throw new BadRequestException({
        code: MFA_ERROR.NOT_ENROLLED,
        message: 'MFA is not enrolled',
      });
    }

    const secret = decryptMfaSecret(factor.encryptedSecret);
    const normalized = code.replace(/\s+/g, '').trim();
    if (!authenticator.check(normalized, secret)) {
      throw new UnauthorizedException({
        code: MFA_ERROR.INVALID_CODE,
        message: 'Invalid MFA code',
      });
    }

    const step = resolveAcceptedTotpStep(normalized, secret);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is inactive');
    }

    await this.consumeTotpStepAtomic(factor.id, step);

    const claims = this.stepUp.buildClaimsAfterChallenge({
      authMethods: ['pwd', 'totp'],
      securityVersion: user.securityVersion,
    });

    return { claims };
  }

  /** Pre-auth MFA login: verify recovery code only (no access JWT reissue). */
  async verifyLoginMfaRecoveryCode(
    userId: string,
    recoveryCode: string,
  ): Promise<{ claims: AuthSessionClaims }> {
    const codes = await this.prisma.userMfaRecoveryCode.findMany({
      where: { userId, usedAt: null },
    });
    if (codes.length === 0) {
      throw new BadRequestException({
        code: MFA_ERROR.NOT_ENROLLED,
        message: 'No recovery codes available',
      });
    }

    const normalized = recoveryCode.trim().toUpperCase();
    let matchedId: string | null = null;
    for (const row of codes) {
      if (await bcrypt.compare(normalized, row.codeHash)) {
        matchedId = row.id;
        break;
      }
    }
    if (!matchedId) {
      throw new UnauthorizedException({
        code: MFA_ERROR.INVALID_CODE,
        message: 'Invalid recovery code',
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is inactive');
    }

    await this.consumeRecoveryCodeAtomic(matchedId);

    const claims = this.stepUp.buildClaimsAfterChallenge({
      authMethods: ['pwd', 'recovery'],
      securityVersion: user.securityVersion,
    });

    return { claims };
  }

  /** Conditional update: only one concurrent consumer wins per TOTP step. */
  private async consumeTotpStepAtomic(factorId: string, step: bigint): Promise<void> {
    const updated = await this.prisma.userMfaFactor.updateMany({
      where: {
        id: factorId,
        enabledAt: { not: null },
        OR: [{ lastTotpStep: null }, { lastTotpStep: { lt: step } }],
      },
      data: { lastTotpStep: step, lastUsedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new UnauthorizedException({
        code: MFA_ERROR.REPLAY,
        message: 'MFA code replay detected',
      });
    }
  }

  /** Conditional update: only one concurrent consumer marks a recovery code used. */
  private async consumeRecoveryCodeAtomic(codeId: string): Promise<void> {
    const updated = await this.prisma.userMfaRecoveryCode.updateMany({
      where: { id: codeId, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new UnauthorizedException({
        code: MFA_ERROR.REPLAY,
        message: 'MFA credential replay detected',
      });
    }
  }

  private async loadAuthoritativeMembership(
    userId: string,
    binding?: MfaSessionBinding,
  ) {
    if (!binding?.membershipId && !binding?.organizationId) {
      return null;
    }
    if (binding.membershipId) {
      return this.prisma.organizationMembership.findFirst({
        where: { id: binding.membershipId, userId, status: 'ACTIVE' },
        include: { organization: true },
      });
    }
    if (binding.organizationId) {
      return this.prisma.organizationMembership.findFirst({
        where: {
          userId,
          organizationId: binding.organizationId,
          status: 'ACTIVE',
        },
        include: { organization: true },
      });
    }
    return null;
  }

  private async assertSessionBindingActive(
    userId: string,
    binding?: MfaSessionBinding,
  ): Promise<void> {
    if (!binding?.tokenFamily) return;
    const active = await this.prisma.refreshToken.findFirst({
      where: {
        userId,
        family: binding.tokenFamily,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        replacedBy: null,
      },
      select: { id: true, membershipId: true, organizationId: true },
    });
    if (!active) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    if (
      binding.membershipId &&
      active.membershipId &&
      binding.membershipId !== active.membershipId
    ) {
      throw new UnauthorizedException('MFA session scope mismatch');
    }
    if (
      binding.organizationId &&
      active.organizationId &&
      binding.organizationId !== active.organizationId
    ) {
      throw new UnauthorizedException('MFA session scope mismatch');
    }
  }
}