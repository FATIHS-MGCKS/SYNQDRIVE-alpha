import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.join(__dirname, '../../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
  BACKEND_ROOT,
  'prisma/migrations/20260715200000_billing_subscription_items_discounts_schema/migration.sql',
);

function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

describe('Billing subscription items & discounts schema (Prompt 07)', () => {
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

  it('extends BillingSubscription instead of duplicating', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model BillingSubscription[\s\S]*?lockVersion/);
    expect(schema).toMatch(/model BillingSubscription[\s\S]*?trialStartAt/);
    expect(schema).toMatch(/model BillingSubscription[\s\S]*?billingAnchorDay/);
    expect(schema).not.toContain('model OrganizationSubscription');
  });

  it('defines subscription items with product and price references', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model BillingSubscriptionItem[\s\S]*?billingProductId/);
    expect(schema).toMatch(/model BillingSubscriptionItem[\s\S]*?priceVersionId/);
    expect(schema).toMatch(/model BillingSubscriptionItem[\s\S]*?quantity/);
    expect(schema).toContain('@@map("billing_subscription_items")');
  });

  it('defines formal BillingDiscount model', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model BillingDiscount[\s\S]*?discountType/);
    expect(schema).toMatch(/model BillingDiscount[\s\S]*?stripeCouponId/);
    expect(schema).toContain('@@map("billing_discounts")');
  });

  it('keeps legacy BillingOrganizationPriceOverride', () => {
    const schema = readSchema();
    expect(schema).toContain('model BillingOrganizationPriceOverride');
  });

  it('migration enforces one active base plan and validates items/discounts', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toContain('billing_subscription_items_one_active_base_plan_per_org');
    expect(sql).toContain('billing_validate_subscription_item');
    expect(sql).toContain('billing_validate_discount');
    expect(sql).toContain('billing_subscription_items_quantity_check');
    expect(sql).toContain('billing_discounts_percent_bps_check');
    expect(sql).toContain('billing_subscriptions_stripe_subscription_id_stripe_mode_key');
  });
});

describe('Billing subscription constraints integration (requires DATABASE_URL)', () => {
  const databaseUrl = process.env.DATABASE_URL;
  const runDb = process.env.BILLING_SCHEMA_INTEGRATION === '1' && !!databaseUrl;

  (runDb ? it : it.skip)('enforces base plan, add-on, discount and quantity rules', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const orgId = `org-test-${Date.now()}`;
    const subId = `sub-test-${Date.now()}`;

    try {
      execSync('npm run prisma:migrate:deploy', {
        cwd: BACKEND_ROOT,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: 'pipe',
      });

      await prisma.organization.create({
        data: {
          id: orgId,
          companyName: 'Billing Schema Test Org',
          businessType: 'FLEET',
          status: 'ACTIVE',
        },
      });

      const fleet = await prisma.billingCatalogProduct.findUniqueOrThrow({
        where: { key: 'FLEET' },
      });
      const voice = await prisma.billingCatalogProduct.findUniqueOrThrow({
        where: { key: 'VOICE_AGENT' },
      });

      await prisma.billingSubscription.create({
        data: {
          id: subId,
          organizationId: orgId,
          status: 'ACTIVE',
          currency: 'EUR',
        },
      });

      const now = new Date();
      const baseItem = await prisma.billingSubscriptionItem.create({
        data: {
          subscriptionId: subId,
          organizationId: orgId,
          billingProductId: fleet.id,
          itemRole: 'BASE_PLAN',
          quantity: 2,
          validFrom: now,
          status: 'ACTIVE',
        },
      });
      expect(baseItem.id).toBeTruthy();

      await expect(
        prisma.billingSubscriptionItem.create({
          data: {
            subscriptionId: subId,
            organizationId: orgId,
            billingProductId: fleet.id,
            itemRole: 'BASE_PLAN',
            quantity: 1,
            validFrom: now,
            status: 'ACTIVE',
          },
        }),
      ).rejects.toThrow();

      const addon = await prisma.billingSubscriptionItem.create({
        data: {
          subscriptionId: subId,
          organizationId: orgId,
          billingProductId: voice.id,
          itemRole: 'ADDON',
          quantity: 1,
          validFrom: now,
          status: 'ACTIVE',
        },
      });
      expect(addon.id).toBeTruthy();

      await prisma.billingSubscriptionItem.update({
        where: { id: baseItem.id },
        data: { status: 'ENDED', validTo: new Date() },
      });

      const replacementBase = await prisma.billingSubscriptionItem.create({
        data: {
          subscriptionId: subId,
          organizationId: orgId,
          billingProductId: fleet.id,
          itemRole: 'BASE_PLAN',
          quantity: 3,
          validFrom: now,
          status: 'ACTIVE',
        },
      });
      expect(replacementBase.id).toBeTruthy();

      await expect(
        prisma.billingSubscriptionItem.create({
          data: {
            subscriptionId: subId,
            organizationId: orgId,
            billingProductId: fleet.id,
            itemRole: 'BASE_PLAN',
            quantity: -1,
            validFrom: now,
            status: 'DRAFT',
          },
        }),
      ).rejects.toThrow();

      await expect(
        prisma.billingDiscount.create({
          data: {
            subscriptionId: subId,
            discountType: 'PERCENTAGE',
            percentBps: 15000,
            validFrom: now,
          },
        }),
      ).rejects.toThrow();

      await expect(
        prisma.billingDiscount.create({
          data: {
            subscriptionId: subId,
            discountType: 'FIXED_AMOUNT',
            fixedAmountCents: -100,
            currency: 'EUR',
            validFrom: now,
          },
        }),
      ).rejects.toThrow();

      const discount = await prisma.billingDiscount.create({
        data: {
          subscriptionId: subId,
          discountType: 'PERCENTAGE',
          percentBps: 1000,
          validFrom: now,
        },
      });
      expect(discount.id).toBeTruthy();
    } finally {
      await prisma.billingSubscription.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
      await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });
});
