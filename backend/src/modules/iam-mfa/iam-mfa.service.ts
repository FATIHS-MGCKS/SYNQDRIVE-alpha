import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import {
  buildPasswordOnlyClaims,
  sessionClaimsFromJwt,
} from '@shared/auth/auth-session-claims.types';
import { isPrivilegedAccount } from './iam-mfa.policy';
import { resolveIamMfaEffectiveFeatureFlags } from './iam-mfa-feature-flags.resolver';
import { IamMfaEnrollmentService } from './iam-mfa-enrollment.service';
import { IamMfaChallengeService } from './iam-mfa-challenge.service';
import { IamMfaResetService } from './iam-mfa-reset.service';
import type {
  AdminMfaResetInput,
  MfaChallengeResult,
  MfaResetResult,
  MfaStatusResult,
  TotpEnrollmentConfirmResult,
  TotpEnrollmentStartResult,
} from './iam-mfa.types';

@Injectable()
export class IamMfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly enrollment: IamMfaEnrollmentService,
    private readonly challengeService: IamMfaChallengeService,
    private readonly resetService: IamMfaResetService,
  ) {}

  async getStatus(input: {
    userId: string;
    email: string;
    platformRole?: string | null;
    membershipRole?: string | null;
    permissions?: unknown;
    organizationId?: string | null;
  }): Promise<MfaStatusResult> {
    const flags = resolveIamMfaEffectiveFeatureFlags(input.organizationId ?? null);
    const enrolled = await this.enrollment.isMfaEnrolled(input.userId);
    const factors = await this.prisma.userMfaFactor.findMany({
      where: { userId: input.userId, enabledAt: { not: null } },
      select: { factorType: true },
    });
    const recoveryCodesRemaining = await this.enrollment.countUnusedRecoveryCodes(
      input.userId,
    );
    const privilegedAccount = isPrivilegedAccount({
      platformRole: input.platformRole,
      membershipRole: input.membershipRole,
      permissions: input.permissions,
    });

    return {
      enrolled,
      factorTypes: factors.map((f) => f.factorType),
      recoveryCodesRemaining,
      privilegedAccount,
      enrollmentRequired:
        flags.mfaPrivilegedEnrollmentRequired && privilegedAccount && !enrolled,
      stepUpEnforced: flags.mfaStepUpEnforced,
    };
  }

  startTotpEnrollment(
    userId: string,
    email: string,
    organizationId: string | null,
  ): Promise<TotpEnrollmentStartResult> {
    return this.enrollment.startTotpEnrollment(userId, email, organizationId);
  }

  confirmTotpEnrollment(
    userId: string,
    code: string,
    organizationId: string | null,
    idempotencyKey: string,
  ): Promise<TotpEnrollmentConfirmResult> {
    return this.enrollment.confirmTotpEnrollment(
      userId,
      code,
      organizationId,
      idempotencyKey,
    );
  }

  async challenge(input: {
    userId: string;
    code?: string;
    recoveryCode?: string;
    accessToken?: string;
    idempotencyKey?: string;
  }): Promise<MfaChallengeResult> {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    const existingClaims = input.accessToken
      ? sessionClaimsFromJwt(
          this.refreshTokens.decodeAccessToken(input.accessToken) as Record<string, unknown>,
        )
      : buildPasswordOnlyClaims(user?.securityVersion ?? 0);

    if (input.recoveryCode) {
      return this.challengeService.challengeWithRecoveryCode({
        userId: input.userId,
        recoveryCode: input.recoveryCode,
        existingClaims: {
          authenticatedAt: existingClaims.authenticatedAt,
          securityVersion: existingClaims.securityVersion,
        },
        idempotencyKey: input.idempotencyKey,
      });
    }
    if (!input.code) {
      throw new BadRequestException('code or recoveryCode required');
    }
    return this.challengeService.challengeWithTotp({
      userId: input.userId,
      code: input.code,
      existingClaims: {
        authenticatedAt: existingClaims.authenticatedAt,
        securityVersion: existingClaims.securityVersion,
      },
      idempotencyKey: input.idempotencyKey,
    });
  }

  resetOwnMfa(input: {
    userId: string;
    organizationId: string | null;
    idempotencyKey: string;
  }): Promise<MfaResetResult> {
    return this.resetService.resetOwnMfa(input);
  }

  resetUserMfa(input: AdminMfaResetInput): Promise<MfaResetResult> {
    return this.resetService.resetMfaForUser(input);
  }

  async buildClaimsForLogin(userId: string): Promise<ReturnType<typeof buildPasswordOnlyClaims>> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return buildPasswordOnlyClaims(user?.securityVersion ?? 0);
  }
}
