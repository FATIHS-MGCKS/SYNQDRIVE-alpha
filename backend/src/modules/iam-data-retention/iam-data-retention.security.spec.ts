import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActivityAction, IamDataCategory } from '@prisma/client';
import { IamDataRetentionWorkerService } from './iam-data-retention-worker.service';
import { IamDsarExportService } from './iam-dsar-export.service';
import { IamLegalHoldService } from './iam-legal-hold.service';
import { IamUserDeletionService } from './iam-user-deletion.service';
import { pseudonymizeValue } from './iam-data-retention.policy';
import { UserAccessAuditAction } from '@modules/users/user-access-audit.service';

describe('IAM data retention (Prompt 20)', () => {
  const orgA = 'org-a';
  const orgB = 'org-b';
  const actorId = 'actor-1';
  const subjectUserId = 'user-subject';

  const retentionConfig = {
    enabled: true,
    dryRun: true,
    batchSize: 100,
    maxBatchesPerCategory: 5,
    maxRetries: 2,
    sessionGraceDays: 7,
    inviteDeliveryMetadataDays: 30,
    pseudonymizationSalt: 'test-salt',
  };

  function buildWorker(overrides: Record<string, unknown> = {}) {
    const prisma: Record<string, any> = {
      refreshToken: {
        findMany: jest.fn().mockResolvedValue([{ id: 'rt-1', userId: subjectUserId }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      inviteEmailOutbox: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      organizationUserInvite: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      activityLog: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      iamAuditOutbox: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      userMfaFactor: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userMfaRecoveryCode: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      iamRetentionPolicyOverride: { findMany: jest.fn().mockResolvedValue([]) },
      iamRetentionRunLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
      ...(overrides.prisma as object),
    };

    const legalHold = {
      isBlocked: jest.fn().mockResolvedValue(false),
      ...(overrides.legalHold as object),
    };

    const iamAudit = {
      enqueueInTransaction: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      processOutboxIds: jest.fn().mockResolvedValue(undefined),
      ...(overrides.iamAudit as object),
    };

    const metrics = {
      record: jest.fn(),
      snapshot: jest.fn().mockReturnValue({}),
      reset: jest.fn(),
    };

    const worker = new IamDataRetentionWorkerService(
      prisma as never,
      legalHold as never,
      iamAudit as never,
      metrics as never,
      retentionConfig as never,
    );

    return { worker, prisma, legalHold, iamAudit, metrics };
  }

  it('dry run does not delete expired sessions', async () => {
    const { worker, prisma } = buildWorker();
    const report = await worker.runOnce({
      dryRun: true,
      categories: [IamDataCategory.SESSION_REFRESH_TOKEN],
    });

    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    expect(report.dryRun).toBe(true);
    expect(report.phases.some((p) => p.category === IamDataCategory.SESSION_REFRESH_TOKEN)).toBe(
      true,
    );
  });

  it('legal hold blocks session deletion', async () => {
    const { worker, prisma, legalHold } = buildWorker({
      legalHold: { isBlocked: jest.fn().mockResolvedValue(true) },
    });

    const report = await worker.runOnce({
      dryRun: false,
      categories: [IamDataCategory.SESSION_REFRESH_TOKEN],
    });

    const phase = report.phases.find((p) => p.category === IamDataCategory.SESSION_REFRESH_TOKEN);
    expect(phase?.skipped).toBeGreaterThan(0);
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it('session retention deletes expired tokens when not on hold', async () => {
    const { worker, prisma } = buildWorker();

    await worker.runOnce({
      dryRun: false,
      categories: [IamDataCategory.SESSION_REFRESH_TOKEN],
    });

    expect(prisma.refreshToken.deleteMany).toHaveBeenCalled();
  });

  it('invite retention redacts revoked token hashes', async () => {
    const prisma = {
      refreshToken: { findMany: jest.fn().mockResolvedValue([]) },
      inviteEmailOutbox: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      organizationUserInvite: {
        findMany: jest.fn().mockResolvedValue([{ id: 'inv-1' }]),
        update: jest.fn().mockResolvedValue({}),
      },
      activityLog: { findMany: jest.fn().mockResolvedValue([]) },
      iamAuditOutbox: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      userMfaFactor: { deleteMany: jest.fn() },
      userMfaRecoveryCode: { deleteMany: jest.fn() },
      iamRetentionPolicyOverride: { findMany: jest.fn().mockResolvedValue([]) },
      iamRetentionRunLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const worker = new IamDataRetentionWorkerService(
      prisma as never,
      { isBlocked: jest.fn().mockResolvedValue(false) } as never,
      { enqueueInTransaction: jest.fn(), processOutboxIds: jest.fn() } as never,
      { record: jest.fn() } as never,
      retentionConfig as never,
    );

    await worker.runOnce({
      dryRun: false,
      categories: [IamDataCategory.INVITE],
    });

    expect(prisma.organizationUserInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: 'redacted',
          tokenLookup: 'redacted-inv-1',
        }),
      }),
    );
  });

  it('pseudonymizes IP addresses deterministically', () => {
    const a = pseudonymizeValue('203.0.113.10', 'salt');
    const b = pseudonymizeValue('203.0.113.10', 'salt');
    const c = pseudonymizeValue('203.0.113.10', 'other');

    expect(a).toMatch(/^psn_/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('DSAR export is tenant-scoped and auditable', async () => {
    const prisma = {
      iamDsarExportLog: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      organizationMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'mem-1',
          role: 'ORG_MEMBER',
          status: 'ACTIVE',
          roleLabel: null,
          permissions: {},
          stationScope: 'all',
          stationIds: null,
          organizationRole: null,
          membershipVersion: 1,
          createdAt: new Date(),
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: subjectUserId,
          email: 'user@example.com',
          name: 'User',
          firstName: null,
          lastName: null,
          phone: null,
          language: 'de',
          timezone: 'Europe/Berlin',
          status: 'ACTIVE',
          createdAt: new Date(),
          lastLoginAt: null,
        }),
      },
      refreshToken: { count: jest.fn().mockResolvedValue(1) },
      activityLog: { findMany: jest.fn().mockResolvedValue([]) },
      organizationUserInvite: { findMany: jest.fn().mockResolvedValue([]) },
      userMfaFactor: { findMany: jest.fn().mockResolvedValue([]) },
      userMfaRecoveryCode: { count: jest.fn().mockResolvedValue(0) },
      accessReviewItem: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          iamDsarExportLog: {
            create: jest.fn().mockResolvedValue({
              id: 'export-1',
              recordCount: 2,
              completedAt: new Date(),
            }),
          },
        }),
      ),
    };

    const iamAudit = {
      enqueueInTransaction: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      processOutboxIds: jest.fn().mockResolvedValue(undefined),
    };

    const service = new IamDsarExportService(prisma as never, iamAudit as never);

    const result = await service.exportUserData({
      organizationId: orgA,
      subjectUserId,
      requestedByUserId: actorId,
      idempotencyKey: 'dsar-key-1',
    });

    expect(result.organizationId).toBe(orgA);
    expect(result.data.organizationId).toBe(orgA);
    expect(iamAudit.enqueueInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: UserAccessAuditAction.IAM_DSAR_EXPORT_REQUESTED,
      }),
    );
  });

  it('DSAR export rejects cross-tenant idempotency replay', async () => {
    const prisma = {
      iamDsarExportLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'export-1',
          organizationId: orgB,
          completedAt: new Date(),
          createdAt: new Date(),
          exportFormat: 'json',
        }),
      },
    };

    const service = new IamDsarExportService(prisma as never, {} as never);

    await expect(
      service.exportUserData({
        organizationId: orgA,
        subjectUserId,
        requestedByUserId: actorId,
        idempotencyKey: 'shared-key',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('DSAR export requires membership in organization', async () => {
    const prisma = {
      iamDsarExportLog: { findUnique: jest.fn().mockResolvedValue(null) },
      organizationMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const service = new IamDsarExportService(prisma as never, {} as never);

    await expect(
      service.exportUserData({
        organizationId: orgA,
        subjectUserId,
        requestedByUserId: actorId,
        idempotencyKey: 'dsar-key-2',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('global deletion assessment distinguishes blockers', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: subjectUserId }) },
      organizationMembership: { count: jest.fn().mockResolvedValue(2) },
      customerDocument: { count: jest.fn().mockResolvedValue(1) },
    };

    const service = new IamUserDeletionService(
      prisma as never,
      { isBlocked: jest.fn().mockResolvedValue(false) } as never,
      {} as never,
    );

    const assessment = await service.assessGlobalDeletion(subjectUserId);

    expect(assessment.canHardDelete).toBe(false);
    expect(assessment.recommendedAction).toBe('PSEUDONYMIZE');
    expect(assessment.blockers).toEqual(
      expect.arrayContaining(['ACTIVE_MEMBERSHIPS', 'DOCUMENT_REFERENCES']),
    );
  });

  it('global deletion blocked under legal hold', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: subjectUserId }) },
      organizationMembership: { count: jest.fn().mockResolvedValue(0) },
      customerDocument: { count: jest.fn().mockResolvedValue(0) },
    };

    const service = new IamUserDeletionService(
      prisma as never,
      { isBlocked: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
    );

    const assessment = await service.assessGlobalDeletion(subjectUserId);
    expect(assessment.recommendedAction).toBe('BLOCKED');
    expect(assessment.blockers).toContain('LEGAL_HOLD');
  });

  it('retention run with actor audits completion', async () => {
    const { worker, iamAudit } = buildWorker();

    await worker.run({
      organizationId: orgA,
      actorUserId: actorId,
      dryRun: true,
      categories: [IamDataCategory.SESSION_REFRESH_TOKEN],
      trigger: 'api',
    });

    expect(iamAudit.enqueueInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: UserAccessAuditAction.IAM_RETENTION_RUN_COMPLETED,
        actorUserId: actorId,
      }),
    );
  });

  it('legal hold placement is audited', async () => {
    const prisma = {
      iamLegalHold: {
        create: jest.fn().mockResolvedValue({ id: 'hold-1' }),
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          iamLegalHold: {
            create: jest.fn().mockResolvedValue({ id: 'hold-1' }),
          },
        }),
      ),
    };

    const iamAudit = {
      enqueueInTransaction: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      processOutboxIds: jest.fn().mockResolvedValue(undefined),
    };

    const service = new IamLegalHoldService(prisma as never, iamAudit as never);

    await service.placeHold({
      organizationId: orgA,
      userId: subjectUserId,
      reason: 'Litigation hold',
      placedByUserId: actorId,
    });

    expect(iamAudit.enqueueInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: UserAccessAuditAction.IAM_LEGAL_HOLD_PLACED,
      }),
    );
  });

  it('login failure retention targets AUTH_FAIL rows', async () => {
    const prisma = {
      refreshToken: { findMany: jest.fn().mockResolvedValue([]) },
      inviteEmailOutbox: { findMany: jest.fn().mockResolvedValue([]) },
      organizationUserInvite: { findMany: jest.fn().mockResolvedValue([]) },
      activityLog: {
        findMany: jest.fn().mockResolvedValue([{ id: 'log-1', userId: subjectUserId }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      iamAuditOutbox: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      userMfaFactor: { deleteMany: jest.fn() },
      userMfaRecoveryCode: { deleteMany: jest.fn() },
      iamRetentionPolicyOverride: { findMany: jest.fn().mockResolvedValue([]) },
      iamRetentionRunLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const worker = new IamDataRetentionWorkerService(
      prisma as never,
      { isBlocked: jest.fn().mockResolvedValue(false) } as never,
      { enqueueInTransaction: jest.fn(), processOutboxIds: jest.fn() } as never,
      { record: jest.fn() } as never,
      retentionConfig as never,
    );

    await worker.runOnce({
      dryRun: false,
      categories: [IamDataCategory.LOGIN_FAILURE],
    });

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ action: ActivityAction.AUTH_FAIL }),
      }),
    );
    expect(prisma.activityLog.deleteMany).toHaveBeenCalled();
  });
});
