import { NotFoundException } from '@nestjs/common';
import { BookingRentalEligibilityService } from './booking-rental-eligibility.service';
import { RentalEffectiveRulesService } from '@modules/rental-rules/rental-effective-rules.service';
import { PrismaService } from '@shared/database/prisma.service';
import { buildEffectiveRentalRules } from '@modules/rental-rules/rental-effective-rules.util';
import { createActiveRentalRulesActivationSnapshot } from '@modules/rental-rules/rental-rules-activation.policy';
import type { EffectiveRentalRules } from '@modules/rental-rules/rental-rules.types';
import { splitLicenseHoldingMonths } from '@modules/rental-rules/license-holding.util';
import { CustomerDocumentStatus } from '@prisma/client';

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
    activation: createActiveRentalRulesActivationSnapshot(),
  });

  const prisma = {
    customer: { findFirst: jest.fn() },
    vehicle: { findFirst: jest.fn() },
    customerDocument: { findMany: jest.fn() },
    customerVerificationCheck: { findMany: jest.fn() },
    bookingDeposit: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
  } as unknown as PrismaService;

  const rentalEffectiveRules = {
    computeForVehicle: jest.fn(),
    formatEffectiveRules: jest.fn(),
  } as unknown as RentalEffectiveRulesService;

  const verificationService = {
    getEligibilityStatus: jest.fn(),
  } as unknown as import('@modules/customer-verification/customer-verification.service').CustomerVerificationService;

  const service = new BookingRentalEligibilityService(
    prisma,
    rentalEffectiveRules,
    verificationService,
  );

  const startDate = new Date('2026-07-01T10:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue({ id: 'veh1' });
    (prisma.customerDocument.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.customerVerificationCheck.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.bookingDeposit.findFirst as jest.Mock).mockResolvedValue(null);
    (rentalEffectiveRules.computeForVehicle as jest.Mock).mockResolvedValue(baseEffectiveRules);
    (rentalEffectiveRules.formatEffectiveRules as jest.Mock).mockImplementation(
      (rules: EffectiveRentalRules) => ({
        ...rules,
        depositAmount: rules.depositAmountCents,
        minimumLicenseHoldingYears: {
          value:
            rules.minimumLicenseHoldingMonths.value != null
              ? splitLicenseHoldingMonths(rules.minimumLicenseHoldingMonths.value).wholeYears
              : null,
          source: rules.minimumLicenseHoldingMonths.source,
          sourceName: rules.minimumLicenseHoldingMonths.sourceName,
        },
        minimumLicenseHoldingRemainderMonths: {
          value:
            rules.minimumLicenseHoldingMonths.value != null
              ? splitLicenseHoldingMonths(rules.minimumLicenseHoldingMonths.value).extraMonths
              : null,
          source: rules.minimumLicenseHoldingMonths.source,
          sourceName: rules.minimumLicenseHoldingMonths.sourceName,
        },
      }),
    );
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
      customerId: 'cust1',
      idDocument: 'verified',
      drivingLicense: 'verified',
      proofOfAddress: 'not_required',
      canConfirmBooking: true,
      canStartPickup: true,
      blockingReasons: [],
      warnings: [],
    });
  });

  function mockCustomer(overrides: {
    dateOfBirth?: Date | null;
    licenseIssuedAt?: string | null;
    idVerified?: boolean;
    licenseVerified?: boolean;
  } = {}) {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      id: 'cust1',
      organizationId: 'org1',
      dateOfBirth:
        overrides.dateOfBirth !== undefined
          ? overrides.dateOfBirth
          : new Date('1990-01-15'),
      licenseIssuedAt:
        overrides.licenseIssuedAt === null
          ? null
          : overrides.licenseIssuedAt
            ? new Date(overrides.licenseIssuedAt)
            : new Date('2018-01-01'),
      licenseExpiry: null,
      idVerified: overrides.idVerified ?? true,
      licenseVerified: overrides.licenseVerified ?? true,
    });
  }

  it('returns ELIGIBLE when organization rental rules are inactive', async () => {
    mockCustomer({
      dateOfBirth: new Date('2008-01-01'),
      licenseIssuedAt: '2024-01-01',
      idVerified: false,
      licenseVerified: false,
    });
    const inactiveRules = buildEffectiveRentalRules({
      organizationId: 'org1',
      vehicleId: 'veh1',
      orgLayer,
      categoryLayer: null,
      vehicleLayer: null,
      rentalCategoryId: null,
      rentalCategoryName: null,
      rentalCategoryType: null,
      rulesActive: false,
      activation: createActiveRentalRulesActivationSnapshot({
        organizationRulesActive: false,
        enforcementActive: false,
      }),
    });
    (rentalEffectiveRules.computeForVehicle as jest.Mock).mockResolvedValue(inactiveRules);

    const result = await service.check({
      organizationId: 'org1',
      vehicleId: 'veh1',
      customerId: 'cust1',
      startDate,
    });

    expect(result.status).toBe('ELIGIBLE');
    expect(result.blockingReasons).toHaveLength(0);
  });

  it('returns ELIGIBLE when customer meets minimum age and license holding with verified facts', async () => {
    mockCustomer({ licenseIssuedAt: '2018-01-01' });

    const result = await service.check({
      organizationId: 'org1',
      vehicleId: 'veh1',
      customerId: 'cust1',
      startDate,
      paymentIntent: 'payment_link',
    });

    expect(result.status).toBe('ELIGIBLE');
    expect(result.blockingReasons).toHaveLength(0);
    expect(result.missingFields).toHaveLength(0);
    expect(result.decisionSource).toBe('RENTAL_RULES_EFFECTIVE');
    expect(result.facts.some((f) => f.field === 'dateOfBirth' && f.sourceType === 'CUSTOMER_CANONICAL_VERIFIED')).toBe(true);
  });

  it('returns NOT_ELIGIBLE when verified customer is too young', async () => {
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

  it('returns NOT_ELIGIBLE when verified license holding duration is too short', async () => {
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
      activation: createActiveRentalRulesActivationSnapshot(),
    });
    (rentalEffectiveRules.computeForVehicle as jest.Mock).mockResolvedValue(rulesNoLicense);
    mockCustomer({ dateOfBirth: null, idVerified: false });

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
      activation: createActiveRentalRulesActivationSnapshot(),
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
      activation: createActiveRentalRulesActivationSnapshot({
        categoryAssigned: true,
        categoryActive: true,
        vehicleOverrideActive: true,
      }),
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

  it('adds warning for pickup_required ID without blocking ELIGIBLE rental rules', async () => {
    mockCustomer({ licenseIssuedAt: '2018-01-01' });
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
      customerId: 'cust1',
      idDocument: 'pickup_required',
      drivingLicense: 'verified',
      proofOfAddress: 'not_required',
      canConfirmBooking: true,
      canStartPickup: false,
      blockingReasons: [],
      warnings: [],
    });

    const result = await service.check({
      organizationId: 'org1',
      vehicleId: 'veh1',
      customerId: 'cust1',
      startDate,
    });

    expect(result.status).toBe('ELIGIBLE');
    expect(result.warningReasons).toContain('Ausweisprüfung beim Pickup vorgesehen');
  });

  it('proofOfAddress pending is warning only, not blocking', async () => {
    mockCustomer({ licenseIssuedAt: '2018-01-01' });
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
      customerId: 'cust1',
      idDocument: 'verified',
      drivingLicense: 'verified',
      proofOfAddress: 'pending',
      canConfirmBooking: true,
      canStartPickup: true,
      blockingReasons: [],
      warnings: [],
    });

    const result = await service.check({
      organizationId: 'org1',
      vehicleId: 'veh1',
      customerId: 'cust1',
      startDate,
    });

    expect(result.status).toBe('ELIGIBLE');
    expect(result.warningReasons).toContain(
      'Adressnachweis optional — noch nicht bestätigt',
    );
    expect(result.blockingReasons).toHaveLength(0);
  });

  describe('unverified OCR must not drive binding decisions', () => {
    it.each(['UPLOADED', 'PENDING_REVIEW'] as CustomerDocumentStatus[])(
      'does not use %s license OCR for blocking NOT_ELIGIBLE',
      async (status) => {
        mockCustomer({
          dateOfBirth: new Date('1990-01-15'),
          licenseIssuedAt: null,
          licenseVerified: false,
        });
        (prisma.customerDocument.findMany as jest.Mock).mockResolvedValue([
          {
            id: 'license-doc',
            type: 'LICENSE_FRONT',
            status,
            extractedJson: { licenseIssuedAt: '2025-10-01' },
            reviewedAt: null,
            reviewedByUserId: null,
            uploadedByUserId: 'uploader-1',
            updatedAt: new Date('2026-06-01'),
          },
        ]);

        const result = await service.check({
          organizationId: 'org1',
          vehicleId: 'veh1',
          customerId: 'cust1',
          startDate,
        });

        expect(result.status).toBe('MANUAL_APPROVAL_REQUIRED');
        expect(result.blockingReasons).toHaveLength(0);
        expect(result.manualApprovalReasons.some((r) =>
          r.includes('unverified document data'),
        )).toBe(true);
        expect(result.facts.find((f) => f.field === 'licenseIssuedAt')?.sourceType).toBe(
          'OCR_UNVERIFIED',
        );
      },
    );

    it('does not treat unverified OCR young age as NOT_ELIGIBLE', async () => {
      mockCustomer({
        dateOfBirth: null,
        licenseIssuedAt: '2018-01-01',
        idVerified: false,
      });
      (prisma.customerDocument.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'id-doc',
          type: 'ID_FRONT',
          status: 'UPLOADED',
          extractedJson: { date_of_birth: '2008-01-01' },
          reviewedAt: null,
          reviewedByUserId: null,
          uploadedByUserId: 'uploader-1',
          updatedAt: new Date('2026-06-01'),
        },
      ]);

      const result = await service.check({
        organizationId: 'org1',
        vehicleId: 'veh1',
        customerId: 'cust1',
        startDate,
      });

      expect(result.status).not.toBe('NOT_ELIGIBLE');
      expect(result.blockingReasons).toHaveLength(0);
      expect(result.manualApprovalReasons.some((r) =>
        r.includes('unverified document data'),
      )).toBe(true);
    });

    it('uses verified KYC check extracted data when canonical fields are unverified', async () => {
      mockCustomer({
        dateOfBirth: null,
        licenseIssuedAt: null,
        idVerified: false,
        licenseVerified: false,
      });
      (prisma.customerVerificationCheck.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'id-check',
          kind: 'ID_DOCUMENT',
          status: 'VERIFIED',
          extractedJson: { date_of_birth: '1990-01-15' },
          completedAt: new Date('2026-05-01'),
          checkedByUserId: 'kyc-reviewer',
          updatedAt: new Date('2026-05-01'),
        },
        {
          id: 'license-check',
          kind: 'DRIVING_LICENSE',
          status: 'VERIFIED',
          extractedJson: { licenseIssuedAt: '2018-01-01' },
          completedAt: new Date('2026-05-01'),
          checkedByUserId: 'kyc-reviewer',
          updatedAt: new Date('2026-05-01'),
        },
      ]);

      const result = await service.check({
        organizationId: 'org1',
        vehicleId: 'veh1',
        customerId: 'cust1',
        startDate,
      });

      expect(result.status).toBe('ELIGIBLE');
      expect(result.facts.find((f) => f.field === 'dateOfBirth')?.sourceType).toBe('KYC_VERIFIED');
      expect(result.facts.find((f) => f.field === 'licenseIssuedAt')?.sourceType).toBe('KYC_VERIFIED');
    });

    it('requires manual approval when verification is pending review', async () => {
      mockCustomer({ licenseIssuedAt: '2018-01-01' });
      (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
        customerId: 'cust1',
        idDocument: 'requires_review',
        drivingLicense: 'verified',
        proofOfAddress: 'not_required',
        canConfirmBooking: false,
        canStartPickup: false,
        blockingReasons: [],
        warnings: [],
      });

      const result = await service.check({
        organizationId: 'org1',
        vehicleId: 'veh1',
        customerId: 'cust1',
        startDate,
      });

      expect(result.status).toBe('MANUAL_APPROVAL_REQUIRED');
      expect(result.manualApprovalReasons).toContain(
        'Ausweisprüfung erfordert manuelle Freigabe',
      );
    });
  });
});
