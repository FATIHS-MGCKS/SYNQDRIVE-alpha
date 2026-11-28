import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PasswordResetPurpose, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@shared/database/prisma.service';
import { PasswordPolicyService } from '@shared/auth/password-policy.service';
import { IamSessionPolicyService } from './iam-session-policy.service';
import { acquireCanonicalSecurityMutationLocks } from './iam-security-mutation-concurrency';
import { TransactionalMailService } from '@modules/users/transactional-mail.service';
import { UserAccessAuditService, UserAccessAuditAction } from '@modules/users/user-access-audit.service';
import {
  PASSWORD_RESET_REQUEST_NEUTRAL,
  PASSWORD_RESET_TTL_MINUTES,
} from './password-reset.constants';
import { PasswordResetRateLimitService } from './password-reset-rate-limit.service';
import {
  generatePasswordResetToken,
  passwordResetTokenLookupKey,
  verifyPasswordResetToken,
} from './utils/password-reset-token.util';

export interface PasswordResetRequestContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly rateLimit: PasswordResetRateLimitService,
    private readonly mail: TransactionalMailService,
    private readonly sessionPolicy: IamSessionPolicyService,
    private readonly userAudit: UserAccessAuditService,
  ) {}

  /** Org admin initiates reset — never returns token or URL. */
  async requestAdminReset(input: {
    organizationId: string;
    userId: string;
    actorUserId?: string;
    reason?: string;
    context?: PasswordResetRequestContext;
  }): Promise<typeof PASSWORD_RESET_REQUEST_NEUTRAL> {
    const ip = input.context?.ipAddress?.trim() || 'unknown';
    await this.rateLimit.assertWithinLimit('IP', ip, input.organizationId);
    await this.rateLimit.assertWithinLimit(
      'ORGANIZATION',
      input.organizationId,
      input.organizationId,
    );

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId: input.organizationId,
        userId: input.userId,
        status: { not: 'REMOVED' },
      },
      include: {
        user: { select: { id: true, email: true, status: true } },
      },
    });
    if (!membership?.user) {
      throw new NotFoundException('User not found in organization');
    }

    await this.rateLimit.assertWithinLimit(
      'EMAIL',
      membership.user.email.toLowerCase(),
      input.organizationId,
    );

    await this.issueResetToken({
      userId: membership.user.id,
      email: membership.user.email,
      purpose: PasswordResetPurpose.ADMIN_INITIATED,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      reason: input.reason,
    });

    void this.userAudit.record({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      auditAction: UserAccessAuditAction.USER_PASSWORD_RESET_REQUESTED,
      targetUserId: membership.user.id,
      description: `Admin-initiated password reset requested`,
      metadata: input.reason ? { reason: input.reason } : undefined,
      ipAddress: input.context?.ipAddress,
      userAgent: input.context?.userAgent,
    });

    return PASSWORD_RESET_REQUEST_NEUTRAL;
  }

  /**
   * Admin-initiated reset bound to a master provisioning securityOperationId.
   * Returns the persisted token id; never exposes plaintext to callers.
   */
  async requestAdminResetBoundToOperation(input: {
    organizationId: string;
    userId: string;
    actorUserId?: string;
    securityOperationId: string;
    reason?: string;
    context?: PasswordResetRequestContext;
  }): Promise<{ tokenId: string }> {
    const ip = input.context?.ipAddress?.trim() || 'unknown';
    await this.rateLimit.assertWithinLimit('IP', ip, input.organizationId);
    await this.rateLimit.assertWithinLimit(
      'ORGANIZATION',
      input.organizationId,
      input.organizationId,
    );

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId: input.organizationId,
        userId: input.userId,
        status: { not: 'REMOVED' },
      },
      include: {
        user: { select: { id: true, email: true, status: true, passwordHash: true } },
      },
    });
    if (!membership?.user) {
      throw new NotFoundException('User not found in organization');
    }
    if (membership.user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('User is not eligible for credential setup');
    }

    await this.rateLimit.assertWithinLimit(
      'EMAIL',
      membership.user.email.toLowerCase(),
      input.organizationId,
    );

    const existingOpToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: membership.user.id,
        securityOperationId: input.securityOperationId,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (existingOpToken) {
      return { tokenId: existingOpToken.id };
    }

    const issued = await this.issueResetToken({
      userId: membership.user.id,
      email: membership.user.email,
      purpose: PasswordResetPurpose.ADMIN_INITIATED,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      reason: input.reason,
      securityOperationId: input.securityOperationId,
    });

    void this.userAudit.record({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      auditAction: UserAccessAuditAction.USER_PASSWORD_RESET_REQUESTED,
      targetUserId: membership.user.id,
      description: 'Admin-initiated credential setup requested',
      metadata: {
        securityOperationId: input.securityOperationId,
        ...(input.reason ? { reason: input.reason } : {}),
      },
      ipAddress: input.context?.ipAddress,
      userAgent: input.context?.userAgent,
    });

    return { tokenId: issued.tokenId };
  }

  /** Public self-service — enumeration-safe neutral response. */
  async requestSelfServiceReset(input: {
    email: string;
    context?: PasswordResetRequestContext;
  }): Promise<typeof PASSWORD_RESET_REQUEST_NEUTRAL> {
    const normalizedEmail = input.email.toLowerCase().trim();
    const ip = input.context?.ipAddress?.trim() || 'unknown';

    await this.rateLimit.assertWithinLimit('IP', ip);
    await this.rateLimit.assertWithinLimit('EMAIL', normalizedEmail);

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, status: true },
    });

    if (user && user.status === UserStatus.ACTIVE) {
      await this.issueResetToken({
        userId: user.id,
        email: user.email,
        purpose: PasswordResetPurpose.SELF_SERVICE,
      });

      void this.userAudit.record({
        auditAction: UserAccessAuditAction.USER_PASSWORD_RESET_REQUESTED,
        targetUserId: user.id,
        description: 'Self-service password reset requested',
        ipAddress: input.context?.ipAddress,
        userAgent: input.context?.userAgent,
      });
    }

    return PASSWORD_RESET_REQUEST_NEUTRAL;
  }

  async confirmReset(input: {
    token: string;
    newPassword: string;
    confirmPassword: string;
    context?: PasswordResetRequestContext;
  }): Promise<{ message: string }> {
    if (input.newPassword !== input.confirmPassword) {
      throw new BadRequestException('newPassword and confirmPassword must match');
    }
    this.passwordPolicy.assertAcceptablePassword(input.newPassword);

    const lookup = passwordResetTokenLookupKey(input.token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenLookup: lookup },
      include: { user: true },
    });

    if (!record || record.revokedAt) {
      throw new UnauthorizedException('Invalid or expired password reset token');
    }
    if (record.usedAt) {
      throw new BadRequestException('Password reset token has already been used');
    }
    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired password reset token');
    }
    if (record.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    const valid = await verifyPasswordResetToken(input.token, record.tokenHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid or expired password reset token');
    }

    let intentIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      await acquireCanonicalSecurityMutationLocks(tx, {
        organizationIds: record.organizationId ? [record.organizationId] : [],
        userIds: [record.userId],
      });

      const freshRecord = await tx.passwordResetToken.findUnique({
        where: { id: record.id },
        include: { user: { select: { status: true, sessionVersion: true } } },
      });
      if (!freshRecord || freshRecord.revokedAt) {
        throw new UnauthorizedException('Invalid or expired password reset token');
      }
      if (freshRecord.usedAt) {
        throw new BadRequestException('Password reset token has already been used');
      }
      if (freshRecord.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid or expired password reset token');
      }
      if (freshRecord.user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Account is not active');
      }

      const hash = await bcrypt.hash(input.newPassword, 10);
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: hash,
          mustChangePassword: false,
        },
      });

      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });

      if (freshRecord.securityOperationId) {
        await tx.masterIdentityCredentialSetupIntent.updateMany({
          where: { securityOperationId: freshRecord.securityOperationId },
          data: { credentialEstablishedAt: new Date() },
        });
      }

      const enqueued = await this.sessionPolicy.enqueueInTransactionWithAuthoritativeInvalidation(tx, {
        eventType: 'PASSWORD_CHANGED',
        userId: record.userId,
        organizationId: record.organizationId,
        actorUserId: record.userId,
        mutationVersion: freshRecord.user.sessionVersion + 1,
        metadata: { source: 'password_reset_confirm', purpose: record.purpose },
      });
      intentIds = enqueued.intentIds;
    });

    if (intentIds.length > 0) {
      await this.sessionPolicy.processIntents(intentIds);
    }

    void this.userAudit.record({
      organizationId: record.organizationId ?? undefined,
      actorUserId: record.userId,
      auditAction: UserAccessAuditAction.USER_PASSWORD_RESET_COMPLETED,
      targetUserId: record.userId,
      description: 'Password reset completed (self-service)',
      level: 'WARN',
      ipAddress: input.context?.ipAddress,
      userAgent: input.context?.userAgent,
      metadata: { purpose: record.purpose },
    });

    await this.mail.sendPasswordResetCompleted({
      to: record.user.email,
    });

    return { message: 'Password has been reset successfully. Please sign in again.' };
  }

  private async issueResetToken(input: {
    userId: string;
    email: string;
    purpose: PasswordResetPurpose;
    organizationId?: string;
    actorUserId?: string;
    reason?: string;
    securityOperationId?: string;
  }): Promise<{ tokenId: string; plainToken: string }> {
    await this.revokePendingTokensForUser(input.userId, {
      purpose: input.purpose,
      securityOperationId: input.securityOperationId,
    });

    const { plain, hash } = generatePasswordResetToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

    const created = await this.prisma.passwordResetToken.create({
      data: {
        userId: input.userId,
        tokenHash: hash,
        tokenLookup: passwordResetTokenLookupKey(plain),
        purpose: input.purpose,
        organizationId: input.organizationId ?? null,
        actorUserId: input.actorUserId ?? null,
        reason: input.reason ?? null,
        securityOperationId: input.securityOperationId ?? null,
        expiresAt,
      },
    });

    const resetUrl = this.buildResetUrl(plain);
    await this.mail.sendPasswordReset({
      to: input.email,
      resetUrl,
      expiresAt,
      purpose: input.purpose,
    });

    // Never log plaintext token or full reset URL.
    this.logger.log(
      `Password reset email queued for user=${input.userId} purpose=${input.purpose}`,
    );
    return { tokenId: created.id, plainToken: plain };
  }

  private async revokePendingTokensForUser(
    userId: string,
    scope?: { purpose: PasswordResetPurpose; securityOperationId?: string },
  ): Promise<void> {
    if (scope?.securityOperationId) {
      await this.prisma.passwordResetToken.updateMany({
        where: {
          userId,
          securityOperationId: scope.securityOperationId,
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      return;
    }
  if (scope?.purpose === PasswordResetPurpose.ADMIN_INITIATED) {
      await this.prisma.passwordResetToken.updateMany({
        where: {
          userId,
          purpose: PasswordResetPurpose.ADMIN_INITIATED,
          securityOperationId: null,
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      return;
    }
    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId,
        purpose: PasswordResetPurpose.SELF_SERVICE,
        usedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  private buildResetUrl(token: string): string {
    const base =
      process.env.APP_URL?.trim() ||
      process.env.FRONTEND_URL?.trim() ||
      'https://app.synqdrive.eu';
    const url = new URL('/reset-password', base.replace(/\/$/, ''));
    url.searchParams.set('token', token);
    return url.toString();
  }
}
