import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  MembershipRole,
  OrganizationRoleAssignmentMode,
  OrganizationRoleVersionStatus,
} from '@prisma/client';
import { OrganizationRoleVersionService } from './organization-role-version.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('OrganizationRoleVersionService', () => {
  const orgId = 'org-a';
  const roleId = 'role-1';
  const membershipId = 'mem-1';
  const actorId = 'admin-1';

  let prisma: {
    organizationRole: { findFirst: jest.Mock };
    organizationRoleVersion: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    organizationMembership: { findFirst: jest.Mock; update: jest.Mock };
    organizationRoleAssignment: {
      updateMany: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    membershipPermissionOverride: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: OrganizationRoleVersionService;

  const baseRole = {
    id: roleId,
    organizationId: orgId,
    name: 'Desk Agent',
    description: null,
    isSystemTemplate: false,
    membershipRole: MembershipRole.WORKER,
    permissions: { bookings: { read: true, write: false } },
    stationScopeDefault: null,
    defaultStationIds: null,
    fieldAgentAccessDefault: false,
    createdByUserId: actorId,
  };

  beforeEach(() => {
    prisma = {
      organizationRole: { findFirst: jest.fn() },
      organizationRoleVersion: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      organizationMembership: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      organizationRoleAssignment: {
        updateMany: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      membershipPermissionOverride: { create: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
    };
    service = new OrganizationRoleVersionService(prisma as unknown as PrismaService);
  });

  it('creates initial approved version for new role', async () => {
    prisma.organizationRoleVersion.create.mockResolvedValue({
      id: 'ver-1',
      version: 1,
      status: OrganizationRoleVersionStatus.APPROVED,
    });

    await service.createInitialVersionForRole(baseRole, actorId);

    expect(prisma.organizationRoleVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationRoleId: roleId,
          version: 1,
          status: OrganizationRoleVersionStatus.APPROVED,
        }),
      }),
    );
  });

  it('creates new approved version and supersedes previous', async () => {
    prisma.organizationRole.findFirst.mockResolvedValue(baseRole);
    prisma.organizationRoleVersion.findMany.mockResolvedValue([{ version: 1, status: 'APPROVED' }]);
    prisma.organizationRoleVersion.create.mockResolvedValue({
      id: 'ver-2',
      version: 2,
      status: OrganizationRoleVersionStatus.APPROVED,
    });

    await service.createApprovedVersion(orgId, roleId, actorId, {
      changeReason: 'Updated permissions',
    });

    expect(prisma.organizationRoleVersion.updateMany).toHaveBeenCalled();
    expect(prisma.organizationRoleVersion.create).toHaveBeenCalled();
  });

  it('assigns role with FOLLOW_LATEST mode', async () => {
    prisma.organizationRole.findFirst.mockResolvedValue(baseRole);
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: membershipId,
      organizationId: orgId,
    });
    prisma.organizationRoleVersion.findFirst.mockResolvedValue({
      id: 'ver-2',
      organizationRoleId: roleId,
      organizationId: orgId,
      version: 2,
      nameSnapshot: 'Desk Agent',
      fieldAgentAccess: false,
      riskClassification: 'STANDARD',
      status: OrganizationRoleVersionStatus.APPROVED,
      createdAt: new Date(),
    });
    prisma.organizationRoleAssignment.create.mockResolvedValue({
      id: 'assign-1',
      assignmentMode: OrganizationRoleAssignmentMode.FOLLOW_LATEST_APPROVED_VERSION,
    });
    prisma.organizationMembership.update.mockResolvedValue({ id: membershipId });

    const result = await service.assignRoleToMembership(
      orgId,
      membershipId,
      roleId,
      actorId,
      { assignmentMode: OrganizationRoleAssignmentMode.FOLLOW_LATEST_APPROVED_VERSION },
    );

    expect(prisma.organizationRoleAssignment.updateMany).toHaveBeenCalled();
    expect(result.assignment).toBeDefined();
  });

  it('assigns role with PINNED version', async () => {
    prisma.organizationRole.findFirst.mockResolvedValue(baseRole);
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: membershipId,
      organizationId: orgId,
    });
    prisma.organizationRoleVersion.findFirst.mockResolvedValue({
      id: 'ver-1',
      organizationRoleId: roleId,
      organizationId: orgId,
      version: 1,
      status: OrganizationRoleVersionStatus.APPROVED,
    });
    prisma.organizationRoleAssignment.create.mockResolvedValue({ id: 'assign-2' });
    prisma.organizationMembership.update.mockResolvedValue({ id: membershipId });

    await service.assignRoleToMembership(orgId, membershipId, roleId, actorId, {
      assignmentMode: OrganizationRoleAssignmentMode.PINNED_VERSION,
      pinnedRoleVersionId: 'ver-1',
    });

    expect(prisma.organizationRoleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignedRoleVersionId: 'ver-1',
          assignmentMode: OrganizationRoleAssignmentMode.PINNED_VERSION,
        }),
      }),
    );
  });

  it('rejects assigning retired pinned version', async () => {
    prisma.organizationRole.findFirst.mockResolvedValue(baseRole);
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: membershipId,
      organizationId: orgId,
    });
    prisma.organizationRoleVersion.findFirst.mockResolvedValue({
      id: 'ver-1',
      status: OrganizationRoleVersionStatus.RETIRED,
    });

    await expect(
      service.assignRoleToMembership(orgId, membershipId, roleId, actorId, {
        assignmentMode: OrganizationRoleAssignmentMode.PINNED_VERSION,
        pinnedRoleVersionId: 'ver-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates explicit permission override', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: membershipId,
      organizationId: orgId,
    });
    prisma.membershipPermissionOverride.create.mockResolvedValue({ id: 'override-1' });

    const result = await service.createPermissionOverride(orgId, membershipId, actorId, {
      moduleKey: 'bookings',
      permissionLevel: 'write',
      effect: 'ALLOW',
      reason: 'Temporary dispatch access',
    });

    expect(result.id).toBe('override-1');
    expect(prisma.membershipPermissionOverride.create).toHaveBeenCalled();
  });

  it('rejects cross-tenant assignment when membership not in org', async () => {
    prisma.organizationRole.findFirst.mockResolvedValue(baseRole);
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(
      service.assignRoleToMembership(orgId, membershipId, roleId, actorId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects cross-tenant scope explicitly', () => {
    expect(() => service.assertTenantScope('org-a', 'org-b', 'assignment')).toThrow(
      ForbiddenException,
    );
  });

  it('lists assignment history', async () => {
    prisma.organizationRoleAssignment.findMany.mockResolvedValue([
      {
        id: 'a2',
        organizationId: orgId,
        membershipId,
        assignmentMode: OrganizationRoleAssignmentMode.FOLLOW_LATEST_APPROVED_VERSION,
        assignedAt: new Date('2026-06-01'),
        effectiveFrom: new Date('2026-06-01'),
        isCurrent: true,
        organizationRoleId: roleId,
        assignedRoleVersionId: 'ver-2',
        assignedByUserId: actorId,
        endedAt: null,
      },
    ]);

    const history = await service.listAssignmentHistory(orgId, membershipId);
    expect(history).toHaveLength(1);
    expect(history[0].assignmentMode).toBe('FOLLOW_LATEST_APPROVED_VERSION');
  });
});
