/**
 * Catalog status transitions must not mutate commercial billing subgraph (disposable Postgres).
 *
 * PRODUCT_CATALOG_V2_BILLING_PRESERVATION_POSTGRES_INTEGRATION=1
 *
 * Seeded in this gate: rental `price_books`, `price_tariff_versions`, `billing_subscriptions`,
 * `billing_discounts`, `billing_invoices`, `organization_products`.
 * Not seeded (reported gap): `billing_price_books`, `billing_price_versions`,
 * `billing_subscription_items`, `billing_payments`, `org_invoices`, `vehicle_product_grants`.
 */
import {
  PrismaClient,
  ProductCatalogStatus,
  ProductSlug,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { defaultVehicleAccessModeForNewAssignment } from './organization-product-vehicle-access-defaults';
import { ProductsService } from './products.service';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { assertProductCatalogV2DisposablePostgres } from './testing/product-catalog-v2-disposable-postgres-preflight';

const LIVE = process.env.PRODUCT_CATALOG_V2_BILLING_PRESERVATION_POSTGRES_INTEGRATION === '1';
const OPT_IN = 'PRODUCT_CATALOG_V2_BILLING_PRESERVATION_POSTGRES_INTEGRATION';

type CommercialFingerprint = {
  priceBooks: unknown[];
  tariffVersions: unknown[];
  billingSubscriptions: unknown[];
  billingDiscounts: unknown[];
  billingInvoices: unknown[];
  organizationProducts: unknown[];
  vehicleProductGrants: unknown[];
};

async function snapshotCommercialState(
  prisma: PrismaClient,
  organizationId: string,
): Promise<CommercialFingerprint> {
  const [priceBooks, tariffVersions, billingSubscriptions, billingDiscounts, billingInvoices, organizationProducts, vehicleProductGrants] =
    await Promise.all([
      prisma.priceBook.findMany({ where: { organizationId }, orderBy: { id: 'asc' } }),
      prisma.priceTariffVersion.findMany({ where: { organizationId }, orderBy: { id: 'asc' } }),
      prisma.billingSubscription.findMany({ where: { organizationId }, orderBy: { id: 'asc' } }),
      prisma.billingDiscount.findMany({
        where: { subscription: { organizationId } },
        orderBy: { id: 'asc' },
      }),
      prisma.billingInvoice.findMany({
        where: { subscription: { organizationId } },
        orderBy: { id: 'asc' },
      }),
      prisma.organizationProduct.findMany({ where: { organizationId }, orderBy: { id: 'asc' } }),
      prisma.vehicleProductGrant.findMany({ where: { organizationId }, orderBy: { id: 'asc' } }),
    ]);
  return {
    priceBooks,
    tariffVersions,
    billingSubscriptions,
    billingDiscounts,
    billingInvoices,
    organizationProducts,
    vehicleProductGrants,
  };
}

(LIVE ? describe : describe.skip)('Product Catalog V2 — billing preservation (postgres)', () => {
  const prisma = new PrismaClient();
  let products: ProductsService;
  const catalogRestores: Array<{ slug: ProductSlug; catalogStatus: ProductCatalogStatus }> = [];
  let orgId = '';
  let adminId = '';

  beforeAll(async () => {
    assertProductCatalogV2DisposablePostgres(OPT_IN);
    const audit = new AuditService(prisma as never);
    const masterAdminAudit = new MasterAdminAuditService(audit);
    products = new ProductsService(prisma as never, masterAdminAudit);

    adminId = `v2-billing-master-${Date.now()}`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${adminId},
        ${`v2-billing-${Date.now()}@test.example`},
        'Billing Master',
        ${UserStatus.ACTIVE}::"UserStatus",
        ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole",
        NOW(),
        NOW()
      )
    `;
    const org = await prisma.organization.create({
      data: { companyName: `V2 Billing Org ${Date.now()}`, businessType: 'RENTAL' },
    });
    orgId = org.id;
  });

  afterAll(async () => {
    for (const restore of catalogRestores) {
      await prisma.product.update({
        where: { slug: restore.slug },
        data: { catalogStatus: restore.catalogStatus },
      });
    }
    if (orgId) {
      await prisma.billingInvoice.deleteMany({
        where: { subscription: { organizationId: orgId } },
      });
      await prisma.billingSubscription.deleteMany({ where: { organizationId: orgId } });
      await prisma.priceTariffVersion.deleteMany({ where: { organizationId: orgId } });
      await prisma.priceTariffGroup.deleteMany({ where: { organizationId: orgId } });
      await prisma.priceBook.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    }
    if (adminId) {
      await prisma.user.deleteMany({ where: { id: adminId } });
    }
    await prisma.$disconnect();
  });

  async function seedCommercialFixture() {
    const priceBook = await prisma.priceBook.create({
      data: {
        organizationId: orgId,
        name: 'V2 Acceptance Price Book',
        currency: 'EUR',
      },
    });
    const tariffGroup = await prisma.priceTariffGroup.create({
      data: {
        organizationId: orgId,
        priceBookId: priceBook.id,
        name: 'Default',
      },
    });
    await prisma.priceTariffVersion.create({
      data: {
        organizationId: orgId,
        priceBookId: priceBook.id,
        tariffGroupId: tariffGroup.id,
        versionNumber: 1,
        validFrom: new Date(),
        status: 'ACTIVE',
      },
    });
    const subscription = await prisma.billingSubscription.create({
      data: {
        organizationId: orgId,
        status: 'ACTIVE',
        currency: 'EUR',
      },
    });
    await prisma.billingDiscount.create({
      data: {
        subscriptionId: subscription.id,
        discountType: 'PERCENTAGE',
        percentBps: 1000,
        currency: 'EUR',
        validFrom: new Date(),
      },
    });
    await prisma.billingInvoice.create({
      data: {
        subscriptionId: subscription.id,
        status: 'OPEN',
        currency: 'EUR',
        amountCents: 1190,
        invoiceDate: new Date(),
      },
    });
  }

  it('leaves billing and entitlement rows unchanged across catalog disable/enable', async () => {
    const slug = ProductSlug.RENTAL;
    const beforeCatalog = await prisma.product.findUniqueOrThrow({ where: { slug } });
    catalogRestores.push({ slug, catalogStatus: beforeCatalog.catalogStatus });
    await prisma.product.update({ where: { slug }, data: { catalogStatus: ProductCatalogStatus.ACTIVE } });

    await seedCommercialFixture();

    const product = await prisma.product.findUniqueOrThrow({ where: { slug } });
    await prisma.organizationProduct.create({
      data: {
        organizationId: orgId,
        productId: product.id,
        status: 'ACTIVE',
        plan: 'STARTER',
        vehicleAccessMode: defaultVehicleAccessModeForNewAssignment(slug),
        activatedAt: new Date(),
      },
    });

    const before = await snapshotCommercialState(prisma, orgId);
    expect(before.priceBooks.length).toBe(1);
    expect(before.tariffVersions.length).toBe(1);
    expect(before.billingSubscriptions.length).toBe(1);
    expect(before.billingDiscounts.length).toBe(1);
    expect(before.billingInvoices.length).toBe(1);
    expect(before.organizationProducts.length).toBe(1);
    expect(before.vehicleProductGrants.length).toBe(0);

    await products.updateProductCatalogStatusForMasterAdmin({
      productSlug: slug,
      patch: {
        catalogStatus: ProductCatalogStatus.DISABLED,
        ifCurrentCatalogStatus: ProductCatalogStatus.ACTIVE,
        changeReason: 'billing preservation disable',
      },
      actorUserId: adminId,
      audit: { correlationId: `v2-bill-disable-${Date.now()}` },
    });

    await products.updateProductCatalogStatusForMasterAdmin({
      productSlug: slug,
      patch: {
        catalogStatus: ProductCatalogStatus.ACTIVE,
        ifCurrentCatalogStatus: ProductCatalogStatus.DISABLED,
        changeReason: 'billing preservation re-enable',
      },
      actorUserId: adminId,
      audit: { correlationId: `v2-bill-enable-${Date.now()}` },
    });

    const after = await snapshotCommercialState(prisma, orgId);
    expect(after).toEqual(before);

    const catalogAfter = await prisma.product.findUniqueOrThrow({ where: { slug } });
    expect(catalogAfter.catalogStatus).toBe(ProductCatalogStatus.ACTIVE);
  });
});