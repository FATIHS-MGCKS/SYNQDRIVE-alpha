/**
 * Product Catalog V2 — Master Admin HTTP acceptance (real service + disposable Postgres).
 *
 * PRODUCT_CATALOG_V2_ACCEPTANCE_HTTP_POSTGRES_INTEGRATION=1
 * DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive_product_metadata_p1
 *
 * Test-data lifecycle:
 * - Isolated org/user ids per run; catalog rows restored after tests.
 * - `activity_logs` is append-only — never UPDATE/DELETE audit rows or disable triggers.
 * - Best-effort cleanup of grants/vehicles/org_products only; org rows and audit evidence may
 *   remain until CI drops disposable DB `synqdrive_product_metadata_p1`.
 */
import {
  ActivityEntity,
  OrgProductPlan,
  OrgProductStatus,
  PrismaClient,
  ProductCatalogStatus,
  ProductSlug,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import * as request from 'supertest';
import { MFA_ERROR } from '@modules/iam-mfa/iam-mfa.policy';
import { installMfaEnforcedEnvForSuite } from '@shared/auth/testing/master-admin-mfa-http.integration.harness';
import { PRODUCT_CATALOG_ADMISSION_DENIAL_REASON } from './product-catalog-admission.authority';
import { defaultVehicleAccessModeForNewAssignment } from './organization-product-vehicle-access-defaults';
import { assertProductCatalogV2DisposablePostgres } from './testing/product-catalog-v2-disposable-postgres-preflight';
import {
  createProductCatalogV2HttpHarness,
  MASTER_BEARER,
  MEMBER_BEARER,
  VALID_STEP_UP,
  type ProductCatalogV2HttpHarness,
} from './testing/product-catalog-v2-http-nest.harness';

const LIVE = process.env.PRODUCT_CATALOG_V2_ACCEPTANCE_HTTP_POSTGRES_INTEGRATION === '1';
const OPT_IN = 'PRODUCT_CATALOG_V2_ACCEPTANCE_HTTP_POSTGRES_INTEGRATION';

async function countCatalogStatusAuditRows(
  prisma: PrismaClient,
  productId: string,
): Promise<number> {
  return prisma.activityLog.count({
    where: {
      entity: ActivityEntity.ADMIN_OPERATION,
      entityId: productId,
      metaJson: { path: ['action'], equals: 'catalog_status_patch' },
    },
  });
}

(LIVE ? describe : describe.skip)('Product Catalog V2 — HTTP acceptance (postgres)', () => {
  const prisma = new PrismaClient();
  let harness: ProductCatalogV2HttpHarness;
  const catalogRestores: Array<{ slug: ProductSlug; catalogStatus: ProductCatalogStatus }> = [];
  const cleanupOrgIds: string[] = [];
  const seededMasterId = 'master-admin-1';

  installMfaEnforcedEnvForSuite();

  beforeAll(async () => {
    assertProductCatalogV2DisposablePostgres(OPT_IN);
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${seededMasterId},
        'catalog-v2-http@synqdrive.test',
        'Catalog V2 HTTP',
        ${UserStatus.ACTIVE}::"UserStatus",
        ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole",
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.userMfaFactor
      .create({
        data: {
          userId: seededMasterId,
          factorType: 'TOTP',
          encryptedSecret: 'test',
          enabledAt: new Date(),
        },
      })
      .catch(() => undefined);
    harness = await createProductCatalogV2HttpHarness(prisma);
  });

  afterAll(async () => {
    for (const restore of catalogRestores) {
      await prisma.product.update({
        where: { slug: restore.slug },
        data: { catalogStatus: restore.catalogStatus },
      });
    }
    for (const orgId of cleanupOrgIds) {
      await prisma.vehicleProductGrant.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
      await prisma.vehicle.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
      await prisma.organizationProduct.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
    }
    await prisma.userMfaFactor.deleteMany({ where: { userId: seededMasterId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: seededMasterId } }).catch(() => undefined);
    await harness.app.close();
    await prisma.$disconnect();
  });

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

  async function seedOrganization(): Promise<string> {
    const org = await prisma.organization.create({
      data: { companyName: `V2 HTTP Org ${Date.now()}`, businessType: 'RENTAL' },
    });
    cleanupOrgIds.push(org.id);
    return org.id;
  }

  const authHeaders = {
    Authorization: MASTER_BEARER,
    'x-step-up-token': VALID_STEP_UP,
  };

  it('lists catalog products over HTTP', async () => {
    const res = await request(harness.app.getHttpServer())
      .get('/api/v1/admin/products')
      .set('Authorization', MASTER_BEARER)
      .expect(200);
    const slugs = (res.body as { slug: string }[]).map((r) => r.slug);
    expect(slugs).toEqual(expect.arrayContaining([ProductSlug.RENTAL, ProductSlug.FLEET, ProductSlug.VYMOD]));
  });

  it('reads catalog product detail', async () => {
    await ensureActive(ProductSlug.RENTAL);
    const res = await request(harness.app.getHttpServer())
      .get('/api/v1/admin/products/RENTAL')
      .set('Authorization', MASTER_BEARER)
      .expect(200);
    expect(res.body.slug).toBe(ProductSlug.RENTAL);
    expect(res.body.catalogStatus).toBe(ProductCatalogStatus.ACTIVE);
  });

  it('persists metadata patch with MFA step-up', async () => {
    const slug = ProductSlug.FLEET;
    await ensureActive(slug);
    const before = await prisma.product.findUniqueOrThrow({ where: { slug } });
  const name = `Fleet V2 ${Date.now()}`;

    await request(harness.app.getHttpServer())
      .patch(`/api/v1/admin/products/${slug}`)
      .set(authHeaders)
      .send({
        name,
        description: before.description,
        ifCurrentName: before.name,
        ifCurrentDescription: before.description,
      })
      .expect(200);

    const after = await prisma.product.findUniqueOrThrow({ where: { slug } });
    expect(after.name).toBe(name);
  });

  it('returns HTTP 409 on stale metadata CAS', async () => {
    const slug = ProductSlug.VYMOD;
    await ensureActive(slug);
    const row = await prisma.product.findUniqueOrThrow({ where: { slug } });
    const res = await request(harness.app.getHttpServer())
      .patch(`/api/v1/admin/products/${slug}`)
      .set(authHeaders)
      .send({
        name: 'Stale',
        description: row.description,
        ifCurrentName: 'intentionally-wrong-name',
        ifCurrentDescription: row.description,
      });
    expect(res.status).toBe(409);
  });

  it('returns authoritative impact preview for DISABLED target', async () => {
    await ensureActive(ProductSlug.RENTAL);
    const res = await request(harness.app.getHttpServer())
      .get('/api/v1/admin/products/RENTAL/catalog-status/impact')
      .query({ targetCatalogStatus: 'DISABLED' })
      .set('Authorization', MASTER_BEARER)
      .expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        productSlug: ProductSlug.RENTAL,
        currentCatalogStatus: ProductCatalogStatus.ACTIVE,
        requestedTargetCatalogStatus: ProductCatalogStatus.DISABLED,
      }),
    );
  });

  it('transitions ACTIVE → DISABLED with mandatory change reason', async () => {
    const slug = ProductSlug.FLEET;
    await ensureActive(slug);
    const productBefore = await prisma.product.findUniqueOrThrow({ where: { slug } });
    const auditBefore = await countCatalogStatusAuditRows(prisma, productBefore.id);
    const res = await request(harness.app.getHttpServer())
      .patch(`/api/v1/admin/products/${slug}/catalog-status`)
      .set(authHeaders)
      .send({
        catalogStatus: ProductCatalogStatus.DISABLED,
        ifCurrentCatalogStatus: ProductCatalogStatus.ACTIVE,
        changeReason: 'acceptance disable',
      })
      .expect(200);
    expect(res.body.product.catalogStatus).toBe(ProductCatalogStatus.DISABLED);
    expect(res.body.noop).toBe(false);
    const product = await prisma.product.findUniqueOrThrow({ where: { slug } });
    expect(product.catalogStatus).toBe(ProductCatalogStatus.DISABLED);
    expect(await countCatalogStatusAuditRows(prisma, productBefore.id)).toBe(auditBefore + 1);
    const latestAudit = await prisma.activityLog.findFirst({
      where: {
        entity: ActivityEntity.ADMIN_OPERATION,
        entityId: productBefore.id,
        metaJson: { path: ['action'], equals: 'catalog_status_patch' },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(latestAudit?.metaJson).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          productSlug: slug,
          changeReason: 'acceptance disable',
        }),
      }),
    );
  });

  it('denies new organization assignment when catalog DISABLED', async () => {
    const slug = ProductSlug.VYMOD;
    await rememberCatalog(slug);
    await prisma.product.update({
      where: { slug },
      data: { catalogStatus: ProductCatalogStatus.DISABLED },
    });
    const orgId = await seedOrganization();
    const res = await request(harness.app.getHttpServer())
      .post('/api/v1/admin/products/assign')
      .set(authHeaders)
      .send({ orgId, productSlug: slug });
    expect(res.status).toBe(403);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'PRODUCT_CATALOG_ADMISSION_DENIED',
        reason: PRODUCT_CATALOG_ADMISSION_DENIAL_REASON.CATALOG_DISABLED,
        productSlug: slug,
      }),
    );
    const opCount = await prisma.organizationProduct.count({
      where: { organizationId: orgId, product: { slug } },
    });
    expect(opCount).toBe(0);
  });

  it('preserves existing organization product when catalog disabled over HTTP path', async () => {
    const slug = ProductSlug.RENTAL;
    await ensureActive(slug);
    const orgId = await seedOrganization();
    const product = await prisma.product.findUniqueOrThrow({ where: { slug } });
    const op = await prisma.organizationProduct.create({
      data: {
        organizationId: orgId,
        productId: product.id,
        status: OrgProductStatus.ACTIVE,
        plan: OrgProductPlan.STARTER,
        vehicleAccessMode: defaultVehicleAccessModeForNewAssignment(slug),
        activatedAt: new Date(),
      },
    });
    await request(harness.app.getHttpServer())
      .patch(`/api/v1/admin/products/${slug}/catalog-status`)
      .set(authHeaders)
      .send({
        catalogStatus: ProductCatalogStatus.DISABLED,
        ifCurrentCatalogStatus: ProductCatalogStatus.ACTIVE,
        changeReason: 'preserve op',
      })
      .expect(200);
    const opAfter = await prisma.organizationProduct.findUniqueOrThrow({ where: { id: op.id } });
    expect(opAfter.status).toBe(OrgProductStatus.ACTIVE);
  });

  it('transitions DISABLED → ACTIVE and restores admission eligibility', async () => {
    const slug = ProductSlug.FLEET;
    await rememberCatalog(slug);
    await prisma.product.update({
      where: { slug },
      data: { catalogStatus: ProductCatalogStatus.DISABLED },
    });
    const orgId = await seedOrganization();
    await request(harness.app.getHttpServer())
      .patch(`/api/v1/admin/products/${slug}/catalog-status`)
      .set(authHeaders)
      .send({
        catalogStatus: ProductCatalogStatus.ACTIVE,
        ifCurrentCatalogStatus: ProductCatalogStatus.DISABLED,
        changeReason: 'restore admissions',
      })
      .expect(200);
    await request(harness.app.getHttpServer())
      .post('/api/v1/admin/products/assign')
      .set(authHeaders)
      .send({ orgId, productSlug: slug })
      .expect(201);
    const opCount = await prisma.organizationProduct.count({
      where: { organizationId: orgId, product: { slug } },
    });
    expect(opCount).toBe(1);
  });

  it('does not auto-reactivate suspended organization products on catalog re-enable', async () => {
    const slug = ProductSlug.VYMOD;
    await rememberCatalog(slug);
    const orgId = await seedOrganization();
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
    await prisma.product.update({
      where: { slug },
      data: { catalogStatus: ProductCatalogStatus.DISABLED },
    });
    await request(harness.app.getHttpServer())
      .patch(`/api/v1/admin/products/${slug}/catalog-status`)
      .set(authHeaders)
      .send({
        catalogStatus: ProductCatalogStatus.ACTIVE,
        ifCurrentCatalogStatus: ProductCatalogStatus.DISABLED,
        changeReason: 're-enable without customer restore',
      })
      .expect(200);
    const opAfter = await prisma.organizationProduct.findUniqueOrThrow({ where: { id: op.id } });
    expect(opAfter.status).toBe(OrgProductStatus.SUSPENDED);
  });

  it('rejects TAXI DISABLED → ACTIVE reactivation', async () => {
    const slug = ProductSlug.TAXI;
    const row = await prisma.product.findUnique({ where: { slug } });
    if (!row) {
      return;
    }
    await rememberCatalog(slug);
    await prisma.product.update({ where: { slug }, data: { catalogStatus: ProductCatalogStatus.DISABLED } });
    const res = await request(harness.app.getHttpServer())
      .patch(`/api/v1/admin/products/${slug}/catalog-status`)
      .set(authHeaders)
      .send({
        catalogStatus: ProductCatalogStatus.ACTIVE,
        ifCurrentCatalogStatus: ProductCatalogStatus.DISABLED,
        changeReason: 'must fail',
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('returns 403 for non-master actor', async () => {
    await request(harness.app.getHttpServer())
      .get('/api/v1/admin/products')
      .set('Authorization', MEMBER_BEARER)
      .expect(403);
  });

  it('requires MFA step-up for mutating catalog metadata', async () => {
    const slug = ProductSlug.RENTAL;
    const row = await prisma.product.findUniqueOrThrow({ where: { slug } });
    const res = await request(harness.app.getHttpServer())
      .patch(`/api/v1/admin/products/${slug}`)
      .set('Authorization', MASTER_BEARER)
      .send({
        name: row.name,
        description: row.description,
        ifCurrentName: row.name,
        ifCurrentDescription: row.description,
      });
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe(MFA_ERROR.STEP_UP_REQUIRED);
  });

  it('rejects expired or invalid MFA step-up token', async () => {
    const slug = ProductSlug.RENTAL;
    const row = await prisma.product.findUniqueOrThrow({ where: { slug } });
    const res = await request(harness.app.getHttpServer())
      .patch(`/api/v1/admin/products/${slug}`)
      .set({ Authorization: MASTER_BEARER, 'x-step-up-token': 'bad-token' })
      .send({
        name: row.name,
        description: row.description,
        ifCurrentName: row.name,
        ifCurrentDescription: row.description,
      });
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe(MFA_ERROR.STEP_UP_EXPIRED);
  });

  it('returns HTTP 409 on stale catalog status CAS', async () => {
    const slug = ProductSlug.FLEET;
    await ensureActive(slug);
    const res = await request(harness.app.getHttpServer())
      .patch(`/api/v1/admin/products/${slug}/catalog-status`)
      .set(authHeaders)
      .send({
        catalogStatus: ProductCatalogStatus.DISABLED,
        ifCurrentCatalogStatus: ProductCatalogStatus.DISABLED,
        changeReason: 'stale',
      });
    expect(res.status).toBe(409);
  });

  it('service-level CAS remains ConflictException (parity)', async () => {
    const slug = ProductSlug.VYMOD;
    await ensureActive(slug);
    await expect(
      harness.products.updateProductCatalogStatusForMasterAdmin({
        productSlug: slug,
        patch: {
          catalogStatus: ProductCatalogStatus.DISABLED,
          ifCurrentCatalogStatus: ProductCatalogStatus.DISABLED,
          changeReason: 'stale',
        },
        actorUserId: seededMasterId,
        audit: { correlationId: `v2-cas-${Date.now()}` },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});