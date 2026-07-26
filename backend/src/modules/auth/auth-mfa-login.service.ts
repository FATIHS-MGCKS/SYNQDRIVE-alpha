import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserPlatformRole } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '@shared/database/prisma.service';
import { RefreshTokenService } from './refresh-token.service';
import { IamMfaEnrollmentService } from '@modules/iam-mfa/iam-mfa-enrollment.service';
import { IamMfaChallengeService } from '@modules/iam-mfa/iam-mfa-challenge.service';
import { resolveIamMfaFeatureFlagsForPrincipal } from '@modules/iam-mfa/iam-mfa-feature-flags.resolver';
import { MFA_ERROR } from '@modules/iam-mfa/iam-mfa.policy';

const MFA_PENDING_TTL_SEC = 5 * 60;

export type MasterAdminLoginMfaGateResult =
  | { kind: 'none' }
  | {
      kind: 'mfa_required';
      mfaPendingToken: string;
      enrollmentRequired: boolean;
    };

@Injectable()
export class AuthMfaLoginService {
  private readonly jwtSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly enrollment: IamMfaEnrollmentService,
    private readonly challenge: IamMfaChallengeService,
  ) {
    this.jwtSecret = this.config.get<string>('app.jwtSecret')!;
  }

  async evaluateMasterAdminLoginGate(user: {
    id: string;
    platformRole: string;
  }): Promise<MasterAdminLoginMfaGateResult> {
    if (user.platformRole !== UserPlatformRole.MASTER_ADMIN) {
      return { kind: 'none' };
    }

    const flags = resolveIamMfaFeatureFlagsForPrincipal({
      organizationId: null,
      platformRole: user.platformRole,
    });
    if (!flags.masterAdminMfaEnabled) {
      return { kind: 'none' };
    }

    const enrolled = await this.enrollment.isMfaEnrolled(user.id);
    if (!enrolled) {
      // Password login allowed so master admin can complete enrollment in-app.
      return { kind: 'none' };
    }

    return {
      kind: 'mfa_required',
      mfaPendingToken: this.signMfaPendingToken(user.id),
      enrollmentRequired: false,
    };
  }

  async completeLoginMfa(input: {
    mfaPendingToken: string;
    code?: string;
    recoveryCode?: string;
    userAgent?: string;
    ipAddress?: string;
  }) {
    const userId = this.verifyMfaPendingToken(input.mfaPendingToken);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { organization: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is inactive');
    }
    if (user.platformRole !== UserPlatformRole.MASTER_ADMIN) {
      throw new UnauthorizedException('Invalid MFA login context');
    }

    const enrolled = await this.enrollment.isMfaEnrolled(user.id);
    if (!enrolled) {
      throw new UnauthorizedException({
        code: MFA_ERROR.ENROLLMENT_REQUIRED,
        message: 'MFA enrollment required before login',
      });
    }

    const challengeResult = input.recoveryCode
      ? await this.challenge.challengeWithRecoveryCode({
          userId: user.id,
          recoveryCode: input.recoveryCode,
        })
      : await this.challenge.challengeWithTotp({
          userId: user.id,
          code: input.code ?? '',
        });

    const membership = user.memberships[0] ?? null;
    const tokens = await this.refreshTokens.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        sessionVersion: user.securityVersion,
      },
      membership
        ? {
            role: membership.role,
            organizationId: membership.organizationId,
            organizationName: membership.organization?.companyName ?? null,
            organizationLogoUrl: membership.organization?.logoUrl ?? null,
            permissions: membership.permissions,
            membershipId: membership.id,
            membershipVersion: membership.membershipVersion,
            organizationRoleId: membership.organizationRoleId,
          }
        : null,
      {
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
      },
    );

    return {
      ...tokens,
      accessToken: challengeResult.accessToken ?? tokens.accessToken,
      assuranceLevel: challengeResult.assuranceLevel,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        membershipRole: membership?.role ?? null,
        organizationId: membership?.organizationId ?? null,
        organizationName: membership?.organization?.companyName ?? null,
        permissions: membership?.permissions ?? null,
      },
    };
  }

  signMfaPendingToken(userId: string): string {
    return jwt.sign(
      { sub: userId, purpose: 'mfa_login' },
      this.jwtSecret,
      { expiresIn: MFA_PENDING_TTL_SEC },
    );
  }

  verifyMfaPendingToken(token: string): string {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as jwt.JwtPayload;
      if (decoded.purpose !== 'mfa_login' || typeof decoded.sub !== 'string') {
        throw new Error('invalid purpose');
      }
      return decoded.sub;
    } catch {
      throw new UnauthorizedException('MFA login session expired or invalid');
    }
  }
}
