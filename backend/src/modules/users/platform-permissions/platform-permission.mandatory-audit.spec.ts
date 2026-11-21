import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ActivityEntity,
  PlatformPermissionKey,
  Prisma,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import {
  MasterAdminAuditAction,
  type MasterAdminAuditRecordInput,
} from '@modules/activity-log/master-admin-audit.contract';
import { PlatformPermissionService } from './platform-permission.service';

const baseAudit = (): MasterAdminAuditRecordInput => ({
  auditAction: MasterAdminAuditAction.PLATFORM_USER_UPDATED,
  actorUserId: 'actor-1',
  actorPlatformRole: 'MASTER_ADMIN',
  description: 'test audit',
  correlationId: 'corr-1',
  metadata: { domain: 'platform_permission', operation: 'GRANT_MASTER_BILLING' },
});

describe('PlatformPermissionService — mandatory audit (F2)', () => {
  const tx = {
    user: { findUnique: jest.fn() },
    userPlatformPermissionGrant: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    activityLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
  };

  const prisma = {
    $transaction: jest.fn(),
    user: { findUnique: jest.fn() },
    userPlatformPermissionGrant: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  let service: PlatformPermissionService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx.activityLog.create.mockReset();
    tx.activityLog.create.mockResolvedValue({ id: 'log-1' });
    prisma.$transaction.mockImplementation(async (fn: (inner: typeof tx) => Promise<unknown>) =>
      fn(tx),
    );
    service = new PlatformPermissionService(prisma as never);
  });

  it('grant + audit success persists activityLog in the same transaction', async () => {
    (tx.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.USER,
    });
    (tx.userPlatformPermissionGrant.findFirst as jest.Mock).mockResolvedValue(null);
    (tx.userPlatformPermissionGrant.create as jest.Mock).mockResolvedValue({ id: 'grant-1' });

    const buildAudit = jest.fn((result) => ({
      ...baseAudit(),
      entityId: 'target',
      metadata: { grantId: result.grantId, idempotent: result.idempotent },
    }));

    const result = await service.grantMasterBillingWithMandatoryAudit(
      'target',
      'actor-1',
      buildAudit,
    );

    expect(result).toEqual({ granted: true, idempotent: false, grantId: 'grant-1' });
    expect(buildAudit).toHaveBeenCalledWith(result);
    expect(tx.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: ActivityEntity.ADMIN_OPERATION,
          entityId: 'target',
        }),
      }),
    );
  });

  it('revoke + audit success', async () => {
    (tx.userPlatformPermissionGrant.findFirst as jest.Mock).mockResolvedValue({ id: 'grant-1' });
    (tx.userPlatformPermissionGrant.update as jest.Mock).mockResolvedValue({ id: 'grant-1' });

    const buildAudit = jest.fn((result) => ({
      ...baseAudit(),
      metadata: { operation: 'REVOKE_MASTER_BILLING', grantId: result.grantId },
    }));

    const result = await service.revokeMasterBillingWithMandatoryAudit(
      'target',
      'actor-1',
      buildAudit,
    );

    expect(result.revoked).toBe(true);
    expect(tx.activityLog.create).toHaveBeenCalled();
  });

  it('audit failure rolls back grant create', async () => {
    (tx.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.USER,
    });
    (tx.userPlatformPermissionGrant.findFirst as jest.Mock).mockResolvedValue(null);
    (tx.userPlatformPermissionGrant.create as jest.Mock).mockResolvedValue({ id: 'grant-1' });
    tx.activityLog.create.mockRejectedValue(new Error('audit persistence failed'));

    await expect(
      service.grantMasterBillingWithMandatoryAudit('target', 'actor-1', () => baseAudit()),
    ).rejects.toThrow('audit persistence failed');
  });

  it('audit failure rolls back revoke update', async () => {
    (tx.userPlatformPermissionGrant.findFirst as jest.Mock).mockResolvedValue({ id: 'grant-1' });
    (tx.userPlatformPermissionGrant.update as jest.Mock).mockResolvedValue({ id: 'grant-1' });
    tx.activityLog.create.mockRejectedValue(new Error('audit persistence failed'));

    await expect(
      service.revokeMasterBillingWithMandatoryAudit('target', 'actor-1', () => baseAudit()),
    ).rejects.toThrow('audit persistence failed');
  });

  it('idempotent grant still requires durable audit', async () => {
    (tx.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.USER,
    });
    (tx.userPlatformPermissionGrant.findFirst as jest.Mock).mockResolvedValue({ id: 'grant-existing' });

    const buildAudit = jest.fn((result) => ({
      ...baseAudit(),
      metadata: { idempotent: result.idempotent },
    }));

    const result = await service.grantMasterBillingWithMandatoryAudit(
      'target',
      'actor-1',
      buildAudit,
    );

    expect(result.idempotent).toBe(true);
    expect(tx.userPlatformPermissionGrant.create).not.toHaveBeenCalled();
    expect(tx.activityLog.create).toHaveBeenCalled();
    expect(buildAudit).toHaveBeenCalledWith(
      expect.objectContaining({ idempotent: true, grantId: 'grant-existing' }),
    );
  });

  it('P2002 race resolves to idempotent grant before audit', async () => {
    (tx.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.USER,
    });
    (tx.userPlatformPermissionGrant.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'grant-race' });
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '0',
    });
    (tx.userPlatformPermissionGrant.create as jest.Mock).mockRejectedValue(p2002);

    const result = await service.grantMasterBillingWithMandatoryAudit(
      'target',
      'actor-1',
      () => baseAudit(),
    );

    expect(result).toEqual({ granted: true, idempotent: true, grantId: 'grant-race' });
    expect(tx.activityLog.create).toHaveBeenCalled();
  });

  it('eligibility failure does not write audit', async () => {
    (tx.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      service.grantMasterBillingWithMandatoryAudit('missing', 'actor-1', () => baseAudit()),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejects MASTER_ADMIN grant targets before audit', async () => {
    (tx.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });

    await expect(
      service.grantMasterBillingWithMandatoryAudit('target', 'actor-1', () => baseAudit()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });
});