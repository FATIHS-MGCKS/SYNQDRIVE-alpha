/**
 * Vehicle grant TOCTOU review — disposable Postgres concurrency probes.
 *
 * VEHICLE_PRODUCT_GRANT_TOCTOU_POSTGRES_INTEGRATION=1
 *
 * Test-data lifecycle: orgs/vehicles/grants use isolated ids; `activity_logs` is never
 * deleted (append-only). Disposable CI drops the whole database after the gate.
 */
import { ForbiddenException } from '@nestjs/common';
import {
  OrgProductPlan,
  OrgProductStatus,
  Prisma,
  PrismaClient,
  ProductCatalogStatus,
  ProductSlug,
  UserPlatformRole,
  UserStatus,
  VehicleProductGrantStatus,
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
  const masterIds: string[] = [];

  beforeAll(() => {
    assertProductCatalogV2DisposablePostgres(OPT_IN);
    grants = new VehicleProductGrantService(prisma as unknown as PrismaService, audit);
  });

  afterAll(async () => {
    for (const orgId of orgIds) {
      await prisma.vehicleProductGrant.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
      await prisma.vehicle.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
      await prisma.organizationProduct.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
    }
    if (masterIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: masterIds } } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function seedMasterAdmin(): Promise<string> {
    const adminId = `toctou-master-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    masterIds.push(adminId);
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${adminId},
        ${`toctou-${adminId}@test.example`},
        'TOCTOU Master',
        ${UserStatus.ACTIVE}::"UserStatus",
        ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole",
        NOW(),
        NOW()
      )
    `;
    return adminId;
  }

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

  it('blocks NEW grant when catalog admission is disabled inside the grant transaction', async () => {
    const slug = ProductSlug.FLEET;
    await prisma.product.update({
      where: { slug },
      data: { catalogStatus: ProductCatalogStatus.DISABLED },
    });
    const adminId = await seedMasterAdmin();
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

  it('B: org suspension after precheck but before grant tx may persist ACTIVE grant (deterministic)', async () => {
    const slug = ProductSlug.RENTAL;
    await prisma.product.update({
      where: { slug },
      data: { catalogStatus: ProductCatalogStatus.ACTIVE },
    });
    const adminId = await seedMasterAdmin();
    const { orgId, vehicleId } = await seedOrgWithProduct(slug);

    const originalTransaction = prisma.$transaction.bind(prisma);
    const grantPrisma = prisma as PrismaClient & {
      $transaction: typeof prisma.$transaction;
    };
    let observedLockOrder: string[] = [];
    try {
      grantPrisma.$transaction = (async (
        fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
        opts?: Parameters<PrismaClient['$transaction']>[1],
      ) => {
        observedLockOrder.push('grant_tx_entered');
        await prisma.organizationProduct.updateMany({
          where: { organizationId: orgId, product: { slug } },
          data: { status: OrgProductStatus.SUSPENDED },
        });
        observedLockOrder.push('org_product_suspended_before_grant_mutation');
        return originalTransaction(fn as Parameters<typeof originalTransaction>[0], opts);
      }) as typeof prisma.$transaction;

      const grant = await grants.grantExplicit({
        organizationId: orgId,
        vehicleId,
        productSlug: slug,
        grantedByUserId: adminId,
        audit: { correlationId: `toctou-b-${Date.now()}` },
      });

      const op = await prisma.organizationProduct.findFirst({
        where: { organizationId: orgId, product: { slug } },
      });
      expect(op?.status).toBe(OrgProductStatus.SUSPENDED);
      expect(grant.status).toBe(VehicleProductGrantStatus.ACTIVE);
      expect(observedLockOrder).toEqual([
        'grant_tx_entered',
        'org_product_suspended_before_grant_mutation',
      ]);
    } finally {
      grantPrisma.$transaction = originalTransaction;
    }
  });

  it('C: rejects grant when organization product is suspended before call', async () => {
    const slug = ProductSlug.VYMOD;
    const adminId = await seedMasterAdmin();
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

    const grantsCount = await prisma.vehicleProductGrant.count({
      where: { organizationId: orgId, vehicleId, productSlug: slug },
    });
    expect(grantsCount).toBe(0);
  });
});