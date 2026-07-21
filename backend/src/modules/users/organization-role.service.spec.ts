import { BadRequestException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { OrganizationRoleService } from './organization-role.service';
import { OrganizationRoleVersionService } from './organization-role-version.service';
import { PrismaService } from '@shared/database/prisma.service';
import { UserAccessAuditService } from './user-access-audit.service';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from './defaults/organization-role.defaults';

describe('OrganizationRoleService', () => {
  const orgId = 'org-1';
  const actorId = 'admin-1';
  const roleId = 'role-custom-1';

  let prisma: {
    organizationRole: {
      count: jest.Mock;
      upsert: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    organizationRoleVersion: { count: jest.Mock };
    organizationMembership: {
      findFirst: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
  };
  let userAudit: { record: jest.Mock };
  let roleVersionService: {
    createInitialVersionForRole: jest.Mock;
    maybeCreateVersionOnRoleUpdate: jest.Mock;
    assignRoleToMembership: jest.Mock;
  };
  let service: OrganizationRoleService;

  beforeEach(() => {
    prisma = {
      organizationRole: {
        count: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'seed-role' }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      organizationRoleVersion: { count: jest.fn().mockResolvedValue(0) },
      organizationMembership: {
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    userAudit = { record: jest.fn().mockResolvedValue(undefined) };
    roleVersionService = {
      createInitialVersionForRole: jest.fn().mockResolvedValue({ id: 'ver-1' }),
      maybeCreateVersionOnRoleUpdate: jest.fn().mockResolvedValue(null),
      assignRoleToMembership: jest.fn().mockResolvedValue({
        assignment: {
          id: 'assign-1',
          assignmentMode: 'FOLLOW_LATEST_APPROVED_VERSION',
        },
        membership: { organizationRoleId: roleId, role: MembershipRole.SUB_ADMIN },
      }),
    };
    service = new OrganizationRoleService(
      prisma as unknown as PrismaService,
      userAudit as unknown as UserAccessAuditService,
      roleVersionService as unknown as OrganizationRoleVersionService,
    );
  });

  it('seeds default role templates when missing', async () => {
    prisma.organizationRole.count.mockResolvedValue(0);
    prisma.organizationRole.findMany.mockResolvedValue([]);

    await service.listRoles(orgId);

    expect(prisma.organizationRole.upsert).toHaveBeenCalledTimes(
      DEFAULT_ORGANIZATION_ROLE_TEMPLATES.length,
    );
    expect(roleVersionService.createInitialVersionForRole).toHaveBeenCalled();
  });

  it('creates custom role and writes audit', async () => {
    prisma.organizationRole.create.mockResolvedValue({
      id: roleId,
      organizationId: orgId,
      name: 'Custom Desk',
      description: 'Test',
      systemKey: null,
      isSystemTemplate: false,
      isDefault: false,
      isActive: true,
      membershipRole: MembershipRole.WORKER,
      permissions: { 'users-roles': { read: true, write: false } },
      fieldAgentAccessDefault: false,
      stationScopeDefault: null,
      defaultStationIds: null,
      createdByUserId: actorId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const role = await service.createRole(
      orgId,
      {
        name: 'Custom Desk',
        membershipRole: MembershipRole.WORKER,
        permissions: { 'users-roles': { read: true, write: false } },
      },
      actorId,
    );

    expect(role.name).toBe('Custom Desk');
    expect(roleVersionService.createInitialVersionForRole).toHaveBeenCalled();
    expect(userAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ auditAction: 'ROLE_CREATED' }),
    );
  });

  it('assigns role to user membership via versioned assignment', async () => {
    prisma.organizationRole.findFirst.mockResolvedValue({
      id: roleId,
      organizationId: orgId,
      name: 'Disposition',
      systemKey: 'disposition',
      isSystemTemplate: true,
      isActive: true,
      membershipRole: MembershipRole.SUB_ADMIN,
      permissions: { bookings: 'write' },
      fieldAgentAccessDefault: false,
      stationScopeDefault: null,
      defaultStationIds: null,
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'm-1',
      userId: 'user-1',
      organizationId: orgId,
      role: MembershipRole.WORKER,
      organizationRoleId: null,
      permissions: null,
      fieldAgentAccess: false,
      stationScope: null,
      stationIds: null,
      roleLabel: null,
    });

    await service.assignRoleToUser(orgId, 'user-1', roleId, actorId);

    expect(roleVersionService.assignRoleToMembership).toHaveBeenCalledWith(
      orgId,
      'm-1',
      roleId,
      actorId,
    );
    expect(userAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ auditAction: 'ROLE_ASSIGNED' }),
    );
  });

  it('blocks structural updates without preview/apply flow', async () => {
    prisma.organizationRole.findFirst.mockResolvedValue({
      id: roleId,
      organizationId: orgId,
      isSystemTemplate: false,
      name: 'Custom',
    });

    await expect(
      service.updateRole(
        orgId,
        roleId,
        { permissions: { bookings: { read: true, write: true } } },
        actorId,
      ),
    ).rejects.toThrow(/previewRoleChange/);
  });

  it('blocks deleting system template', async () => {
    prisma.organizationRole.findFirst.mockResolvedValue({
      id: roleId,
      organizationId: orgId,
      isSystemTemplate: true,
      systemKey: 'org_admin',
      name: 'Org Admin',
    });

    await expect(service.deleteRole(orgId, roleId, actorId)).rejects.toThrow(
      BadRequestException,
    );
  });
});
