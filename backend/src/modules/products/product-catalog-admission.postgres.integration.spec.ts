/**
 * Product catalog admission enforcement (P2A) — disposable PostgreSQL.
 *
 * PRODUCT_CATALOG_P2A_POSTGRES_INTEGRATION=1
 * DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive_product_metadata_p1
 */
import { randomUUID } from 'node:crypto';
import {
  OrganizationProductVehicleAccessMode,
  OrgProductPlan,
  OrgProductStatus,
  PrismaClient,
  ProductCatalogStatus,
  ProductSlug,
  UserPlatformRole,
  UserStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { ProductsService } from './products.service';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { ProductCatalogAdmissionDeniedError } from './product-catalog-admission.authority';
import { VehicleProductGrantService } from './vehicle-product-grants/vehicle-product-grant.service';
import { defaultVehicleAccessModeForNewAssignment } from './organization-product-vehicle-access-defaults';
import { EntitlementsQueryService } from './entitlements/entitlements-query.service';

const LIVE = process.env.PRODUCT_CATALOG_P2A_POSTGRES_INTEGRATION === '1';
const DISPOSABLE_DB_TOKEN = 'synqdrive_product_metadata_p1';

function assertDisposableDatabaseUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url || /production|staging|app\.synqdrive|srv1374778|hstgr\.cloud|mein-vps/i.test(url)) {
    throw new Error('PRODUCT_CATALOG_P2A_POSTGRES_INTEGRATION requires isolated DATABASE_URL');
  }
  if (!url.includes(DISPOSABLE_DB_TOKEN)) {
    throw new Error(`DATABASE_URL must reference disposable database "${DISPOSABLE_DB_TOKEN}"`);
  }
}

