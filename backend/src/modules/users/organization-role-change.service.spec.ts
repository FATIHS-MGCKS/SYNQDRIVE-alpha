import { BadRequestException, ConflictException } from '@nestjs/common';
import { MembershipRole, OrganizationRoleAssignmentMode } from '@prisma/client';
import { OrganizationRoleChangeService, type ApplyRoleChangeResult } from './organization-role-change.service';
import { OrganizationRoleVersionService } from './organization-role-version.service';
import { IamSessionPolicyService } from '@modules/auth/iam-session-policy.service';
import { UserAccessAuditService } from './user-access-audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { buildRoleChangePreviewHash } from './policies/role-change-impact.policy';

describe('OrganizationRoleChangeService', () => {
  const orgId = 'org-a';
  const roleId = 'role-1';
  const actorId = 'admin-1';

  const baseRole = {
    id: roleId,
    organizationId: orgId,
    name: 'Desk',
    description: null,
    isSystemTemplate: false,
    membershipRole: MembershipRole.WORKER,
    permissions: { bookings: { read: true, write: false } },
    stationScopeDefault: null,
    defaultStationIds: [],
    fieldAgentAccessDefault: false,
  };

  let prisma: {
    organizationRole: { findFirst: jest.Mock; update: jest.Mock };
    organizationRoleVersion: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
    organizationRoleAssignment: { findMany: jest.Mock };
    organizationMembership: { findMany: jest.Mock; update: jest.Mock };
    refreshToken: { count: jest.Mock };
    organizationRoleChangeApplication: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let roleVersionService: OrganizationRoleVersionService;
  let sessionPolicy: IamSessionPolicyService;
  let userAudit: UserAccessAuditService;
  let service: OrganizationRoleChangeService;

  beforeEach(() => {
    prisma = {
      organizationRole: {
        findFirst: jest.fn().mockResolvedValue(baseRole),
        update: jest.fn(),
      },
      organizationRoleVersion: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ver-1', version: 1 }),
        findMany: jest.fn().mockResolvedValue([{ version: 1 }]),
        updateMany: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'ver-2', version: 2 }),
      },
      organizationRoleAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'assign-follow',
            assignmentMode: OrganizationRoleAssignmentMode.FOLLOW_LATEST_APPROVED_VERSION,
            assignedRoleVersionId: null,
            assignedRoleVersion: null,
            membership: {
              id: 'mem-1',
              userId: 'user-1',
              role: MembershipRole.WORKER,
              permissions: { bookings: { read: true, write: false } },
              stationIds: [],
              stationScope: null,
            },
          },
          {
            id: 'assign-pinned',
            assignmentMode: OrganizationRoleAssignmentMode.PINNED_VERSION,
            assignedRoleVersionId: 'ver-1',
            assignedRoleVersion: { id: 'ver-1', version: 1 },
            membership: {
              id: 'mem-2',
              userId: 'user-2',
              role: MembershipRole.WORKER,
              permissions: { bookings: { read: true, write: false } },
              stationIds: ['s-1'],
              stationScope: null,
            },
          },
        ]),
      },
      organizationMembership: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'mem-admin',
            userId: 'admin-1',
            role: MembershipRole.ORG_ADMIN,
            permissions: null,
          },
        ]),
        update: jest.fn().mockImplementation(async ({ where }) => ({
          id: where.id,
          userId: where.id === 'mem-1' ? 'user-1' : 'user-2',
          membershipVersion: 2,
        })),
      },
      refreshToken: { count: jest.fn().mockResolvedValue(3) },
      organizationRoleChangeApplication: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
    };

    roleVersionService = {
      assertSystemRoleSafe: jest.fn(),
    } as unknown as OrganizationRoleVersionService;

    sessionPolicy = {
      enqueueInTransaction: jest.fn().mockResolvedValue({ intentIds: ['intent-1'] }),
      processIntents: jest.fn().mockResolvedValue([]),
    } as unknown as IamSessionPolicyService;

    userAudit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as UserAccessAuditService;

    service = new OrganizationRoleChangeService(
      prisma as unknown as PrismaService,
      roleVersionService,
      sessionPolicy,
      userAudit,
    );
  });

  it('previewRoleChange reports follow latest and pinned impacts', async () => {
    const changes = {
      permissions: { bookings: { read: true, write: true } },
    };
    const preview = await service.previewRoleChange(orgId, roleId, changes, actorId);

    expect(preview.affectedMembershipCount).toBe(2);
    expect(preview.followLatestCount).toBe(1);
    expect(preview.pinnedCount).toBe(1);
    expect(preview.gainedPermissions).toContainEqual({
      module: 'bookings',
      level: 'write',
    });
    expect(preview.memberships.find((m) => m.membershipId === 'mem-2')?.willReceiveUpdate).toBe(
      false,
    );
  });

  it('applyRoleChange rejects stale preview hash', async () => {
    await expect(
      service.applyRoleChange(
        orgId,
        roleId,
        {
          previewHash: 'deadbeef',
          expectedRoleVersion: 1,
          reason: 'test',
          idempotencyKey: 'idem-1',
          changes: { permissions: { bookings: { read: true, write: true } } },
        },
        actorId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('applyRoleChange applies version and propagates follow latest only', async () => {
    const changes = { permissions: { bookings: { read: true, write: true } } };
    const preview = await service.previewRoleChange(orgId, roleId, changes, actorId);

    const result = (await service.applyRoleChange(
      orgId,
      roleId,
      {
        previewHash: preview.previewHash,
        expectedRoleVersion: preview.currentVersionNumber,
        reason: 'Expand booking write access',
        idempotencyKey: 'idem-apply-1',
        changes,
      },
      actorId,
    )) as ApplyRoleChangeResult;

    expect(result.newVersionNumber).toBe(2);
    expect(result.followLatestUpdatedCount).toBe(1);
    expect(result.pinnedUnchangedCount).toBe(1);
    expect(result.pinnedMemberships[0].remainsOnPinnedVersion).toBe(true);
    expect(sessionPolicy.processIntents).toHaveBeenCalled();
    expect(userAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ auditAction: 'ROLE_CHANGE_APPLIED' }),
    );
  });

  it('applyRoleChange is idempotent', async () => {
    const cached = { newVersionNumber: 2 };
    (prisma.organizationRoleChangeApplication.findUnique as jest.Mock).mockResolvedValue({
      result: cached,
    });

    const result = await service.applyRoleChange(
      orgId,
      roleId,
      {
        previewHash: 'any',
        expectedRoleVersion: 1,
        reason: 'test',
        idempotencyKey: 'idem-replay',
        changes: { permissions: { bookings: { read: true, write: true } } },
      },
      actorId,
    );

    expect(result).toEqual(cached);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks apply when last effective admin would be removed', async () => {
    (prisma.organizationMembership.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'mem-only-admin',
        userId: 'only-admin',
        role: MembershipRole.WORKER,
        permissions: { 'users-roles': { read: true, write: true, manage: true } },
      },
    ]);
    (prisma.organizationRoleAssignment.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'assign-admin',
        assignmentMode: OrganizationRoleAssignmentMode.FOLLOW_LATEST_APPROVED_VERSION,
        assignedRoleVersionId: null,
        assignedRoleVersion: null,
        membership: {
          id: 'mem-only-admin',
          userId: 'only-admin',
          role: MembershipRole.WORKER,
          permissions: { 'users-roles': { read: true, write: true, manage: true } },
          stationIds: [],
          stationScope: null,
        },
      },
    ]);

    const changes = { permissions: { dashboard: { read: true, write: false } } };
    await expect(
      service.applyRoleChange(
        orgId,
        roleId,
        {
          previewHash: buildRoleChangePreviewHash({
            organizationRoleId: roleId,
            currentVersionNumber: 1,
            proposedChanges: changes,
          }),
          expectedRoleVersion: 1,
          reason: 'remove admin',
          idempotencyKey: 'idem-last-admin',
          changes,
        },
        actorId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
