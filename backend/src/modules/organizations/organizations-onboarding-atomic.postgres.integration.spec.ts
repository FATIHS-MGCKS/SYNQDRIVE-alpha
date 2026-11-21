/**
 * ORG_ONBOARDING_P4_PG=1 DATABASE_URL=postgresql://127.0.0.1:5432/synqdrive_org_onboarding_p4_test
 */
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  OrganizationRoleVersionStatus,
  PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { OrganizationsService } from './organizations.service';
import { OrganizationRoleService } from '@modules/users/organization-role.service';
import { OrganizationRoleVersionService } from '@modules/users/organization-role-version.service';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import {
  assertOrgOnboardingP4DisposablePostgresPreflight,
  isOrgOnboardingP4PostgresOptIn,
} from './testing/org-onboarding-p4-disposable-postgres-preflight';

const LIVE = isOrgOnboardingP4PostgresOptIn();

async function cleanupOrg(prisma: PrismaClient, orgId: string, userIds: string[] = []) {
  await prisma.organizationRoleVersion.deleteMany({ where: { organizationId: orgId } });
  await prisma.organizationRoleAssignment.deleteMany({ where: { organizationId: orgId } });
  await prisma.organizationRole.deleteMany({ where: { organizationId: orgId } });
  await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
  for (const userId of userIds) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
  await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}

