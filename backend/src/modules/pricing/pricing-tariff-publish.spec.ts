import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingService } from './pricing.service';
import { PricingMigrationService } from './pricing-migration.service';
import {
  createPricingTestStore,
  createSedanPricingFixtures,
  SEDAN_DEPOSIT_ACTIVE_CENTS,
  SEDAN_DEPOSIT_DRAFT_CENTS,
  SEDAN_DAILY_NET_CENTS,
} from './pricing-test-store';

describe('Pricing tariff publish flow (Sedan deposit 17700 → 50000)', () => {
  const ids = createSedanPricingFixtures();
  const migration = { ensureOrgPricing: jest.fn().mockResolvedValue({ migrated: false, vehiclesAssigned: 0 }) };

  function buildServices() {
    const store = createPricingTestStore(ids);
    const tariffs = new PriceTariffsService(store.prisma as unknown as PrismaService, migration as unknown as PricingMigrationService);
    const pricing = new PricingService(store.prisma as unknown as PrismaService, migration as unknown as PricingMigrationService);
    return { store, tariffs, pricing };
  }

  const draftRatePayload = (depositAmountCents: number) => ({
    rate: {
      dailyRateCents: SEDAN_DAILY_NET_CENTS,
      weeklyRateCents: SEDAN_DAILY_NET_CENTS * 7,
      monthlyRateCents: SEDAN_DAILY_NET_CENTS * 30,
      includedKmPerDay: 200,
      extraKmPriceCents: 22,
      depositAmountCents,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PriceTariffsService — draft & publish', () => {
    it('starts with ACTIVE Sedan depositAmountCents = 17700 (59€ × 3 migration)', async () => {
      const { store } = buildServices();
      const activeRate = store.rates.find((r) => r.tariffVersionId === ids.activeVersionId);
      expect(activeRate?.depositAmountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
      expect(SEDAN_DEPOSIT_ACTIVE_CENTS).toBe(17700);
    });

    it('upsertGroupVersion creates DRAFT with depositAmountCents = 50000 while ACTIVE stays 17700', async () => {
      const { store, tariffs } = buildServices();

      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));

      expect(draft.status).toBe('DRAFT');
      expect(draft.rate?.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);

      const activeRate = store.rates.find((r) => r.tariffVersionId === ids.activeVersionId);
      expect(activeRate?.depositAmountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);

      const activeVersions = store.versions.filter(
        (v) => v.tariffGroupId === ids.groupId && v.status === 'ACTIVE',
      );
      expect(activeVersions).toHaveLength(1);
      expect(activeVersions[0].id).toBe(ids.activeVersionId);
    });

    it('activateVersion promotes the draft and archives the previous ACTIVE version', async () => {
      const { store, tariffs } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));

      const activated = await tariffs.activateVersion(ids.orgId, draft.id);

      expect(activated.status).toBe('ACTIVE');
      expect(activated.id).toBe(draft.id);
      expect(activated.rate?.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);

      const archived = store.versions.find((v) => v.id === ids.activeVersionId);
      expect(archived?.status).toBe('ARCHIVED');
      expect(archived?.validTo).toBeInstanceOf(Date);

      expect(store.countActiveVersions(ids.groupId)).toBe(1);
    });

    it('allows only one ACTIVE version per tariff group after publish', async () => {
      const { store, tariffs } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));
      await tariffs.activateVersion(ids.orgId, draft.id);

      const active = store.versions.filter((v) => v.tariffGroupId === ids.groupId && v.status === 'ACTIVE');
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(draft.id);
    });

    it('re-activating the stale ACTIVE id does not promote the 50000 draft (wrong publish target)', async () => {
      const { store, tariffs, pricing } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));

      // Mirrors TariffGroupDrawer bug: activateVersion called with old ACTIVE id.
      await tariffs.activateVersion(ids.orgId, ids.activeVersionId);

      expect(store.countActiveVersions(ids.groupId)).toBe(1);
      expect(store.versions.find((v) => v.id === ids.activeVersionId)?.status).toBe('ACTIVE');
      expect(store.versions.find((v) => v.id === draft.id)?.status).toBe('DRAFT');

      const simulation = await pricing.simulateBookingPrice(ids.orgId, {
        vehicleId: ids.vehicleId,
        pickupAt: store.pickupAt.toISOString(),
        returnAt: store.returnAt.toISOString(),
      });
      expect(simulation.depositAmountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
      expect(simulation.depositAmountCents).not.toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
    });
  });

  describe('PricingService — simulation & snapshot', () => {
    it('simulateBookingPrice returns depositAmountCents = 17700 before draft publish', async () => {
      const { store, pricing } = buildServices();

      const simulation = await pricing.simulateBookingPrice(ids.orgId, {
        vehicleId: ids.vehicleId,
        pickupAt: store.pickupAt.toISOString(),
        returnAt: store.returnAt.toISOString(),
      });

      expect(simulation.depositAmountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
      expect(simulation.tariffVersionId).toBe(ids.activeVersionId);
      expect(simulation.currency).toBe('EUR');
    });

    it('simulateBookingPrice returns depositAmountCents = 50000 after correct draft publish', async () => {
      const { store, tariffs, pricing } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));
      await tariffs.activateVersion(ids.orgId, draft.id);

      const simulation = await pricing.simulateBookingPrice(ids.orgId, {
        vehicleId: ids.vehicleId,
        pickupAt: store.pickupAt.toISOString(),
        returnAt: store.returnAt.toISOString(),
      });

      expect(simulation.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
      expect(simulation.tariffVersionId).toBe(draft.id);
      expect(simulation.tariffGroupId).toBe(ids.groupId);
      expect(simulation.currency).toBe('EUR');
    });

    it('does not use a DRAFT version for booking simulation', async () => {
      const { store, tariffs, pricing } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));

      const simulation = await pricing.simulateBookingPrice(ids.orgId, {
        vehicleId: ids.vehicleId,
        pickupAt: store.pickupAt.toISOString(),
        returnAt: store.returnAt.toISOString(),
      });

      expect(simulation.tariffVersionId).toBe(ids.activeVersionId);
      expect(simulation.tariffVersionId).not.toBe(draft.id);
      expect(simulation.depositAmountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
    });

    it('createBookingPriceSnapshot persists deposit, tariff ids and EUR currency after publish', async () => {
      const { store, tariffs, pricing } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));
      await tariffs.activateVersion(ids.orgId, draft.id);

      const bookingId = 'booking-sedan-1';
      const { snapshot } = await pricing.createBookingPriceSnapshot(ids.orgId, bookingId, {
        vehicleId: ids.vehicleId,
        pickupAt: store.pickupAt,
        returnAt: store.returnAt,
      });

      expect(snapshot.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
      expect(snapshot.tariffVersionId).toBe(draft.id);
      expect(snapshot.tariffGroupId).toBe(ids.groupId);
      expect(snapshot.priceBookId).toBe(ids.priceBookId);
      expect(snapshot.currency).toBe('EUR');
      expect(store.snapshots[0]?.bookingId).toBe(bookingId);

      const assignmentFindFirst = (
        store.prisma as { vehicleTariffAssignment: { findFirst: jest.Mock } }
      ).vehicleTariffAssignment.findFirst;
      expect(assignmentFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ids.orgId,
            vehicleId: ids.vehicleId,
            isActive: true,
          }),
        }),
      );
    });

    it('documents gap: inactive tariff group is still resolved (product rule not enforced yet)', async () => {
      const { store, pricing } = buildServices();
      store.setGroupInactive();

      const simulation = await pricing.simulateBookingPrice(ids.orgId, {
        vehicleId: ids.vehicleId,
        pickupAt: store.pickupAt.toISOString(),
        returnAt: store.returnAt.toISOString(),
      });

      // Current code resolves ACTIVE version without checking PriceTariffGroup.isActive.
      expect(simulation.depositAmountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
      expect(store.groups[0].isActive).toBe(false);
    });
  });

  describe('PriceTariffsService — guards', () => {
    it('rejects activation when version has no rate', async () => {
      const { store, tariffs } = buildServices();
      store.rates.length = 0;

      await expect(tariffs.activateVersion(ids.orgId, ids.activeVersionId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