(LIVE ? describe : describe.skip)('Product catalog admission — postgres (P2A)', () => {
  const prisma = new PrismaClient();
  let products: ProductsService;
  let grants: VehicleProductGrantService;
  let entitlements: EntitlementsQueryService;

  const cleanupOrgIds: string[] = [];
  const seededMasterIds: string[] = [];
  const catalogRestores: Array<{ slug: ProductSlug; catalogStatus: ProductCatalogStatus }> = [];

  beforeAll(() => {
    assertDisposableDatabaseUrl();
    const audit = new AuditService(prisma as never);
    const masterAdminAudit = new MasterAdminAuditService(audit);
    products = new ProductsService(prisma as never, masterAdminAudit);
    grants = new VehicleProductGrantService(prisma as never, masterAdminAudit);
    entitlements = new EntitlementsQueryService(prisma as never);
  });

  afterAll(async () => {
    for (const orgId of cleanupOrgIds) {
      await prisma.organizationProduct.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
      await prisma.vehicleProductGrant.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
      await prisma.vehicle.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    }
    for (const restore of catalogRestores) {
      await prisma.product
        .update({ where: { slug: restore.slug }, data: { catalogStatus: restore.catalogStatus } })
        .catch(() => undefined);
    }
    if (seededMasterIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: seededMasterIds } } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function seedOrganization(): Promise<string> {
    const org = await prisma.organization.create({
      data: {
        companyName: `P2A Org ${Date.now()}`,
        businessType: 'RENTAL',
      },
    });
    cleanupOrgIds.push(org.id);
    return org.id;
  }

  async function seedMasterAdmin(): Promise<string> {
    const suffix = Date.now();
    const id = `p2a-admin-${suffix}`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${id},
        ${`p2a-${suffix}@test.example`},
        'P2A Master',
        ${UserStatus.ACTIVE}::"UserStatus",
        ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole",
        NOW(),
        NOW()
      )
    `;
    seededMasterIds.push(id);
    return id;
  }

  async function setCatalogStatus(slug: ProductSlug, status: ProductCatalogStatus) {
    const before = await prisma.product.findUniqueOrThrow({ where: { slug } });
    if (!catalogRestores.some((r) => r.slug === slug)) {
      catalogRestores.push({ slug, catalogStatus: before.catalogStatus });
    }
    await prisma.product.update({ where: { slug }, data: { catalogStatus: status } });
  }

  it('allows new organization assignment when catalog ACTIVE', async () => {
    const orgId = await seedOrganization();
    const adminId = await seedMasterAdmin();
    await setCatalogStatus(ProductSlug.FLEET, ProductCatalogStatus.ACTIVE);

    const row = await products.assignProductForMasterAdmin({
      orgId,
      productSlug: ProductSlug.FLEET,
      actorUserId: adminId,
    });

    expect(row.status).toBe(OrgProductStatus.ACTIVE);
  });

  it('denies new assignment when catalog DISABLED', async () => {
    const orgId = await seedOrganization();
    const adminId = await seedMasterAdmin();
    await setCatalogStatus(ProductSlug.FLEET, ProductCatalogStatus.DISABLED);

    await expect(
      products.assignProductForMasterAdmin({
        orgId,
        productSlug: ProductSlug.FLEET,
        actorUserId: adminId,
      }),
    ).rejects.toBeInstanceOf(ProductCatalogAdmissionDeniedError);

    const links = await prisma.organizationProduct.count({
      where: { organizationId: orgId, product: { slug: ProductSlug.FLEET } },
    });
    expect(links).toBe(0);
  });

  it('denies reactivation when catalog DISABLED but preserves suspended row', async () => {
    const orgId = await seedOrganization();
    const adminId = await seedMasterAdmin();
    const product = await prisma.product.findUniqueOrThrow({ where: { slug: ProductSlug.FLEET } });

    await prisma.organizationProduct.create({
      data: {
        organizationId: orgId,
        productId: product.id,
        plan: OrgProductPlan.STARTER,
        status: OrgProductStatus.SUSPENDED,
        vehicleAccessMode: defaultVehicleAccessModeForNewAssignment(ProductSlug.FLEET),
      },
    });

    await setCatalogStatus(ProductSlug.FLEET, ProductCatalogStatus.DISABLED);

    await expect(
      products.assignProductForMasterAdmin({
        orgId,
        productSlug: ProductSlug.FLEET,
        actorUserId: adminId,
      }),
    ).rejects.toBeInstanceOf(ProductCatalogAdmissionDeniedError);

    const row = await prisma.organizationProduct.findFirstOrThrow({
      where: { organizationId: orgId, productId: product.id },
    });
    expect(row.status).toBe(OrgProductStatus.SUSPENDED);
  });

  it('preserves existing ACTIVE entitlement when catalog DISABLED (plan change allowed)', async () => {
    const orgId = await seedOrganization();
    const adminId = await seedMasterAdmin();
    const product = await prisma.product.findUniqueOrThrow({ where: { slug: ProductSlug.FLEET } });

    await prisma.organizationProduct.create({
      data: {
        organizationId: orgId,
        productId: product.id,
        plan: OrgProductPlan.STARTER,
        status: OrgProductStatus.ACTIVE,
        vehicleAccessMode: defaultVehicleAccessModeForNewAssignment(ProductSlug.FLEET),
        activatedAt: new Date(),
      },
    });

    await setCatalogStatus(ProductSlug.FLEET, ProductCatalogStatus.DISABLED);

    const updated = await products.assignProductForMasterAdmin({
      orgId,
      productSlug: ProductSlug.FLEET,
      plan: OrgProductPlan.BUSINESS,
      actorUserId: adminId,
    });

    expect(updated.status).toBe(OrgProductStatus.ACTIVE);
    expect(updated.plan).toBe(OrgProductPlan.BUSINESS);

    const entitlement = await entitlements.getForOrganizationProduct(orgId, ProductSlug.FLEET);
    expect(entitlement.capabilities.canAccessProductUi).toBe(true);
  });

  it('denies new vehicle grant when catalog DISABLED', async () => {
    const orgId = await seedOrganization();
    const adminId = await seedMasterAdmin();
    const product = await prisma.product.findUniqueOrThrow({ where: { slug: ProductSlug.FLEET } });

    await prisma.organizationProduct.create({
      data: {
        organizationId: orgId,
        productId: product.id,
        status: OrgProductStatus.ACTIVE,
        plan: OrgProductPlan.STARTER,
        vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
        activatedAt: new Date(),
      },
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        vin: `VIN-P2A-${Date.now()}`,
        make: 'Test',
        model: 'P2A',
        year: 2025,
        fuelType: 'ELECTRIC',
        licensePlate: `P2A-${Date.now()}`,
        status: 'AVAILABLE',
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      },
    });
    const vehicleId = vehicle.id;

    await setCatalogStatus(ProductSlug.FLEET, ProductCatalogStatus.DISABLED);

    await expect(
      grants.grantExplicit({
        organizationId: orgId,
        vehicleId,
        productSlug: ProductSlug.FLEET,
        grantedByUserId: adminId,
      }),
    ).rejects.toBeInstanceOf(ProductCatalogAdmissionDeniedError);

    expect(await grants.hasActiveGrant(orgId, vehicleId, ProductSlug.FLEET)).toBe(false);
  });

  it('legacy assignProduct denies new admission when catalog DISABLED', async () => {
    const orgId = await seedOrganization();
    await setCatalogStatus(ProductSlug.RENTAL, ProductCatalogStatus.DISABLED);

    await expect(products.assignProduct(orgId, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      ProductCatalogAdmissionDeniedError,
    );
  });
});