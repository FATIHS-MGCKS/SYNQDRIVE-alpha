/**
 * Price version publish regression (disposable PostgreSQL only).
 *
 * PRICEBOOK_PUBLISH_POSTGRES_INTEGRATION=1
 * DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/pricebook_publish_disposable_<id>
 */
import {
  BillingPriceVersionStatus,
  BillingProductRole,
  BillingTierMode,
  PrismaClient,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { BillingAuditService } from './billing-audit.service';
import { PricebookService } from './pricebook.service';
import { assertPricebookPublishDisposablePostgres } from './testing/pricebook-publish-disposable-postgres-preflight';

const OPT_IN = 'PRICEBOOK_PUBLISH_POSTGRES_INTEGRATION';
const LIVE = process.env[OPT_IN] === '1';

async function createPublishedActiveVersion(
  prisma: PrismaClient,
  bookId: string,
  versionNumber: number,
  unitPriceCents: number,
  effectiveFrom: Date,
) {
  const draft = await prisma.billingPriceVersion.create({
    data: {
      priceBookId: bookId,
      versionNumber,
      status: BillingPriceVersionStatus.DRAFT,
      tierMode: BillingTierMode.VOLUME,
      tiers: {
        create: [{ minVehicles: 1, maxVehicles: null, unitPriceCents, sortOrder: 0 }],
      },
    },
  });
  return prisma.billingPriceVersion.update({
    where: { id: draft.id },
    data: {
      status: BillingPriceVersionStatus.ACTIVE,
      effectiveFrom,
      publishedAt: effectiveFrom,
    },
    include: { tiers: true },
  });
}

async function seedBook(prisma: PrismaClient, prefix: string) {
  const key = `${prefix}_${Date.now()}`;
  const catalog = await prisma.billingCatalogProduct.create({
    data: {
      key,
      name: `Test ${key}`,
      productRole: BillingProductRole.BASE_PLAN,
    },
  });
  const book = await prisma.billingPriceBook.create({
    data: {
      name: `PG ${prefix} ${Date.now()}`,
      productKey: key,
      billingProductId: catalog.id,
      currency: 'EUR',
    },
  });
  return { key, catalogId: catalog.id, bookId: book.id };
}

(LIVE ? describe : describe.skip)('Pricebook publish (postgres)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();
  let svc: PricebookService;
  const catalogKeys: string[] = [];

  beforeAll(() => {
    assertPricebookPublishDisposablePostgres(OPT_IN);
    svc = new PricebookService(prisma as never, new BillingAuditService(prisma as never));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('publishes draft while archiving prior ACTIVE with effective_to', async () => {
    const { key, bookId } = await seedBook(prisma, 'SUPERSEDE');
    catalogKeys.push(key);

    const active = await createPublishedActiveVersion(
      prisma,
      bookId,
      1,
      1000,
      new Date('2026-01-01T00:00:00.000Z'),
    );

    const draft = await prisma.billingPriceVersion.create({
      data: {
        priceBookId: bookId,
        versionNumber: 2,
        versionLabel: 'Entwurf v2',
        status: BillingPriceVersionStatus.DRAFT,
        tierMode: BillingTierMode.VOLUME,
        tiers: {
          create: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 2000, sortOrder: 0 }],
        },
      },
    });

    const effectiveFrom = new Date(Date.now() - 60_000);
    const published = await svc.publishVersion(draft.id, 'actor-test', effectiveFrom);

    expect(published.status).toBe(BillingPriceVersionStatus.ACTIVE);
    expect(published.effectiveFrom?.toISOString()).toBe(effectiveFrom.toISOString());
    expect(published.publishedAt).toBeTruthy();

    const archived = await prisma.billingPriceVersion.findUnique({ where: { id: active.id } });
    expect(archived?.status).toBe(BillingPriceVersionStatus.ARCHIVED);
    expect(archived?.effectiveTo?.toISOString()).toBe(effectiveFrom.toISOString());

    const auditCount = await prisma.billingAuditLog.count({
      where: { entityId: draft.id, action: 'PRICE_VERSION_PUBLISHED' },
    });
    expect(auditCount).toBe(1);

  });

  it('rejects second publish of same version (idempotent guard)', async () => {
    const { key, bookId } = await seedBook(prisma, 'IDEM');
    catalogKeys.push(key);

    const draft = await prisma.billingPriceVersion.create({
      data: {
        priceBookId: bookId,
        versionNumber: 1,
        status: BillingPriceVersionStatus.DRAFT,
        tierMode: BillingTierMode.VOLUME,
        tiers: {
          create: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 500, sortOrder: 0 }],
        },
      },
    });

    await svc.publishVersion(draft.id, 'actor-test');
    await expect(svc.publishVersion(draft.id, 'actor-test')).rejects.toBeInstanceOf(ConflictException);

    const auditCount = await prisma.billingAuditLog.count({
      where: { entityId: draft.id, action: 'PRICE_VERSION_PUBLISHED' },
    });
    expect(auditCount).toBe(1);

  });

  it('getPricingConfiguration does not surface future-effective ACTIVE as current', async () => {
    const { key, bookId } = await seedBook(prisma, 'CFG');
    catalogKeys.push(key);
    await prisma.billingPriceBook.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
    await prisma.billingPriceBook.update({
      where: { id: bookId },
      data: { isDefault: true },
    });

    const current = await createPublishedActiveVersion(
      prisma,
      bookId,
      1,
      100,
      new Date('2020-01-01T00:00:00.000Z'),
    );

    const draft = await prisma.billingPriceVersion.create({
      data: {
        priceBookId: bookId,
        versionNumber: 2,
        status: BillingPriceVersionStatus.DRAFT,
        tierMode: BillingTierMode.VOLUME,
        tiers: {
          create: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 999, sortOrder: 0 }],
        },
      },
    });

    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await svc.publishVersion(draft.id, 'actor-test', future);

    const config = await svc.getPricingConfiguration();
    expect(config.configured).toBe(true);
    expect(config.activeVersion?.id).toBe(current.id);
    expect(config.activeVersion?.id).not.toBe(draft.id);
  });

  it('keeps prior ACTIVE applicable until scheduled effectiveFrom', async () => {
    const { key, bookId } = await seedBook(prisma, 'FUTURE');
    catalogKeys.push(key);

    const active = await createPublishedActiveVersion(
      prisma,
      bookId,
      1,
      100,
      new Date('2020-01-01T00:00:00.000Z'),
    );

    const draft = await prisma.billingPriceVersion.create({
      data: {
        priceBookId: bookId,
        versionNumber: 2,
        status: BillingPriceVersionStatus.DRAFT,
        tierMode: BillingTierMode.VOLUME,
        tiers: {
          create: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 200, sortOrder: 0 }],
        },
      },
    });

    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await svc.publishVersion(draft.id, 'actor-test', future);

    const prior = await prisma.billingPriceVersion.findUnique({ where: { id: active.id } });
    expect(prior?.status).toBe(BillingPriceVersionStatus.ACTIVE);
    expect(prior?.effectiveTo?.toISOString()).toBe(future.toISOString());

    const applicableNow = await svc.findActiveVersion(bookId, new Date());
    expect(applicableNow?.id).toBe(active.id);

  });

  it('blocks mutating published tier rows and illegal version mutation', async () => {
    const { key, bookId } = await seedBook(prisma, 'IMMUT');
    catalogKeys.push(key);

    const draft = await prisma.billingPriceVersion.create({
      data: {
        priceBookId: bookId,
        versionNumber: 1,
        status: BillingPriceVersionStatus.DRAFT,
        tierMode: BillingTierMode.VOLUME,
        tiers: {
          create: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 900, sortOrder: 0 }],
        },
      },
    });

    const published = await svc.publishVersion(draft.id, 'actor-test');
    const tierId = published.tiers[0].id;

    await expect(
      prisma.billingPriceTier.update({
        where: { id: tierId },
        data: { unitPriceCents: 1 },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.billingPriceVersion.update({
        where: { id: published.id },
        data: { versionLabel: 'mutated' },
      }),
    ).rejects.toThrow();

  });

  it('leaves only one ACTIVE version per book after sequential supersede publishes', async () => {
    const { key, bookId } = await seedBook(prisma, 'CHAIN');
    catalogKeys.push(key);

    await createPublishedActiveVersion(prisma, bookId, 1, 50, new Date('2020-01-01T00:00:00.000Z'));

    const draft2 = await prisma.billingPriceVersion.create({
      data: {
        priceBookId: bookId,
        versionNumber: 2,
        status: BillingPriceVersionStatus.DRAFT,
        tierMode: BillingTierMode.VOLUME,
        tiers: {
          create: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 60, sortOrder: 0 }],
        },
      },
    });
    const draft3 = await prisma.billingPriceVersion.create({
      data: {
        priceBookId: bookId,
        versionNumber: 3,
        status: BillingPriceVersionStatus.DRAFT,
        tierMode: BillingTierMode.VOLUME,
        tiers: {
          create: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 70, sortOrder: 0 }],
        },
      },
    });

    await svc.publishVersion(draft2.id, 'actor-a');
    await svc.publishVersion(draft3.id, 'actor-b');

    const activeCount = await prisma.billingPriceVersion.count({
      where: { priceBookId: bookId, status: BillingPriceVersionStatus.ACTIVE },
    });
    expect(activeCount).toBe(1);
    const active = await prisma.billingPriceVersion.findFirst({
      where: { priceBookId: bookId, status: BillingPriceVersionStatus.ACTIVE },
    });
    expect(active?.id).toBe(draft3.id);
  });

  it('serializes concurrent publish so only one draft activates', async () => {
    const { key, bookId } = await seedBook(prisma, 'RACE');
    catalogKeys.push(key);

    await createPublishedActiveVersion(prisma, bookId, 1, 50, new Date('2020-01-01T00:00:00.000Z'));

    const draft2 = await prisma.billingPriceVersion.create({
      data: {
        priceBookId: bookId,
        versionNumber: 2,
        status: BillingPriceVersionStatus.DRAFT,
        tierMode: BillingTierMode.VOLUME,
        tiers: {
          create: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 60, sortOrder: 0 }],
        },
      },
    });
    const draft3 = await prisma.billingPriceVersion.create({
      data: {
        priceBookId: bookId,
        versionNumber: 3,
        status: BillingPriceVersionStatus.DRAFT,
        tierMode: BillingTierMode.VOLUME,
        tiers: {
          create: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 70, sortOrder: 0 }],
        },
      },
    });

    const results = await Promise.allSettled([
      svc.publishVersion(draft2.id, 'actor-a'),
      svc.publishVersion(draft3.id, 'actor-b'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);

    const activeCount = await prisma.billingPriceVersion.count({
      where: { priceBookId: bookId, status: BillingPriceVersionStatus.ACTIVE },
    });
    expect(activeCount).toBe(1);
  });
});