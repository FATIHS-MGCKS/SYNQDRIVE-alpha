import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingMigrationService } from './pricing-migration.service';
import { PricingService } from './pricing.service';
import {
  createPricingTestStore,
  createSedanPricingFixtures,
  SEDAN_DEPOSIT_ACTIVE_CENTS,
  SEDAN_DEPOSIT_DRAFT_CENTS,
} from './pricing-test-store';
import { zonedStartOfDayToUtc } from './tariff-instant.util';
import { isEffectiveAt } from './tariff-validity.util';

describe('Pricing tariff resolution by pickup instant', () => {
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

  it('uses current ACTIVE tariff for pickup today (before scheduled switch)', async () => {
    const { tariffs, pricing } = build();
    const draft = await tariffs.upsertGroupVersion(
      ids.orgId,
      ids.groupId,
      draftRate(SEDAN_DEPOSIT_DRAFT_CENTS),
    );
    const switchAt = zonedStartOfDayToUtc('2026-08-01', 'Europe/Berlin');
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
      effectiveFrom: '2026-08-01',
    });

    const julyPickup = await simulate(pricing, '2026-07-20T10:00:00.000Z');
    expect(julyPickup.depositAmountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
    expect(julyPickup.tariffVersionId).toBe(ids.activeVersionId);
    void switchAt;
  });

  it('uses SCHEDULED tariff for future pickup after switch date', async () => {
    const { store, tariffs, pricing } = build();
    const draft = await tariffs.upsertGroupVersion(
      ids.orgId,
      ids.groupId,
      draftRate(SEDAN_DEPOSIT_DRAFT_CENTS),
    );
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
      effectiveFrom: '2026-08-01',
    });

    const augustPickup = await simulate(
      pricing,
      '2026-08-05T10:00:00.000Z',
      '2026-08-08T10:00:00.000Z',
    );
    expect(augustPickup.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
    expect(augustPickup.tariffVersionId).toBe(draft.id);

    const scheduled = store.versions.find((v) => v.id === draft.id);
    expect(scheduled?.status).toBe('SCHEDULED');
  });

  it('uses ARCHIVED tariff for historical pickup before switch', async () => {
    const { store, tariffs, pricing } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRate(50000));
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, { draftVersionId: draft.id });

    const archived = store.versions.find((v) => v.id === ids.activeVersionId);
    expect(archived?.status).toBe('ARCHIVED');

    const historical = await simulate(pricing, '2026-02-01T10:00:00.000Z');
    expect(historical.tariffVersionId).toBe(ids.activeVersionId);
    expect(historical.depositAmountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
  });

  it('applies new tariff exactly at switch instant (validFrom inclusive)', async () => {
    const { tariffs, pricing } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRate(60000));
    const switchInstant = zonedStartOfDayToUtc('2026-08-01', 'Europe/Berlin');
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
      effectiveFrom: '2026-08-01',
    });

    const atSwitch = await simulate(pricing, switchInstant.toISOString());
    expect(atSwitch.tariffVersionId).toBe(draft.id);
    expect(atSwitch.depositAmountCents).toBe(60000);
  });

  it('excludes superseded tariff at validTo boundary (validTo exclusive)', async () => {
    const { store, tariffs } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRate(55000));
    const switchInstant = zonedStartOfDayToUtc('2026-08-01', 'Europe/Berlin');
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
      effectiveFrom: switchInstant.toISOString(),
    });

    const active = store.versions.find((v) => v.id === ids.activeVersionId);
    expect(active?.validTo?.toISOString()).toBe(switchInstant.toISOString());
    expect(
      isEffectiveAt(
        { validFrom: active!.validFrom, validTo: active!.validTo },
        switchInstant,
      ),
    ).toBe(false);
  });

  it('parses date-only effectiveFrom in org timezone (DST summer → UTC)', async () => {
    const { store, tariffs } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRate(58000));
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
      effectiveFrom: '2026-08-01',
    });

    const scheduled = store.versions.find((v) => v.id === draft.id);
    expect(scheduled?.validFrom.toISOString()).toBe('2026-07-31T22:00:00.000Z');
  });

  it('ends prior ACTIVE validTo when scheduling without overlapping windows', async () => {
    const { store, tariffs } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRate(52000));
    const switchInstant = zonedStartOfDayToUtc('2026-08-01', 'Europe/Berlin');
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
      effectiveFrom: '2026-08-01',
    });

    const active = store.versions.find((v) => v.id === ids.activeVersionId)!;
    const scheduled = store.versions.find((v) => v.id === draft.id)!;
    expect(active.validTo?.getTime()).toBe(switchInstant.getTime());
    expect(active.status).toBe('ACTIVE');

    const midpoint = new Date(switchInstant.getTime() - 60_000);
    expect(isEffectiveAt(active, midpoint)).toBe(true);
    expect(isEffectiveAt(scheduled, midpoint)).toBe(false);
    expect(isEffectiveAt(scheduled, switchInstant)).toBe(true);
  });

  it('returns clear error when no version matches pickup', async () => {
    const { store, pricing } = build();
    const active = store.versions.find((v) => v.id === ids.activeVersionId)!;
    active.validTo = new Date('2026-01-01T00:00:00.000Z');

    await expect(simulate(pricing, '2026-08-01T10:00:00.000Z')).rejects.toMatchObject({
      response: { code: 'NO_TARIFF_VERSION_FOR_PICKUP' },
    });
  });

  it('never resolves DRAFT versions for booking simulation', async () => {
    const { tariffs, pricing } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRate(99999));
    const simulation = await simulate(pricing, '2026-08-01T10:00:00.000Z');
    expect(simulation.tariffVersionId).not.toBe(draft.id);
    expect(simulation.depositAmountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
  });

  it('keeps existing booking snapshot after tariff publish', async () => {
    const { store, tariffs, pricing } = build();
    const before = await pricing.createBookingPriceSnapshot(ids.orgId, 'booking-hist-1', {
      vehicleId: ids.vehicleId,
      pickupAt: store.pickupAt,
      returnAt: store.returnAt,
    });

    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRate(88888));
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, { draftVersionId: draft.id });

    const after = store.snapshots.find((s) => s.bookingId === 'booking-hist-1');
    expect(after?.depositAmountCents).toBe(before.snapshot.depositAmountCents);
    expect(after?.tariffVersionId).toBe(before.snapshot.tariffVersionId);

    const newSim = await simulate(pricing, store.pickupAt.toISOString());
    expect(newSim.depositAmountCents).toBe(88888);
  });

  it('exposes future SCHEDULED version in catalog', async () => {
    const { tariffs } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRate(47000));
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
      effectiveFrom: '2030-01-01',
    });

    const catalog = await tariffs.getFullCatalog(ids.orgId);
    const group = catalog.groups[0] as {
      scheduledVersions?: Array<{ id: string; status: string }>;
      activeVersion?: { id: string };
    };
    expect(group.scheduledVersions?.some((v) => v.id === draft.id && v.status === 'SCHEDULED')).toBe(
      true,
    );
    expect(group.activeVersion?.id).toBe(ids.activeVersionId);
  });

  it('rejects invalid pickup instant', async () => {
    const { pricing } = build();
    await expect(
      pricing.simulateBookingPrice(ids.orgId, {
        vehicleId: ids.vehicleId,
        pickupAt: 'not-a-date',
        returnAt: '2026-08-04T10:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
