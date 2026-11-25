/**
 * Product catalog status lifecycle (P2B) — disposable PostgreSQL.
 *
 * PRODUCT_CATALOG_P2B_POSTGRES_INTEGRATION=1
 * DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive_product_metadata_p1
 */
import { ConflictException } from '@nestjs/common';
import {
  ActivityEntity,
  OrgProductStatus,
  PrismaClient,
  ProductCatalogStatus,
  ProductSlug,
  UserPlatformRole,
  UserStatus,
  VehicleProductGrantStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { ProductsService } from './products.service';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { ProductCatalogAdmissionDeniedError } from './product-catalog-admission.authority';
import { VehicleProductGrantService } from './vehicle-product-grants/vehicle-product-grant.service';
import { defaultVehicleAccessModeForNewAssignment } from './organization-product-vehicle-access-defaults';
import { OrgProductPlan } from '@prisma/client';

const LIVE = process.env.PRODUCT_CATALOG_P2B_POSTGRES_INTEGRATION === '1';
const DISPOSABLE_DB_TOKEN = 'synqdrive_product_metadata_p1';

function assertDisposableDatabaseUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url || /production|staging|app\.synqdrive|srv1374778|hstgr\.cloud|mein-vps/i.test(url)) {
    throw new Error('PRODUCT_CATALOG_P2B_POSTGRES_INTEGRATION requires isolated DATABASE_URL');
  }
  if (!url.includes(DISPOSABLE_DB_TOKEN)) {
    throw new Error(`DATABASE_URL must reference disposable database "${DISPOSABLE_DB_TOKEN}"`);
  }
}

async function countAuditByCorrelationId(prisma: PrismaClient, correlationId: string): Promise<number> {
  return prisma.activityLog.count({
    where: {
      entity: ActivityEntity.ADMIN_OPERATION,
      metaJson: { path: ['correlationId'], equals: correlationId },
    },
  });
}

