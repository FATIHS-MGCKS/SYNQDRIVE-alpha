import { NotFoundException } from '@nestjs/common';
import { BookingRentalEligibilityService } from './booking-rental-eligibility.service';
import { RentalEffectiveRulesService } from '@modules/rental-rules/rental-effective-rules.service';
import { PrismaService } from '@shared/database/prisma.service';
import { buildEffectiveRentalRules } from '@modules/rental-rules/rental-effective-rules.util';
import type { EffectiveRentalRules } from '@modules/rental-rules/rental-rules.types';

describe('BookingRentalEligibilityService', () => {
  const orgLayer = {
    source: 'ORGANIZATION_DEFAULT' as const,
    sourceName: 'Acme Rental',
    values: {
      minimumAgeYears: 21,
      minimumLicenseHoldingMonths: 12,
      depositAmountCents: 50000,
      depositCurrency: 'EUR',
      creditCardRequired: false,
      foreignTravelPolicy: 'ALLOWED' as const,
      additionalDriverPolicy: 'ALLOWED' as const,
      youngDriverPolicy: 'ALLOWED' as const,
      insuranceRequirement: null,
      manualApprovalRequired: false,
      notes: null,
    },
  };

  const baseEffectiveRules = buildEffectiveRentalRules({
    organizationId: 'org1',
    vehicleId: 'veh1',
    orgLayer,
    categoryLayer: null,
    vehicleLayer: null,
    rentalCategoryId: null,
    rentalCategoryName: null,
    rentalCategoryType: null,
    rulesActive: true,
  });

  const prisma = {
    customer: { findFirst: jest.fn() },
    vehicle: { findFirst: jest.fn() },
    customerDocument: { findFirst: jest.fn() },
    bookingDeposit: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
  } as unknown as PrismaService;

  const rentalEffectiveRules = {
    computeForVehicle: jest.fn(),
    formatEffectiveRules: jest.fn(),
  } as unknown as RentalEffectiveRulesService;

  const service = new BookingRentalEligibilityService(prisma, rentalEffectiveRules);

  const startDate = new Date('2026-07-01T10:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue({ id: 'veh1' });
    (prisma.customerDocument.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.bookingDeposit.findFirst as jest.Mock).mockResolvedValue(null);
    (rentalEffectiveRules.computeForVehicle as jest.Mock).mockResolvedValue(baseEffectiveRules);
    (rentalEffectiveRules.formatEffectiveRules as jest.Mock).mockImplementation(
      (rules: EffectiveRentalRules) => ({
        ...rules,
        depositAmount: rules.depositAmountCents,
        minimumLicenseHoldingYears: {
          value:
            rules.minimumLicenseHoldingMonths.value != null
              ? Math.round(rules.minimumLicenseHoldingMonths.value / 12)
              : null,
          source: rules.minimumLicenseHoldingMonths.source,
          sourceName: rules.minimumLicenseHoldingMonths.sourceName,
        },
      }),
    );
  });

  function mockCustomer(overrides: {
    dateOfBirth?: Date | null;
    licenseIssuedAt?: string;
  } = {}) {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      id: 'cust1',
      organizationId: 'org1',
      dateOfBirth:
        overrides.dateOfBirth !== undefined
          ? overrides.dateOfBirth
          : new Date('1990-01-15'),
    });
    if (overrides.licenseIssuedAt) {
      (prisma.customerDocument.findFirst as jest.Mock).mockResolvedValue({
        extractedJson: { licenseIssuedAt: overrides.licenseIssuedAt },
      });
    }
  }

  it('returns ELIGIBLE when customer meets minimum age and license holding', async () => {
    mockCustomer({ licenseIssuedAt: '2018-01-01' });

    const result = await service.check({
      organizationId: 'org1',
      vehicleId: 'veh1',
      customerId: 'cust1',
      startDate,
      paymentMethod: 'card',
    });

    expect(result.status).toBe('ELIGIBLE');
    expect(result.blockingReasons).toHaveLength(0);
    expect(result.missingFields).toHaveLength(0);
    expect(result.decisionSource).toBe('RENTAL_RULES_EFFECTIVE');
  });

  it('returns NOT_ELIGIBLE when customer is too young', async () => {
    mockCustomer({
      dateOfBirth: new Date('2008-01-01'),
      licenseIssuedAt: '2024-01-01',
    });

    const result = await service.check({
      organizationId: 'org1',
      vehicleId: 'veh1',
      customerId: 'cust1',
      startDate,
    });

    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.blockingReasons.some((r) => r.includes('minimum age 21'))).toBe(true);
  });

  it('returns NOT_ELIGIBLE when license holding duration is too short', async () => {
    mockCustomer({ licenseIssuedAt: '2025-10-01' });

    const result = await service.check({
      organizationId: 'org1',
      vehicleId: 'veh1',
      customerId: 'cust1',
      startDate,
    });

    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.blockingReasons.some((r) => r.includes('held a license'))).toBe(true);
  });

  it('returns MISSING_INFORMATION when required customer data is missing', async () => {
    const rulesNoLicense = buildEffectiveRentalRules({
      organizationId: 'org1',
      vehicleId: 'veh1',
      orgLayer: {
        ...orgLayer,
        values: { ...orgLayer.values, minimumLicenseHoldingMonths: null },
      },
      categoryLayer: null,
      vehicleLayer: null,
      rentalCategoryId: null,
      rentalCategoryName: null,
      rentalCategoryType: null,
      rulesActive: true,
    });
    (rentalEffectiveRules.computeForVehicle as jest.Mock).mockResolvedValue(rulesNoLicense);
    mockCustomer({ dateOfBirth: null });

    const result = await service.check({
      organizationId: 'org1',
      vehicleId: 'veh1',
      customerId: 'cust1',
      startDate,
    });

    expect(result.status).toBe('MISSING_INFORMATION');
    expect(result.missingFields).toContain('customer.dateOfBirth');
    expect(result.blockingReasons).toHaveLength(0);
  });

  it('returns MANUAL_APPROVAL_REQUIRED when foreign travel needs approval', async () => {
    mockCustomer({ licenseIssuedAt: '2018-01-01' });
    const rules = buildEffectiveRentalRules({
      organizationId: 'org1',
      vehicleId: 'veh1',
      orgLayer: {
        ...orgLayer,
        values: { ...orgLayer.values, foreignTravelPolicy: 'APPROVAL_REQUIRED' },
      },
      categoryLayer: null,
      vehicleLayer: null,
      rentalCategoryId: null,
      rentalCategoryName: null,
      rentalCategoryType: null,
      rulesActive: true,
    });
    (rentalEffectiveRules.computeForVehicle as jest.Mock).mockResolvedValue(rules);

    const result = await service.check({
      organizationId: 'org1',
      vehicleId: 'veh1',
      customerId: 'cust1',
      startDate,
      foreignTravelRequested: true,
    });

    expect(result.status).toBe('MANUAL_APPROVAL_REQUIRED');
    expect(result.manualApprovalReasons.some((r) => r.includes('Foreign travel'))).toBe(true);
  });

  it('vehicle override wins over category rule for minimum age', async () => {
    mockCustomer({
      dateOfBirth: new Date('1998-06-01'),
      licenseIssuedAt: '2016-01-01',
    });
    const rules = buildEffectiveRentalRules({
      organizationId: 'org1',
      vehicleId: 'veh1',
      orgLayer,
      categoryLayer: {
        source: 'CATEGORY',
        sourceName: 'Premium',
        values: { minimumAgeYears: 25 },
      },
      vehicleLayer: {
        source: 'VEHICLE_OVERRIDE',
        sourceName: 'BMW M3',
        values: { minimumAgeYears: 30 },
      },
      rentalCategoryId: 'cat1',
      rentalCategoryName: 'Premium',
      rentalCategoryType: 'PREMIUM',
      rulesActive: true,
    });
    (rentalEffectiveRules.computeForVehicle as jest.Mock).mockResolvedValue(rules);

    const result = await service.check({
      organizationId: 'org1',
      vehicleId: 'veh1',
      customerId: 'cust1',
      startDate,
    });

    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.effectiveRules.minimumAgeYears.value).toBe(30);
    expect(result.effectiveRules.minimumAgeYears.source).toBe('VEHICLE_OVERRIDE');
    expect(result.blockingReasons.some((r) => r.includes('minimum age 30'))).toBe(true);
  });

  it('rejects cross-tenant customer lookup', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.check({
        organizationId: 'org1',
        vehicleId: 'veh1',
        customerId: 'cust-other-org',
        startDate,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
