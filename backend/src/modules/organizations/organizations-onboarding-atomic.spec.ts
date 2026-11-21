import { ConflictException } from '@nestjs/common';
import { MembershipStatus, OrganizationStatus } from '@prisma/client';
import { OrganizationsService } from './organizations.service';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';

describe('OrganizationsService — atomic MA onboarding', () => {
  const orgId = 'org-new';
  const adminId = 'user-admin-1';
  const email = 'admin@new-org.test';

  let prisma: {
    organization: { create: jest.Mock; findUnique: jest.Mock };
    organizationRole: { count: jest.Mock };
    user: { findUnique: jest.Mock; create: jest.Mock };
    organizationMembership: { create: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let roleService: { ensureDefaultRoles: jest.Mock };
  let audit: { record: jest.Mock };
  let service: OrganizationsService;

  beforeEach(() => {
    const tx = {
      $executeRaw: jest.fn(),
      organization: { create: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn() },
      organizationMembership: { create: jest.fn(), findFirst: jest.fn() },
    };

    prisma = {
      organization: { create: jest.fn(), findUnique: jest.fn() },
      organizationRole: { count: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn() },
      organizationMembership: { create: jest.fn(), findFirst: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    tx.organization.create.mockResolvedValue({
      id: orgId,
      companyName: 'Test',
      status: OrganizationStatus.PENDING,
    });
    tx.user.findUnique.mockResolvedValue(null);
    tx.user.create.mockResolvedValue({
      id: adminId,
      email,
      name: 'Admin',
    });
    tx.organizationMembership.create.mockResolvedValue({ id: 'mem-1' });

    prisma.organization.create.mockResolvedValue({
      id: orgId,
      companyName: 'Org only',
      status: OrganizationStatus.PENDING,
    });
    prisma.organizationRole.count.mockResolvedValue(DEFAULT_ORGANIZATION_ROLE_TEMPLATES.length);

    roleService = { ensureDefaultRoles: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn() };

    service = new OrganizationsService(
      prisma as never,
      audit as never,
      roleService as never,
      { aggregateDerivedFleetStatusCounts: jest.fn() } as never,
      { get: () => null } as never,
    );
  });

  it('org-only create awaits default roles before returning', async () => {
    const org = await service.create(
      { companyName: 'Solo Org' } as never,
      { actorUserId: 'ma-1' },
    );
    expect(org.id).toBe(orgId);
    expect(roleService.ensureDefaultRoles).toHaveBeenCalledWith(orgId, undefined);
    expect(prisma.organizationRole.count).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
  });

  it('create with initialAdmin uses single transaction path', async () => {
    const result = await service.create(
      {
        companyName: 'With Admin',
        initialAdmin: { name: 'A', email, password: 'Str0ng!Passw0rd' },
      } as never,
      { actorUserId: 'ma-1' },
    );
    expect(prisma.$transaction).toHaveBeenCalled();
    expect((result as { initialAdmin?: { id: string; email: string } }).initialAdmin).toEqual(
      expect.objectContaining({ id: adminId, email }),
    );
    expect(roleService.ensureDefaultRoles).toHaveBeenCalledWith(orgId, adminId);
  });

  it('rejects duplicate admin email inside createWithAdmin transaction', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      organization: { create: jest.fn() },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
        create: jest.fn(),
      },
      organizationMembership: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

    await expect(
      service.createWithAdmin(
        { companyName: 'Dup' },
        { name: 'A', email, password: 'Str0ng!Passw0rd' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.organization.create).not.toHaveBeenCalled();
  });

  it('fails closed when default roles are incomplete', async () => {
    prisma.organizationRole.count.mockResolvedValue(0);
    await expect(
      service.create({ companyName: 'Incomplete roles' } as never),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ORGANIZATION_ONBOARDING_INCOMPLETE' }),
    });
  });

  it('createOrgAdmin uses transaction and rejects duplicate email', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: orgId });
    const tx = {
      $executeRaw: jest.fn(),
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'exists' }),
        create: jest.fn(),
      },
      organizationMembership: { findFirst: jest.fn(), create: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

    await expect(
      service.createOrgAdmin(orgId, {
        name: 'A',
        email,
        password: 'Str0ng!Passw0rd',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});