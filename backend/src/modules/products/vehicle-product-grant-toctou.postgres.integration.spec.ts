/**
 * Vehicle grant TOCTOU review — disposable Postgres concurrency probes.
 *
 * VEHICLE_PRODUCT_GRANT_TOCTOU_POSTGRES_INTEGRATION=1
 */
import { ForbiddenException } from '@nestjs/common';
import {
  OrgProductPlan,
  OrgProductStatus,
  PrismaClient,
  ProductCatalogStatus,
  ProductSlug,
  UserPlatformRole,
  UserStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { defaultVehicleAccessModeForNewAssignment } from './organization-product-vehicle-access-defaults';
import { VehicleProductGrantService } from './vehicle-product-grants/vehicle-product-grant.service';
import { assertProductCatalogV2DisposablePostgres } from './testing/product-catalog-v2-disposable-postgres-preflight';

const LIVE = process.env.VEHICLE_PRODUCT_GRANT_TOCTOU_POSTGRES_INTEGRATION === '1';
const OPT_IN = 'VEHICLE_PRODUCT_GRANT_TOCTOU_POSTGRES_INTEGRATION';

(LIVE ? describe : describe.skip)('Vehicle product grant TOCTOU — postgres review', () => {
  const prisma = new PrismaClient();
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as MasterAdminAuditService;
  let grants: VehicleProductGrantService;
  const orgIds: string[] = [];
  let adminId = '';

  beforeAll(() => {
    assertProductCatalogV2DisposablePostgres(OPT_IN);
    grants = new VehicleProductGrantService(prisma as unknown as PrismaService, audit);
  });

  afterAll(async () => {
    if (orgIds.length) {
      await prisma.vehicleProductGrant.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.vehicle.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organizationProduct.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    if (adminId) {
      await prisma.user.deleteMany({ where: { id: adminId } });
    }
    await prisma.$disconnect();
  });

  async function seedOrgWithProduct(slug: ProductSlug) {
    const org = await prisma.organization.create({
      data: { companyName: `TOCTOU ${Date.now()}`, businessType: 'RENTAL' },
    });
    orgIds.push(org.id);
    const product = await prisma.product.findUniqueOrThrow({ where: { slug } });
    await prisma.organizationProduct.create({
      data: {
        organizationId: org.id,
        productId: product.id,
        status: OrgProductStatus.ACTIVE,
        plan: OrgProductPlan.STARTER,
        vehicleAccessMode: defaultVehicleAccessModeForNewAssignment(slug),
        activatedAt: new Date(),
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        vin: `VIN-TOCTOU-${Date.now()}`,
        make: 'Test',
        model: 'Grant',
        year: 2025,
        fuelType: 'ELECTRIC',
        licensePlate: `TOCTOU-${Date.now()}`,
        status: 'AVAILABLE',
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      },
    });
    return { orgId: org.id, vehicleId: vehicle.id, slug };
  }

  beforeEach(async () => {
    adminId = `toctou-master-${Date.now()}`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${adminId},
        ${`toctou-${Date.now()}@test.example`},
        'TOCTOU Master',
        ${UserStatus.ACTIVE}::"UserStatus",
        ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole",
        NOW(),
        NOW()
      )
    `;
  });

  it('blocks NEW grant when catalog admission is disabled inside the grant transaction', async () => {
    const slug = ProductSlug.FLEET;
    await prisma.product.update({
      where: { slug },
      data: { catalogStatus: ProductCatalogStatus.DISABLED },
    });
    const { orgId, vehicleId } = await seedOrgWithProduct(slug);

    await expect(
      grants.grantExplicit({
        organizationId: orgId,
        vehicleId,
        productSlug: slug,
        grantedByUserId: adminId,
        audit: { correlationId: `toctou-catalog-${Date.now()}` },
      }),
    ).rejects.toThrow(/admission|disabled|catalog/i);

    await prisma.product.update({
      where: { slug },
      data: { catalogStatus: ProductCatalogStatus.ACTIVE },
    });
  });

  it('documents org-product eligibility TOCTOU under concurrent suspension', async () => {
    const slug = ProductSlug.RENTAL;
    await prisma.product.update({
      where: { slug },
      data: { catalogStatus: ProductCatalogStatus.ACTIVE },
    });
    const { orgId, vehicleId } = await seedOrgWithProduct(slug);

    const [grant] = await Promise.all([
      grants.grantExplicit({
        organizationId: orgId,
        vehicleId,
        productSlug: slug,
        grantedByUserId: adminId,
        audit: { correlationId: `toctou-org-${Date.now()}` },
      }),
      prisma.organizationProduct.updateMany({
        where: { organizationId: orgId, product: { slug } },
        data: { status: OrgProductStatus.SUSPENDED },
      }),
    ]);

    const op = await prisma.organizationProduct.findFirst({
      where: { organizationId: orgId, product: { slug } },
    });
    expect(op?.status).toBe(OrgProductStatus.SUSPENDED);
    expect(grant.status).toBe('ACTIVE');
  });

  it('rejects grant when organization product is already suspended before call', async () => {
    const slug = ProductSlug.VYMOD;
    const { orgId, vehicleId } = await seedOrgWithProduct(slug);
    await prisma.organizationProduct.updateMany({
      where: { organizationId: orgId, product: { slug } },
      data: { status: OrgProductStatus.SUSPENDED },
    });

    await expect(
      grants.grantExplicit({
        organizationId: orgId,
        vehicleId,
        productSlug: slug,
        grantedByUserId: adminId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});