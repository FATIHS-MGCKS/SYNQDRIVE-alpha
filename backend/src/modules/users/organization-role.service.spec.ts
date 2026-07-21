import { BadRequestException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { OrganizationRoleService } from './organization-role.service';
import { PrismaService } from '@shared/database/prisma.service';
import { IamAuditService } from './iam-audit.service';
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
    organizationMembership: {
      findFirst: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let iamAudit: {
    enqueueInTransaction: jest.Mock;
    processOutboxIds: jest.Mock;
  };
  let service: OrganizationRoleService;

  beforeEach(() => {
    prisma = {
      organizationRole: {
        count: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      organizationMembership: {
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
    };
    iamAudit = {
      enqueueInTransaction: jest.fn().mockResolvedValue({ id: 'audit-outbox-1' }),
      processOutboxIds: jest.fn().mockResolvedValue(undefined),
    };
    service = new OrganizationRoleService(
      prisma as unknown as PrismaService,
      iamAudit as unknown as IamAuditService,
    );
  });

  it('seeds default role templates when missing', async () => {
    prisma.organizationRole.count.mockResolvedValue(0);
    prisma.organizationRole.findMany.mockResolvedValue([]);

    await service.listRoles(orgId);

    expect(prisma.organizationRole.upsert).toHaveBeenCalledTimes(
      DEFAULT_ORGANIZATION_ROLE_TEMPLATES.length,
    );
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
    expect(iamAudit.enqueueInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'ROLE_CREATED' }),
    );
  });

  it('assigns role to user membership', async () => {
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
    prisma.organizationMembership.update.mockResolvedValue({});

    await service.assignRoleToUser(orgId, 'user-1', roleId, actorId);

    expect(prisma.organizationMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationRoleId: roleId,
          role: MembershipRole.SUB_ADMIN,
        }),
      }),
    );
    expect(iamAudit.enqueueInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'ROLE_ASSIGNED' }),
    );
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
