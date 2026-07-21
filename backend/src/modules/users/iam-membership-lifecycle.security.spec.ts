import { BadRequestException } from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { IamMembershipLifecycleService } from './iam-membership-lifecycle.service';
import { IamAuditService } from './iam-audit.service';
import { IamMembershipLifecycleNotificationService } from './iam-membership-lifecycle-notification.service';
import { PrismaService } from '@shared/database/prisma.service';
import { LAST_ORG_ADMIN_MESSAGE } from '@shared/auth/permission.constants';
import {
  canJoinMembershipStatus,
  canReactivateMembershipStatus,
  diffMembershipPermissions,
} from './iam-membership-lifecycle.policy';

describe('IamMembershipLifecycleService', () => {
  const orgId = 'org-a';
  const userId = 'user-1';
  const membershipId = 'mem-1';

  const baseMembership = {
    id: membershipId,
    userId,
    organizationId: orgId,
    role: MembershipRole.WORKER,
    organizationRoleId: null,
    roleLabel: null,
    stationScope: 'ALL',
    stationIds: null,
    permissions: { bookings: { read: true, write: false } },
    fieldAgentAccess: false,
    status: MembershipStatus.ACTIVE,
    membershipVersion: 2,
    department: null,
    position: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let prisma: {
    organizationMembership: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    organizationUserInvite: { updateMany: jest.Mock };
    orgTaskAutomationRuleOverride: { updateMany: jest.Mock; count: jest.Mock };
    orgTask: { count: jest.Mock };
    iamAuditOutbox: { findUnique: jest.Mock };
    $transaction: jest.Mock;
    activityLog: { create: jest.Mock };
  };
  let iamAudit: {
    enqueueInTransaction: jest.Mock;
    processOutboxIds: jest.Mock;
  };
  let notifications: { notifyAfterCommit: jest.Mock };
  let service: IamMembershipLifecycleService;

  beforeEach(() => {
    prisma = {
      organizationMembership: {
        findFirst: jest.fn().mockResolvedValue(baseMembership),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          ...baseMembership,
          ...data,
          id: membershipId,
        })),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          ...baseMembership,
          ...data,
          membershipVersion:
            typeof data.membershipVersion === 'object'
              ? baseMembership.membershipVersion + 1
              : data.membershipVersion ?? baseMembership.membershipVersion,
        })),
        count: jest.fn().mockResolvedValue(1),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: userId, email: 'user@test.de' }),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
      organizationUserInvite: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      orgTaskAutomationRuleOverride: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        count: jest.fn().mockResolvedValue(0),
      },
      orgTask: { count: jest.fn().mockResolvedValue(0) },
      iamAuditOutbox: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
      activityLog: { create: jest.fn().mockResolvedValue({}) },
    };
    iamAudit = {
      enqueueInTransaction: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      processOutboxIds: jest.fn().mockResolvedValue(undefined),
    };
    notifications = { notifyAfterCommit: jest.fn().mockResolvedValue(undefined) };
    service = new IamMembershipLifecycleService(
      prisma as unknown as PrismaService,
      iamAudit as unknown as IamAuditService,
      notifications as unknown as IamMembershipLifecycleNotificationService,
    );
  });

  it('joiner creates membership with audit outbox atomically', async () => {
    prisma.organizationMembership.findUnique.mockResolvedValue(null);

    const result = await service.join({
      organizationId: orgId,
      userId,
      idempotencyKey: 'join-1',
      role: MembershipRole.WORKER,
      source: 'provisioning',
    });

    expect(result.idempotent).toBe(false);
    expect(prisma.organizationMembership.create).toHaveBeenCalled();
    expect(iamAudit.enqueueInTransaction).toHaveBeenCalled();
    expect(iamAudit.processOutboxIds).toHaveBeenCalled();
    expect(notifications.notifyAfterCommit).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'joined' }),
    );
  });

  it('mover preview reports permission gain and loss', async () => {
    const preview = await service.previewMove(orgId, userId, {
      role: MembershipRole.SUB_ADMIN,
      permissions: { bookings: { read: true, write: true, manage: true } },
    });

    expect(preview.permissionChanges.gained.length).toBeGreaterThan(0);
    expect(preview.sessionInvalidationRequired).toBe(true);
  });

  it('mover applies role change and revokes sessions on permission loss', async () => {
    const result = await service.move({
      organizationId: orgId,
      userId,
      idempotencyKey: 'move-1',
      role: MembershipRole.SUB_ADMIN,
    });

    expect(result.sessionsRevoked).toBe(3);
    expect(iamAudit.enqueueInTransaction).toHaveBeenCalled();
  });

  it('scope reduction marks session invalidation required', () => {
    const changes = diffMembershipPermissions(
      { bookings: { read: true, write: true } },
      { bookings: { read: true, write: false } },
    );
    expect(changes.lost).toContain('bookings');
  });

  it('suspend revokes sessions and pending invites', async () => {
    const result = await service.suspend({
      organizationId: orgId,
      userId,
      idempotencyKey: 'suspend-1',
    });

    expect(result.status).toBe(MembershipStatus.SUSPENDED);
    expect(result.sessionsRevoked).toBe(3);
    expect(result.invitesRevoked).toBe(1);
  });

  it('remove clears overrides and reports ownership conflicts when forced', async () => {
    prisma.orgTask.count.mockResolvedValue(2);
    prisma.orgTaskAutomationRuleOverride.count.mockResolvedValue(1);

    const result = await service.remove({
      organizationId: orgId,
      userId,
      idempotencyKey: 'remove-1',
      force: true,
    });

    expect(result.status).toBe(MembershipStatus.REMOVED);
    expect(result.overridesCleared).toBe(2);
    expect(result.ownershipConflicts).toHaveLength(2);
    expect(prisma.user.findUnique).toHaveBeenCalled();
  });

  it('remove blocks when ownership conflicts exist without force', async () => {
    prisma.orgTask.count.mockResolvedValue(1);

    await expect(
      service.remove({
        organizationId: orgId,
        userId,
        idempotencyKey: 'remove-blocked',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reactivate requires explicit role assignment', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      ...baseMembership,
      status: MembershipStatus.REMOVED,
      membershipVersion: 4,
    });

    const result = await service.reactivate({
      organizationId: orgId,
      userId,
      idempotencyKey: 'reactivate-1',
      role: MembershipRole.WORKER,
      permissions: { bookings: { read: true, write: false } },
    });

    expect(result.status).toBe(MembershipStatus.ACTIVE);
    expect(prisma.organizationMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: MembershipRole.WORKER,
          status: MembershipStatus.ACTIVE,
        }),
      }),
    );
  });

  it('blocks removing last active org admin', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      ...baseMembership,
      role: MembershipRole.ORG_ADMIN,
    });
    prisma.organizationMembership.count.mockResolvedValue(0);

    await expect(
      service.remove({
        organizationId: orgId,
        userId,
        idempotencyKey: 'remove-admin',
      }),
    ).rejects.toThrow(LAST_ORG_ADMIN_MESSAGE);
  });

  it('join is idempotent for active membership', async () => {
    prisma.organizationMembership.findUnique.mockResolvedValue(baseMembership);
    prisma.iamAuditOutbox.findUnique.mockResolvedValue({ id: 'existing-outbox' });

    const result = await service.join({
      organizationId: orgId,
      userId,
      idempotencyKey: 'join-dup',
      role: MembershipRole.WORKER,
      source: 'invite',
    });

    expect(result.idempotent).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('enforces cross-tenant membership lookup', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(
      service.suspend({
        organizationId: 'org-b',
        userId,
        idempotencyKey: 'cross-tenant',
      }),
    ).rejects.toThrow('Membership not found');
  });

  it('policy allows reactivation only from leaver states', () => {
    expect(canReactivateMembershipStatus(MembershipStatus.REMOVED)).toBe(true);
    expect(canReactivateMembershipStatus(MembershipStatus.ACTIVE)).toBe(false);
    expect(canJoinMembershipStatus(MembershipStatus.REACTIVATION_REQUIRED)).toBe(true);
  });
});
