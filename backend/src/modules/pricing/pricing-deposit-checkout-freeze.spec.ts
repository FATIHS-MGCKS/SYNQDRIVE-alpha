import { PrismaService } from '@shared/database/prisma.service';
import { BookingWizardCheckoutContextService } from '@modules/bookings/booking-wizard-checkout-context.service';
import { BookingDepositSnapshotService } from '@modules/deposit/booking-deposit-snapshot.service';
import { OrganizationPaymentAccountService } from '@modules/payments/organization-payment-account.service';
import { PaymentsAccessService } from '@modules/payments/payments-access.service';
import { PaymentFeeService } from '@modules/payments/payment-fee.service';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingMigrationService } from './pricing-migration.service';
import { PricingQuoteService } from './pricing-quote.service';
import { PricingService } from './pricing.service';
import {
  createBookingDepositSnapshotStub,
  createPricingTestStore,
  createSedanPricingFixtures,
  createTariffPassthroughDepositResolver,
  SEDAN_DEPOSIT_ACTIVE_CENTS,
} from './pricing-test-store';

describe('Deposit checkout freeze flow (quote → snapshot → checkout)', () => {
  const ids = createSedanPricingFixtures();
  const migration = { ensureOrgPricing: jest.fn().mockResolvedValue({ migrated: false, vehiclesAssigned: 0 }) };
  const depositSnapshotStub = createBookingDepositSnapshotStub();

  function build() {
    const store = createPricingTestStore(ids);
    const prisma = store.prisma as unknown as PrismaService;
    const tariffs = new PriceTariffsService(prisma, migration as unknown as PricingMigrationService);
    const pricing = new PricingService(
      prisma,
      migration as unknown as PricingMigrationService,
      createTariffPassthroughDepositResolver(),
      depositSnapshotStub,
    );
    const quotes = new PricingQuoteService(prisma, pricing);
    const checkout = new BookingWizardCheckoutContextService(
      prisma,
      { isPaymentsEnabled: jest.fn().mockResolvedValue(true) } as unknown as PaymentsAccessService,
      {
        findByOrganization: jest.fn().mockResolvedValue({
          stripeConnectedAccountId: 'acct_1',
          status: 'ACTIVE',
          chargesEnabled: true,
        }),
      } as unknown as OrganizationPaymentAccountService,
      {
        buildFeeSnapshotForBooking: jest.fn().mockResolvedValue({ rentalPaymentAmountCents: 12_000 }),
      } as unknown as PaymentFeeService,
      depositSnapshotStub as unknown as BookingDepositSnapshotService,
    );
    return { store, tariffs, pricing, quotes, checkout, prisma };
  }

  it('keeps the same deposit from simulation through quote, snapshot, and checkout context', async () => {
    const { pricing, quotes, checkout, prisma } = build();
    const pickupAt = '2026-07-20T10:00:00.000Z';
    const returnAt = '2026-08-04T10:00:00.000Z';

    const simulation = await pricing.simulateBookingPrice(ids.orgId, {
      vehicleId: ids.vehicleId,
      pickupAt,
      returnAt,
    });
    expect(simulation.depositAmountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);

    const quote = await quotes.createQuote({
      organizationId: ids.orgId,
      vehicleId: ids.vehicleId,
      pickupAt: new Date(pickupAt),
      returnAt: new Date(returnAt),
      simulation,
    });
    expect(quote.totals.depositAmountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
    expect(quote.totals.frozenDeposit?.amountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);

    const consumed = await quotes.consumeForBooking({
      organizationId: ids.orgId,
      quoteId: quote.quoteId,
      vehicleId: ids.vehicleId,
      pickupAt: new Date(pickupAt),
      returnAt: new Date(returnAt),
    });
    expect(consumed.simulation.depositAmountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);

    const bookingId = 'booking-deposit-freeze-1';
    await prisma.booking.create({
      data: {
        id: bookingId,
        organizationId: ids.orgId,
        customerId: 'cust-1',
        vehicleId: ids.vehicleId,
        startDate: new Date(pickupAt),
        endDate: new Date(returnAt),
        status: 'PENDING',
        totalPriceCents: consumed.simulation.totalGrossCents,
        currency: 'eur',
      },
    });

    await pricing.createBookingPriceSnapshotFromSimulation(
      ids.orgId,
      bookingId,
      consumed.simulation,
    );

    (depositSnapshotStub.extractFrozenDepositFromPricingInput as jest.Mock).mockReturnValue({
      amountCents: SEDAN_DEPOSIT_ACTIVE_CENTS,
      currency: 'EUR',
      source: 'TARIFF_RATE',
      ruleRevisionId: 'rate-1',
      reason: 'From active tariff rate.',
      manualOverride: false,
      calculatedAt: new Date().toISOString(),
      frozenAt: null,
    });

    const context = await checkout.getCheckoutContext(ids.orgId, bookingId);
    expect(context.depositAmountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
    expect(context.depositDueAtPickupCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
    expect(context.rentalAmountCents).toBe(consumed.simulation.totalGrossCents);
    expect(context.frozenDeposit?.amountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
  });
});
