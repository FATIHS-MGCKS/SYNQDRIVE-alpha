/**
 * Secure password self-service reset (Prompt 6/22).
 */
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PasswordResetPurpose, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PasswordResetService } from './password-reset.service';
import { PasswordResetRateLimitService } from './password-reset-rate-limit.service';
import { IamSessionPolicyService } from './iam-session-policy.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PasswordPolicyService } from '@shared/auth/password-policy.service';
import { TransactionalMailService } from '@modules/users/transactional-mail.service';
import { UserAccessAuditService } from '@modules/users/user-access-audit.service';
import {
  generatePasswordResetToken,
  passwordResetTokenLookupKey,
} from './utils/password-reset-token.util';
import { PASSWORD_RESET_REQUEST_NEUTRAL } from './password-reset.constants';

describe('PasswordResetService (Prompt 6)', () => {
  const userId = 'user-1';
  const orgId = 'org-a';
  const email = 'user@example.com';

  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    organizationMembership: { findFirst: jest.Mock };
    passwordResetToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let rateLimit: { assertWithinLimit: jest.Mock };
  let mail: { sendPasswordReset: jest.Mock; sendPasswordResetCompleted: jest.Mock };
  let sessionPolicy: {
    enqueueInTransaction: jest.Mock;
    processIntents: jest.Mock;
  };
  let userAudit: { record: jest.Mock };
  let service: PasswordResetService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      organizationMembership: { findFirst: jest.fn() },
      passwordResetToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    rateLimit = { assertWithinLimit: jest.fn().mockResolvedValue(undefined) };
    mail = {
      sendPasswordReset: jest.fn().mockResolvedValue({ sent: false, fallback: true }),
      sendPasswordResetCompleted: jest.fn().mockResolvedValue({ sent: false, fallback: true }),
    };
    sessionPolicy = {
      enqueueInTransaction: jest.fn().mockResolvedValue({ intentIds: ['intent-1'], scopes: [] }),
      processIntents: jest.fn().mockResolvedValue([]),
    };
    userAudit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new PasswordResetService(
      prisma as unknown as PrismaService,
      new PasswordPolicyService(),
      rateLimit as unknown as PasswordResetRateLimitService,
      mail as unknown as TransactionalMailService,
      sessionPolicy as unknown as IamSessionPolicyService,
      userAudit as unknown as UserAccessAuditService,
    );
  });

  it('admin reset returns neutral status without token or URL', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      user: { id: userId, email, status: UserStatus.ACTIVE },
    });

    const result = await service.requestAdminReset({
      organizationId: orgId,
      userId,
      actorUserId: 'admin-1',
      reason: 'locked out',
      context: { ipAddress: '127.0.0.1' },
    });

    expect(result).toEqual(PASSWORD_RESET_REQUEST_NEUTRAL);
    expect(prisma.passwordResetToken.create).toHaveBeenCalled();
    expect(mail.sendPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({ to: email, purpose: PasswordResetPurpose.ADMIN_INITIATED }),
    );
    const mailArg = mail.sendPasswordReset.mock.calls[0][0];
    expect(result).not.toHaveProperty('token');
    expect(JSON.stringify(result)).not.toMatch(/resetUrl|token/i);
    expect(userAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        actorUserId: 'admin-1',
        metadata: { reason: 'locked out' },
      }),
    );
    expect(mailArg.resetUrl).toContain('token=');
  });

  it('self-service unknown email returns same neutral response', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const known = await service.requestSelfServiceReset({
      email: 'missing@example.com',
      context: { ipAddress: '1.2.3.4' },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email,
      status: UserStatus.ACTIVE,
    });
    const existing = await service.requestSelfServiceReset({
      email,
      context: { ipAddress: '1.2.3.4' },
    });

    expect(known).toEqual(PASSWORD_RESET_REQUEST_NEUTRAL);
    expect(existing).toEqual(PASSWORD_RESET_REQUEST_NEUTRAL);
    expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
  });

  it('second reset revokes prior pending tokens', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      user: { id: userId, email, status: UserStatus.ACTIVE },
    });

    await service.requestAdminReset({
      organizationId: orgId,
      userId,
      actorUserId: 'admin-1',
    });
    await service.requestAdminReset({
      organizationId: orgId,
      userId,
      actorUserId: 'admin-1',
    });

    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledTimes(2);
  });

  it('confirm reset sets password, marks token used, revokes sessions', async () => {
    const { plain, hash } = generatePasswordResetToken();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'prt-1',
      userId,
      tokenHash: hash,
      purpose: PasswordResetPurpose.SELF_SERVICE,
      organizationId: null,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      revokedAt: null,
      user: { id: userId, email, status: UserStatus.ACTIVE },
    });
    prisma.passwordResetToken.update.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({});

    const result = await service.confirmReset({
      token: plain,
      newPassword: 'newpassword123',
      confirmPassword: 'newpassword123',
    });

    expect(result.message).toMatch(/reset successfully/i);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mustChangePassword: false,
          passwordHash: expect.any(String),
        }),
      }),
    );
    expect(sessionPolicy.processIntents).toHaveBeenCalledWith(['intent-1']);
    expect(mail.sendPasswordResetCompleted).toHaveBeenCalled();
  });

  it('rejects expired token', async () => {
    const { plain, hash } = generatePasswordResetToken();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'prt-1',
      userId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
      revokedAt: null,
      user: { status: UserStatus.ACTIVE },
    });

    await expect(
      service.confirmReset({
        token: plain,
        newPassword: 'newpassword123',
        confirmPassword: 'newpassword123',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects already used token', async () => {
    const { plain, hash } = generatePasswordResetToken();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'prt-1',
      userId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
      revokedAt: null,
      user: { status: UserStatus.ACTIVE },
    });

    await expect(
      service.confirmReset({
        token: plain,
        newPassword: 'newpassword123',
        confirmPassword: 'newpassword123',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('admin reset rejects cross-tenant membership', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(
      service.requestAdminReset({
        organizationId: 'foreign-org',
        userId,
        actorUserId: 'admin-1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('stores only token hash, not plaintext', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      user: { id: userId, email, status: UserStatus.ACTIVE },
    });

    await service.requestAdminReset({
      organizationId: orgId,
      userId,
      actorUserId: 'admin-1',
    });

    const createData = prisma.passwordResetToken.create.mock.calls[0][0].data;
    expect(createData.tokenHash).toBeDefined();
    expect(createData.tokenLookup).toMatch(/^[a-f0-9]{64}$/);
    expect(createData.tokenHash).not.toBe(createData.tokenLookup);
  });

  it('lookup key matches token without storing plaintext in DB create', async () => {
    const { plain, hash } = generatePasswordResetToken();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'prt-1',
      userId,
      tokenHash: hash,
      purpose: PasswordResetPurpose.SELF_SERVICE,
      organizationId: null,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      revokedAt: null,
      user: { id: userId, email, status: UserStatus.ACTIVE },
    });

    await service.confirmReset({
      token: plain,
      newPassword: 'anotherpass12',
      confirmPassword: 'anotherpass12',
    });

    expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { tokenLookup: passwordResetTokenLookupKey(plain) },
      include: { user: true },
    });
  });
});
