import { BadRequestException } from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '@shared/database/prisma.service';
import { UserAccessAuditService } from './user-access-audit.service';
import { LAST_ORG_ADMIN_MESSAGE } from '@shared/auth/permission.constants';
import { IamSessionPolicyService } from '@modules/auth/iam-session-policy.service';
import { PasswordResetService } from '@modules/auth/password-reset.service';

describe('UsersService — security & membership', () => {
  const orgId = 'org-1';
  const adminUserId = 'admin-1';
  const workerUserId = 'worker-1';

  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    organizationMembership: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    station: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let userAudit: { record: jest.Mock };
  let sessionPolicy: {
    enqueueInTransaction: jest.Mock;
    processIntents: jest.Mock;
  };
  let passwordReset: { requestAdminReset: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      organizationMembership: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      station: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    userAudit = { record: jest.fn().mockResolvedValue(undefined) };
    sessionPolicy = {
      enqueueInTransaction: jest.fn().mockResolvedValue({ intentIds: ['intent-1'], scopes: [] }),
      processIntents: jest.fn().mockResolvedValue([]),
    };
    passwordReset = {
      requestAdminReset: jest.fn().mockResolvedValue({
        status: 'accepted',
        message:
          'If an account exists for this request, password reset instructions will be sent to the verified email address.',
      }),
    };
    service = new UsersService(
      prisma as unknown as PrismaService,
      userAudit as unknown as UserAccessAuditService,
      sessionPolicy as unknown as IamSessionPolicyService,
      passwordReset as unknown as PasswordResetService,
    );
  });

  it('blocks removing the last active ORG_ADMIN', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'm1',
      role: MembershipRole.ORG_ADMIN,
      status: MembershipStatus.ACTIVE,
      membershipVersion: 0,
      permissions: null,
    });
    prisma.organizationMembership.findMany.mockResolvedValue([]);
    prisma.organizationMembership.count.mockResolvedValue(0);

    await expect(service.removeOrgUser(orgId, adminUserId)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.removeOrgUser(orgId, adminUserId)).rejects.toThrow(
      LAST_ORG_ADMIN_MESSAGE,
    );
  });

  it('reactivates REMOVED membership on createOrgUser', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: workerUserId,
      email: 'worker@test.de',
      firstName: 'W',
      lastName: 'K',
      name: 'W K',
      phone: null,
      mobile: null,
      address: null,
    });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      id: 'm-removed',
      status: MembershipStatus.REMOVED,
    });
    prisma.organizationMembership.update.mockResolvedValue({
      id: 'm-removed',
      role: MembershipRole.WORKER,
      status: MembershipStatus.ACTIVE,
      roleLabel: null,
      stationScope: null,
      stationIds: null,
      department: null,
      position: null,
      permissions: null,
      fieldAgentAccess: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: workerUserId,
        email: 'worker@test.de',
        name: 'W K',
        firstName: 'W',
        lastName: 'K',
        status: 'ACTIVE',
        phone: '',
        mobile: '',
        language: 'de',
        timezone: 'Europe/Berlin',
        dateFormat: 'DD.MM.YYYY',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        address: '',
        mustChangePassword: false,
        lastLoginIp: '',
        lastLoginDevice: '',
      },
      organization: { id: orgId, companyName: 'Test Org' },
    });

    const result = await service.createOrgUser(orgId, {
      email: 'worker@test.de',
      firstName: 'W',
      lastName: 'K',
      role: 'WORKER',
    });

    expect(prisma.organizationMembership.update).toHaveBeenCalled();
    expect(result.email).toBe('worker@test.de');
  });

  it('rejects direct org-admin password write (deprecated endpoint)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'm1',
      role: MembershipRole.WORKER,
      status: MembershipStatus.ACTIVE,
    });

    await expect(
      service.changeOrgUserPassword(
        orgId,
        workerUserId,
        'short',
        workerUserId,
        { id: workerUserId },
      ),
    ).rejects.toThrow(/reset|deprecated/i);
  });
});
