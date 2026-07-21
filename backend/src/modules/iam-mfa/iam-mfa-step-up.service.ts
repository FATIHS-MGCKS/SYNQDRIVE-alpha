import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import * as crypto from 'crypto';
import {
  buildMfaClaims,
  AuthSessionClaims,
} from '@shared/auth/auth-session-claims.types';
import {
  STEP_UP_TTL_MS,
  StepUpActionCode,
} from './iam-mfa.policy';
import { hashStepUpToken } from './iam-mfa-crypto.util';

@Injectable()
export class IamMfaStepUpService {
  constructor(private readonly prisma: PrismaService) {}

  async createGrant(input: {
    userId: string;
    actionScope: StepUpActionCode | 'GLOBAL';
    claims: AuthSessionClaims;
    idempotencyKey?: string;
  }): Promise<{ stepUpToken: string; expiresAt: Date }> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashStepUpToken(rawToken);
    const expiresAt = new Date(Date.now() + STEP_UP_TTL_MS);

    if (input.idempotencyKey) {
      const existing = await this.prisma.userMfaStepUpGrant.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing && existing.expiresAt > new Date() && !existing.consumedAt) {
        return { stepUpToken: rawToken, expiresAt: existing.expiresAt };
      }
    }

    await this.prisma.userMfaStepUpGrant.create({
      data: {
        userId: input.userId,
        idempotencyKey: input.idempotencyKey ?? null,
        tokenHash,
        actionScope: input.actionScope,
        assuranceLevel: input.claims.assuranceLevel,
        authMethods: input.claims.authMethods,
        authenticatedAt: new Date(input.claims.authenticatedAt),
        mfaAuthenticatedAt: new Date(input.claims.mfaAuthenticatedAt ?? new Date()),
        expiresAt,
      },
    });

    return { stepUpToken: rawToken, expiresAt };
  }

  async validateGrant(
    userId: string,
    rawToken: string,
    action: StepUpActionCode,
  ): Promise<boolean> {
    const tokenHash = hashStepUpToken(rawToken);
    const grant = await this.prisma.userMfaStepUpGrant.findFirst({
      where: {
        userId,
        tokenHash,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!grant) return false;
    if (grant.actionScope !== 'GLOBAL' && grant.actionScope !== action) {
      return false;
    }
    await this.prisma.userMfaStepUpGrant.update({
      where: { id: grant.id },
      data: { consumedAt: new Date() },
    });
    return true;
  }

  buildClaimsAfterChallenge(input: {
    existingAuthenticatedAt?: string;
    authMethods: AuthSessionClaims['authMethods'];
    securityVersion: number;
  }): AuthSessionClaims {
    return buildMfaClaims({
      authenticatedAt: input.existingAuthenticatedAt,
      authMethods: input.authMethods,
      securityVersion: input.securityVersion,
    });
  }
}
