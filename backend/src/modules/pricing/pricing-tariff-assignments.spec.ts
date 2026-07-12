import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingMigrationService } from './pricing-migration.service';
import {
  createPricingTestStore,
  createSedanPricingFixtures,
} from './pricing-test-store';

describe('Tariff assignments and deletion', () => {
  const ids = createSedanPricingFixtures();
  const migration = { ensureOrgPricing: jest.fn().mockResolvedValue({ migrated: false, vehiclesAssigned: 0 }) };

  function build() {
    const store = createPricingTestStore(ids);
    const tariffs = new PriceTariffsService(
      store.prisma as unknown as PrismaService,
      migration as unknown as PricingMigrationService,
    );
    return { store, tariffs };
  }

  it('assignVehicle reassigns vehicle to a new tariff group', async () => {
    const { store, tariffs } = build();
    const otherGroupId = 'group-suv';
    store.groups.push({
      id: otherGroupId,
      organizationId: ids.orgId,
      priceBookId: ids.priceBookId,
      name: 'SUV',
      category: 'SUV',
      isActive: true,
    });

    const assignment = await tariffs.assignVehicle(ids.orgId, {
      vehicleId: ids.vehicleId,
      tariffGroupId: otherGroupId,
    });

    expect(assignment.tariffGroupId).toBe(otherGroupId);
    expect(assignment.isActive).toBe(true);
    const previous = store.assignments.find((a) => a.id === ids.assignmentId);
    expect(previous?.isActive).toBe(false);
    const active = store.assignments.filter((a) => a.vehicleId === ids.vehicleId && a.isActive);
    expect(active).toHaveLength(1);
    expect(active[0].tariffGroupId).toBe(otherGroupId);
  });

  it('assignVehicle is idempotent for the same group', async () => {
    const { tariffs } = build();
    const first = await tariffs.assignVehicle(ids.orgId, {
      vehicleId: ids.vehicleId,
      tariffGroupId: ids.groupId,
    });
    const second = await tariffs.assignVehicle(ids.orgId, {
      vehicleId: ids.vehicleId,
      tariffGroupId: ids.groupId,
    });
    expect(second.id).toBe(first.id);
  });

  it('discardDraftVersion removes only DRAFT versions', async () => {
    const { store, tariffs } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, {
      rate: {
        dailyRateCents: 5000,
        weeklyRateCents: 0,
        monthlyRateCents: 0,
        includedKmPerDay: 200,
        extraKmPriceCents: 22,
        depositAmountCents: 15000,
      },
    });

    await tariffs.discardDraftVersion(ids.orgId, ids.groupId, draft.id);

    expect(store.versions.some((v) => v.id === draft.id)).toBe(false);
    expect(store.versions.some((v) => v.id === ids.activeVersionId)).toBe(true);
  });

  it('discardDraftVersion rejects non-draft versions', async () => {
    const { tariffs } = build();
    await expect(
      tariffs.discardDraftVersion(ids.orgId, ids.groupId, ids.activeVersionId),
    ).rejects.toThrow(BadRequestException);
  });

  it('deleteTariffGroup removes group and deactivates assignments', async () => {
    const { store, tariffs } = build();
    await tariffs.deleteTariffGroup(ids.orgId, ids.groupId);

    expect(store.groups.some((g) => g.id === ids.groupId)).toBe(false);
    const assignment = store.assignments.find((a) => a.id === ids.assignmentId);
    expect(assignment?.isActive).toBe(false);
  });
});
