import { PrismaService } from '@shared/database/prisma.service';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingMigrationService } from './pricing-migration.service';
import { PricingQuoteService } from './pricing-quote.service';
import { PRICING_QUOTE_STALE_MESSAGE } from './pricing-quote.types';
import { PricingService } from './pricing.service';
import {
  createPricingTestStore,
  createSedanPricingFixtures,
  createTariffPassthroughDepositResolver,
  createBookingDepositSnapshotStub,
  SEDAN_DEPOSIT_ACTIVE_CENTS,
  SEDAN_DEPOSIT_DRAFT_CENTS,
} from './pricing-test-store';

describe('Pricing quotes (price lock)', () => {
  const ids = createSedanPricingFixtures();
  const userId = 'user-staff-1';
  const migration = {
    ensureOrgPricing: jest.fn().mockResolvedValue({ migrated: false, vehiclesAssigned: 0 }),
  };

  const draftRate = (depositAmountCents: number) => ({
    rate: {
      dailyRateCents: 4958,
      weeklyRateCents: 0,
      monthlyRateCents: 0,
      includedKmPerDay: 200,
      extraKmPriceCents: 22,
      depositAmountCents,
    },
  });

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
    return { store, tariffs, pricing, quotes };
  }

  const pickupAt = '2026-08-01T10:00:00.000Z';
  const returnAt = '2026-08-04T10:00:00.000Z';

  async function simulateAndQuote(
    pricing: PricingService,
    quotes: PricingQuoteService,
    pricingInput?: Record<string, unknown>,
  ) {
    const simulation = await pricing.simulateBookingPrice(ids.orgId, {
      vehicleId: ids.vehicleId,
      pickupAt,
      returnAt,
      ...pricingInput,
    });
    const quote = await quotes.createQuote({
      organizationId: ids.orgId,
      createdByUserId: userId,
      vehicleId: ids.vehicleId,
      pickupAt: new Date(pickupAt),
      returnAt: new Date(returnAt),
      pricingInput: pricingInput as never,
      simulation,
    });
    return { simulation, quote };
  }

  async function consumeAndSnapshot(
    store: ReturnType<typeof createPricingTestStore>,
    pricing: PricingService,
    quotes: PricingQuoteService,
    quoteId: string,
    bookingId: string,
    pricingInput?: Record<string, unknown>,
  ) {
    const { simulation, pricingInput: quotedInput } = await quotes.consumeForBooking({
      organizationId: ids.orgId,
      userId,
      quoteId,
      vehicleId: ids.vehicleId,
      pickupAt: new Date(pickupAt),
      returnAt: new Date(returnAt),
      pricingInput: pricingInput as never,
    });

    await (store.prisma as { $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> }).$transaction(
      async (tx) => {
        await quotes.markConsumed(tx as never, quoteId, ids.orgId, bookingId);
        await pricing.createBookingPriceSnapshotFromSimulation(
          ids.orgId,
          bookingId,
          simulation,
          quotedInput,
          tx as never,
        );
      },
    );

    return { simulation, snapshot: store.snapshots[store.snapshots.length - 1] };
  }

  it('valid quote creates booking snapshot from accepted quote', async () => {
    const { store, pricing, quotes } = build();
    const { simulation, quote } = await simulateAndQuote(pricing, quotes);
    const { snapshot } = await consumeAndSnapshot(
      store,
      pricing,
      quotes,
      quote.quoteId,
      'booking-1',
    );

    expect(snapshot.tariffVersionId).toBe(simulation.tariffVersionId);
    expect(snapshot.totalGrossCents).toBe(simulation.totalGrossCents);
    expect(snapshot.depositAmountCents).toBe(simulation.depositAmountCents);
    expect(store.quotes[0].status).toBe('CONSUMED');
    expect(store.quotes[0].consumedByBookingId).toBe('booking-1');
  });

  it('pricing snapshot matches quote totals exactly', async () => {
    const { store, pricing, quotes } = build();
    const { simulation, quote } = await simulateAndQuote(pricing, quotes);
    const { snapshot } = await consumeAndSnapshot(
      store,
      pricing,
      quotes,
      quote.quoteId,
      'booking-snap',
    );

    expect(snapshot.subtotalNetCents).toBe(simulation.subtotalNetCents);
    expect(snapshot.taxAmountCents).toBe(simulation.taxAmountCents);
    expect(snapshot.totalGrossCents).toBe(simulation.totalGrossCents);
    expect(snapshot.depositAmountCents).toBe(simulation.depositAmountCents);
    expect(snapshot.rentalDays).toBe(simulation.rentalDays);
    expect(snapshot.currency).toBe(simulation.currency);
    expect(snapshot.lineItems.length).toBe(simulation.lineItems.length);
  });

  it('rejects expired quote', async () => {
    const { store, pricing, quotes } = build();
    const { quote } = await simulateAndQuote(pricing, quotes);
    store.quotes[0].expiresAt = new Date('2020-01-01T00:00:00.000Z');

    await expect(
      quotes.consumeForBooking({
        organizationId: ids.orgId,
        userId,
        quoteId: quote.quoteId,
        vehicleId: ids.vehicleId,
        pickupAt: new Date(pickupAt),
        returnAt: new Date(returnAt),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PRICING_QUOTE_EXPIRED',
        message: PRICING_QUOTE_STALE_MESSAGE,
      }),
    });
    expect(store.quotes[0].status).toBe('EXPIRED');
  });

  it('rejects changed rental period', async () => {
    const { pricing, quotes } = build();
    const { quote } = await simulateAndQuote(pricing, quotes);

    await expect(
      quotes.consumeForBooking({
        organizationId: ids.orgId,
        userId,
        quoteId: quote.quoteId,
        vehicleId: ids.vehicleId,
        pickupAt: new Date('2026-08-02T10:00:00.000Z'),
        returnAt: new Date(returnAt),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PRICING_QUOTE_PERIOD_MISMATCH' }),
    });
  });

  it('rejects changed extras selection', async () => {
    const { store, pricing, quotes } = build();
    const extraId = 'extra-active-1';
    store.extraOptions.push({
      id: extraId,
      organizationId: ids.orgId,
      tariffVersionId: ids.activeVersionId,
      label: 'Kindersitz',
      description: null,
      priceCents: 500,
      pricingType: 'PER_BOOKING',
      isActive: true,
      sortOrder: 0,
    });

    const { quote } = await simulateAndQuote(pricing, quotes, {
      selectedExtraOptionIds: [extraId],
    });

    await expect(
      quotes.consumeForBooking({
        organizationId: ids.orgId,
        userId,
        quoteId: quote.quoteId,
        vehicleId: ids.vehicleId,
        pickupAt: new Date(pickupAt),
        returnAt: new Date(returnAt),
        pricingInput: { selectedExtraOptionIds: [] },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PRICING_QUOTE_OPTIONS_MISMATCH' }),
    });
  });

  it('rejects quote from another organization', async () => {
    const { pricing, quotes } = build();
    const { quote } = await simulateAndQuote(pricing, quotes);

    await expect(
      quotes.consumeForBooking({
        organizationId: 'other-org',
        userId,
        quoteId: quote.quoteId,
        vehicleId: ids.vehicleId,
        pickupAt: new Date(pickupAt),
        returnAt: new Date(returnAt),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PRICING_QUOTE_NOT_FOUND' }),
    });
  });

  it('cannot consume quote twice', async () => {
    const { store, pricing, quotes } = build();
    const { quote } = await simulateAndQuote(pricing, quotes);
    await consumeAndSnapshot(store, pricing, quotes, quote.quoteId, 'booking-once');

    await expect(
      quotes.consumeForBooking({
        organizationId: ids.orgId,
        userId,
        quoteId: quote.quoteId,
        vehicleId: ids.vehicleId,
        pickupAt: new Date(pickupAt),
        returnAt: new Date(returnAt),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PRICING_QUOTE_ALREADY_CONSUMED' }),
    });
  });

  it('detects tariff version change after quote', async () => {
    const { tariffs, pricing, quotes } = build();
    const { quote } = await simulateAndQuote(pricing, quotes);

    const draft = await tariffs.upsertGroupVersion(
      ids.orgId,
      ids.groupId,
      draftRate(SEDAN_DEPOSIT_ACTIVE_CENTS),
    );
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
      effectiveFrom: '2026-08-01',
    });

    await expect(
      quotes.consumeForBooking({
        organizationId: ids.orgId,
        userId,
        quoteId: quote.quoteId,
        vehicleId: ids.vehicleId,
        pickupAt: new Date(pickupAt),
        returnAt: new Date(returnAt),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PRICING_QUOTE_STALE',
        reason: 'TARIFF_VERSION_CHANGED',
      }),
    });
  });

  it('keeps 500 EUR deposit from quoted scheduled tariff', async () => {
    const { tariffs, pricing, quotes } = build();
    const draft = await tariffs.upsertGroupVersion(
      ids.orgId,
      ids.groupId,
      draftRate(SEDAN_DEPOSIT_DRAFT_CENTS),
    );
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
      effectiveFrom: '2026-08-01',
    });

    const augustPickup = '2026-08-05T10:00:00.000Z';
    const augustReturn = '2026-08-08T10:00:00.000Z';
    const simulation = await pricing.simulateBookingPrice(ids.orgId, {
      vehicleId: ids.vehicleId,
      pickupAt: augustPickup,
      returnAt: augustReturn,
    });
    expect(simulation.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);

    const quote = await quotes.createQuote({
      organizationId: ids.orgId,
      createdByUserId: userId,
      vehicleId: ids.vehicleId,
      pickupAt: new Date(augustPickup),
      returnAt: new Date(augustReturn),
      simulation,
    });

    const consumed = await quotes.consumeForBooking({
      organizationId: ids.orgId,
      userId,
      quoteId: quote.quoteId,
      vehicleId: ids.vehicleId,
      pickupAt: new Date(augustPickup),
      returnAt: new Date(augustReturn),
    });

    expect(consumed.simulation.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
    expect(quote.totals.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
  });

  it('does not silently change price when tariff changes after quote', async () => {
    const { store, tariffs, pricing, quotes } = build();
    const { quote, simulation } = await simulateAndQuote(pricing, quotes);

    const draft = await tariffs.upsertGroupVersion(
      ids.orgId,
      ids.groupId,
      draftRate(SEDAN_DEPOSIT_DRAFT_CENTS),
    );
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
      effectiveFrom: '2026-08-01',
    });

    await expect(
      quotes.consumeForBooking({
        organizationId: ids.orgId,
        userId,
        quoteId: quote.quoteId,
        vehicleId: ids.vehicleId,
        pickupAt: new Date(pickupAt),
        returnAt: new Date(returnAt),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PRICING_QUOTE_STALE' }),
    });

    const freshSim = await pricing.simulateBookingPrice(ids.orgId, {
      vehicleId: ids.vehicleId,
      pickupAt,
      returnAt,
    });
    expect(freshSim.tariffVersionId).not.toBe(simulation.tariffVersionId);
    expect(freshSim.depositAmountCents).not.toBe(simulation.depositAmountCents);
    expect(store.quotes[0].status).toBe('ACTIVE');
  });

  it('parallel consume attempts yield only one successful consumption', async () => {
    const { store, pricing, quotes } = build();
    const { quote } = await simulateAndQuote(pricing, quotes);

    const attempt = async (bookingId: string) => {
      const { simulation } = await quotes.consumeForBooking({
        organizationId: ids.orgId,
        userId,
        quoteId: quote.quoteId,
        vehicleId: ids.vehicleId,
        pickupAt: new Date(pickupAt),
        returnAt: new Date(returnAt),
      });
      await (store.prisma as { $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> }).$transaction(
        async (tx) => {
          await quotes.markConsumed(tx as never, quote.quoteId, ids.orgId, bookingId);
          await pricing.createBookingPriceSnapshotFromSimulation(
            ids.orgId,
            bookingId,
            simulation,
            undefined,
            tx as never,
          );
        },
      );
    };

    const results = await Promise.allSettled([attempt('booking-a'), attempt('booking-b')]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(store.quotes[0].status).toBe('CONSUMED');
    expect(store.snapshots.length).toBe(1);
  });

  it('expires stale active quotes via cleanup', async () => {
    const { store, pricing, quotes } = build();
    await simulateAndQuote(pricing, quotes);
    await simulateAndQuote(pricing, quotes);
    store.quotes[0].expiresAt = new Date('2020-01-01T00:00:00.000Z');
    store.quotes[1].expiresAt = new Date('2099-01-01T00:00:00.000Z');

    const count = await quotes.expireStaleQuotes(ids.orgId);
    expect(count).toBe(1);
    expect(store.quotes[0].status).toBe('EXPIRED');
    expect(store.quotes[1].status).toBe('ACTIVE');
  });
});
