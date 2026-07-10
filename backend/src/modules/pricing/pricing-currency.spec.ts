import { BadRequestException } from '@nestjs/common';
import { PricingMigrationService } from './pricing-migration.service';
import { PricingService } from './pricing.service';
import { PriceTariffsService } from './price-tariffs.service';
import {
  createPricingTestStore,
  createSedanPricingFixtures,
  SEDAN_DEPOSIT_DRAFT_CENTS,
} from './pricing-test-store';

describe('Pricing currency resolution', () => {
  const pickupAt = '2026-08-01T10:00:00.000Z';
  const returnAt = '2026-08-04T10:00:00.000Z';

  const draftRatePayload = (depositAmountCents: number) => ({
    rate: {
      dailyRateCents: 4958,
      weeklyRateCents: 0,
      monthlyRateCents: 0,
      includedKmPerDay: 200,
      extraKmPriceCents: 22,
      depositAmountCents,
    },
  });

  function setup(currency: string) {
    const ids = createSedanPricingFixtures();
    const { prisma } = createPricingTestStore(ids, { currency });
    const migration = { ensureOrgPricing: jest.fn() } as unknown as PricingMigrationService;
    const pricing = new PricingService(prisma as never, migration);
    const tariffs = new PriceTariffsService(prisma as never, migration);
    return { ids, prisma, pricing, tariffs };
  }

  it('EUR price book returns EUR simulation currency', async () => {
    const { ids, pricing } = setup('EUR');
    const simulation = await pricing.simulateBookingPrice(ids.orgId, {
      vehicleId: ids.vehicleId,
      pickupAt,
      returnAt,
    });
    expect(simulation.currency).toBe('EUR');
    expect(simulation.depositAmountCents).toBe(17700);
  });

  it('USD price book returns USD simulation currency without conversion', async () => {
    const { ids, pricing } = setup('USD');
    const simulation = await pricing.simulateBookingPrice(ids.orgId, {
      vehicleId: ids.vehicleId,
      pickupAt,
      returnAt,
    });
    expect(simulation.currency).toBe('USD');
    expect(simulation.depositAmountCents).toBe(17700);
    expect(simulation.totalGrossCents).toBeGreaterThan(0);
  });

  it('rejects client currency mismatch on simulate', async () => {
    const { ids, pricing } = setup('EUR');
    await expect(
      pricing.simulateBookingPrice(ids.orgId, {
        vehicleId: ids.vehicleId,
        pickupAt,
        returnAt,
        currency: 'USD',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('snapshot stores server-resolved currency', async () => {
    const { ids, pricing, tariffs } = setup('USD');
    const draft = await tariffs.upsertGroupVersion(
      ids.orgId,
      ids.groupId,
      draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS),
    );
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
    });
    const simulation = await pricing.simulateBookingPrice(ids.orgId, {
      vehicleId: ids.vehicleId,
      pickupAt,
      returnAt,
    });
    const { snapshot } = await pricing.createBookingPriceSnapshot(ids.orgId, 'booking-usd-1', {
      vehicleId: ids.vehicleId,
      pickupAt: new Date(pickupAt),
      returnAt: new Date(returnAt),
    });
    expect(simulation.currency).toBe('USD');
    expect(snapshot.currency).toBe('USD');
    expect(snapshot.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
  });

  it('throws when price book currency is missing', async () => {
    const { ids, pricing } = setup('');
    await expect(
      pricing.simulateBookingPrice(ids.orgId, {
        vehicleId: ids.vehicleId,
        pickupAt,
        returnAt,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('177 → 500 deposit regression remains independent of currency code', async () => {
    const { ids, pricing, tariffs } = setup('EUR');
    const draft = await tariffs.upsertGroupVersion(
      ids.orgId,
      ids.groupId,
      draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS),
    );
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, { draftVersionId: draft.id });
    const simulation = await pricing.simulateBookingPrice(ids.orgId, {
      vehicleId: ids.vehicleId,
      pickupAt,
      returnAt,
    });
    expect(simulation.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
  });
});
