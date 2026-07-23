import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingMigrationService } from './pricing-migration.service';
import { PricingService } from './pricing.service';
import {
  createPricingTestStore,
  createSedanPricingFixtures,
  createTariffPassthroughDepositResolver,
  createBookingDepositSnapshotStub,
  SEDAN_DEPOSIT_ACTIVE_CENTS,
  SEDAN_DEPOSIT_DRAFT_CENTS,
} from './pricing-test-store';
import { zonedStartOfDayToUtc } from './tariff-instant.util';

describe('Pricing context (server-resolved)', () => {
  const ids = createSedanPricingFixtures();
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
    return { store, tariffs, pricing };
  }

  const simulate = (
    pricing: PricingService,
    pickupAt: string,
    returnAt = '2026-08-04T10:00:00.000Z',
  ) =>
    pricing.simulateBookingPrice(ids.orgId, {
      vehicleId: ids.vehicleId,
      pickupAt,
      returnAt,
    });

  it('pricingContext contains correct IDs', async () => {
    const { pricing } = build();
    const result = await simulate(pricing, '2026-07-20T10:00:00.000Z');
    const ctx = result.pricingContext;

    expect(ctx.priceBookId).toBe(ids.priceBookId);
    expect(ctx.assignmentId).toBe(ids.assignmentId);
    expect(ctx.tariffGroupId).toBe(ids.groupId);
    expect(ctx.tariffVersionId).toBe(ids.activeVersionId);
    expect(ctx.vehicleId).toBe(ids.vehicleId);
    expect(ctx.tariffGroupName).toBe('Sedan');
    expect(ctx.priceBookName).toBe('Standard Preisbuch');
  });

  it('pricingContext uses effective tariff version at pickup', async () => {
    const { tariffs, pricing } = build();
    const draft = await tariffs.upsertGroupVersion(
      ids.orgId,
      ids.groupId,
      draftRate(SEDAN_DEPOSIT_DRAFT_CENTS),
    );
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
      effectiveFrom: '2026-08-01',
    });

    const july = await simulate(pricing, '2026-07-20T10:00:00.000Z');
    expect(july.pricingContext.tariffVersionId).toBe(ids.activeVersionId);
    expect(july.pricingContext.versionNumber).toBe(1);

    const august = await simulate(
      pricing,
      '2026-08-05T10:00:00.000Z',
      '2026-08-08T10:00:00.000Z',
    );
    expect(august.pricingContext.tariffVersionId).toBe(draft.id);
  });

  it('pricingContext uses correct currency from price book', async () => {
    const usdIds = { ...ids, priceBookId: 'book-usd-1' };
    const store = createPricingTestStore(usdIds, { currency: 'USD' });
    const pricing = new PricingService(
      store.prisma as unknown as PrismaService,
      migration as unknown as PricingMigrationService,
      createTariffPassthroughDepositResolver(),
      createBookingDepositSnapshotStub(),
    );

    const result = await pricing.simulateBookingPrice(ids.orgId, {
      vehicleId: ids.vehicleId,
      pickupAt: '2026-07-20T10:00:00.000Z',
      returnAt: '2026-07-22T10:00:00.000Z',
    });

    expect(result.pricingContext.currency).toBe('USD');
    expect(result.currency).toBe('USD');
  });

  it('pricingContext contains 50000 cent deposit when scheduled version applies', async () => {
    const { tariffs, pricing } = build();
    const draft = await tariffs.upsertGroupVersion(
      ids.orgId,
      ids.groupId,
      draftRate(SEDAN_DEPOSIT_DRAFT_CENTS),
    );
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
      effectiveFrom: '2026-08-01',
    });

    const august = await simulate(
      pricing,
      '2026-08-05T10:00:00.000Z',
      '2026-08-08T10:00:00.000Z',
    );
    expect(august.pricingContext.depositAmountCents).toBe(50000);
    expect(august.depositAmountCents).toBe(50000);
  });

  it('future booking receives scheduled tariff in pricingContext', async () => {
    const { tariffs, pricing } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRate(60000));
    const switchAt = zonedStartOfDayToUtc('2026-08-01', 'Europe/Berlin');
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
      effectiveFrom: '2026-08-01',
    });

    const future = await simulate(pricing, switchAt.toISOString(), '2026-08-03T10:00:00.000Z');
    expect(future.pricingContext.tariffVersionId).toBe(draft.id);
    expect(future.pricingContext.effectiveFrom).toBe(switchAt.toISOString());
  });

  it('rejects inactive tariff group', async () => {
    const { store, pricing } = build();
    const group = store.groups.find((g) => g.id === ids.groupId)!;
    group.isActive = false;

    await expect(simulate(pricing, '2026-07-20T10:00:00.000Z')).rejects.toMatchObject({
      response: { code: 'TARIFF_GROUP_INACTIVE' },
    });
  });

  it('simulation and booking snapshot share the same resolver pricingContext', async () => {
    const { pricing } = build();
    const pickupAt = '2026-07-20T10:00:00.000Z';
    const returnAt = '2026-07-22T10:00:00.000Z';

    const simulation = await pricing.simulateBookingPrice(ids.orgId, {
      vehicleId: ids.vehicleId,
      pickupAt,
      returnAt,
    });

    const { simulation: snapshotSim } = await pricing.createBookingPriceSnapshot(
      ids.orgId,
      'booking-ctx-1',
      {
        vehicleId: ids.vehicleId,
        pickupAt: new Date(pickupAt),
        returnAt: new Date(returnAt),
      },
    );

    expect(snapshotSim.pricingContext).toEqual(simulation.pricingContext);
    expect(snapshotSim.tariffVersionId).toBe(simulation.pricingContext.tariffVersionId);
  });

  it('conflicting assignments produce ASSIGNMENT_CONFLICT', async () => {
    const { store, pricing } = build();
    store.assignments.push({
      id: 'assignment-conflict-2',
      organizationId: ids.orgId,
      vehicleId: ids.vehicleId,
      tariffGroupId: 'group-other',
      priceBookId: 'book-other',
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      validTo: null,
      isActive: true,
    });

    await expect(simulate(pricing, '2026-07-20T10:00:00.000Z')).rejects.toMatchObject({
      response: { code: 'ASSIGNMENT_CONFLICT' },
    });
  });

  it('never uses DRAFT version in pricingContext', async () => {
    const { tariffs, pricing } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRate(99999));
    const result = await simulate(pricing, '2026-07-20T10:00:00.000Z');
    expect(result.pricingContext.tariffVersionId).not.toBe(draft.id);
    expect(result.pricingContext.tariffVersionId).toBe(ids.activeVersionId);
  });

  it('rejects incomplete tariff version rate', async () => {
    const { store, pricing } = build();
    const rate = store.rates.find((r) => r.tariffVersionId === ids.activeVersionId)!;
    rate.dailyRateCents = 0;

    await expect(simulate(pricing, '2026-07-20T10:00:00.000Z')).rejects.toMatchObject({
      response: { code: 'TARIFF_VERSION_INCOMPLETE' },
    });
  });

  it('resolvePricingContext matches simulateBookingPrice context', async () => {
    const { pricing } = build();
    const pickupAt = new Date('2026-07-20T10:00:00.000Z');
    const returnAt = new Date('2026-07-22T10:00:00.000Z');

    const resolved = await pricing.resolvePricingContext(
      ids.orgId,
      ids.vehicleId,
      pickupAt,
      returnAt,
    );
    const simulated = await pricing.simulateBookingPrice(ids.orgId, {
      vehicleId: ids.vehicleId,
      pickupAt: pickupAt.toISOString(),
      returnAt: returnAt.toISOString(),
    });

    expect(resolved).toEqual(simulated.pricingContext);
  });
});

describe('Pricing context error shape', () => {
  it('BadRequestException exposes machine-readable code', () => {
    const err = new BadRequestException({
      message: 'Test',
      code: 'NO_ACTIVE_TARIFF',
    });
    expect(err.getResponse()).toMatchObject({ code: 'NO_ACTIVE_TARIFF' });
  });
});
