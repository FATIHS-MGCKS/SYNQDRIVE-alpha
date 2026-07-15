import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.join(__dirname, '../../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
  BACKEND_ROOT,
  'prisma/migrations/20260715250000_stripe_catalog_mapping/migration.sql',
);

function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

describe('Stripe catalog mapping schema (Prompt 20)', () => {
  it('passes prisma validate', () => {
    const output = execSync('npm run prisma:validate', {
      cwd: BACKEND_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://synqdrive:synqdrive@localhost:5432/synqdrive',
      },
    });
    expect(output).toContain('valid');
  });

  it('defines billing stripe catalog mapping per product and price version', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model BillingStripeCatalogMapping[\s\S]*?billingProductId/);
    expect(schema).toMatch(/model BillingStripeCatalogMapping[\s\S]*?priceVersionId/);
    expect(schema).toMatch(/model BillingStripeCatalogMapping[\s\S]*?stripeMode/);
    expect(schema).toMatch(/model BillingStripeCatalogMapping[\s\S]*?stripeProductId/);
    expect(schema).toMatch(/model BillingStripeCatalogMapping[\s\S]*?stripePriceId/);
    expect(schema).toMatch(/model BillingStripeCatalogMapping[\s\S]*?lastVerifiedAt/);
    expect(schema).toContain('@@unique([priceVersionId, stripeMode])');
    expect(schema).toContain('@@unique([stripePriceId, stripeMode])');
    expect(schema).toContain('@@map("billing_stripe_catalog_mappings")');
  });

  it('migration creates version-level stripe catalog mapping table', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toContain('CREATE TABLE "billing_stripe_catalog_mappings"');
    expect(sql).toContain('billing_stripe_catalog_mappings_price_version_id_stripe_mode_key');
    expect(sql).toContain('billing_stripe_catalog_mappings_stripe_price_id_stripe_mode_key');
    expect(sql).toContain('"last_verified_at"');
    expect(sql).toContain('DISABLED');
  });
});
