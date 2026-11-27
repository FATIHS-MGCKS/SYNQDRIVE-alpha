import { ConflictException, Injectable } from '@nestjs/common';
import { MembershipStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import * as crypto from 'crypto';
import {
  buildMfaClaims,
  AuthSessionClaims,
} from '@shared/auth/auth-session-claims.types';
import {
  MFA_ERROR,
  STEP_UP_TTL_MS,
  StepUpActionCode,
} from './iam-mfa.policy';
import { hashStepUpToken } from './iam-mfa-crypto.util';
import type {
  StepUpGrantBinding,
  StepUpGrantRequestCache,
  StepUpGrantValidationContext,
} from './iam-mfa-step-up-binding.types';

@Injectable()
export class IamMfaStepUpService {
  constructor(private readonly prisma: PrismaService) {}

  async createGrant(input: {
    userId: string;
    actionScope: StepUpActionCode | 'GLOBAL';
    claims: AuthSessionClaims;
    idempotencyKey?: string;
    binding: StepUpGrantBinding;
  }): Promise<{ stepUpToken: string; expiresAt: Date }> {
    if (!input.binding.tokenFamily) {
      throw new ConflictException({
        code: MFA_ERROR.STEP_UP_REQUIRED,
        message: 'Step-up grant requires bound session family',
      });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashStepUpToken(rawToken);
    const expiresAt = new Date(Date.now() + STEP_UP_TTL_MS);

    if (input.idempotencyKey) {
      const existing = await this.prisma.userMfaStepUpGrant.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing && existing.expiresAt > new Date() && !existing.consumedAt) {
        throw new ConflictException({
          code: MFA_ERROR.STEP_UP_IDEMPOTENCY_REPLAY,
          message:
            'An unconsumed step-up grant already exists for this idempotency key; reuse the original token',
          expiresAt: existing.expiresAt.toISOString(),
        });
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
        tokenFamily: input.binding.tokenFamily,
        organizationId: input.binding.organizationId,
        membershipId: input.binding.membershipId,
        sessionVersion: input.binding.sessionVersion,
        securityVersion: input.binding.securityVersion,
        membershipVersion: input.binding.membershipVersion,
      },
    });

    return { stepUpToken: rawToken, expiresAt };
  }

  async validateGrant(
    userId: string,
    rawToken: string,
    action: StepUpActionCode,
    context: StepUpGrantValidationContext,
    requestCache?: StepUpGrantRequestCache,
  ): Promise<boolean> {
    const tokenHash = hashStepUpToken(rawToken);
    const grant = await this.prisma.userMfaStepUpGrant.findFirst({
      where: {
        userId,
        tokenHash,
        expiresAt: { gt: new Date() },
        ...(requestCache?.consumedGrantId
          ? { id: requestCache.consumedGrantId }
          : { consumedAt: null }),
      },
    });
    if (!grant) return false;
    const alreadyConsumedThisRequest =
      Boolean(requestCache?.consumedGrantId) && grant.id === requestCache?.consumedGrantId;
    if (grant.consumedAt && !alreadyConsumedThisRequest) {
      return false;
    }
    if (!grant.actionScope || (grant.actionScope !== 'GLOBAL' && grant.actionScope !== action)) {
      return false;
    }

    if (!grant.tokenFamily) {
      return false;
    }

    if (grant.sessionVersion === null || grant.securityVersion === null) {
      return false;
    }

    const liveUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, sessionVersion: true, securityVersion: true },
    });
    if (!liveUser || liveUser.status !== UserStatus.ACTIVE) {
      return false;
    }
    if (grant.sessionVersion !== liveUser.sessionVersion) {
      return false;
    }
    if (grant.securityVersion !== liveUser.securityVersion) {
      return false;
    }
    if (context.sessionVersion !== liveUser.sessionVersion) {
      return false;
    }

    if (context.tokenFamily !== grant.tokenFamily) {
      return false;
    }

    const grantIsPlatformOnly =
      grant.organizationId === null && grant.membershipId === null;
    const contextIsPlatformOnly =
      (context.organizationId ?? null) === null && (context.membershipId ?? null) === null;

    if (grantIsPlatformOnly) {
      if (!contextIsPlatformOnly) {
        return false;
      }
    } else {
      if (grant.organizationId !== context.organizationId) {
        return false;
      }
      if (grant.membershipId !== context.membershipId) {
        return false;
      }
    }

    if (grant.membershipId) {
      if (grant.membershipVersion === null) {
        return false;
      }
      const membership = await this.prisma.organizationMembership.findUnique({
        where: { id: grant.membershipId },
        select: { membershipVersion: true, status: true },
      });
      if (!membership || membership.status !== MembershipStatus.ACTIVE) {
        return false;
      }
      if (grant.membershipVersion !== membership.membershipVersion) {
        return false;
      }
      if (
        context.membershipVersion === null ||
        context.membershipVersion === undefined
      ) {
        return false;
      }
      if (context.membershipVersion !== membership.membershipVersion) {
        return false;
      }
    }

    const activeRefresh = await this.prisma.refreshToken.findFirst({
      where: {
        userId,
        family: grant.tokenFamily,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        replacedBy: null,
      },
      select: {
        id: true,
        organizationId: true,
        membershipId: true,
        sessionVersion: true,
        membershipVersion: true,
      },
    });
    if (!activeRefresh) {
      return false;
    }
    if (activeRefresh.sessionVersion !== liveUser.sessionVersion) {
      return false;
    }
    if (grantIsPlatformOnly) {
      if (activeRefresh.organizationId !== null || activeRefresh.membershipId !== null) {
        return false;
      }
    } else {
      if (activeRefresh.organizationId !== grant.organizationId) {
        return false;
      }
      if (activeRefresh.membershipId !== grant.membershipId) {
        return false;
      }
      if (grant.membershipId) {
        if (
          activeRefresh.membershipVersion === null ||
          activeRefresh.membershipVersion !== grant.membershipVersion
        ) {
          return false;
        }
        if (
          context.membershipVersion === null ||
          context.membershipVersion === undefined
        ) {
          return false;
        }
        if (context.membershipVersion !== activeRefresh.membershipVersion) {
          return false;
        }
      }
    }

    if (alreadyConsumedThisRequest) {
      return true;
    }

    const consumed = await this.prisma.userMfaStepUpGrant.updateMany({
      where: { id: grant.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 1) {
      if (requestCache) {
        requestCache.consumedGrantId = grant.id;
        requestCache.consumedTokenHash = tokenHash;
      }
      return true;
    }
    return false;
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