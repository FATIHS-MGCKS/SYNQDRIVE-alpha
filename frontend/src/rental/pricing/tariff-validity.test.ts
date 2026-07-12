import { describe, expect, it } from 'vitest';
import type { PriceTariffCatalog } from './pricingTypes';
import {
  getVehicleTariffFromCatalog,
  isTariffEffectiveAt,
} from './pricingUtils';

describe('tariff validity (frontend)', () => {
  it('isTariffEffectiveAt uses half-open interval', () => {
    const from = '2026-07-12T00:00:00.000Z';
    const to = '2026-07-13T00:00:00.000Z';
    expect(isTariffEffectiveAt(from, to, new Date('2026-07-12T08:00:00.000Z'))).toBe(true);
    expect(isTariffEffectiveAt(from, to, new Date('2026-07-13T00:00:00.000Z'))).toBe(false);
    expect(isTariffEffectiveAt('2026-07-12T18:22:00.000Z', null, new Date('2026-07-12T08:00:00.000Z'))).toBe(
      false,
    );
  });

  it('getVehicleTariffFromCatalog respects pickup instant for assignments', () => {
    const catalog: PriceTariffCatalog = {
      priceBook: {
        id: 'pb-1',
        name: 'Default',
        currency: 'EUR',
        taxRatePercent: 19,
        isActive: true,
      },
      groups: [
        {
          id: 'g-1',
          name: 'SUV',
          isActive: true,
          sortOrder: 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
          activeVersion: {
            id: 'v-1',
            versionNumber: 1,
            status: 'ACTIVE',
            validFrom: '2026-01-01T00:00:00.000Z',
            rate: {
              dailyRateCents: 5000,
              weeklyRateCents: 0,
              monthlyRateCents: 0,
              includedKmPerDay: 200,
              extraKmPriceCents: 22,
              depositAmountCents: 50000,
            },
            mileagePackages: [],
            insuranceOptions: [],
            extraOptions: [],
          },
          draftVersion: null,
          scheduledVersions: [],
          archivedVersions: [],
          versions: [
            {
              id: 'v-1',
              versionNumber: 1,
              status: 'ACTIVE',
              validFrom: '2026-01-01T00:00:00.000Z',
              rate: {
                dailyRateCents: 5000,
                weeklyRateCents: 0,
                monthlyRateCents: 0,
                includedKmPerDay: 200,
                extraKmPriceCents: 22,
                depositAmountCents: 50000,
              },
              mileagePackages: [],
              insuranceOptions: [],
              extraOptions: [],
            },
          ],
        },
      ],
      assignments: [
        {
          id: 'a-1',
          vehicleId: 'veh-1',
          tariffGroupId: 'g-1',
          priceBookId: 'pb-1',
          isActive: true,
          validFrom: '2026-07-12T16:22:00.000Z',
        },
      ],
      unassignedVehicleCount: 0,
    };

    expect(getVehicleTariffFromCatalog(catalog, 'veh-1')).not.toBeNull();
    expect(
      getVehicleTariffFromCatalog(catalog, 'veh-1', '2026-07-12T08:00:00.000Z'),
    ).toBeNull();
    expect(
      getVehicleTariffFromCatalog(catalog, 'veh-1', '2026-07-12T18:00:00.000Z'),
    ).not.toBeNull();
  });
});
