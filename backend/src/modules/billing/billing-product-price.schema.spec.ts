import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.join(__dirname, '../../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
  BACKEND_ROOT,
  'prisma/migrations/20260715190000_billing_product_price_schema/migration.sql',
);

function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

describe('Billing product & price Prisma schema (Prompt 06)', () => {
  it('passes prisma validate', () => {
    const output = execSync('npm run prisma:validate', {
      cwd: BACKEND_ROOT,
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://synqdrive:synqdrive@localhost:5432/synqdrive',
      },
      encoding: 'utf8',
    });
    expect(output).toContain('valid');
  });

  it('defines BillingCatalogProduct with unique product key', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model BillingCatalogProduct[\s\S]*?key\s+String\s+@unique/);
    expect(schema).toContain('@@map("billing_catalog_products")');
  });

  it('extends BillingPriceBook without removing legacy product_key', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model BillingPriceBook[\s\S]*?productKey\s+String/);
    expect(schema).toMatch(/model BillingPriceBook[\s\S]*?billingProductId\s+String\?/);
    expect(schema).toContain('BillingPriceBookStatus');
  });

  it('keeps price version uniqueness per pricebook', () => {
    const schema = readSchema();
    expect(schema).toMatch(
      /model BillingPriceVersion[\s\S]*?@@unique\(\[priceBookId, versionNumber\]\)/,
    );
    expect(schema).toMatch(/model BillingPriceVersion[\s\S]*?publishedByUserId/);
  });

  it('stores tier prices in minor units', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model BillingPriceTier[\s\S]*?unitPriceCents\s+Int\?/);
    expect(schema).toMatch(/model BillingPriceTier[\s\S]*?minVehicles\s+Int/);
  });

  it('separates Stripe TEST and LIVE mappings', () => {
    const schema = readSchema();
    expect(schema).toMatch(
      /model BillingStripePriceMapping[\s\S]*?@@unique\(\[priceBookId, stripeMode\]\)/,
    );
    expect(schema).toMatch(
      /model BillingStripePriceMapping[\s\S]*?@@unique\(\[stripePriceId, stripeMode\]\)/,
    );
    expect(schema).toContain('enum BillingStripeMode');
  });

  it('migration SQL guards published versions and seeds catalog products', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toContain('CREATE TABLE "billing_catalog_products"');
    expect(sql).toContain('billing_stripe_price_mappings_price_book_id_stripe_mode_key');
    expect(sql).toContain('billing_guard_published_price_version');
    expect(sql).toContain('billing_guard_published_price_tier');
    expect(sql).toContain('ON CONFLICT ("key") DO NOTHING');
    expect(sql).not.toMatch(/DROP TABLE "billing_price_books"/i);
  });

  it('uses ISO currency char(3) on price books', () => {
    const schema = readSchema();
    expect(schema).toMatch(/currency\s+String\s+@default\("EUR"\)\s+@db\.Char\(3\)/);
  });
});

describe('Billing schema integration (requires DATABASE_URL)', () => {
  const databaseUrl = process.env.DATABASE_URL;
  const runDb = process.env.BILLING_SCHEMA_INTEGRATION === '1' && !!databaseUrl;

  (runDb ? it : it.skip)('applies migration and enforces uniqueness constraints', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      execSync('npm run prisma:migrate:deploy', {
        cwd: BACKEND_ROOT,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: 'pipe',
      });

      await prisma.billingCatalogProduct.create({
        data: {
          key: `TEST_PRODUCT_${Date.now()}`,
          name: 'Test Product',
          productRole: 'BASE_PLAN',
        },
      });

      await expect(
        prisma.billingCatalogProduct.create({
          data: {
            key: 'RENTAL',
            name: 'Duplicate',
            productRole: 'BASE_PLAN',
          },
        }),
      ).rejects.toThrow();

      const product = await prisma.billingCatalogProduct.findUnique({
        where: { key: 'RENTAL' },
      });
      expect(product).not.toBeNull();

      const book = await prisma.billingPriceBook.create({
        data: {
          name: 'Integration Test Book',
          productKey: 'RENTAL',
          billingProductId: product!.id,
          currency: 'EUR',
        },
      });

      const version = await prisma.billingPriceVersion.create({
        data: {
          priceBookId: book.id,
          versionNumber: 99_001,
          status: 'DRAFT',
        },
      });

      await expect(
        prisma.billingPriceVersion.create({
          data: {
            priceBookId: book.id,
            versionNumber: 99_001,
            status: 'DRAFT',
          },
        }),
      ).rejects.toThrow();

      await prisma.billingStripePriceMapping.create({
        data: {
          priceBookId: book.id,
          stripeMode: 'TEST',
          stripePriceId: `price_test_${Date.now()}`,
        },
      });

      await expect(
        prisma.billingStripePriceMapping.create({
          data: {
            priceBookId: book.id,
            stripeMode: 'TEST',
            stripePriceId: `price_test_dup_${Date.now()}`,
          },
        }),
      ).rejects.toThrow();

      await prisma.billingStripePriceMapping.create({
        data: {
          priceBookId: book.id,
          stripeMode: 'LIVE',
          stripePriceId: `price_live_${Date.now()}`,
        },
      });

      const published = await prisma.billingPriceVersion.update({
        where: { id: version.id },
        data: {
          status: 'ACTIVE',
          publishedAt: new Date(),
        },
      });

      await expect(
        prisma.billingPriceVersion.update({
          where: { id: published.id },
          data: { versionLabel: 'mutated' },
        }),
      ).rejects.toThrow();

      await prisma.billingPriceBook.delete({ where: { id: book.id } });
    } finally {
      await prisma.$disconnect();
    }
  });
});