(LIVE ? describe : describe.skip)('Product catalog status lifecycle — postgres (P2B)', () => {
  const prisma = new PrismaClient();
  let products: ProductsService;
  let grants: VehicleProductGrantService;
  const seededMasterIds: string[] = [];
  const cleanupOrgIds: string[] = [];
  const catalogRestores: Array<{ slug: ProductSlug; catalogStatus: ProductCatalogStatus }> = [];

  beforeAll(() => {
    assertDisposableDatabaseUrl();
    const audit = new AuditService(prisma as never);
    const masterAdminAudit = new MasterAdminAuditService(audit);
    products = new ProductsService(prisma as never, masterAdminAudit);
    grants = new VehicleProductGrantService(prisma as never, masterAdminAudit);
  });

  afterAll(async () => {
    for (const orgId of cleanupOrgIds) {
      await prisma.organizationProduct.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
      await prisma.vehicleProductGrant.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
      await prisma.vehicle.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    }
    for (const restore of catalogRestores) {
      await prisma.product.update({
        where: { slug: restore.slug },
        data: { catalogStatus: restore.catalogStatus },
      });
    }
    if (seededMasterIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: seededMasterIds } } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function seedMasterAdmin(): Promise<string> {
    const suffix = Date.now();
    const id = `p2b-master-${suffix}`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${id},
        ${`p2b-${suffix}@test.example`},
        'P2B Master',
        ${UserStatus.ACTIVE}::"UserStatus",
        ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole",
        NOW(),
        NOW()
      )
    `;
    seededMasterIds.push(id);
    return id;
  }

  async function seedOrganization(): Promise<string> {
    const org = await prisma.organization.create({
      data: {
        companyName: `P2B Org ${Date.now()}`,
        businessType: 'RENTAL',
      },
    });
    cleanupOrgIds.push(org.id);
    return org.id;
  }

  async function rememberCatalog(slug: ProductSlug) {
    const row = await prisma.product.findUniqueOrThrow({ where: { slug } });
    if (!catalogRestores.some((r) => r.slug === slug)) {
      catalogRestores.push({ slug, catalogStatus: row.catalogStatus });
    }
  }

  async function ensureActive(slug: ProductSlug) {
    await rememberCatalog(slug);
    await prisma.product.update({ where: { slug }, data: { catalogStatus: ProductCatalogStatus.ACTIVE } });
  }

  it('ACTIVE → DISABLED succeeds with mandatory audit', async () => {
    const slug = ProductSlug.RENTAL;
    await ensureActive(slug);
    const adminId = await seedMasterAdmin();
    const correlationId = `p2b-disable-${Date.now()}`;

    const result = await products.updateProductCatalogStatusForMasterAdmin({
      productSlug: slug,
      patch: {
        catalogStatus: ProductCatalogStatus.DISABLED,
        ifCurrentCatalogStatus: ProductCatalogStatus.ACTIVE,
        changeReason: 'suspend new admissions',
      },
      actorUserId: adminId,
      audit: { correlationId },
    });

    expect(result.noop).toBe(false);
    expect(result.product.catalogStatus).toBe(ProductCatalogStatus.DISABLED);
    expect(await countAuditByCorrelationId(prisma, correlationId)).toBe(1);
  });

  it('DISABLED → ACTIVE succeeds', async () => {
    const slug = ProductSlug.FLEET;
    await rememberCatalog(slug);
    await prisma.product.update({ where: { slug }, data: { catalogStatus: ProductCatalogStatus.DISABLED } });
    const adminId = await seedMasterAdmin();
    const correlationId = `p2b-enable-${Date.now()}`;

    const result = await products.updateProductCatalogStatusForMasterAdmin({
      productSlug: slug,
      patch: {
        catalogStatus: ProductCatalogStatus.ACTIVE,
        ifCurrentCatalogStatus: ProductCatalogStatus.DISABLED,
        changeReason: 'restore admissions',
      },
      actorUserId: adminId,
      audit: { correlationId },
    });

    expect(result.product.catalogStatus).toBe(ProductCatalogStatus.ACTIVE);
    expect(await countAuditByCorrelationId(prisma, correlationId)).toBe(1);
  });

  it('rejects stale CAS with 409 and no audit', async () => {
    const slug = ProductSlug.VYMOD;
    await ensureActive(slug);
    const adminId = await seedMasterAdmin();
    const correlationId = `p2b-cas-${Date.now()}`;

    await expect(
      products.updateProductCatalogStatusForMasterAdmin({
        productSlug: slug,
        patch: {
          catalogStatus: ProductCatalogStatus.DISABLED,
          ifCurrentCatalogStatus: ProductCatalogStatus.DISABLED,
          changeReason: 'stale',
        },
        actorUserId: adminId,
        audit: { correlationId },
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(await countAuditByCorrelationId(prisma, correlationId)).toBe(0);
  });

  it('TAXI cannot be reactivated (DISABLED → ACTIVE)', async () => {
    const slug = ProductSlug.TAXI;
    const row = await prisma.product.findUnique({ where: { slug } });
    if (!row) {
      return;
    }
    await rememberCatalog(slug);
    await prisma.product.update({ where: { slug }, data: { catalogStatus: ProductCatalogStatus.DISABLED } });
    const adminId = await seedMasterAdmin();

    await expect(
      products.updateProductCatalogStatusForMasterAdmin({
        productSlug: slug,
        patch: {
          catalogStatus: ProductCatalogStatus.ACTIVE,
          ifCurrentCatalogStatus: ProductCatalogStatus.DISABLED,
          changeReason: 'must not apply',
        },
        actorUserId: adminId,
        audit: { correlationId: `p2b-taxi-${Date.now()}` },
      }),
    ).rejects.toThrow(/cannot be reactivated/);
  });

  it('audit failure rolls back catalog_status', async () => {
    const slug = ProductSlug.FLEET;
    await ensureActive(slug);
    const before = await prisma.product.findUniqueOrThrow({ where: { slug } });
    const correlationId = `p2b-audit-rollback-${Date.now()}`;

    await expect(
      products.updateProductCatalogStatusForMasterAdmin({
        productSlug: slug,
        patch: {
          catalogStatus: ProductCatalogStatus.DISABLED,
          ifCurrentCatalogStatus: ProductCatalogStatus.ACTIVE,
          changeReason: 'rollback test',
        },
        actorUserId: 'nonexistent-user-id-for-fk-violation',
        audit: { correlationId },
      }),
    ).rejects.toBeDefined();

    const after = await prisma.product.findUniqueOrThrow({ where: { slug } });
    expect(after.catalogStatus).toBe(before.catalogStatus);
    expect(await countAuditByCorrelationId(prisma, correlationId)).toBe(0);
  });

  it('preserves existing organization products and grants when disabling', async () => {
    const slug = ProductSlug.FLEET;
    await ensureActive(slug);
    const orgId = await seedOrganization();
    const adminId = await seedMasterAdmin();
    const product = await prisma.product.findUniqueOrThrow({ where: { slug } });
    const op = await prisma.organizationProduct.create({
      data: {
        organizationId: orgId,
        productId: product.id,
        status: OrgProductStatus.SUSPENDED,
        plan: OrgProductPlan.STARTER,
        vehicleAccessMode: defaultVehicleAccessModeForNewAssignment(slug),
        activatedAt: new Date(),
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        vin: `VIN-P2B-${Date.now()}`,
        make: 'Test',
        model: 'P2B',
        year: 2025,
        fuelType: 'ELECTRIC',
        licensePlate: `P2B-${Date.now()}`,
        status: 'AVAILABLE',
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      },
    });
    await prisma.vehicleProductGrant.create({
      data: {
        organizationId: orgId,
        vehicleId: vehicle.id,
        productSlug: slug,
        status: VehicleProductGrantStatus.ACTIVE,
        grantedByUserId: adminId,
      },
    });

    await products.updateProductCatalogStatusForMasterAdmin({
      productSlug: slug,
      patch: {
        catalogStatus: ProductCatalogStatus.DISABLED,
        ifCurrentCatalogStatus: ProductCatalogStatus.ACTIVE,
        changeReason: 'preserve entitlements',
      },
      actorUserId: adminId,
      audit: { correlationId: `p2b-preserve-${Date.now()}` },
    });

    const opAfter = await prisma.organizationProduct.findUniqueOrThrow({ where: { id: op.id } });
    expect(opAfter.status).toBe(OrgProductStatus.SUSPENDED);
    const grantCount = await prisma.vehicleProductGrant.count({
      where: { organizationId: orgId, productSlug: slug, status: VehicleProductGrantStatus.ACTIVE },
    });
    expect(grantCount).toBe(1);
  });

  it('re-enable catalog does not auto-reactivate suspended organization products', async () => {
    const slug = ProductSlug.VYMOD;
    await rememberCatalog(slug);
    const orgId = await seedOrganization();
    const adminId = await seedMasterAdmin();
    const product = await prisma.product.findUniqueOrThrow({ where: { slug } });

    const op = await prisma.organizationProduct.create({
      data: {
        organizationId: orgId,
        productId: product.id,
        status: OrgProductStatus.SUSPENDED,
        plan: OrgProductPlan.STARTER,
        vehicleAccessMode: defaultVehicleAccessModeForNewAssignment(slug),
        activatedAt: new Date(),
      },
    });

    await products.updateProductCatalogStatusForMasterAdmin({
      productSlug: slug,
      patch: {
        catalogStatus: ProductCatalogStatus.DISABLED,
        ifCurrentCatalogStatus: ProductCatalogStatus.ACTIVE,
        changeReason: 'phase 1',
      },
      actorUserId: adminId,
      audit: { correlationId: `p2b-sus-1-${Date.now()}` },
    });

    await products.updateProductCatalogStatusForMasterAdmin({
      productSlug: slug,
      patch: {
        catalogStatus: ProductCatalogStatus.ACTIVE,
        ifCurrentCatalogStatus: ProductCatalogStatus.DISABLED,
        changeReason: 'phase 2',
      },
      actorUserId: adminId,
      audit: { correlationId: `p2b-sus-2-${Date.now()}` },
    });

    const opAfter = await prisma.organizationProduct.findUniqueOrThrow({ where: { id: op.id } });
    expect(opAfter.status).toBe(OrgProductStatus.SUSPENDED);
  });

  it('noop transition does not write audit', async () => {
    const slug = ProductSlug.RENTAL;
    await ensureActive(slug);
    const adminId = await seedMasterAdmin();
    const correlationId = `p2b-noop-${Date.now()}`;

    const result = await products.updateProductCatalogStatusForMasterAdmin({
      productSlug: slug,
      patch: {
        catalogStatus: ProductCatalogStatus.ACTIVE,
        ifCurrentCatalogStatus: ProductCatalogStatus.ACTIVE,
        changeReason: 'no actual change',
      },
      actorUserId: adminId,
      audit: { correlationId },
    });

    expect(result.noop).toBe(true);
    expect(await countAuditByCorrelationId(prisma, correlationId)).toBe(0);
  });

  it('disable blocks subsequent new admission', async () => {
    const slug = ProductSlug.FLEET;
    await ensureActive(slug);
    const orgId = await seedOrganization();
    const adminId = await seedMasterAdmin();

    await products.updateProductCatalogStatusForMasterAdmin({
      productSlug: slug,
      patch: {
        catalogStatus: ProductCatalogStatus.DISABLED,
        ifCurrentCatalogStatus: ProductCatalogStatus.ACTIVE,
        changeReason: 'stop assign',
      },
      actorUserId: adminId,
      audit: { correlationId: `p2b-deny-${Date.now()}` },
    });

    await expect(products.assignProduct(orgId, slug)).rejects.toBeInstanceOf(
      ProductCatalogAdmissionDeniedError,
    );
  });

  it('impact preview is authoritative for current catalog status', async () => {
    const slug = ProductSlug.RENTAL;
    await ensureActive(slug);
    const impact = await products.getProductCatalogStatusImpact(
      slug,
      ProductCatalogStatus.DISABLED,
    );
    expect(impact.currentCatalogStatus).toBe(ProductCatalogStatus.ACTIVE);
    expect(impact.requestedTargetCatalogStatus).toBe(ProductCatalogStatus.DISABLED);
    expect(impact.admissionAfterTarget.newOrganizationProductAssignments).toBe('BLOCKED');
    expect(impact.guarantees.existingOrganizationProductsPreserved).toBe(true);
    expect(impact.previewMayBeStaleBeforeWrite).toBe(true);
  });

  it('serializes concurrent status disable with admission under products-row lock', async () => {
    const slug = ProductSlug.VYMOD;
    await ensureActive(slug);
    const orgId = await seedOrganization();
    const adminId = await seedMasterAdmin();

    const disableDone = products.updateProductCatalogStatusForMasterAdmin({
      productSlug: slug,
      patch: {
        catalogStatus: ProductCatalogStatus.DISABLED,
        ifCurrentCatalogStatus: ProductCatalogStatus.ACTIVE,
        changeReason: 'race disable',
      },
      actorUserId: adminId,
      audit: { correlationId: `p2b-race-disable-${Date.now()}` },
    });

    await expect(products.assignProduct(orgId, slug)).rejects.toBeDefined();

    const result = await disableDone;
    expect(result.product.catalogStatus).toBe(ProductCatalogStatus.DISABLED);

    await expect(products.assignProduct(orgId, slug)).rejects.toBeInstanceOf(
      ProductCatalogAdmissionDeniedError,
    );
  });
});