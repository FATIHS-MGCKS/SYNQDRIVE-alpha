/**
 * Regression: publishVersion archives prior ACTIVE published row with effective_to close.
 *
 * PRICEBOOK_PUBLISH_POSTGRES_INTEGRATION=1 + DATABASE_URL (disposable DB)
 */
import { execSync } from 'child_process';
import * as path from 'path';
import {
  BillingPriceVersionStatus,
  BillingTierMode,
  PrismaClient,
} from '@prisma/client';
import { BillingAuditService } from './billing-audit.service';
import { PricebookService } from './pricebook.service';

const BACKEND_ROOT = path.join(__dirname, '../../..');
const LIVE = process.env.PRICEBOOK_PUBLISH_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('Pricebook publish (postgres)', () => {
  const prisma = new PrismaClient();
  let svc: PricebookService;
  const bookIds: string[] = [];
  const catalogKeys: string[] = [];

  beforeAll(async () => {
    execSync('npm run prisma:migrate:deploy', {
      cwd: BACKEND_ROOT,
      env: { ...process.env },
      stdio: 'pipe',
    });
    svc = new PricebookService(prisma as never, new BillingAuditService(prisma as never));
  });

  afterAll(async () => {
    for (const bookId of bookIds) {
      await prisma.billingPriceTier.deleteMany({
        where: { priceVersion: { priceBookId: bookId } },
      });
      await prisma.billingPriceVersion.deleteMany({ where: { priceBookId: bookId } });
      await prisma.billingPriceBook.delete({ where: { id: bookId } }).catch(() => undefined);
    }
    for (const key of catalogKeys) {
      await prisma.billingCatalogProduct.delete({ where: { key } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('publishes draft while archiving prior ACTIVE with effective_to', async () => {
    const key = `TEST_${Date.now()}`;
    catalogKeys.push(key);
    const catalog = await prisma.billingCatalogProduct.create({
      data: { key, name: `Test ${key}` },
    });

    const book = await prisma.billingPriceBook.create({
      data: {
        name: `PG publish ${Date.now()}`,
        productKey: key,
        billingProductId: catalog.id,
        currency: 'EUR',
      },
    });
    bookIds.push(book.id);

    const active = await prisma.billingPriceVersion.create({
      data: {
        priceBookId: book.id,
        versionNumber: 1,
        versionLabel: 'v1',
        status: BillingPriceVersionStatus.ACTIVE,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        tierMode: BillingTierMode.VOLUME,
        tiers: {
          create: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 1000, sortOrder: 0 }],
        },
      },
    });

    const draft = await prisma.billingPriceVersion.create({
      data: {
        priceBookId: book.id,
        versionNumber: 2,
        versionLabel: 'Entwurf v2',
        status: BillingPriceVersionStatus.DRAFT,
        tierMode: BillingTierMode.VOLUME,
        tiers: {
          create: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 2000, sortOrder: 0 }],
        },
      },
    });

    const effectiveFrom = new Date('2026-12-01T00:00:00.000Z');
    const published = await svc.publishVersion(draft.id, 'actor-test', effectiveFrom);

    expect(published.status).toBe(BillingPriceVersionStatus.ACTIVE);
    expect(published.effectiveFrom?.toISOString()).toBe(effectiveFrom.toISOString());
    expect(published.publishedAt).toBeTruthy();

    const archived = await prisma.billingPriceVersion.findUnique({ where: { id: active.id } });
    expect(archived?.status).toBe(BillingPriceVersionStatus.ARCHIVED);
    expect(archived?.effectiveTo?.toISOString()).toBe(effectiveFrom.toISOString());

    const audit = await prisma.billingAuditLog.findFirst({
      where: { entityId: draft.id, action: 'PRICE_VERSION_PUBLISHED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeTruthy();
  });

  it('rejects second publish of same version (idempotent guard)', async () => {
    const key = `TEST_IDEM_${Date.now()}`;
    catalogKeys.push(key);
    const catalog = await prisma.billingCatalogProduct.create({
      data: { key, name: `Test ${key}` },
    });
    const book = await prisma.billingPriceBook.create({
      data: {
        name: `PG idem ${Date.now()}`,
        productKey: key,
        billingProductId: catalog.id,
        currency: 'EUR',
      },
    });
    bookIds.push(book.id);

    const draft = await prisma.billingPriceVersion.create({
      data: {
        priceBookId: book.id,
        versionNumber: 1,
        status: BillingPriceVersionStatus.DRAFT,
        tierMode: BillingTierMode.VOLUME,
        tiers: {
          create: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 500, sortOrder: 0 }],
        },
      },
    });

    await svc.publishVersion(draft.id, 'actor-test');
    await expect(svc.publishVersion(draft.id, 'actor-test')).rejects.toMatchObject({
      message: expect.stringContaining('DRAFT'),
    });
  });
});