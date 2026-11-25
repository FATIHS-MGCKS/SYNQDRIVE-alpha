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
import {
  ProductCatalogAdmissionDeniedError,
  lockProductCatalogRowBySlug,
} from './product-catalog-admission.authority';
import { VehicleProductGrantService } from './vehicle-product-grants/vehicle-product-grant.service';
import { defaultVehicleAccessModeForNewAssignment } from './organization-product-vehicle-access-defaults';
import { EntitlementsQueryService } from './entitlements/entitlements-query.service';

const LIVE = process.env.PRODUCT_CATALOG_P2A_POSTGRES_INTEGRATION === '1';
const DISPOSABLE_DB_TOKEN = 'synqdrive_product_metadata_p1';

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

  describe('catalog admission vs catalog_status concurrency (P2A seal)', () => {
    const CONCURRENCY_SLUG = ProductSlug.VYMOD;
    let prismaPeer: PrismaClient;

    beforeAll(() => {
      prismaPeer = new PrismaClient();
    });

    afterAll(async () => {
      await prismaPeer.$disconnect();
    });

    async function snapshotCatalog(slug: ProductSlug): Promise<ProductCatalogStatus> {
      const row = await prisma.product.findUniqueOrThrow({ where: { slug } });
      return row.catalogStatus;
    }

    it('holds products-row FOR UPDATE through org-product create; competing DISABLED waits', async () => {
      const orgId = await seedOrganization();
      const catalogProduct = await prisma.product.findUniqueOrThrow({ where: { slug: CONCURRENCY_SLUG } });
      await setCatalogStatus(CONCURRENCY_SLUG, ProductCatalogStatus.ACTIVE);

      const admissionLocked = createDeferred();
      const releaseAdmissionCreate = createDeferred();
      const disableAttemptedForUpdate = createDeferred();
      const disableFinished = createDeferred<{ status: 'ok' | 'failed'; error?: unknown }>();

      const admissionTx = prisma.$transaction(
        async (tx) => {
          const locked = await lockProductCatalogRowBySlug(tx, CONCURRENCY_SLUG);
          expect(locked?.catalogStatus).toBe(ProductCatalogStatus.ACTIVE);
          admissionLocked.resolve();
          await releaseAdmissionCreate.promise;
          await tx.organizationProduct.create({
            data: {
              organizationId: orgId,
              productId: catalogProduct.id,
              plan: OrgProductPlan.STARTER,
              status: OrgProductStatus.ACTIVE,
              vehicleAccessMode: defaultVehicleAccessModeForNewAssignment(CONCURRENCY_SLUG),
              activatedAt: new Date(),
            },
          });
        },
        { timeout: 120_000 },
      );

      await admissionLocked.promise;

      const disableTx = prismaPeer
        .$transaction(
          async (tx) => {
            disableAttemptedForUpdate.resolve();
            await tx.$queryRaw`SELECT id FROM products WHERE slug = ${CONCURRENCY_SLUG}::"ProductSlug" FOR UPDATE`;
            await tx.product.update({
              where: { slug: CONCURRENCY_SLUG },
              data: { catalogStatus: ProductCatalogStatus.DISABLED },
            });
          },
          { timeout: 120_000 },
        )
        .then(
          () => disableFinished.resolve({ status: 'ok' }),
          (error) => disableFinished.resolve({ status: 'failed', error }),
        );

      await disableAttemptedForUpdate.promise;
      let disableSettledEarly = false;
      void disableTx.finally(() => {
        disableSettledEarly = true;
      });
      for (let spin = 0; spin < 30 && !disableSettledEarly; spin += 1) {
        await new Promise((r) => setImmediate(r));
      }
      expect(disableSettledEarly).toBe(false);

      releaseAdmissionCreate.resolve();
      await admissionTx;
      const disableResult = await disableFinished.promise;
      expect(disableResult.status).toBe('ok');

      const orgProduct = await prisma.organizationProduct.findFirst({
        where: { organizationId: orgId, productId: catalogProduct.id },
      });
      expect(orgProduct?.status).toBe(OrgProductStatus.ACTIVE);
      expect(await snapshotCatalog(CONCURRENCY_SLUG)).toBe(ProductCatalogStatus.DISABLED);

      await setCatalogStatus(CONCURRENCY_SLUG, ProductCatalogStatus.ACTIVE);
    });

    it('denies admission when DISABLED is committed before admission obtains the row lock', async () => {
      const orgId = await seedOrganization();
      const adminId = await seedMasterAdmin();
      await setCatalogStatus(CONCURRENCY_SLUG, ProductCatalogStatus.ACTIVE);

      await prismaPeer.$transaction(async (tx) => {
        const locked = await lockProductCatalogRowBySlug(tx, CONCURRENCY_SLUG);
        expect(locked).not.toBeNull();
        await tx.product.update({
          where: { slug: CONCURRENCY_SLUG },
          data: { catalogStatus: ProductCatalogStatus.DISABLED },
        });
      });

      expect(await snapshotCatalog(CONCURRENCY_SLUG)).toBe(ProductCatalogStatus.DISABLED);

      await expect(
        products.assignProductForMasterAdmin({
          orgId,
          productSlug: CONCURRENCY_SLUG,
          actorUserId: adminId,
        }),
      ).rejects.toBeInstanceOf(ProductCatalogAdmissionDeniedError);

      expect(
        await prisma.organizationProduct.count({
          where: { organizationId: orgId, productId: (await prisma.product.findUniqueOrThrow({ where: { slug: CONCURRENCY_SLUG } })).id },
        }),
      ).toBe(0);

      await setCatalogStatus(CONCURRENCY_SLUG, ProductCatalogStatus.ACTIVE);
    });

    it('preserves admitted OrganizationProduct when DISABLED follows successful admission', async () => {
      const orgId = await seedOrganization();
      const adminId = await seedMasterAdmin();
      await setCatalogStatus(CONCURRENCY_SLUG, ProductCatalogStatus.ACTIVE);

      const admitted = await products.assignProductForMasterAdmin({
        orgId,
        productSlug: CONCURRENCY_SLUG,
        actorUserId: adminId,
      });
      expect(admitted.status).toBe(OrgProductStatus.ACTIVE);

      await prismaPeer.product.update({
        where: { slug: CONCURRENCY_SLUG },
        data: { catalogStatus: ProductCatalogStatus.DISABLED },
      });

      const row = await prisma.organizationProduct.findFirstOrThrow({
        where: { organizationId: orgId, product: { slug: CONCURRENCY_SLUG } },
      });
      expect(row.status).toBe(OrgProductStatus.ACTIVE);
      expect(row.id).toBe(admitted.id);
      expect(await snapshotCatalog(CONCURRENCY_SLUG)).toBe(ProductCatalogStatus.DISABLED);

      const entitlement = await entitlements.getForOrganizationProduct(orgId, CONCURRENCY_SLUG);
      expect(entitlement.capabilities.canAccessProductUi).toBe(true);

      await setCatalogStatus(CONCURRENCY_SLUG, ProductCatalogStatus.ACTIVE);
    });

    it('TAXI retired policy is evaluated before catalog admission lock acquisition', async () => {
      const orgId = await seedOrganization();
      await expect(products.assignProduct(orgId, ProductSlug.TAXI)).rejects.toThrow(/retired/);
      expect(
        await prisma.organizationProduct.count({
          where: { organizationId: orgId, product: { slug: ProductSlug.TAXI } },
        }),
      ).toBe(0);
    });
  });
});