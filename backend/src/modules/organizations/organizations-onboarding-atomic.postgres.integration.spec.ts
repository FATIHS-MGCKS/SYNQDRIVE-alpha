/**
 * ORG_ONBOARDING_P4_PG=1 DATABASE_URL=postgresql://127.0.0.1:5432/synqdrive_org_onboarding_p4_test
 */
import { PrismaClient, OrganizationStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { OrganizationsService } from './organizations.service';
import { OrganizationRoleService } from '@modules/users/organization-role.service';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import {
  assertOrgOnboardingP4DisposablePostgresPreflight,
  isOrgOnboardingP4PostgresOptIn,
} from './testing/org-onboarding-p4-disposable-postgres-preflight';

const LIVE = isOrgOnboardingP4PostgresOptIn();

(LIVE ? describe : describe.skip)('organizations onboarding atomic (postgres)', () => {
  let prisma: PrismaClient;
  let service: OrganizationsService;

  beforeAll(async () => {
    assertOrgOnboardingP4DisposablePostgresPreflight();
    prisma = new PrismaClient();
    await prisma.$connect();
    const roleService = new OrganizationRoleService(
      prisma as never,
      { record: jest.fn() } as never,
      { createInitialVersionForRole: jest.fn().mockResolvedValue({}) } as never,
    );
    service = new OrganizationsService(
      prisma as never,
      { record: jest.fn() } as never,
      roleService,
      { aggregateDerivedFleetStatusCounts: jest.fn() } as never,
      { get: () => null } as never,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('commits org + admin + default roles', async () => {
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
    const roleCount = await prisma.organizationRole.count({
      where: { organizationId: orgId, isSystemTemplate: true },
    });
    expect(roleCount).toBeGreaterThanOrEqual(DEFAULT_ORGANIZATION_ROLE_TEMPLATES.length);

    const membership = await prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, role: 'ORG_ADMIN' },
    });
    expect(membership).not.toBeNull();

    const admin = (result as { initialAdmin?: { id: string } }).initialAdmin;
    expect(admin?.id).toBeTruthy();

    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationRole.deleteMany({ where: { organizationId: orgId } });
    if (admin?.id) await prisma.user.delete({ where: { id: admin.id } }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: orgId } });
  });
});