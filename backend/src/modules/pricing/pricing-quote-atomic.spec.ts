import { ConflictException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingMigrationService } from './pricing-migration.service';
import { PricingQuoteApplicationService } from './pricing-quote-application.service';
import { PRICING_QUOTE_ATOMIC_ERROR_CODES } from './pricing-engine.constants';
import { PricingQuoteService } from './pricing-quote.service';
import { PRICING_QUOTE_STALE_MESSAGE } from './pricing-quote.types';
import { PricingService } from './pricing.service';
import {
  createBookingDepositSnapshotStub,
  createPricingTestStore,
  createSedanPricingFixtures,
  createTariffPassthroughDepositResolver,
} from './pricing-test-store';

describe('PricingQuoteApplicationService (atomic quote → booking → snapshot)', () => {
  const ids = createSedanPricingFixtures();
  const userId = 'user-staff-1';
  const migration = {
    ensureOrgPricing: jest.fn().mockResolvedValue({ migrated: false, vehiclesAssigned: 0 }),
  };

  const pickupAt = '2026-08-01T10:00:00.000Z';
  const returnAt = '2026-08-04T10:00:00.000Z';

  function build() {
    const store = createPricingTestStore(ids);
    const tariffs = new PriceTariffsService(
      store.prisma as unknown as PrismaService,
      migration as unknown as PricingMigrationService,
    );
    const pricing = new PricingService(
      store.prisma as unknown as PrismaService,
      migration as unknown as PricingMigrationService,
      createTariffPassthroughDepositResolver(),
      createBookingDepositSnapshotStub(),
    );
    const quotes = new PricingQuoteService(
      store.prisma as unknown as PrismaService,
      pricing,
    );
    const application = new PricingQuoteApplicationService(
      store.prisma as unknown as PrismaService,
      quotes,
      pricing,
    );
    return { store, tariffs, pricing, quotes, application };
  }

  async function createQuote(pricing: PricingService, quotes: PricingQuoteService) {
    const simulation = await pricing.simulateBookingPrice(ids.orgId, {
      vehicleId: ids.vehicleId,
      pickupAt,
      returnAt,
    });
    const quote = await quotes.createQuote({
      organizationId: ids.orgId,
      createdByUserId: userId,
      vehicleId: ids.vehicleId,
      pickupAt: new Date(pickupAt),
      returnAt: new Date(returnAt),
      simulation,
    });
    return { simulation, quote };
  }

  async function atomicCreate(
    application: PricingQuoteApplicationService,
    pricing: PricingService,
    quoteId: string,
    bookingId: string,
  ) {
    return application.createBookingWithQuote({
      organizationId: ids.orgId,
      userId,
      quoteId,
      vehicleId: ids.vehicleId,
      pickupAt: new Date(pickupAt),
      returnAt: new Date(returnAt),
      bookingId,
      createBooking: async (tx, pricedFields) =>
        tx.booking.create({
          data: {
            id: bookingId,
            organizationId: ids.orgId,
            customerId: 'customer-1',
            vehicleId: ids.vehicleId,
            startDate: new Date(pickupAt),
            endDate: new Date(returnAt),
            status: 'PENDING',
            ...pricedFields,
          },
        }) as never,
    });
  }

  it('atomically creates booking, snapshot revision 1, and consumes quote', async () => {
    const { store, pricing, quotes, application } = build();
    const { quote } = await createQuote(pricing, quotes);

    const result = await atomicCreate(application, pricing, quote.quoteId, 'booking-atomic-1');

    expect(result.idempotentReplay).toBe(false);
    expect(result.snapshotRevision).toBe(1);
    expect(store.quotes[0].status).toBe('CONSUMED');
    expect(store.quotes[0].consumedByBookingId).toBe('booking-atomic-1');
    expect(store.snapshots).toHaveLength(1);
    expect(store.snapshots[0].isCurrent).toBe(true);
    expect(store.snapshots[0].revision).toBe(1);
    expect(store.snapshots[0].pricingQuoteId).toBe(quote.quoteId);
    expect(store.snapshots[0].engineVersion).toBe('pricing-engine-v1');
    expect(store.snapshots[0].metadataJson).toBeTruthy();
  });

  it('rejects double quote use', async () => {
    const { store, pricing, quotes, application } = build();
    const { quote } = await createQuote(pricing, quotes);
    await atomicCreate(application, pricing, quote.quoteId, 'booking-first');

    await expect(
      atomicCreate(application, pricing, quote.quoteId, 'booking-second'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PRICING_QUOTE_ALREADY_CONSUMED' }),
    });
    expect(store.bookings).toHaveLength(1);
    expect(store.snapshots).toHaveLength(1);
  });

  it('returns idempotent replay when quote already consumed for same booking', async () => {
    const { pricing, quotes, application } = build();
    const { quote } = await createQuote(pricing, quotes);
    const first = await atomicCreate(application, pricing, quote.quoteId, 'booking-idem');
    const second = await atomicCreate(application, pricing, quote.quoteId, 'booking-idem');

    expect(second.idempotentReplay).toBe(true);
    expect(second.snapshotId).toBe(first.snapshotId);
    expect(second.booking.id).toBe('booking-idem');
  });

  it('rejects expired quote inside transaction', async () => {
    const { store, pricing, quotes, application } = build();
    const { quote } = await createQuote(pricing, quotes);
    store.quotes[0].expiresAt = new Date('2020-01-01T00:00:00.000Z');

    await expect(
      atomicCreate(application, pricing, quote.quoteId, 'booking-expired'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PRICING_QUOTE_EXPIRED',
        message: PRICING_QUOTE_STALE_MESSAGE,
      }),
    });
    expect(store.bookings).toHaveLength(0);
    expect(store.snapshots).toHaveLength(0);
  });

  it('rejects manipulated quote integrity hash', async () => {
    const { store, pricing, quotes, application } = build();
    const { quote } = await createQuote(pricing, quotes);
    store.quotes[0].integrityHash = 'tampered-hash';

    await expect(
      atomicCreate(application, pricing, quote.quoteId, 'booking-tampered'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: PRICING_QUOTE_ATOMIC_ERROR_CODES.QUOTE_TAMPERED,
      }),
    });
    expect(store.bookings).toHaveLength(0);
    expect(store.snapshots).toHaveLength(0);
  });

  it('rolls back when booking insert fails', async () => {
    const { store, pricing, quotes, application } = build();
    const { quote } = await createQuote(pricing, quotes);

    await expect(
      application.createBookingWithQuote({
        organizationId: ids.orgId,
        userId,
        quoteId: quote.quoteId,
        vehicleId: ids.vehicleId,
        pickupAt: new Date(pickupAt),
        returnAt: new Date(returnAt),
        createBooking: async () => {
          throw new Error('booking insert failed');
        },
      }),
    ).rejects.toThrow('booking insert failed');

    expect(store.quotes[0].status).toBe('ACTIVE');
    expect(store.bookings).toHaveLength(0);
    expect(store.snapshots).toHaveLength(0);
  });

  it('rolls back when snapshot creation fails', async () => {
    const { store, pricing, quotes, application } = build();
    const { quote } = await createQuote(pricing, quotes);

    const appendSpy = jest
      .spyOn(pricing, 'appendBookingPriceSnapshotRevision')
      .mockRejectedValue(new ConflictException({
        message: 'snapshot failed',
        code: PRICING_QUOTE_ATOMIC_ERROR_CODES.SNAPSHOT_FAILED,
      }));

    await expect(
      atomicCreate(application, pricing, quote.quoteId, 'booking-snap-fail'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: PRICING_QUOTE_ATOMIC_ERROR_CODES.SNAPSHOT_FAILED,
      }),
    });

    expect(store.quotes[0].status).toBe('ACTIVE');
    expect(store.bookings).toHaveLength(0);
    expect(store.snapshots).toHaveLength(0);
    appendSpy.mockRestore();
  });

  it('parallel quote consumption allows only one successful booking', async () => {
    const { store, pricing, quotes, application } = build();
    const { quote } = await createQuote(pricing, quotes);

    const results = await Promise.allSettled([
      atomicCreate(application, pricing, quote.quoteId, 'booking-parallel-a'),
      atomicCreate(application, pricing, quote.quoteId, 'booking-parallel-b'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(store.quotes[0].status).toBe('CONSUMED');
    expect(store.bookings).toHaveLength(1);
    expect(store.snapshots).toHaveLength(1);
    expect(store.snapshots[0].isCurrent).toBe(true);
  });

  it('appends snapshot revision on reprice without overwriting prior revision', async () => {
    const { store, pricing, quotes, application } = build();
    const { quote: quote1 } = await createQuote(pricing, quotes);
    await atomicCreate(application, pricing, quote1.quoteId, 'booking-reprice');

    const { quote: quote2 } = await createQuote(pricing, quotes);
    const result = await application.repriceBookingWithQuote({
      organizationId: ids.orgId,
      userId,
      bookingId: 'booking-reprice',
      quoteId: quote2.quoteId,
      vehicleId: ids.vehicleId,
      pickupAt: new Date(pickupAt),
      returnAt: new Date(returnAt),
      bookingUpdate: { status: 'PENDING' },
    });

    expect(result.snapshotRevision).toBe(2);
    expect(store.snapshots).toHaveLength(2);
    expect(store.snapshots.filter((s) => s.isCurrent)).toHaveLength(1);
    expect(store.snapshots.find((s) => s.revision === 1)?.isCurrent).toBe(false);
    expect(store.snapshots.find((s) => s.revision === 2)?.isCurrent).toBe(true);
  });
});
