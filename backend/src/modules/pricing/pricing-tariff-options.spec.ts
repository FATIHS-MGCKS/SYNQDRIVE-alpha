import { PrismaService } from '@shared/database/prisma.service';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingMigrationService } from './pricing-migration.service';
import { PricingService } from './pricing.service';
import { resolveLineItemSourceId } from './pricing-line-item-source.util';
import {
  createPricingTestStore,
  createSedanPricingFixtures,
  SEDAN_DAILY_NET_CENTS,
  SEDAN_DEPOSIT_DRAFT_CENTS,
} from './pricing-test-store';

describe('Tariff option stable identity', () => {
  const ids = createSedanPricingFixtures();
  const migration = {
    ensureOrgPricing: jest.fn().mockResolvedValue({ migrated: false, vehiclesAssigned: 0 }),
  };

  const draftRate = () => ({
    rate: {
      dailyRateCents: SEDAN_DAILY_NET_CENTS,
      weeklyRateCents: 0,
      monthlyRateCents: 0,
      includedKmPerDay: 200,
      extraKmPriceCents: 22,
      depositAmountCents: SEDAN_DEPOSIT_DRAFT_CENTS,
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

  it('keeps existing extra option id after label edit', async () => {
    const { store, tariffs } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, {
      extraOptions: [
        {
          label: 'GPS',
          priceCents: 500,
          pricingType: 'PER_BOOKING',
          isActive: true,
          sortOrder: 0,
        },
      ],
    });

    const created = store.extraOptions.find((o) => o.tariffVersionId === draft.id);
    expect(created?.id).toBeTruthy();

    await tariffs.updateVersion(ids.orgId, draft.id, {
      extraOptions: [
        {
          id: created!.id,
          label: 'Navigation',
          priceCents: 600,
          pricingType: 'PER_BOOKING',
          isActive: true,
          sortOrder: 0,
        },
      ],
    });

    const updated = store.extraOptions.find((o) => o.id === created!.id);
    expect(updated?.label).toBe('Navigation');
    expect(store.extraOptions.filter((o) => o.tariffVersionId === draft.id)).toHaveLength(1);
  });

  it('supports duplicate labels with distinct ids', async () => {
    const { store, tariffs } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, {
      extraOptions: [
        { label: 'Child seat', priceCents: 300, pricingType: 'PER_BOOKING', sortOrder: 0 },
        { label: 'Child seat', priceCents: 400, pricingType: 'PER_BOOKING', sortOrder: 1 },
      ],
    });

    const rows = store.extraOptions.filter((o) => o.tariffVersionId === draft.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toBe(rows[1].id);
  });

  it('deactivates removed options instead of deleting them', async () => {
    const { store, tariffs } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, {
      extraOptions: [
        { label: 'GPS', priceCents: 500, pricingType: 'PER_BOOKING', sortOrder: 0 },
        { label: 'Ski rack', priceCents: 800, pricingType: 'PER_BOOKING', sortOrder: 1 },
      ],
    });

    const gps = store.extraOptions.find((o) => o.label === 'GPS' && o.tariffVersionId === draft.id)!;
    await tariffs.updateVersion(ids.orgId, draft.id, {
      extraOptions: [
        {
          id: gps.id,
          label: 'GPS',
          priceCents: 500,
          pricingType: 'PER_BOOKING',
          sortOrder: 0,
        },
      ],
    });

    const ski = store.extraOptions.find((o) => o.label === 'Ski rack')!;
    expect(ski.isActive).toBe(false);
    expect(store.extraOptions.some((o) => o.id === ski.id)).toBe(true);
  });

  it('does not offer deactivated options in new booking simulation', async () => {
    const { store, tariffs, pricing } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, {
      extraOptions: [
        { label: 'GPS', priceCents: 500, pricingType: 'PER_BOOKING', sortOrder: 0 },
      ],
    });
    const gps = store.extraOptions.find((o) => o.tariffVersionId === draft.id)!;

    await tariffs.updateVersion(ids.orgId, draft.id, {
      extraOptions: [
        {
          id: gps.id,
          label: 'GPS',
          priceCents: 500,
          pricingType: 'PER_BOOKING',
          isActive: false,
          sortOrder: 0,
        },
      ],
    });

    await expect(
      pricing.simulateBookingPrice(ids.orgId, {
        vehicleId: ids.vehicleId,
        pickupAt: store.pickupAt.toISOString(),
        returnAt: store.returnAt.toISOString(),
        selectedExtraOptionIds: [gps.id],
      }),
    ).rejects.toMatchObject({
      response: { message: expect.stringContaining('Extras') },
    });
  });

  it('stores sourceId on snapshot line items and keeps them after tariff change', async () => {
    const { store, tariffs, pricing } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, {
      ...draftRate(),
      extraOptions: [
        { label: 'GPS', priceCents: 500, pricingType: 'PER_BOOKING', sortOrder: 0 },
      ],
    });
    const gps = store.extraOptions.find((o) => o.tariffVersionId === draft.id)!;
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, { draftVersionId: draft.id });

    const { snapshot } = await pricing.createBookingPriceSnapshot(ids.orgId, 'booking-opt-1', {
      vehicleId: ids.vehicleId,
      pickupAt: store.pickupAt,
      returnAt: store.returnAt,
      pricing: { selectedExtraOptionIds: [gps.id] },
    });

    const extraLine = snapshot.lineItems.find((li) => li.type === 'EXTRA');
    expect(resolveLineItemSourceId(extraLine?.metadataJson)).toBe(gps.id);
    expect(extraLine?.label).toBe('GPS');

    const nextDraft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, {
      ...draftRate(),
      extraOptions: [
        { label: 'Navigation Pro', priceCents: 900, pricingType: 'PER_BOOKING', sortOrder: 0 },
      ],
    });
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, { draftVersionId: nextDraft.id });

    const stored = store.snapshots.find((s) => s.bookingId === 'booking-opt-1');
    const storedExtra = (stored?.lineItems as Array<Record<string, unknown>>).find(
      (li) => li.type === 'EXTRA',
    );
    expect(storedExtra?.label).toBe('GPS');
    expect(resolveLineItemSourceId(storedExtra?.metadataJson)).toBe(gps.id);
    void snapshot;
  });

  it('creates new option with new id', async () => {
    const { store, tariffs } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, {
      extraOptions: [{ label: 'A', priceCents: 100, pricingType: 'PER_BOOKING', sortOrder: 0 }],
    });
    const firstId = store.extraOptions.find((o) => o.tariffVersionId === draft.id)!.id;

    await tariffs.updateVersion(ids.orgId, draft.id, {
      extraOptions: [
        { id: firstId, label: 'A', priceCents: 100, pricingType: 'PER_BOOKING', sortOrder: 0 },
        { label: 'B', priceCents: 200, pricingType: 'PER_BOOKING', sortOrder: 1 },
      ],
    });

    const idsForVersion = store.extraOptions
      .filter((o) => o.tariffVersionId === draft.id && o.isActive)
      .map((o) => o.id);
    expect(idsForVersion).toHaveLength(2);
    expect(idsForVersion).toContain(firstId);
  });

  it('keeps deposit as separate DEPOSIT line item type with source metadata', async () => {
    const { pricing } = build();
    const simulation = await pricing.simulateBookingPrice(ids.orgId, {
      vehicleId: ids.vehicleId,
      pickupAt: '2026-08-01T10:00:00.000Z',
      returnAt: '2026-08-04T10:00:00.000Z',
    });
    const deposit = simulation.lineItems.find((li) => li.type === 'DEPOSIT');
    expect(deposit).toBeDefined();
    expect(deposit?.metadataJson).toMatchObject({
      lineItemType: 'DEPOSIT',
      sourceType: 'TARIFF_RATE',
    });
  });
});
