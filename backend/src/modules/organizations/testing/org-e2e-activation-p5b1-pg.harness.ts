import * as bcrypt from 'bcrypt';
import {
  BusinessType,
  MembershipRole,
  MembershipStatus,
  OrgProductPlan,
  OrgProductStatus,
  OrganizationProductVehicleAccessMode,
  OrganizationStatus,
  PrismaClient,
  ProductSlug,
  UserPlatformRole,
  UserStatus,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { OrganizationsService } from '../organizations.service';
import { OrganizationRoleService } from '@modules/users/organization-role.service';
import { OrganizationRoleVersionService } from '@modules/users/organization-role-version.service';
import { ProductsService } from '@modules/products/products.service';
import { createVehicleRowForIntegrationHarness } from '@modules/vehicles/testing/vehicle-row-integration.harness';
import { VehiclesService } from '@modules/vehicles/vehicles.service';

export const P5B1_JWT_SECRET = 'p5b1-disposable-org-e2e-jwt-secret';

export async function ensureCatalogProducts(prisma: PrismaClient): Promise<void> {
  for (const row of [
    { slug: ProductSlug.FLEET, name: 'SynqDrive Fleet' },
    { slug: ProductSlug.RENTAL, name: 'SynqDrive Rental' },
  ]) {
    await prisma.product.upsert({
      where: { slug: row.slug },
      create: { slug: row.slug, name: row.name, description: `${row.name} test` },
      update: {},
    });
  }
}

export function buildOrganizationsService(prisma: PrismaClient): OrganizationsService {
  const roleVersionService = new OrganizationRoleVersionService(prisma as never);
  const roleService = new OrganizationRoleService(
    prisma as never,
    { record: jest.fn() } as never,
    roleVersionService,
  );
  return new OrganizationsService(
    prisma as never,
    { record: jest.fn() } as never,
    roleService,
    { aggregateDerivedFleetStatusCounts: jest.fn() } as never,
    { get: () => null } as never,
  );
}

export function buildProductsService(prisma: PrismaClient): ProductsService {
  return new ProductsService(prisma as never, { record: jest.fn() } as never);
}

export function buildVehiclesService(prisma: PrismaClient): VehiclesService {
  const stub = (): unknown => ({});
  return new (VehiclesService as unknown as new (...args: unknown[]) => VehiclesService)(
    prisma,
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    { KEY: 'dimo' },
    stub(),
    stub(),
    stub(),
  );
}

export async function createMasterAdminActor(prisma: PrismaClient): Promise<{ id: string }> {
  const id = randomUUID();
  const passwordHash = await bcrypt.hash('Ma-Str0ng!Pass', 4);
  await prisma.user.create({
    data: {
      id,
      email: `ma-${id}@p5b1.test`,
      name: 'MA Actor',
      passwordHash,
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    },
  });
  return { id };
}

export type OrgBootstrapResult = {
  orgId: string;
  adminId: string;
  adminEmail: string;
  adminPassword: string;
  companyName: string;
};

export async function bootstrapOrganizationWithAdmin(
  orgs: OrganizationsService,
  label: string,
): Promise<OrgBootstrapResult> {
  const adminEmail = `admin-${randomUUID()}@p5b1.test`;
  const companyName = `P5B1-${label}-${randomUUID().slice(0, 8)}`;
  const created = await orgs.create(
    {
      companyName,
      businessType: BusinessType.FLEET,
      status: OrganizationStatus.PENDING,
      initialAdmin: {
        name: 'Org Admin',
        email: adminEmail,
        password: 'Str0ng!Passw0rd1',
      },
    } as never,
    { actorUserId: 'ma-p5b1' },
  );
  return {
    orgId: created.id,
    adminId: (created as { initialAdmin: { id: string } }).initialAdmin.id,
    adminEmail,
    adminPassword: 'Str0ng!Passw0rd1',
    companyName,
  };
}

export async function setOrganizationStatus(
  prisma: PrismaClient,
  orgId: string,
  status: OrganizationStatus,
): Promise<void> {
  await prisma.organization.update({ where: { id: orgId }, data: { status } });
}

export async function assignFleetProductActive(
  products: ProductsService,
  orgId: string,
  actorUserId: string,
) {
  return products.assignProductForMasterAdmin({
    orgId,
    productSlug: ProductSlug.FLEET,
    plan: OrgProductPlan.STARTER,
    vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    actorUserId,
  });
}

export async function assignFleetProductTrial(
  prisma: PrismaClient,
  orgId: string,
): Promise<void> {
  const product = await prisma.product.findUniqueOrThrow({ where: { slug: ProductSlug.FLEET } });
  await prisma.organizationProduct.upsert({
    where: {
      organizationId_productId: { organizationId: orgId, productId: product.id },
    },
    create: {
      organizationId: orgId,
      productId: product.id,
      status: OrgProductStatus.TRIAL,
      plan: OrgProductPlan.STARTER,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    },
    update: { status: OrgProductStatus.TRIAL },
  });
}

export async function createFleetVehicle(
  prisma: PrismaClient,
  orgId: string,
  actorUserId: string,
  suffix: string,
) {
  return createVehicleRowForIntegrationHarness(
    prisma,
    orgId,
    {
      vin: `VIN${suffix}${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      make: 'Test',
      model: 'E2E',
      year: 2026,
      licensePlate: `PL-${suffix}`,
      fuelType: 'ELECTRIC',
      status: VehicleStatus.AVAILABLE,
    },
    actorUserId,
    { invokeLegacyBillingHook: false },
  );
}

export async function loadOrgAdminMembership(prisma: PrismaClient, orgId: string, userId: string) {
  return prisma.organizationMembership.findFirstOrThrow({
    where: { organizationId: orgId, userId, status: MembershipStatus.ACTIVE },
    include: { organization: true, user: true },
  });
}

export async function cleanupOrgGraph(prisma: PrismaClient, orgId: string): Promise<void> {
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId: orgId },
    select: { userId: true },
  });
  await prisma.vehicle.deleteMany({ where: { organizationId: orgId } });
  await prisma.organizationRoleVersion.deleteMany({ where: { organizationId: orgId } });
  await prisma.organizationRoleAssignment.deleteMany({ where: { organizationId: orgId } });
  await prisma.organizationRole.deleteMany({ where: { organizationId: orgId } });
  await prisma.organizationProduct.deleteMany({ where: { organizationId: orgId } });
  await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
  await prisma.refreshToken.deleteMany({
    where: { userId: { in: memberships.map((m) => m.userId) } },
  });
  for (const m of memberships) {
    const other = await prisma.organizationMembership.count({ where: { userId: m.userId } });
    if (other === 0) {
      await prisma.user.delete({ where: { id: m.userId } }).catch(() => undefined);
    }
  }
  await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}

export function tenantJwtUser(input: {
  userId: string;
  orgId: string;
  membershipRole?: MembershipRole;
}) {
  return {
    id: input.userId,
    platformRole: 'USER',
    organizationId: input.orgId,
    membershipRole: input.membershipRole ?? MembershipRole.ORG_ADMIN,
  };
}