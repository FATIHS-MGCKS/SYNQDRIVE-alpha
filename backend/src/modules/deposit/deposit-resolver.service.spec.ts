import { PrismaService } from '@shared/database/prisma.service';
import { RentalEffectiveRulesService } from '@modules/rental-rules/rental-effective-rules.service';
import { DepositResolverService } from './deposit-resolver.service';
import { DEPOSIT_SOURCE } from './deposit-resolver.types';

describe('DepositResolverService', () => {
  const organizationId = 'org-1';
  const vehicleId = 'veh-1';

  const tariffContext = {
    assignmentId: 'assign-1',
    vehicleId,
    pickupAt: new Date('2026-08-01T10:00:00.000Z'),
    priceBook: {
      id: 'book-1',
      name: 'EUR Standard',
      currency: 'EUR',
      taxRatePercent: 19,
    },
    tariffGroup: {
      id: 'group-1',
      name: 'Sedan',
      category: 'SEDAN',
      isActive: true,
    },
    tariffVersion: {
      id: 'tv-1',
      versionNumber: 1,
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      validTo: null,
      rate: {
        id: 'rate-1',
        dailyRateCents: 5000,
        weeklyRateCents: 27500,
        monthlyRateCents: 100000,
        includedKmPerDay: 200,
        extraKmPriceCents: 22,
        depositAmountCents: 30000,
        minimumRentalDays: null,
      },
      mileagePackages: [],
      insuranceOptions: [],
      extraOptions: [],
    },
  };

  let prisma: {
    vehicle: { findFirst: jest.Mock };
    organizationRentalRules: { findUnique: jest.Mock };
  };
  let rentalEffectiveRules: { computeForVehicle: jest.Mock };
  let service: DepositResolverService;

  beforeEach(() => {
    prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          rentalCategoryId: 'cat-1',
          rentalRequirementOverride: null,
        }),
      },
      organizationRentalRules: {
        findUnique: jest.fn().mockResolvedValue({ id: 'org-rules-1' }),
      },
    };
    rentalEffectiveRules = {
      computeForVehicle: jest.fn().mockResolvedValue({
        organizationId,
        vehicleId,
        rentalCategoryId: 'cat-1',
        rentalCategoryName: 'SUV',
        rentalCategoryType: null,
        rulesActive: true,
        minimumAgeYears: { value: null, source: null, sourceName: null },
        minimumLicenseHoldingMonths: { value: null, source: null, sourceName: null },
        depositAmountCents: {
          value: 60000,
          source: 'CATEGORY',
          sourceName: 'SUV',
        },
        depositCurrency: { value: 'EUR', source: 'CATEGORY', sourceName: 'SUV' },
        creditCardRequired: { value: null, source: null, sourceName: null },
        foreignTravelPolicy: { value: null, source: null, sourceName: null },
        additionalDriverPolicy: { value: null, source: null, sourceName: null },
        youngDriverPolicy: { value: null, source: null, sourceName: null },
        insuranceRequirement: { value: null, source: null, sourceName: null },
        manualApprovalRequired: { value: null, source: null, sourceName: null },
        notes: { value: null, source: null, sourceName: null },
      }),
    };
    service = new DepositResolverService(
      prisma as unknown as PrismaService,
      rentalEffectiveRules as unknown as RentalEffectiveRulesService,
    );
  });

  it('raises tariff deposit to category minimum through service integration', async () => {
    const result = await service.resolveForVehicleTariff({
      organizationId,
      vehicleId,
      tariffContext: tariffContext as never,
    });

    expect(result.amount).toBe(60000);
    expect(result.source).toBe(DEPOSIT_SOURCE.CATEGORY_MINIMUM);
    expect(result.ruleRevisionId).toBe('cat-1');
    expect(result.components.raisedToMinimum).toBe(true);
  });

  it('uses tariff when it exceeds rental rules minimum', async () => {
    rentalEffectiveRules.computeForVehicle.mockResolvedValue({
      ...rentalEffectiveRules.computeForVehicle.mock.results[0]?.value,
      depositAmountCents: {
        value: 20000,
        source: 'ORGANIZATION_DEFAULT',
        sourceName: 'Org',
      },
      depositCurrency: { value: 'EUR', source: 'ORGANIZATION_DEFAULT', sourceName: 'Org' },
    });

    const result = await service.resolveForVehicleTariff({
      organizationId,
      vehicleId,
      tariffContext: tariffContext as never,
    });

    expect(result.amount).toBe(30000);
    expect(result.source).toBe(DEPOSIT_SOURCE.TARIFF_RATE);
    expect(result.ruleRevisionId).toBe('rate-1');
  });
});
