import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivityAction, ActivityEntity, TwoFactorCredentialType } from '@prisma/client';
import { authenticator } from 'otplib';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { SecretEncryptionService } from '@shared/crypto/secret-encryption.service';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  verifyRecoveryCode,
} from './two-factor-crypto.util';

authenticator.options = { window: 1 };

export type TotpSetupResult = {
  otpauthUrl: string;
  secretPreview: string;
};

export type TotpVerifyResult = {
  enabled: true;
  recoveryCodes: string[];
};

@Injectable()
export class AccountTwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: SecretEncryptionService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  isAvailable(): boolean {
    return this.encryption.isConfigured();
  }

  async isEnabled(userId: string): Promise<boolean> {
    const credential = await this.prisma.userTwoFactorCredential.findUnique({
      where: {
        userId_type: {
          userId,
          type: TwoFactorCredentialType.TOTP,
        },
      },
    });
    return Boolean(credential?.enabledAt);
  }

  async setupTotp(
    userId: string,
    email: string,
    auditCtx: { ip?: string; userAgent?: string; route?: string },
  ): Promise<TotpSetupResult> {
    this.assertAvailable();

    const existing = await this.prisma.userTwoFactorCredential.findUnique({
      where: {
        userId_type: {
          userId,
          type: TwoFactorCredentialType.TOTP,
        },
      },
    });
    if (existing?.enabledAt) {
      throw new ConflictException('TOTP 2FA is already enabled for this account');
    }

    const secret = authenticator.generateSecret();
    const secretEncrypted = this.encryption.encrypt(secret);
    const issuer = this.config.get<string>('security.totpIssuer', 'SynqDrive');

    await this.prisma.userTwoFactorCredential.upsert({
      where: {
        userId_type: {
          userId,
          type: TwoFactorCredentialType.TOTP,
        },
      },
      create: {
        userId,
        type: TwoFactorCredentialType.TOTP,
        secretEncrypted,
      },
      update: {
        secretEncrypted,
        enabledAt: null,
        confirmedAt: null,
        lastUsedAt: null,
      },
    });

    void this.audit.record({
      actorUserId: userId,
      action: ActivityAction.REGISTER,
      entity: ActivityEntity.AUTH_EVENT,
      entityId: userId,
      description: '2FA TOTP setup started',
      route: auditCtx.route,
      ipAddress: auditCtx.ip,
      userAgent: auditCtx.userAgent,
      metaJson: { step: 'totp_setup_started' },
    });

    return {
      otpauthUrl: authenticator.keyuri(email, issuer, secret),
      secretPreview: secret.slice(-4),
    };
  }

  async verifyAndEnableTotp(
    userId: string,
    code: string,
    auditCtx: { ip?: string; userAgent?: string; route?: string },
  ): Promise<TotpVerifyResult> {
    this.assertAvailable();

    const credential = await this.getPendingCredential(userId);
    const secret = this.encryption.decrypt(credential.secretEncrypted);
    if (!this.verifyTotpCode(secret, code)) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    const now = new Date();
    const recoveryCodes = await this.prisma.$transaction(async (tx) => {
      await tx.userTwoFactorCredential.update({
        where: { id: credential.id },
        data: {
          enabledAt: now,
          confirmedAt: now,
          lastUsedAt: now,
        },
      });
      await tx.userRecoveryCode.deleteMany({ where: { userId } });
      return this.createRecoveryCodesTx(tx, userId);
    });

    void this.audit.record({
      actorUserId: userId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.AUTH_EVENT,
      entityId: userId,
      description: '2FA TOTP enabled',
      route: auditCtx.route,
      ipAddress: auditCtx.ip,
      userAgent: auditCtx.userAgent,
      level: 'WARN',
      metaJson: { step: 'totp_enabled' },
    });

    return { enabled: true, recoveryCodes };
  }

  async disableTotp(
    userId: string,
    input: { currentPassword?: string; totpCode?: string },
    auditCtx: { ip?: string; userAgent?: string; route?: string },
  ): Promise<{ disabled: true }> {
    const credential = await this.getEnabledCredential(userId);
    const hasPassword = Boolean(input.currentPassword?.trim());
    const hasTotp = Boolean(input.totpCode?.trim());
    if (!hasPassword && !hasTotp) {
      throw new BadRequestException('Provide currentPassword or totpCode to disable 2FA');
    }

    let authorized = false;

    if (hasPassword) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user?.passwordHash) {
        throw new BadRequestException('Password is not set for this account');
      }
      authorized = await bcrypt.compare(input.currentPassword!, user.passwordHash);
    }

    if (hasTotp) {
      const secret = this.encryption.decrypt(credential.secretEncrypted);
      const totpValid = this.verifyTotpCode(secret, input.totpCode!);
      authorized = authorized || totpValid;
      if (!totpValid) {
        throw new UnauthorizedException('Invalid TOTP code');
      }
    }

    if (!authorized) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.prisma.$transaction([
      this.prisma.userTwoFactorCredential.delete({ where: { id: credential.id } }),
      this.prisma.userRecoveryCode.deleteMany({ where: { userId } }),
    ]);

    void this.audit.warn({
      actorUserId: userId,
      action: ActivityAction.REVOKE,
      entity: ActivityEntity.AUTH_EVENT,
      entityId: userId,
      description: '2FA TOTP disabled',
      route: auditCtx.route,
      ipAddress: auditCtx.ip,
      userAgent: auditCtx.userAgent,
      metaJson: { step: 'totp_disabled' },
    });

    return { disabled: true };
  }

  async regenerateRecoveryCodes(
    userId: string,
    totpCode: string,
    auditCtx: { ip?: string; userAgent?: string; route?: string },
  ): Promise<{ recoveryCodes: string[] }> {
    const credential = await this.getEnabledCredential(userId);
    const secret = this.encryption.decrypt(credential.secretEncrypted);
    if (!this.verifyTotpCode(secret, totpCode)) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    let recoveryCodes: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.userRecoveryCode.deleteMany({ where: { userId } });
      recoveryCodes = await this.createRecoveryCodesTx(tx, userId);
    });

    void this.audit.warn({
      actorUserId: userId,
      action: ActivityAction.RESET,
      entity: ActivityEntity.AUTH_EVENT,
      entityId: userId,
      description: '2FA recovery codes regenerated',
      route: auditCtx.route,
      ipAddress: auditCtx.ip,
      userAgent: auditCtx.userAgent,
      metaJson: { step: 'recovery_codes_regenerated' },
    });

    return { recoveryCodes };
  }

  async verifyTotpForUser(userId: string, code: string): Promise<boolean> {
    const credential = await this.getEnabledCredential(userId);
    const secret = this.encryption.decrypt(credential.secretEncrypted);
    const valid = this.verifyTotpCode(secret, code);
    if (valid) {
      await this.prisma.userTwoFactorCredential.update({
        where: { id: credential.id },
        data: { lastUsedAt: new Date() },
      });
    }
    return valid;
  }

  async consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const rows = await this.prisma.userRecoveryCode.findMany({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    for (const row of rows) {
      const matches = await verifyRecoveryCode(code, row.codeHash);
      if (!matches) continue;

      await this.prisma.userRecoveryCode.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      return true;
    }

    return false;
  }

  private verifyTotpCode(secret: string, code: string): boolean {
    const normalized = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalized)) return false;
    return authenticator.verify({ token: normalized, secret });
  }

  private async getPendingCredential(userId: string) {
    const credential = await this.prisma.userTwoFactorCredential.findUnique({
      where: {
        userId_type: {
          userId,
          type: TwoFactorCredentialType.TOTP,
        },
      },
    });
    if (!credential) {
      throw new BadRequestException('TOTP setup has not been started');
    }
    if (credential.enabledAt) {
      throw new ConflictException('TOTP 2FA is already enabled');
    }
    return credential;
  }

  private async getEnabledCredential(userId: string) {
    const credential = await this.prisma.userTwoFactorCredential.findUnique({
      where: {
        userId_type: {
          userId,
          type: TwoFactorCredentialType.TOTP,
        },
      },
    });
    if (!credential?.enabledAt) {
      throw new BadRequestException('TOTP 2FA is not enabled');
    }
    return credential;
  }

  private async createRecoveryCodesTx(
    tx: Pick<PrismaService, 'userRecoveryCode'>,
    userId: string,
  ): Promise<string[]> {
    const count = this.config.get<number>('security.recoveryCodeCount', 10);
    const codes: string[] = [];
    for (let i = 0; i < count; i += 1) {
      codes.push(generateRecoveryCode());
    }

    await tx.userRecoveryCode.createMany({
      data: await Promise.all(
        codes.map(async (code) => ({
          userId,
          codeHash: await hashRecoveryCode(code),
        })),
      ),
    });

    return codes;
  }

  private assertAvailable() {
    if (!this.isAvailable()) {
      throw new ServiceUnavailableException(
        'TOTP 2FA is unavailable — configure TOTP_ENCRYPTION_KEY on the server',
      );
    }
  }
}
