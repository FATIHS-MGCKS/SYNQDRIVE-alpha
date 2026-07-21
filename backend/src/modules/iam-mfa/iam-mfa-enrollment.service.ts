import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MfaFactorType, Prisma } from '@prisma/client';
import { authenticator } from 'otplib';
import { PrismaService } from '@shared/database/prisma.service';
import * as bcrypt from 'bcrypt';
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCode,
} from './iam-mfa-crypto.util';
import {
  MFA_ERROR,
  RECOVERY_CODE_COUNT,
} from './iam-mfa.policy';
import { resolveIamMfaEffectiveFeatureFlags } from './iam-mfa-feature-flags.resolver';
import type { TotpEnrollmentConfirmResult, TotpEnrollmentStartResult } from './iam-mfa.types';

const BCRYPT_ROUNDS = 10;
const ISSUER = 'SynqDrive';

@Injectable()
export class IamMfaEnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

  assertEnrollmentEnabled(organizationId: string | null) {
    const flags = resolveIamMfaEffectiveFeatureFlags(organizationId);
    if (!flags.mfaEnrollmentEnabled) {
      throw new BadRequestException({
        code: MFA_ERROR.FEATURE_DISABLED,
        message: 'MFA enrollment is not enabled for this organization',
      });
    }
  }

  async startTotpEnrollment(
    userId: string,
    email: string,
    organizationId: string | null,
  ): Promise<TotpEnrollmentStartResult> {
    this.assertEnrollmentEnabled(organizationId);

    const existing = await this.prisma.userMfaFactor.findUnique({
      where: { userId_factorType: { userId, factorType: MfaFactorType.TOTP } },
    });
    if (existing?.enabledAt) {
      throw new ConflictException({
        code: MFA_ERROR.ALREADY_ENROLLED,
        message: 'TOTP MFA is already enrolled',
      });
    }

    const secret = authenticator.generateSecret();
    const encryptedSecret = encryptMfaSecret(secret);
    const factor = await this.prisma.userMfaFactor.upsert({
      where: { userId_factorType: { userId, factorType: MfaFactorType.TOTP } },
      create: {
        userId,
        factorType: MfaFactorType.TOTP,
        label: 'Authenticator app',
        encryptedSecret,
      },
      update: {
        encryptedSecret,
        verifiedAt: null,
        enabledAt: null,
        lastUsedAt: null,
        lastTotpStep: null,
      },
    });

    const otpauthUrl = authenticator.keyuri(email, ISSUER, secret);
    return {
      factorId: factor.id,
      otpauthUrl,
      secretPreview: `${secret.slice(0, 4)}…${secret.slice(-4)}`,
    };
  }

  async confirmTotpEnrollment(
    userId: string,
    code: string,
    organizationId: string | null,
    idempotencyKey: string,
  ): Promise<TotpEnrollmentConfirmResult> {
    this.assertEnrollmentEnabled(organizationId);

    const factor = await this.prisma.userMfaFactor.findUnique({
      where: { userId_factorType: { userId, factorType: MfaFactorType.TOTP } },
    });
    if (!factor?.encryptedSecret) {
      throw new NotFoundException({
        code: MFA_ERROR.NOT_ENROLLED,
        message: 'No pending TOTP enrollment found',
      });
    }
    if (factor.enabledAt) {
      throw new ConflictException({
        code: MFA_ERROR.ALREADY_ENROLLED,
        message: 'TOTP MFA is already enrolled',
      });
    }

    const secret = decryptMfaSecret(factor.encryptedSecret);
    if (!authenticator.check(code.trim(), secret)) {
      throw new BadRequestException({
        code: MFA_ERROR.INVALID_CODE,
        message: 'Invalid verification code',
      });
    }

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      generateRecoveryCode(),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.userMfaFactor.update({
        where: { id: factor.id },
        data: {
          verifiedAt: new Date(),
          enabledAt: new Date(),
        },
      });
      await tx.userMfaRecoveryCode.deleteMany({ where: { userId } });
      for (const plain of recoveryCodes) {
        const codeHash = await bcrypt.hash(plain, BCRYPT_ROUNDS);
        await tx.userMfaRecoveryCode.create({
          data: { userId, codeHash },
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: { securityVersion: { increment: 1 } },
      });
    });

    void idempotencyKey;
    return { enrolled: true, recoveryCodes };
  }

  async isMfaEnrolled(userId: string): Promise<boolean> {
    const factor = await this.prisma.userMfaFactor.findFirst({
      where: { userId, enabledAt: { not: null } },
    });
    return Boolean(factor);
  }

  async countUnusedRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.userMfaRecoveryCode.count({
      where: { userId, usedAt: null },
    });
  }
}
