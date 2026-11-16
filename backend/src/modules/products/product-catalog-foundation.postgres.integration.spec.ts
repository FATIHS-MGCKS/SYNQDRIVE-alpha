/**
 * P2-PR1 — product catalog migrations + VYMOD row (Postgres).
 *
 * Run:
 *   PRODUCT_CATALOG_FOUNDATION_POSTGRES_INTEGRATION=1 \
 *   DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive_product_catalog_p2_pr1 \
 *   npm test -- --runInBand product-catalog-foundation.postgres
 */
import { PrismaClient, ProductCatalogStatus, ProductSlug } from '@prisma/client';

const LIVE = process.env.PRODUCT_CATALOG_FOUNDATION_POSTGRES_INTEGRATION === '1';
const DISPOSABLE_DB_TOKEN = 'synqdrive_product_catalog_p2_pr1';

function assertDisposableDatabaseUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url || /production|staging|app\.synqdrive|srv1374778|hstgr\.cloud|mein-vps/i.test(url)) {
    throw new Error('PRODUCT_CATALOG_FOUNDATION_POSTGRES_INTEGRATION requires isolated DATABASE_URL');
  }
  if (!url.includes(DISPOSABLE_DB_TOKEN)) {
    throw new Error(`DATABASE_URL must reference disposable database "${DISPOSABLE_DB_TOKEN}"`);
  }
}

(LIVE ? describe : describe.skip)('Product catalog foundation — postgres gate', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeAll(() => {
    assertDisposableDatabaseUrl();
  });

  it('schema includes VYMOD slug and catalog_status default ACTIVE', async () => {
    const vymod = await prisma.product.findUnique({ where: { slug: ProductSlug.VYMOD } });
    expect(vymod).not.toBeNull();
    expect(vymod?.catalogStatus).toBe(ProductCatalogStatus.ACTIVE);

    const rental = await prisma.product.findFirst({ where: { slug: ProductSlug.RENTAL } });
    if (rental) {
      expect(rental.catalogStatus).toBe(ProductCatalogStatus.ACTIVE);
    }
  });

  it('VYMOD row does not imply org entitlement', async () => {
    const vymod = await prisma.product.findUniqueOrThrow({ where: { slug: ProductSlug.VYMOD } });
    const orgLinks = await prisma.organizationProduct.count({
      where: { productId: vymod.id },
    });
    expect(orgLinks).toBe(0);
  });
});