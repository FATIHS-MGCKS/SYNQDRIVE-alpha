/**
 * Consolidated E2E-style integration test for the Sedan deposit 177 € → 500 € flow.
 * Maps to Prompt 14 acceptance scenario steps 1–16 (backend-verified subset).
 */
import { PrismaService } from '@shared/database/prisma.service';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingService } from './pricing.service';
import { PricingMigrationService } from './pricing-migration.service';
import { PricingQuoteService } from './pricing-quote.service';
import {
  createPricingTestStore,
  createSedanPricingFixtures,
  createTariffPassthroughDepositResolver,
  SEDAN_DEPOSIT_ACTIVE_CENTS,
  SEDAN_DEPOSIT_DRAFT_CENTS,
  SEDAN_DAILY_NET_CENTS,
} from './pricing-test-store';
import { isExtrasSumLineType, isTaxablePricingLineType } from './pricing-line-item-types';

describe('Pricing deposit E2E flow (17700 → 50000 cents)', () => {
  const ids = createSedanPricingFixtures();
  const migration = { ensureOrgPricing: jest.fn().mockResolvedValue({ migrated: false, vehiclesAssigned: 0 }) };

  function build() {
    const store = createPricingTestStore(ids);
    const prisma = store.prisma as unknown as PrismaService;
    const tariffs = new PriceTariffsService(prisma, migration as unknown as PricingMigrationService);
    const pricing = new PricingService(
      prisma,
      migration as unknown as PricingMigrationService,
      createTariffPassthroughDepositResolver(),
    );
    const quotes = new PricingQuoteService(prisma, pricing);
    return { store, tariffs, pricing, quotes };
  }

  const draftPayload = (deposit: number) => ({
    rate: {
      dailyRateCents: SEDAN_DAILY_NET_CENTS,
      weeklyRateCents: SEDAN_DAILY_NET_CENTS * 7,
      monthlyRateCents: SEDAN_DAILY_NET_CENTS * 30,
      includedKmPerDay: 200,
      extraKmPriceCents: 22,
      depositAmountCents: deposit,
    },
  });

  it('steps 1–16: live 17700 → draft 50000 → publish → simulate → quote → snapshot', async () => {
    const { store, tariffs, pricing, quotes } = build();

    // 1. Sedan active deposit 177 €
    expect(store.rates.find((r) => r.tariffVersionId === ids.activeVersionId)?.depositAmountCents).toBe(
      SEDAN_DEPOSIT_ACTIVE_CENTS,
    );

    // 3–4. Change deposit to 500 € and save draft
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftPayload(SEDAN_DEPOSIT_DRAFT_CENTS));
    expect(draft.rate?.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);

    // 5. Live still 17700 while draft is 50000
    const liveRate = store.rates.find((r) => r.tariffVersionId === ids.activeVersionId);
    expect(liveRate?.depositAmountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);

    // 6–8. Publish — old archived, new active
    const published = await tariffs.publishTariffDraft(ids.orgId, ids.groupId, { draftVersionId: draft.id });
    expect(published.status).toBe('ACTIVE');
    expect(published.rate?.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
    expect(store.versions.find((v) => v.id === ids.activeVersionId)?.status).toBe('ARCHIVED');

    // 9–10. Simulation uses 50000
    const simulation = await pricing.simulateBookingPrice(ids.orgId, {
      vehicleId: ids.vehicleId,
      pickupAt: store.pickupAt.toISOString(),
      returnAt: store.returnAt.toISOString(),
    });
    expect(simulation.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
    expect(simulation.tariffVersionId).toBe(draft.id);
    expect(simulation.currency).toBe('EUR');
    expect(simulation.pricingContext?.assignmentId).toBeTruthy();
    expect(simulation.pricingContext?.tariffGroupId).toBe(ids.groupId);

    // 12. Quote contains 50000 deposit
    const quote = await quotes.createQuote({
      organizationId: ids.orgId,
      vehicleId: ids.vehicleId,
      pickupAt: store.pickupAt,
      returnAt: store.returnAt,
      simulation,
    });
    expect(quote.totals.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);

    // 13–14. Booking snapshot from quote path
    const bookingId = 'booking-e2e-deposit';
    const { snapshot } = await pricing.createBookingPriceSnapshot(ids.orgId, bookingId, {
      vehicleId: ids.vehicleId,
      pickupAt: store.pickupAt,
      returnAt: store.returnAt,
    });

    expect(snapshot.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
    expect(snapshot.currency).toBe('EUR');
    expect(snapshot.tariffGroupId).toBe(ids.groupId);
    expect(snapshot.tariffVersionId).toBe(draft.id);

    // 15. Deposit not in extras or taxable revenue
    const snapRow = store.snapshots.find((s) => s.bookingId === bookingId);
    const depositLine = snapRow?.lineItems.find((li) => li.type === 'DEPOSIT');
    expect(depositLine?.taxRatePercent).toBe(0);
    for (const li of snapRow?.lineItems ?? []) {
      if (li.type === 'DEPOSIT') {
        expect(isExtrasSumLineType(li.type as never)).toBe(false);
        expect(isTaxablePricingLineType(li.type as never)).toBe(false);
      }
    }

    // 16. totalDueNow = gross + deposit (no VAT on deposit)
    expect(snapshot.totalDueNowCents).toBe(snapshot.totalGrossCents + snapshot.depositAmountCents);

    void quote;
  });
});
