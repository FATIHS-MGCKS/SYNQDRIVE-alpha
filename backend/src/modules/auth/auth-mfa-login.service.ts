import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionAssuranceLevel, UserPlatformRole } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '@shared/database/prisma.service';
import { RefreshTokenService } from './refresh-token.service';
import { IamMfaEnrollmentService } from '@modules/iam-mfa/iam-mfa-enrollment.service';
import { IamMfaChallengeService } from '@modules/iam-mfa/iam-mfa-challenge.service';
import { resolveIamMfaFeatureFlagsForPrincipal } from '@modules/iam-mfa/iam-mfa-feature-flags.resolver';
import { MFA_ERROR } from '@modules/iam-mfa/iam-mfa.policy';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';

const MFA_PENDING_TTL_SEC = 5 * 60;

export type MfaPendingLoginContext = {
  userId: string;
  sessionVersion: number;
  securityVersion: number;
  platformRole: UserPlatformRole;
};

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
    private readonly platformPermissions: PlatformPermissionService,
  ) {
    this.jwtSecret = this.config.get<string>('app.jwtSecret')!;
  }

  async evaluateMasterAdminLoginGate(user: {
    id: string;
    platformRole: string;
    sessionVersion: number;
    securityVersion: number;
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
      mfaPendingToken: this.signMfaPendingToken({
        userId: user.id,
        sessionVersion: user.sessionVersion,
        securityVersion: user.securityVersion,
        platformRole: user.platformRole as UserPlatformRole,
      }),
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
    const pending = this.verifyMfaPendingToken(input.mfaPendingToken);
    const user = await this.prisma.user.findUnique({
      where: { id: pending.userId },
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
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is inactive');
    }
    if (user.platformRole !== UserPlatformRole.MASTER_ADMIN) {
      throw new UnauthorizedException('Invalid MFA login context');
    }
    if (
      user.sessionVersion !== pending.sessionVersion ||
      user.securityVersion !== pending.securityVersion ||
      user.platformRole !== pending.platformRole
    ) {
      throw new UnauthorizedException('MFA login session is no longer valid');
    }

    const enrolled = await this.enrollment.isMfaEnrolled(user.id);
    if (!enrolled) {
      throw new UnauthorizedException({
        code: MFA_ERROR.ENROLLMENT_REQUIRED,
        message: 'MFA enrollment required before login',
      });
    }

    const { claims } = input.recoveryCode
      ? await this.challenge.verifyLoginMfaRecoveryCode(user.id, input.recoveryCode)
      : await this.challenge.verifyLoginMfaTotp(user.id, input.code ?? '');

    const tokens = await this.refreshTokens.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        sessionVersion: user.sessionVersion,
        securityVersion: user.securityVersion,
      },
      null,
      {
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
      },
      {
        assuranceLevel: SessionAssuranceLevel.MFA,
        sessionClaims: claims,
        expectedAuth: {
          sessionVersion: pending.sessionVersion,
          securityVersion: pending.securityVersion,
          platformRole: pending.platformRole,
        },
      },
    );

    const platformPermissionsList = await this.platformPermissions.resolveJwtPermissions(user.id);

    return {
      ...tokens,
      assuranceLevel: claims.assuranceLevel,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        platformPermissions: platformPermissionsList,
        membershipRole: null,
        organizationId: null,
        organizationName: null,
        permissions: null,
      },
    };
  }

  signMfaPendingToken(ctx: MfaPendingLoginContext): string {
    return jwt.sign(
      {
        sub: ctx.userId,
        purpose: 'mfa_login',
        sessionVersion: ctx.sessionVersion,
        securityVersion: ctx.securityVersion,
        platformRole: ctx.platformRole,
      },
      this.jwtSecret,
      { expiresIn: MFA_PENDING_TTL_SEC },
    );
  }

  verifyMfaPendingToken(token: string): MfaPendingLoginContext {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as jwt.JwtPayload;
      if (decoded.purpose !== 'mfa_login' || typeof decoded.sub !== 'string') {
        throw new Error('invalid purpose');
      }
      const sessionVersion = Number(decoded.sessionVersion ?? NaN);
      const securityVersion = Number(decoded.securityVersion ?? NaN);
      const platformRole = decoded.platformRole as UserPlatformRole;
      if (
        !Number.isFinite(sessionVersion) ||
        !Number.isFinite(securityVersion) ||
        !platformRole
      ) {
        throw new Error('missing bound context');
      }
      return {
        userId: decoded.sub,
        sessionVersion,
        securityVersion,
        platformRole,
      };
    } catch {
      throw new UnauthorizedException('MFA login session expired or invalid');
    }
  }
}