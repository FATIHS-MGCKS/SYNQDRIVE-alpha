import { PrismaService } from '@shared/database/prisma.service';
import { PricingMigrationService } from './pricing-migration.service';
import { createPricingTestStore, createSedanPricingFixtures } from './pricing-test-store';

describe('PricingMigrationService', () => {
  const ids = createSedanPricingFixtures();

  function build() {
    const store = createPricingTestStore(ids);
    const migration = new PricingMigrationService(store.prisma as unknown as PrismaService);
    return { store, migration };
  }

  it('does not recreate tariff groups when catalog was intentionally emptied', async () => {
    const { store, migration } = build();
    store.groups.length = 0;

    const result = await migration.ensureOrgPricing(ids.orgId);

    expect(result.migrated).toBe(false);
    expect(result.vehiclesAssigned).toBe(0);
    expect(store.groups).toHaveLength(0);
  });

  it('assigns unassigned vehicles only to existing groups without creating new ones', async () => {
    const { store, migration } = build();
    const suvGroupId = 'group-suv-only';
    store.groups.splice(0, store.groups.length, {
      id: suvGroupId,
      organizationId: ids.orgId,
      priceBookId: ids.priceBookId,
      name: 'SUV',
      category: 'SUV',
      isActive: true,
      sortOrder: 0,
    });
    store.versions.push({
      id: 'version-suv-active',
      organizationId: ids.orgId,
      priceBookId: ids.priceBookId,
      tariffGroupId: suvGroupId,
      versionNumber: 1,
      status: 'ACTIVE',
      validFrom: new Date(),
      validTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    store.rates.push({
      id: 'rate-suv',
      organizationId: ids.orgId,
      tariffVersionId: 'version-suv-active',
      dailyRateCents: 5000,
      weeklyRateCents: 0,
      monthlyRateCents: 0,
      includedKmPerDay: 200,
      extraKmPriceCents: 22,
      depositAmountCents: 15000,
      minimumRentalDays: null,
    });
    store.assignments.forEach((a) => {
      a.isActive = false;
    });

    const result = await migration.ensureOrgPricing(ids.orgId);

    expect(store.groups).toHaveLength(1);
    expect(store.groups[0].name).toBe('SUV');
    expect(store.groups.some((g) => g.name === 'Electric' || g.name === 'Sedan' || g.name === 'Compact')).toBe(
      false,
    );
    expect(result.migrated).toBe(false);
    expect(result.vehiclesAssigned).toBe(0);
  });
});
