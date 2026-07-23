import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingService } from './pricing.service';
import { PricingMigrationService } from './pricing-migration.service';
import {
  createPricingTestStore,
  createSedanPricingFixtures,
  createTariffPassthroughDepositResolver,
  createBookingDepositSnapshotStub,
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
    const pricing = new PricingService(
      store.prisma as unknown as PrismaService,
      migration as unknown as PricingMigrationService,
      createTariffPassthroughDepositResolver(),
      createBookingDepositSnapshotStub(),
    );
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

  describe('PriceTariffsService.publishTariffDraft — atomic publish', () => {
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
      expect(store.countActiveVersions(ids.groupId)).toBe(1);
    });

    it('publish promotes draft, archives previous ACTIVE, returns full version with 50000 deposit', async () => {
      const { store, tariffs } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));

      const published = await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
        draftVersionId: draft.id,
        expectedVersionNumber: draft.versionNumber,
      });

      expect(published.status).toBe('ACTIVE');
      expect(published.id).toBe(draft.id);
      expect(published.rate?.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
      expect(published.mileagePackages).toBeDefined();

      const archived = store.versions.find((v) => v.id === ids.activeVersionId);
      expect(archived?.status).toBe('ARCHIVED');
      expect(archived?.validTo).toBeInstanceOf(Date);
      expect(store.countActiveVersions(ids.groupId)).toBe(1);
    });

    it('allows only one ACTIVE version per tariff group after publish', async () => {
      const { store, tariffs } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));
      await tariffs.publishTariffDraft(ids.orgId, ids.groupId, { draftVersionId: draft.id });

      const active = store.versions.filter((v) => v.tariffGroupId === ids.groupId && v.status === 'ACTIVE');
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(draft.id);
    });

    it('rejects publish of ACTIVE version (legacy activate cannot create unsafe state)', async () => {
      const { store, tariffs } = buildServices();
      await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));

      await expect(
        tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
          draftVersionId: ids.activeVersionId,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(store.versions.find((v) => v.id === ids.activeVersionId)?.status).toBe('ACTIVE');
      expect(store.countActiveVersions(ids.groupId)).toBe(1);
    });

    it('rejects publish when draft belongs to another group', async () => {
      const { store, tariffs } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));

      store.groups.push({
        id: 'group-other',
        organizationId: ids.orgId,
        priceBookId: ids.priceBookId,
        name: 'Other',
        category: 'Other',
        isActive: true,
      });

      await expect(
        tariffs.publishTariffDraft(ids.orgId, 'group-other', { draftVersionId: draft.id }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects publish for unknown draft in org', async () => {
      const { tariffs } = buildServices();

      await expect(
        tariffs.publishTariffDraft(ids.orgId, ids.groupId, { draftVersionId: 'missing-draft' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects publish for wrong organization', async () => {
      const { tariffs } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));

      await expect(
        tariffs.publishTariffDraft('org-other', ids.groupId, { draftVersionId: draft.id }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects publish when expectedVersionNumber conflicts', async () => {
      const { tariffs } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));

      await expect(
        tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
          draftVersionId: draft.id,
          expectedVersionNumber: draft.versionNumber + 99,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects concurrent publish when draft is no longer DRAFT', async () => {
      const { store, tariffs } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));
      store.hooks.simulatePublishConflict = true;

      await expect(
        tariffs.publishTariffDraft(ids.orgId, ids.groupId, { draftVersionId: draft.id }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(store.versions.find((v) => v.id === draft.id)?.status).toBe('DRAFT');
      expect(store.countActiveVersions(ids.groupId)).toBe(1);
    });

    it('rolls back when archive step fails — ACTIVE count unchanged', async () => {
      const { store, tariffs } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));
      store.hooks.simulateArchiveFailure = true;

      await expect(
        tariffs.publishTariffDraft(ids.orgId, ids.groupId, { draftVersionId: draft.id }),
      ).rejects.toThrow('simulated archive failure');

      expect(store.versions.find((v) => v.id === draft.id)?.status).toBe('DRAFT');
      expect(store.countActiveVersions(ids.groupId)).toBe(1);
    });

    it('deprecated activateVersion delegates to publish and rejects ACTIVE re-activation', async () => {
      const { tariffs } = buildServices();

      await expect(tariffs.activateVersion(ids.orgId, ids.activeVersionId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('PricingService — simulation & snapshot after publish', () => {
    it('simulateBookingPrice returns depositAmountCents = 17700 before publish', async () => {
      const { store, pricing } = buildServices();

      const simulation = await pricing.simulateBookingPrice(ids.orgId, {
        vehicleId: ids.vehicleId,
        pickupAt: store.pickupAt.toISOString(),
        returnAt: store.returnAt.toISOString(),
      });

      expect(simulation.depositAmountCents).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
      expect(simulation.tariffVersionId).toBe(ids.activeVersionId);
    });

    it('simulateBookingPrice returns depositAmountCents = 50000 after atomic publish', async () => {
      const { store, tariffs, pricing } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));
      await tariffs.publishTariffDraft(ids.orgId, ids.groupId, { draftVersionId: draft.id });

      const simulation = await pricing.simulateBookingPrice(ids.orgId, {
        vehicleId: ids.vehicleId,
        pickupAt: store.pickupAt.toISOString(),
        returnAt: store.returnAt.toISOString(),
      });

      expect(simulation.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
      expect(simulation.tariffVersionId).toBe(draft.id);
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
    });

    it('createBookingPriceSnapshot persists 50000 deposit after publish', async () => {
      const { store, tariffs, pricing } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));
      await tariffs.publishTariffDraft(ids.orgId, ids.groupId, { draftVersionId: draft.id });

      const { snapshot } = await pricing.createBookingPriceSnapshot(ids.orgId, 'booking-sedan-1', {
        vehicleId: ids.vehicleId,
        pickupAt: store.pickupAt,
        returnAt: store.returnAt,
      });

      expect(snapshot.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
      expect(snapshot.tariffVersionId).toBe(draft.id);
    });
  });

  describe('PriceTariffsService — guards', () => {
    it('rejects publish when draft has no rate', async () => {
      const { store, tariffs } = buildServices();
      const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftRatePayload(SEDAN_DEPOSIT_DRAFT_CENTS));
      const idx = store.rates.findIndex((r) => r.tariffVersionId === draft.id);
      if (idx >= 0) store.rates.splice(idx, 1);

      await expect(
        tariffs.publishTariffDraft(ids.orgId, ids.groupId, { draftVersionId: draft.id }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