(LIVE ? describe : describe.skip)('organizations onboarding atomic (postgres)', () => {
  let prisma: PrismaClient;
  let service: OrganizationsService;
  let auditRecord: jest.Mock;

  beforeAll(async () => {
    assertOrgOnboardingP4DisposablePostgresPreflight();
    prisma = new PrismaClient();
    await prisma.$connect();
    auditRecord = jest.fn();
    const roleVersionService = new OrganizationRoleVersionService(prisma as never);
    const roleService = new OrganizationRoleService(
      prisma as never,
      { record: jest.fn() } as never,
      roleVersionService,
    );
    service = new OrganizationsService(
      prisma as never,
      { record: auditRecord } as never,
      roleService,
      { aggregateDerivedFleetStatusCounts: jest.fn() } as never,
      { get: () => null } as never,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('commits org + admin + default roles and approved versions', async () => {
    const email = `onboard-${randomUUID()}@p4.test`;
    const result = await service.create(
      {
        companyName: `P4 ${randomUUID().slice(0, 6)}`,
        initialAdmin: {
          name: 'Onboard Admin',
          email,
          password: 'Str0ng!Passw0rd1',
        },
      } as never,
      { actorUserId: 'ma-pg' },
    );

    const orgId = result.id;
    const roles = await prisma.organizationRole.findMany({
      where: { organizationId: orgId, isSystemTemplate: true, isActive: true },
    });
    expect(roles.length).toBeGreaterThanOrEqual(DEFAULT_ORGANIZATION_ROLE_TEMPLATES.length);
    for (const template of DEFAULT_ORGANIZATION_ROLE_TEMPLATES) {
      const role = roles.find((r) => r.systemKey === template.systemKey);
      expect(role).toBeDefined();
      const approved = await prisma.organizationRoleVersion.findFirst({
        where: {
          organizationRoleId: role!.id,
          status: OrganizationRoleVersionStatus.APPROVED,
        },
      });
      expect(approved).not.toBeNull();
    }

    const admin = (result as { initialAdmin?: { id: string } }).initialAdmin;
    await cleanupOrg(prisma, orgId, admin?.id ? [admin.id] : []);
    expect(auditRecord).toHaveBeenCalled();
  });

  it('org-only create provisions mandatory roles atomically', async () => {
    const org = await service.create(
      { companyName: `Solo ${randomUUID().slice(0, 6)}` } as never,
      { actorUserId: 'ma-pg-solo' },
    );
    const roleCount = await prisma.organizationRole.count({
      where: { organizationId: org.id, isSystemTemplate: true },
    });
    expect(roleCount).toBe(DEFAULT_ORGANIZATION_ROLE_TEMPLATES.length);
    await cleanupOrg(prisma, org.id);
  });

  it('rejects duplicate admin email without orphaned org rows', async () => {
    const email = `dup-${randomUUID()}@p4.test`;
    const secondCompany = `Second-${randomUUID()}`;
    const first = await service.create(
      {
        companyName: `First-${randomUUID()}`,
        initialAdmin: { name: 'A', email, password: 'Str0ng!Passw0rd1' },
      } as never,
    );
    const firstOrgId = first.id;
    await expect(
      service.create(
        {
          companyName: secondCompany,
          initialAdmin: { name: 'B', email, password: 'Str0ng!Passw0rd1' },
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const orphan = await prisma.organization.findFirst({
      where: { companyName: secondCompany },
    });
    expect(orphan).toBeNull();
    const admin = (first as { initialAdmin?: { id: string } }).initialAdmin;
    await cleanupOrg(prisma, firstOrgId, admin?.id ? [admin.id] : []);
  });

  it('rolls back org + admin when role-version seeding fails', async () => {
    const email = `rv-fail-${randomUUID()}@p4.test`;
    const roleVersionService = new OrganizationRoleVersionService(prisma as never);
    const realRoleService = new OrganizationRoleService(
      prisma as never,
      { record: jest.fn() } as never,
      roleVersionService,
    );
    const spy = jest
      .spyOn(roleVersionService, 'createInitialVersionForRole')
      .mockRejectedValueOnce(new Error('simulated role-version failure'));

    const failingService = new OrganizationsService(
      prisma as never,
      { record: jest.fn() } as never,
      realRoleService,
      { aggregateDerivedFleetStatusCounts: jest.fn() } as never,
      { get: () => null } as never,
    );

    await expect(
      failingService.create(
        {
          companyName: `RVFail ${randomUUID().slice(0, 4)}`,
          initialAdmin: { name: 'X', email, password: 'Str0ng!Passw0rd1' },
        } as never,
        { actorUserId: 'ma-should-not-audit' },
      ),
    ).rejects.toThrow('simulated role-version failure');

    const user = await prisma.user.findUnique({ where: { email } });
    const org = await prisma.organization.findFirst({ where: { companyName: { contains: 'RVFail' } } });
    expect(user).toBeNull();
    expect(org).toBeNull();
    spy.mockRestore();
  });

  it('rolls back org-only path when role provision assertion fails', async () => {
    const roleVersionService = new OrganizationRoleVersionService(prisma as never);
    const realRoleService = new OrganizationRoleService(
      prisma as never,
      { record: jest.fn() } as never,
      roleVersionService,
    );
    const spy = jest
      .spyOn(realRoleService, 'assertOrganizationSystemRolesProvisioned')
      .mockRejectedValueOnce(
        new BadRequestException({
          code: 'ORGANIZATION_ONBOARDING_INCOMPLETE',
          message: 'simulated role gate failure',
        }),
      );
    const failingService = new OrganizationsService(
      prisma as never,
      { record: jest.fn() } as never,
      realRoleService,
      { aggregateDerivedFleetStatusCounts: jest.fn() } as never,
      { get: () => null } as never,
    );

    const name = `RoleGate ${randomUUID().slice(0, 4)}`;
    await expect(
      failingService.create({ companyName: name } as never, { actorUserId: 'ma-no-audit' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const org = await prisma.organization.findFirst({ where: { companyName: name } });
    expect(org).toBeNull();
    spy.mockRestore();
  });

  it('concurrent same-email onboarding commits at most one org and one user', async () => {
    const runId = randomUUID();
    const email = `concurrent-${runId}@p4.test`;
    const companyA = `ConcurrentEmailA-${runId}`;
    const companyB = `ConcurrentEmailB-${runId}`;
    const password = 'Str0ng!Passw0rd1';

    const outcomes = await Promise.allSettled([
      service.create(
        {
          companyName: companyA,
          initialAdmin: { name: 'Alpha', email, password },
        } as never,
      ),
      service.create(
        {
          companyName: companyB,
          initialAdmin: { name: 'Beta', email, password },
        } as never,
      ),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      rejected.some(
        (o) => o.status === 'rejected' && o.reason instanceof ConflictException,
      ),
    ).toBe(true);

    const users = await prisma.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);

    const orgA = await prisma.organization.findFirst({ where: { companyName: companyA } });
    const orgB = await prisma.organization.findFirst({ where: { companyName: companyB } });
    const survivingOrg = orgA ?? orgB;
    expect(survivingOrg).not.toBeNull();
    expect(Boolean(orgA) !== Boolean(orgB)).toBe(true);

    const memberships = await prisma.organizationMembership.count({
      where: { userId: users[0]!.id, role: 'ORG_ADMIN' },
    });
    expect(memberships).toBe(1);

    const adminId = users[0]!.id;
    await cleanupOrg(prisma, survivingOrg!.id, [adminId]);
  });

  it('concurrent org-only creates remain isolated', async () => {
    const [a, b] = await Promise.all([
      service.create({ companyName: `ConcA-${randomUUID().slice(0, 4)}` } as never),
      service.create({ companyName: `ConcB-${randomUUID().slice(0, 4)}` } as never),
    ]);
    expect(a.id).not.toBe(b.id);
    await cleanupOrg(prisma, a.id);
    await cleanupOrg(prisma, b.id);
  });

  it('does not record success audit when onboarding transaction fails', async () => {
    const audit = jest.fn();
    const email = `no-audit-${randomUUID()}@p4.test`;
    const roleVersionService = new OrganizationRoleVersionService(prisma as never);
    const realRoleService = new OrganizationRoleService(
      prisma as never,
      { record: jest.fn() } as never,
      roleVersionService,
    );
    jest
      .spyOn(realRoleService, 'ensureDefaultRoles')
      .mockRejectedValueOnce(new Error('simulated role seed failure'));

    const failingService = new OrganizationsService(
      prisma as never,
      { record: audit } as never,
      realRoleService,
      { aggregateDerivedFleetStatusCounts: jest.fn() } as never,
      { get: () => null } as never,
    );

    await expect(
      failingService.create(
        {
          companyName: `NoAudit ${randomUUID().slice(0, 4)}`,
          initialAdmin: { name: 'Y', email, password: 'Str0ng!Passw0rd1' },
        } as never,
        { actorUserId: 'ma-blocked' },
      ),
    ).rejects.toThrow('simulated role seed failure');
    expect(audit).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});