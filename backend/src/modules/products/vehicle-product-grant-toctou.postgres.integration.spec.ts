/**
 * Vehicle grant TOCTOU — disposable Postgres security regression (post-P2 remediation).
 *
 * VEHICLE_PRODUCT_GRANT_TOCTOU_POSTGRES_INTEGRATION=1
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

(LIVE ? describe : describe.skip)('Vehicle product grant TOCTOU — postgres regression', () => {
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

  it('A: existing ACTIVE grant preserved when org product is suspended after grant', async () => {
    const slug = ProductSlug.RENTAL;
    const adminId = await seedMasterAdmin();
    const { orgId, vehicleId } = await seedOrgWithProduct(slug);

    const grant = await grants.grantExplicit({
      organizationId: orgId,
      vehicleId,
      productSlug: slug,
      grantedByUserId: adminId,
    });
    expect(grant.status).toBe(VehicleProductGrantStatus.ACTIVE);

    await prisma.organizationProduct.updateMany({
      where: { organizationId: orgId, product: { slug } },
      data: { status: OrgProductStatus.SUSPENDED },
    });

    const persisted = await prisma.vehicleProductGrant.findFirst({
      where: { organizationId: orgId, vehicleId, productSlug: slug },
    });
    expect(persisted?.status).toBe(VehicleProductGrantStatus.ACTIVE);
    expect(persisted?.id).toBe(grant.id);
  });

  it('B: suspension committed before grant mutation denies new grant (no ACTIVE row)', async () => {
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
        observedLockOrder.push('org_product_suspended_before_inner_tx');
        return originalTransaction(fn as Parameters<typeof originalTransaction>[0], opts);
      }) as typeof prisma.$transaction;

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
      expect(observedLockOrder).toEqual([
        'grant_tx_entered',
        'org_product_suspended_before_inner_tx',
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

  it('D: vehicle lifecycle change before grant commit denies new grant', async () => {
    const slug = ProductSlug.FLEET;
    const adminId = await seedMasterAdmin();
    const { orgId, vehicleId } = await seedOrgWithProduct(slug);

    const originalTransaction = prisma.$transaction.bind(prisma);
    const grantPrisma = prisma as PrismaClient & { $transaction: typeof prisma.$transaction };
    try {
      grantPrisma.$transaction = (async (
        fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
        opts?: Parameters<PrismaClient['$transaction']>[1],
      ) => {
        await prisma.vehicle.update({
          where: { id: vehicleId },
          data: { registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED },
        });
        return originalTransaction(fn as Parameters<typeof originalTransaction>[0], opts);
      }) as typeof prisma.$transaction;

      await expect(
        grants.grantExplicit({
          organizationId: orgId,
          vehicleId,
          productSlug: slug,
          grantedByUserId: adminId,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(
        await prisma.vehicleProductGrant.count({
          where: { organizationId: orgId, vehicleId, productSlug: slug },
        }),
      ).toBe(0);
    } finally {
      grantPrisma.$transaction = originalTransaction;
    }
  });

  it('E: catalog DISABLED blocks new grant (P2A admission inside tx)', async () => {
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

  it('F: concurrent first-time grants yield one ACTIVE row (no duplicate transition)', async () => {
    const slug = ProductSlug.RENTAL;
    const adminId = await seedMasterAdmin();
    const { orgId, vehicleId } = await seedOrgWithProduct(slug);

    const [a, b] = await Promise.all([
      grants.grantExplicit({
        organizationId: orgId,
        vehicleId,
        productSlug: slug,
        grantedByUserId: adminId,
      }),
      grants.grantExplicit({
        organizationId: orgId,
        vehicleId,
        productSlug: slug,
        grantedByUserId: adminId,
      }),
    ]);

    expect(a.id).toBe(b.id);
    expect(a.grantVersion).toBe(1);
    expect(a.status).toBe(VehicleProductGrantStatus.ACTIVE);
    expect(
      await prisma.vehicleProductGrant.count({
        where: { organizationId: orgId, vehicleId, productSlug: slug },
      }),
    ).toBe(1);
  });
});