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
import type { MfaChallengeResult } from './iam-mfa.types';
import { AuthMethod } from '@shared/auth/auth-session-claims.types';

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
    const valid = authenticator.check(normalized, secret);
    if (!valid) {
      throw new UnauthorizedException({
        code: MFA_ERROR.INVALID_CODE,
        message: 'Invalid MFA code',
      });
    }

    const step = BigInt(Math.floor(Date.now() / 1000 / 30));
    if (factor.lastTotpStep != null && factor.lastTotpStep === step) {
      throw new UnauthorizedException({
        code: MFA_ERROR.REPLAY,
        message: 'MFA code replay detected',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { organization: true },
          take: 1,
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.prisma.userMfaFactor.update({
      where: { id: factor.id },
      data: { lastTotpStep: step, lastUsedAt: new Date() },
    });

    const membership = user.memberships[0] ?? null;
    const claims = this.stepUp.buildClaimsAfterChallenge({
      existingAuthenticatedAt: input.existingClaims?.authenticatedAt,
      authMethods: ['pwd', 'totp'],
      securityVersion: input.existingClaims?.securityVersion ?? user.securityVersion,
    });

    const tokenResult = await this.refreshTokens.reissueAccessToken(
      user,
      membership
        ? {
            role: membership.role,
            organizationId: membership.organizationId,
            organizationName: membership.organization?.companyName ?? null,
            permissions: membership.permissions,
          }
        : null,
      claims,
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
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { organization: true },
          take: 1,
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.prisma.userMfaRecoveryCode.update({
      where: { id: matchedId },
      data: { usedAt: new Date() },
    });

    const membership = user.memberships[0] ?? null;
    const claims = this.stepUp.buildClaimsAfterChallenge({
      existingAuthenticatedAt: input.existingClaims?.authenticatedAt,
      authMethods: ['pwd', 'recovery'],
      securityVersion: input.existingClaims?.securityVersion ?? user.securityVersion,
    });

    const tokenResult = await this.refreshTokens.reissueAccessToken(
      user,
      membership
        ? {
            role: membership.role,
            organizationId: membership.organizationId,
            organizationName: membership.organization?.companyName ?? null,
            permissions: membership.permissions,
          }
        : null,
      claims,
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
}
